create or replace function public.support_transition_conversation(
  target_ticket_id uuid,
  expected_state text,
  next_state text,
  actor_user_id uuid default null
)
returns table (ticket_id uuid, state_before text, state_after text, applied boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not (
    (expected_state = 'bot_active' and next_state = 'waiting_manager') or
    (expected_state = 'waiting_manager' and next_state = 'manager_active') or
    (expected_state = 'manager_active' and next_state = 'resolved') or
    (expected_state = 'resolved' and next_state = 'closed')
  ) then
    return;
  end if;

  return query
  update public.support_tickets ticket
  set conversation_state = next_state,
      manager_joined_at = case when next_state = 'manager_active' then coalesce(ticket.manager_joined_at, now()) else ticket.manager_joined_at end,
      resolved_at = case when next_state = 'resolved' then coalesce(ticket.resolved_at, now()) else ticket.resolved_at end,
      closed_at = case when next_state = 'closed' then coalesce(ticket.closed_at, now()) else ticket.closed_at end,
      assigned_to = case when next_state = 'manager_active' and actor_user_id is not null then actor_user_id else ticket.assigned_to end
  where ticket.id = target_ticket_id
    and ticket.conversation_state = expected_state
  returning ticket.id, expected_state, ticket.conversation_state, true;
end;
$$;

create or replace function public.support_accept_conversation(
  target_ticket_id uuid,
  manager_user_id uuid
)
returns table (ticket_id uuid, assigned_user_id uuid, conversation_state text, applied boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  actor_id uuid := coalesce(auth.uid(), manager_user_id);
begin
  if actor_id is null or not exists (
    select 1 from public.organization_members member
    join public.support_tickets ticket on ticket.organization_id = member.organization_id
    where ticket.id = target_ticket_id
      and member.user_id = actor_id
      and member.status = 'active'
      and lower(trim(member.role_code)) in ('owner','manager')
  ) then
    return;
  end if;

  return query
  update public.support_tickets ticket
  set conversation_state = 'manager_active',
      status = case when ticket.status in ('open','assigned') then 'in_progress' else ticket.status end,
      assigned_to = actor_id,
      manager_joined_at = coalesce(ticket.manager_joined_at, now())
  where ticket.id = target_ticket_id
    and ticket.conversation_state = 'waiting_manager'
    and ticket.assigned_to is null
  returning ticket.id, ticket.assigned_to, ticket.conversation_state, true;
end;
$$;

create or replace function public.support_transfer_conversation(
  target_ticket_id uuid,
  from_user_id uuid,
  to_user_id uuid
)
returns table (ticket_id uuid, assigned_user_id uuid, applied boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  actor_id uuid := coalesce(auth.uid(), from_user_id);
  target_org uuid;
begin
  select organization_id into target_org from public.support_tickets where id = target_ticket_id;
  if actor_id is null or target_org is null or not exists (
    select 1 from public.organization_members member
    where member.organization_id = target_org
      and member.user_id = actor_id
      and member.status = 'active'
      and lower(trim(member.role_code)) in ('owner','manager')
  ) or not exists (
    select 1 from public.organization_members member
    where member.organization_id = target_org
      and member.user_id = to_user_id
      and member.status = 'active'
      and lower(trim(member.role_code)) in ('owner','manager','employee')
  ) then
    return;
  end if;

  return query
  update public.support_tickets ticket
  set assigned_to = to_user_id
  where ticket.id = target_ticket_id
    and ticket.assigned_to = from_user_id
    and ticket.conversation_state = 'manager_active'
  returning ticket.id, ticket.assigned_to, true;
end;
$$;

create or replace function public.support_resolve_conversation(
  target_ticket_id uuid,
  actor_user_id uuid default null
)
returns table (ticket_id uuid, state_before text, state_after text, applied boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  actor_id uuid := coalesce(auth.uid(), actor_user_id);
begin
  return query
  update public.support_tickets ticket
  set conversation_state = 'resolved',
      status = 'resolved',
      resolved_at = coalesce(ticket.resolved_at, now())
  where ticket.id = target_ticket_id
    and ticket.conversation_state = 'manager_active'
    and exists (
      select 1 from public.organization_members member
      where member.organization_id = ticket.organization_id
        and member.user_id = actor_id
        and member.status = 'active'
        and (lower(trim(member.role_code)) in ('owner','manager') or ticket.assigned_to = actor_id)
    )
  returning ticket.id, 'manager_active'::text, ticket.conversation_state, true;
end;
$$;

create or replace function public.support_close_conversation(
  target_ticket_id uuid,
  actor_user_id uuid default null
)
returns table (ticket_id uuid, state_before text, state_after text, applied boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  actor_id uuid := coalesce(auth.uid(), actor_user_id);
begin
  return query
  update public.support_tickets ticket
  set conversation_state = 'closed',
      status = 'closed',
      closed_at = coalesce(ticket.closed_at, now())
  where ticket.id = target_ticket_id
    and ticket.conversation_state = 'resolved'
    and exists (
      select 1 from public.organization_members member
      where member.organization_id = ticket.organization_id
        and member.user_id = actor_id
        and member.status = 'active'
        and lower(trim(member.role_code)) in ('owner','manager')
    )
  returning ticket.id, 'resolved'::text, ticket.conversation_state, true;
end;
$$;

create or replace function public.support_create_message(
  target_ticket_id uuid,
  message_text text,
  message_sender_type text,
  message_content_type text default 'text',
  external_message_ref text default null,
  idempotency_key text default null,
  sender_user_id uuid default null
)
returns table (message_id uuid, applied boolean, duplicate boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  actor_id uuid := coalesce(auth.uid(), sender_user_id);
  existing_id uuid;
  created_id uuid;
begin
  if message_text is null or length(trim(message_text)) = 0 or length(message_text) > 2000 then
    return;
  end if;

  if idempotency_key is not null then
    select id into existing_id from public.support_messages
    where ticket_id = target_ticket_id and client_message_id = idempotency_key;
    if existing_id is not null then
      return query select existing_id, false, true;
      return;
    end if;
  end if;

  if not exists (
    select 1 from public.support_tickets ticket
    where ticket.id = target_ticket_id
      and ticket.conversation_state = 'manager_active'
      and exists (
        select 1 from public.organization_members member
        where member.organization_id = ticket.organization_id
          and member.user_id = actor_id
          and member.status = 'active'
          and (lower(trim(member.role_code)) in ('owner','manager') or ticket.assigned_to = actor_id)
      )
  ) then
    return;
  end if;

  insert into public.support_messages(ticket_id, sender_type, sender_user_id, message, message_type, content_type, safe_external_message_ref, client_message_id, is_internal, source)
  values (target_ticket_id, message_sender_type, actor_id, message_text, case when message_sender_type = 'telegram' then 'telegram' else 'text' end, message_content_type, external_message_ref, idempotency_key, false, case when message_sender_type = 'telegram' then 'telegram' else 'web' end)
  returning id into created_id;

  update public.support_tickets
  set last_staff_message_at = now()
  where id = target_ticket_id;

  return query select created_id, true, false;
exception when unique_violation then
  select id into existing_id from public.support_messages where ticket_id = target_ticket_id and client_message_id = idempotency_key;
  return query select existing_id, false, true;
end;
$$;

create or replace function public.support_create_telegram_link_token(
  target_organization_id uuid,
  target_user_id uuid,
  target_token_hash text,
  target_expires_at timestamptz
)
returns table (token_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is not null and auth.uid() <> target_user_id then
    return;
  end if;
  if not exists (
    select 1 from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = target_user_id
      and member.status = 'active'
      and lower(trim(member.role_code)) in ('owner','manager')
  ) then
    return;
  end if;
  return query
  insert into public.support_telegram_link_tokens(organization_id, user_id, token_hash, expires_at)
  values (target_organization_id, target_user_id, target_token_hash, target_expires_at)
  returning id, support_telegram_link_tokens.expires_at;
end;
$$;

create or replace function public.support_accept_telegram_link_token(
  target_token_hash text,
  target_telegram_user_id text,
  target_telegram_chat_id text
)
returns table (organization_id uuid, user_id uuid, linked_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  linked_user uuid;
  linked_org uuid;
  linked_time timestamptz;
begin
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
  returning token.organization_id, token.user_id, token.used_at into linked_org, linked_user, linked_time;

  if linked_user is null then
    return;
  end if;

  insert into public.support_telegram_bindings(organization_id, user_id, telegram_user_id, telegram_chat_id, linked_at, updated_at)
  values (linked_org, linked_user, target_telegram_user_id, target_telegram_chat_id, linked_time, linked_time)
  on conflict (organization_id, user_id) do update
    set telegram_user_id = excluded.telegram_user_id,
        telegram_chat_id = excluded.telegram_chat_id,
        linked_at = excluded.linked_at,
        updated_at = excluded.updated_at,
        revoked_at = null;

  return query select linked_org, linked_user, linked_time;
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
set search_path = public, pg_catalog
as $$
begin
  return query
  update public.support_tickets ticket
  set anonymous_access_revoked_at = coalesce(ticket.anonymous_access_revoked_at, now()),
      anonymous_access_revoked_by = case when ticket.anonymous_access_revoked_at is null then actor_user_id else ticket.anonymous_access_revoked_by end,
      anonymous_access_revoke_reason = case when ticket.anonymous_access_revoked_at is null then left(coalesce(revoke_reason, 'manual'), 200) else ticket.anonymous_access_revoke_reason end
  where ticket.id = target_ticket_id
    and ticket.requester_user_id is null
    and ticket.anonymous_access_token_hash is not null
    and ticket.anonymous_access_revoked_at is null
    and exists (
      select 1 from public.organization_members member
      where member.organization_id = ticket.organization_id
        and member.user_id = coalesce(auth.uid(), actor_user_id)
        and member.status = 'active'
        and lower(trim(member.role_code)) in ('owner','manager')
    )
  returning ticket.id, ticket.anonymous_access_revoked_at, true;
end;
$$;

create or replace function public.support_revoke_closed_anonymous_access()
returns integer
language sql
security definer
set search_path = public, pg_catalog
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

revoke execute on function public.support_create_conversation_with_initial_message(jsonb, text, jsonb) from public, anon, authenticated;
revoke execute on function public.support_revoke_anonymous_access(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.support_revoke_closed_anonymous_access() from public, anon, authenticated;
revoke execute on function public.support_consume_telegram_link_token(text) from public, anon, authenticated;
revoke execute on function public.support_create_message(uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.support_create_telegram_link_token(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.support_accept_telegram_link_token(text, text, text) from public, anon, authenticated;
revoke execute on function public.support_transition_conversation(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.support_accept_conversation(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.support_transfer_conversation(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.support_create_conversation_with_initial_message(jsonb, text, jsonb) to service_role;
grant execute on function public.support_transition_conversation(uuid, text, text, uuid) to service_role;
grant execute on function public.support_accept_conversation(uuid, uuid) to service_role;
grant execute on function public.support_transfer_conversation(uuid, uuid, uuid) to service_role;
grant execute on function public.support_resolve_conversation(uuid, uuid) to service_role;
grant execute on function public.support_close_conversation(uuid, uuid) to service_role;
grant execute on function public.support_revoke_anonymous_access(uuid, uuid, text) to service_role;
grant execute on function public.support_revoke_closed_anonymous_access() to service_role;
grant execute on function public.support_create_message(uuid, text, text, text, text, text, uuid) to service_role;
grant execute on function public.support_create_telegram_link_token(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.support_accept_telegram_link_token(text, text, text) to service_role;
grant execute on function public.support_consume_telegram_link_token(text) to service_role;

alter table public.support_telegram_deliveries enable row level security;
alter table public.support_telegram_message_refs enable row level security;
alter table public.support_anonymous_rate_limits enable row level security;
drop policy if exists support_telegram_deliveries_staff_select on public.support_telegram_deliveries;
create policy support_telegram_deliveries_staff_select on public.support_telegram_deliveries for select to authenticated using (exists (select 1 from public.organization_members member where member.organization_id = support_telegram_deliveries.organization_id and member.user_id = auth.uid() and member.status = 'active' and lower(trim(member.role_code)) in ('owner','manager','employee') and (lower(trim(member.role_code)) in ('owner','manager') or exists (select 1 from public.support_tickets ticket where ticket.id = support_telegram_deliveries.ticket_id and ticket.assigned_to = auth.uid()))));
drop policy if exists support_telegram_message_refs_staff_select on public.support_telegram_message_refs;
create policy support_telegram_message_refs_staff_select on public.support_telegram_message_refs for select to authenticated using (exists (select 1 from public.organization_members member where member.organization_id = support_telegram_message_refs.organization_id and member.user_id = auth.uid() and member.status = 'active' and lower(trim(member.role_code)) in ('owner','manager','employee') and (lower(trim(member.role_code)) in ('owner','manager') or exists (select 1 from public.support_tickets ticket where ticket.id = support_telegram_message_refs.ticket_id and ticket.assigned_to = auth.uid()))));
