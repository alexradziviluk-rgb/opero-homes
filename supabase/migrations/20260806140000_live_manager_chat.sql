alter table public.support_tickets
  add column if not exists anonymous_access_token_hash text,
  add column if not exists anonymous_access_expires_at timestamptz,
  add column if not exists anonymous_access_revoked_at timestamptz,
  add column if not exists anonymous_access_revoked_by uuid references auth.users(id) on delete set null,
  add column if not exists anonymous_access_revoke_reason text;

alter table public.support_tickets
  drop constraint if exists support_tickets_delivery_check;
alter table public.support_tickets
  add constraint support_tickets_delivery_check
  check (delivery_status in ('pending','sent','failed','retrying','partially_sent','all_failed','no_recipients'));

alter table public.support_messages
  add column if not exists client_message_id text,
  add column if not exists content_type text not null default 'text';

alter table public.support_messages
  drop constraint if exists support_messages_sender_type_check;
alter table public.support_messages
  add constraint support_messages_sender_type_check
  check (sender_type in ('client','manager','employee','ai','system','internal_note','telegram'));
alter table public.support_messages
  drop constraint if exists support_messages_type_check;
alter table public.support_messages
  add constraint support_messages_type_check
  check (message_type in ('text','image','pdf','voice','location','system','telegram','internal_note'));
alter table public.support_messages
  add constraint support_messages_content_type_check
  check (content_type in ('text','image','pdf','voice','location'));

create unique index if not exists support_messages_client_message_unique
  on public.support_messages (ticket_id, client_message_id)
  where client_message_id is not null;
create unique index if not exists support_tickets_anonymous_access_unique
  on public.support_tickets (anonymous_access_token_hash)
  where anonymous_access_token_hash is not null;
create index if not exists idx_support_tickets_anonymous_access
  on public.support_tickets (anonymous_access_token_hash, anonymous_access_expires_at)
  where anonymous_access_token_hash is not null and anonymous_access_revoked_at is null;

create table if not exists public.support_anonymous_rate_limits (
  scope_key text not null,
  endpoint text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (scope_key, endpoint)
);

create table if not exists public.support_telegram_deliveries (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  binding_reference text not null,
  recipient_label text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_attempted_at timestamptz,
  sent_at timestamptz,
  last_error_code text,
  telegram_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ticket_id, binding_reference),
  constraint support_telegram_delivery_status_check check (status in ('pending','sent','failed','retrying','skipped','invalid_recipient'))
);

create index if not exists idx_support_anonymous_rate_limits_updated
  on public.support_anonymous_rate_limits (updated_at);
create index if not exists idx_support_telegram_deliveries_ticket
  on public.support_telegram_deliveries (ticket_id, status, updated_at);

create table if not exists public.support_telegram_message_refs (
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  telegram_chat_id text not null,
  telegram_message_id text not null,
  created_at timestamptz not null default now(),
  primary key (telegram_chat_id, telegram_message_id),
  unique (ticket_id, telegram_chat_id)
);
alter table public.support_telegram_message_refs enable row level security;
create index if not exists idx_support_telegram_message_refs_ticket on public.support_telegram_message_refs (ticket_id, telegram_chat_id);

grant select, insert, update, delete on public.support_tickets to service_role;
grant select, insert, update, delete on public.support_messages to service_role;
grant select, insert, update, delete on public.support_audit_log to service_role;
grant select, insert, update, delete on public.support_telegram_link_tokens to service_role;
grant select, insert, update, delete on public.support_telegram_bindings to service_role;
grant select, insert, update, delete on public.support_telegram_message_refs to service_role;
grant select, insert, update, delete on public.support_anonymous_rate_limits to service_role;
grant select, insert, update, delete on public.support_telegram_deliveries to service_role;
grant select on public.support_tickets, public.support_messages to anon, authenticated;
grant insert on public.support_messages to authenticated;
grant select on public.support_audit_log to authenticated;
grant select on public.support_telegram_bindings to authenticated;

create or replace function public.support_check_anonymous_rate_limit(
  scope_keys text[],
  target_endpoint text,
  limit_count integer,
  window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  scope text;
  current_count integer;
  oldest_window timestamptz := now_ts;
begin
  if coalesce(array_length(scope_keys, 1), 0) = 0 or target_endpoint = '' or limit_count < 1 or window_seconds < 1 then
    return query select false, window_seconds;
    return;
  end if;

  foreach scope in array scope_keys loop
    if scope is null or scope = '' then
      continue;
    end if;
    insert into public.support_anonymous_rate_limits(scope_key, endpoint, window_started_at, request_count, updated_at)
    values (scope, target_endpoint, now_ts, 1, now_ts)
    on conflict (scope_key, endpoint) do update
      set window_started_at = case
        when public.support_anonymous_rate_limits.window_started_at + make_interval(secs => window_seconds) <= now_ts then now_ts
        else public.support_anonymous_rate_limits.window_started_at
      end,
      request_count = case
        when public.support_anonymous_rate_limits.window_started_at + make_interval(secs => window_seconds) <= now_ts then 1
        else public.support_anonymous_rate_limits.request_count + 1
      end,
      updated_at = now_ts
    returning support_anonymous_rate_limits.request_count, support_anonymous_rate_limits.window_started_at
    into current_count, oldest_window;
    if current_count > limit_count then
      return query select false, greatest(1, ceil(extract(epoch from oldest_window + make_interval(secs => window_seconds) - now_ts))::integer);
      return;
    end if;
  end loop;
  return query select true, 0;
end;
$$;

create or replace function public.support_revoke_anonymous_access(
  target_ticket_id uuid,
  actor_user_id uuid,
  revoke_reason text default 'manual'
)
returns table (ticket_id uuid, revoked_at timestamptz, applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org uuid;
begin
  select organization_id into target_org from public.support_tickets where id = target_ticket_id;
  if target_org is null or not exists (
    select 1 from public.organization_members member
    where member.organization_id = target_org
      and member.user_id = actor_user_id
      and member.status = 'active'
      and lower(trim(member.role_code)) in ('owner','manager')
  ) then
    return;
  end if;
  return query
  update public.support_tickets
  set anonymous_access_revoked_at = coalesce(anonymous_access_revoked_at, now()),
      anonymous_access_revoked_by = case when anonymous_access_revoked_at is null then actor_user_id else anonymous_access_revoked_by end,
      anonymous_access_revoke_reason = case when anonymous_access_revoked_at is null then left(coalesce(revoke_reason, 'manual'), 200) else anonymous_access_revoke_reason end
  where id = target_ticket_id
    and requester_user_id is null
    and anonymous_access_token_hash is not null
    and anonymous_access_revoked_at is null
  returning id, anonymous_access_revoked_at, anonymous_access_revoked_at = now();
end;
$$;

create or replace function public.support_revoke_closed_anonymous_access()
returns integer
language sql
security definer
set search_path = public
as $$
  update public.support_tickets
  set anonymous_access_revoked_at = coalesce(anonymous_access_revoked_at, now()),
      anonymous_access_revoke_reason = coalesce(anonymous_access_revoke_reason, 'conversation_closed')
  where conversation_state = 'closed'
    and requester_user_id is null
    and anonymous_access_token_hash is not null
    and anonymous_access_revoked_at is null;
  select count(*)::integer from public.support_tickets where conversation_state = 'closed' and requester_user_id is null and anonymous_access_revoked_at is not null;
$$;

grant execute on function public.support_check_anonymous_rate_limit(text[], text, integer, integer) to service_role;
grant execute on function public.support_revoke_anonymous_access(uuid, uuid, text) to service_role;
grant execute on function public.support_revoke_closed_anonymous_access() to service_role;

create or replace function public.support_create_conversation_with_initial_message(
  ticket_payload jsonb,
  initial_message text,
  audit_metadata jsonb
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  created_ticket public.support_tickets;
begin
  insert into public.support_tickets (
    organization_id, requester_user_id, requester_name, requester_email, requester_phone,
    requester_language, category, priority, status, conversation_state, subject,
    customer_message, conversation_summary, ai_summary, delivery_status,
    idempotency_scope, idempotency_key_hash, confirmation_action_id, confirmation_expires_at,
    anonymous_access_token_hash, anonymous_access_expires_at
  )
  select organization_id, requester_user_id, requester_name, requester_email, requester_phone,
    requester_language, category, priority, status, conversation_state, subject,
    customer_message, conversation_summary, ai_summary, delivery_status,
    idempotency_scope, idempotency_key_hash, confirmation_action_id, confirmation_expires_at,
    anonymous_access_token_hash, anonymous_access_expires_at
  from jsonb_to_record(ticket_payload) as payload(
    organization_id uuid, requester_user_id uuid, requester_name text, requester_email text, requester_phone text,
    requester_language text, category text, priority text, status text, conversation_state text, subject text,
    customer_message text, conversation_summary text, ai_summary text, delivery_status text,
    idempotency_scope text, idempotency_key_hash text, confirmation_action_id uuid, confirmation_expires_at timestamptz,
    anonymous_access_token_hash text, anonymous_access_expires_at timestamptz
  )
  returning * into created_ticket;

  insert into public.support_messages(ticket_id, sender_type, sender_user_id, message, message_type, content_type, source, is_internal)
  values (created_ticket.id, 'client', created_ticket.requester_user_id, initial_message, 'text', 'text', 'web', false);
  insert into public.support_audit_log(ticket_id, actor_type, actor_user_id, action, safe_metadata)
  values (created_ticket.id, case when created_ticket.requester_user_id is null then 'anonymous' else 'client' end, created_ticket.requester_user_id, 'created', coalesce(audit_metadata, '{}'::jsonb));
  return created_ticket;
exception when others then
  raise exception using message = 'support conversation creation failed', errcode = sqlstate;
end;
$$;

grant execute on function public.support_create_conversation_with_initial_message(jsonb, text, jsonb) to service_role;

drop policy if exists support_messages_select on public.support_messages;
create policy support_messages_select on public.support_messages
  for select using (
    exists (
      select 1 from public.support_tickets ticket
      where ticket.id = ticket_id
        and (
          (ticket.requester_user_id = auth.uid() and is_internal = false)
          or (public.support_is_org_staff(ticket.organization_id) and public.support_can_read_ticket(ticket.id))
        )
    )
  );

create or replace function public.support_consume_telegram_link_token(target_token_hash text)
returns table (token_id uuid, organization_id uuid, user_id uuid)
language sql
security definer
set search_path = public
as $$
  update public.support_telegram_link_tokens token
  set used_at = now()
  where token.token_hash = target_token_hash
    and token.used_at is null
    and token.expires_at > now()
    and exists (
      select 1 from public.organization_members member
      where member.organization_id = token.organization_id
        and member.user_id = token.user_id
        and member.status = 'active'
        and lower(trim(member.role_code)) in ('owner','manager')
    )
  returning id, organization_id, user_id;
$$;

grant execute on function public.support_consume_telegram_link_token(text) to service_role;

comment on column public.support_tickets.anonymous_access_token_hash is 'SHA-256 hash of the short-lived anonymous conversation access token.';
comment on column public.support_messages.client_message_id is 'Client-generated idempotency key scoped to one conversation.';
