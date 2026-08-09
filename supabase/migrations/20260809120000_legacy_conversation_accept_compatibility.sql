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
    and ticket.assigned_to is null
    and (
      ticket.conversation_state = 'waiting_manager'
      or (
        ticket.status = 'in_progress'
        and ticket.conversation_state = 'bot_active'
        and ticket.resolved_at is null
        and ticket.closed_at is null
      )
    )
  returning ticket.id, ticket.assigned_to, ticket.conversation_state, true;
end;
$$;

revoke execute on function public.support_accept_conversation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.support_accept_conversation(uuid, uuid) to service_role;
