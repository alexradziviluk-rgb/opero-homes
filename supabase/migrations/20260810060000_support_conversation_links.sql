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
    organization_id, apartment_id, booking_id, requester_user_id, requester_name, requester_email, requester_phone,
    requester_language, category, priority, status, conversation_state, subject,
    customer_message, conversation_summary, ai_summary, delivery_status,
    idempotency_scope, idempotency_key_hash, confirmation_action_id, confirmation_expires_at,
    anonymous_access_token_hash, anonymous_access_expires_at
  )
  select organization_id, apartment_id, booking_id, requester_user_id, requester_name, requester_email, requester_phone,
    requester_language, category, priority, status, conversation_state, subject,
    customer_message, conversation_summary, ai_summary, delivery_status,
    idempotency_scope, idempotency_key_hash, confirmation_action_id, confirmation_expires_at,
    anonymous_access_token_hash, anonymous_access_expires_at
  from jsonb_to_record(ticket_payload) as payload(
    organization_id uuid, apartment_id uuid, booking_id uuid, requester_user_id uuid, requester_name text, requester_email text, requester_phone text,
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
