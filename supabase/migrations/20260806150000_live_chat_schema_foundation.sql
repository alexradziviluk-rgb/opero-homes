alter table public.support_tickets
  add column if not exists delivery_summary jsonb,
  add column if not exists last_client_message_at timestamptz,
  add column if not exists last_staff_message_at timestamptz;

alter table public.support_messages
  add column if not exists delivery_state text,
  add column if not exists safe_external_message_ref text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'support_messages_content_type_check' and conrelid = 'public.support_messages'::regclass) then
    alter table public.support_messages add constraint support_messages_content_type_check
      check (content_type is null or content_type in ('text','image','pdf','voice','location'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'support_messages_delivery_state_check' and conrelid = 'public.support_messages'::regclass) then
    alter table public.support_messages add constraint support_messages_delivery_state_check
      check (delivery_state is null or delivery_state in ('pending','sent','failed','retrying'));
  end if;
end;
$$;


create unique index if not exists support_messages_client_message_unique
  on public.support_messages (ticket_id, client_message_id)
  where client_message_id is not null;
create unique index if not exists support_tickets_anonymous_access_unique
  on public.support_tickets (anonymous_access_token_hash)
  where anonymous_access_token_hash is not null;
create index if not exists idx_support_tickets_anonymous_access
  on public.support_tickets (anonymous_access_token_hash, anonymous_access_expires_at)
  where anonymous_access_token_hash is not null and anonymous_access_revoked_at is null;
comment on column public.support_tickets.anonymous_access_token_hash is 'SHA-256 hash only; raw anonymous access tokens are never stored.';
comment on column public.support_messages.client_message_id is 'Client idempotency key scoped to one ticket.';
