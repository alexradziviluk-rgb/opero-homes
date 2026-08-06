create sequence if not exists public.support_ticket_number_seq;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  public_number text not null unique default ('OP-' || lpad(nextval('public.support_ticket_number_seq')::text, 4, '0')),
  organization_id uuid references public.organizations(id) on delete set null,
  apartment_id uuid references public.apartments(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  requester_user_id uuid references auth.users(id) on delete set null,
  requester_name text,
  requester_email text,
  requester_phone text,
  requester_language text not null default 'ru',
  category text not null default 'general',
  priority text not null default 'normal',
  status text not null default 'open',
  subject text not null,
  customer_message text not null,
  ai_summary text not null default '',
  assigned_to uuid references auth.users(id) on delete set null,
  idempotency_scope text not null,
  idempotency_key_hash text not null,
  confirmation_action_id uuid not null default gen_random_uuid(),
  confirmation_expires_at timestamptz not null default (now() + interval '15 minutes'),
  telegram_delivery_key text not null default gen_random_uuid()::text,
  telegram_action_token text not null default encode(gen_random_bytes(18), 'hex'),
  telegram_chat_id text,
  telegram_message_id text,
  delivery_status text not null default 'pending',
  delivery_attempt_count integer not null default 0,
  last_attempted_at timestamptz,
  sent_at timestamptz,
  last_delivery_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  constraint support_tickets_status_check check (status in ('pending_confirmation','open','assigned','in_progress','waiting_for_client','resolved','closed','cancelled')),
  constraint support_tickets_priority_check check (priority in ('normal','high','urgent')),
  constraint support_tickets_delivery_check check (delivery_status in ('pending','sent','failed','retrying'))
);

create unique index if not exists support_tickets_idempotency_unique on public.support_tickets (idempotency_scope, idempotency_key_hash);
create unique index if not exists support_tickets_confirmation_action_unique on public.support_tickets (confirmation_action_id);
create unique index if not exists support_tickets_telegram_delivery_unique on public.support_tickets (telegram_delivery_key);
create unique index if not exists support_tickets_telegram_action_unique on public.support_tickets (telegram_action_token);

create table if not exists public.support_telegram_updates (
  update_id bigint primary key,
  received_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_type text not null check (sender_type in ('client','manager','employee','system')),
  sender_user_id uuid references auth.users(id) on delete set null,
  message text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.support_audit_log (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.organization_members add column if not exists telegram_chat_id text;
alter table public.organization_notification_settings add column if not exists telegram_manager_chat_id text;

create or replace function public.support_is_org_staff(target_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members om where om.organization_id = target_org_id and om.user_id = auth.uid() and om.status = 'active' and lower(trim(om.role_code)) in ('owner','manager','employee','cleaner','maintenance'));
$$;

create or replace function public.support_is_org_manager(target_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members om where om.organization_id = target_org_id and om.user_id = auth.uid() and om.status = 'active' and lower(trim(om.role_code)) in ('owner','manager'));
$$;

create or replace function public.support_can_read_ticket(target_ticket_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.support_tickets t
    where t.id = target_ticket_id
      and (t.requester_user_id = auth.uid() or public.support_is_org_staff(t.organization_id))
      and (not public.support_is_org_staff(t.organization_id) or exists (select 1 from public.organization_members om where om.organization_id = t.organization_id and om.user_id = auth.uid() and om.status = 'active' and (lower(trim(om.role_code)) in ('owner','manager') or t.assigned_to = auth.uid())))
  );
$$;

create index if not exists idx_support_tickets_org_status on public.support_tickets (organization_id, status);
create index if not exists idx_support_tickets_assigned_status on public.support_tickets (assigned_to, status);
create index if not exists idx_support_tickets_requester on public.support_tickets (requester_user_id);
create index if not exists idx_support_tickets_public_number on public.support_tickets (public_number);
create index if not exists idx_support_tickets_created_at on public.support_tickets (created_at desc);
create index if not exists idx_support_tickets_telegram_message on public.support_tickets (telegram_chat_id, telegram_message_id);
create index if not exists idx_support_tickets_delivery on public.support_tickets (delivery_status, last_attempted_at);
create index if not exists idx_support_messages_ticket on public.support_messages (ticket_id, created_at);
create index if not exists idx_support_audit_ticket on public.support_audit_log (ticket_id, created_at);

create or replace function public.support_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists support_tickets_updated_at on public.support_tickets;
create trigger support_tickets_updated_at before update on public.support_tickets for each row execute function public.support_set_updated_at();

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_audit_log enable row level security;
alter table public.support_telegram_updates enable row level security;

drop policy if exists support_tickets_client_select on public.support_tickets;
create policy support_tickets_client_select on public.support_tickets for select using (requester_user_id = auth.uid());
drop policy if exists support_tickets_staff_select on public.support_tickets;
create policy support_tickets_staff_select on public.support_tickets for select using (public.support_can_read_ticket(id));
drop policy if exists support_tickets_staff_update on public.support_tickets;
create policy support_tickets_staff_update on public.support_tickets for update using (public.support_can_read_ticket(id)) with check (public.support_can_read_ticket(id));
drop policy if exists support_messages_select on public.support_messages;
create policy support_messages_select on public.support_messages for select using (exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.requester_user_id = auth.uid() and is_internal = false or public.support_can_read_ticket(t.id))));
drop policy if exists support_messages_client_insert on public.support_messages;
create policy support_messages_client_insert on public.support_messages for insert with check (sender_user_id = auth.uid() and sender_type = 'client' and is_internal = false and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.requester_user_id = auth.uid() and t.status in ('open','assigned','in_progress','waiting_for_client')));
drop policy if exists support_messages_staff_insert on public.support_messages;
create policy support_messages_staff_insert on public.support_messages for insert with check (sender_user_id = auth.uid() and sender_type in ('manager','employee') and exists (select 1 from public.support_tickets t where t.id = ticket_id and public.support_can_read_ticket(t.id)));
drop policy if exists support_audit_staff_select on public.support_audit_log;
create policy support_audit_staff_select on public.support_audit_log for select using (exists (select 1 from public.support_tickets t where t.id = ticket_id and public.support_is_org_staff(t.organization_id)));
