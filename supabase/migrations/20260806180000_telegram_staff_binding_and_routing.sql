alter table public.support_telegram_bindings
  add column if not exists revoked_at timestamptz,
  add column if not exists last_seen_at timestamptz;

alter table public.support_telegram_link_tokens
  add column if not exists revoked_at timestamptz;

create index if not exists idx_support_telegram_bindings_org_active
  on public.support_telegram_bindings (organization_id, user_id)
  where revoked_at is null;
create index if not exists idx_support_telegram_bindings_identity
  on public.support_telegram_bindings (telegram_user_id, telegram_chat_id)
  where revoked_at is null;
create unique index if not exists support_telegram_bindings_active_user_unique
  on public.support_telegram_bindings (telegram_user_id)
  where revoked_at is null;
create unique index if not exists support_telegram_bindings_active_chat_unique
  on public.support_telegram_bindings (telegram_chat_id)
  where revoked_at is null;
create index if not exists idx_support_telegram_link_tokens_expiry
  on public.support_telegram_link_tokens (expires_at)
  where used_at is null and revoked_at is null;

create or replace function public.support_route_telegram_message(
  target_organization_id uuid,
  target_user_id uuid,
  target_chat_id text,
  target_reply_message_id text default null
)
returns table (ticket_id uuid, public_number text, assigned_to uuid, conversation_state text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select ticket.id, ticket.public_number, ticket.assigned_to, ticket.conversation_state
  from public.support_tickets ticket
  join public.organization_members member
    on member.organization_id = ticket.organization_id
   and member.user_id = target_user_id
   and member.status = 'active'
   and lower(trim(member.role_code)) in ('owner','manager','employee')
  join public.support_telegram_bindings binding
    on binding.organization_id = ticket.organization_id
   and binding.user_id = target_user_id
   and binding.telegram_chat_id = target_chat_id
   and binding.revoked_at is null
  left join public.support_telegram_message_refs message_ref
    on message_ref.ticket_id = ticket.id
   and message_ref.organization_id = target_organization_id
   and message_ref.telegram_chat_id = target_chat_id
   and (target_reply_message_id is null or message_ref.telegram_message_id = target_reply_message_id)
  where ticket.organization_id = target_organization_id
    and ticket.assigned_to = target_user_id
    and ticket.conversation_state = 'manager_active'
    and (target_reply_message_id is null or message_ref.ticket_id is not null)
  order by ticket.updated_at desc
  limit 2;
$$;

revoke execute on function public.support_route_telegram_message(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.support_route_telegram_message(uuid, uuid, text, text) to service_role;
