create extension if not exists "pgcrypto";

-- Utility trigger for updated_at columns.
create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Membership helpers based on organization_members.role_code.
create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_org_id
      and om.user_id = auth.uid()
  );
$$;

create or replace function public.current_org_role_code(target_org_id uuid)
returns text
language sql
stable
as $$
  select lower(trim(coalesce(om.role_code, '')))
  from public.organization_members om
  where om.organization_id = target_org_id
    and om.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_org_manager(target_org_id uuid)
returns boolean
language sql
stable
as $$
  select public.current_org_role_code(target_org_id) in ('owner', 'admin', 'manager');
$$;

create or replace function public.validate_apartment_assignees()
returns trigger
language plpgsql
as $$
begin
  if new.responsible_user_id is not null then
    if not exists (
      select 1
      from public.organization_members om
      where om.organization_id = new.organization_id
        and om.user_id = new.responsible_user_id
        and lower(trim(coalesce(om.role_code, ''))) in ('owner', 'admin', 'manager', 'employee', 'staff', 'cleaner', 'maintenance', 'technician')
    ) then
      raise exception 'Responsible user must be an active member of organization with allowed role_code';
    end if;
  end if;

  if new.backup_manager_user_id is not null then
    if not exists (
      select 1
      from public.organization_members om
      where om.organization_id = new.organization_id
        and om.user_id = new.backup_manager_user_id
        and lower(trim(coalesce(om.role_code, ''))) in ('owner', 'admin', 'manager')
    ) then
      raise exception 'Backup manager must be owner/admin/manager in the same organization';
    end if;
  end if;

  return new;
end;
$$;

alter table if exists public.apartments
  add column if not exists responsible_user_id uuid references auth.users(id) on delete set null,
  add column if not exists backup_manager_user_id uuid references auth.users(id) on delete set null;

drop trigger if exists trg_validate_apartment_assignees on public.apartments;
create trigger trg_validate_apartment_assignees
before insert or update of organization_id, responsible_user_id, backup_manager_user_id
on public.apartments
for each row
execute function public.validate_apartment_assignees();

create table if not exists public.organization_notification_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  default_booking_manager_user_id uuid references auth.users(id) on delete set null,
  email_enabled boolean not null default true,
  whatsapp_enabled boolean not null default false,
  whatsapp_provider text,
  whatsapp_channel_connected boolean not null default false,
  fallback_rules jsonb not null default '{}'::jsonb,
  checkin_reminder_hours integer not null default 24,
  checkout_reminder_hours integer not null default 24,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  booking_id text,
  apartment_id text,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint notification_events_event_type_check check (
    event_type in (
      'booking_created',
      'booking_confirmed',
      'booking_payment_succeeded',
      'booking_payment_failed',
      'booking_changed',
      'booking_cancelled',
      'booking_checkin_upcoming',
      'booking_checkout_upcoming',
      'booking_unassigned'
    )
  ),
  constraint notification_events_idempotency_unique unique (organization_id, idempotency_key)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.notification_events(id) on delete cascade,
  title text not null,
  message text not null,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_event_recipient_unique unique (organization_id, event_id, recipient_user_id)
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.notification_events(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_guest_id text,
  recipient_key text not null,
  channel text not null,
  destination text not null,
  template_key text not null,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_channel_check check (channel in ('email', 'whatsapp')),
  constraint notification_deliveries_status_check check (
    status in ('queued', 'processing', 'sent', 'delivered', 'failed', 'retry_scheduled', 'permanently_failed')
  ),
  constraint notification_deliveries_recipient_check check (
    (recipient_user_id is not null and recipient_guest_id is null)
    or (recipient_user_id is null and recipient_guest_id is not null)
  ),
  constraint notification_deliveries_unique unique (organization_id, event_id, recipient_key, channel, template_key)
);

create table if not exists public.notification_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default true,
  whatsapp_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, event_type),
  constraint notification_preferences_event_type_check check (
    event_type in (
      'booking_created',
      'booking_confirmed',
      'booking_payment_succeeded',
      'booking_payment_failed',
      'booking_changed',
      'booking_cancelled',
      'booking_checkin_upcoming',
      'booking_checkout_upcoming',
      'booking_unassigned'
    )
  )
);

create index if not exists idx_notification_events_org_created
  on public.notification_events (organization_id, created_at desc);
create index if not exists idx_notification_events_booking
  on public.notification_events (booking_id);
create index if not exists idx_notifications_recipient_unread
  on public.notifications (recipient_user_id, read_at, created_at desc);
create index if not exists idx_notification_deliveries_queue
  on public.notification_deliveries (status, next_attempt_at, created_at);
create index if not exists idx_notification_deliveries_org
  on public.notification_deliveries (organization_id, created_at desc);

alter table public.organization_notification_settings enable row level security;
alter table public.notification_events enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_preferences enable row level security;

drop policy if exists organization_notification_settings_select on public.organization_notification_settings;
create policy organization_notification_settings_select on public.organization_notification_settings
for select using (public.is_org_member(organization_id));

drop policy if exists organization_notification_settings_manage on public.organization_notification_settings;
create policy organization_notification_settings_manage on public.organization_notification_settings
for all using (public.is_org_manager(organization_id))
with check (public.is_org_manager(organization_id));

drop policy if exists notification_events_select on public.notification_events;
create policy notification_events_select on public.notification_events
for select using (public.is_org_member(organization_id));

drop policy if exists notification_events_insert on public.notification_events;
create policy notification_events_insert on public.notification_events
for insert with check (public.is_org_member(organization_id));

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select using (
  public.is_org_member(organization_id)
  and recipient_user_id = auth.uid()
);

drop policy if exists notifications_insert_staff on public.notifications;
create policy notifications_insert_staff on public.notifications
for insert with check (
  public.is_org_member(organization_id)
  and (
    recipient_user_id = auth.uid()
    or public.is_org_manager(organization_id)
  )
);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update using (
  public.is_org_member(organization_id)
  and recipient_user_id = auth.uid()
)
with check (
  public.is_org_member(organization_id)
  and recipient_user_id = auth.uid()
);

drop policy if exists notification_deliveries_select_staff on public.notification_deliveries;
create policy notification_deliveries_select_staff on public.notification_deliveries
for select using (public.is_org_member(organization_id));

drop policy if exists notification_deliveries_insert_staff on public.notification_deliveries;
create policy notification_deliveries_insert_staff on public.notification_deliveries
for insert with check (public.is_org_manager(organization_id));

drop policy if exists notification_deliveries_update_staff on public.notification_deliveries;
create policy notification_deliveries_update_staff on public.notification_deliveries
for update using (public.is_org_manager(organization_id))
with check (public.is_org_manager(organization_id));

drop policy if exists notification_preferences_select on public.notification_preferences;
create policy notification_preferences_select on public.notification_preferences
for select using (
  public.is_org_member(organization_id)
  and (user_id = auth.uid() or public.is_org_manager(organization_id))
);

drop policy if exists notification_preferences_insert on public.notification_preferences;
create policy notification_preferences_insert on public.notification_preferences
for insert with check (
  public.is_org_member(organization_id)
  and (user_id = auth.uid() or public.is_org_manager(organization_id))
);

drop policy if exists notification_preferences_update on public.notification_preferences;
create policy notification_preferences_update on public.notification_preferences
for update using (
  public.is_org_member(organization_id)
  and (user_id = auth.uid() or public.is_org_manager(organization_id))
)
with check (
  public.is_org_member(organization_id)
  and (user_id = auth.uid() or public.is_org_manager(organization_id))
);

drop trigger if exists trg_org_notification_settings_updated_at on public.organization_notification_settings;
create trigger trg_org_notification_settings_updated_at
before update on public.organization_notification_settings
for each row
execute function public.set_row_updated_at();

drop trigger if exists trg_notification_deliveries_updated_at on public.notification_deliveries;
create trigger trg_notification_deliveries_updated_at
before update on public.notification_deliveries
for each row
execute function public.set_row_updated_at();

drop trigger if exists trg_notification_preferences_updated_at on public.notification_preferences;
create trigger trg_notification_preferences_updated_at
before update on public.notification_preferences
for each row
execute function public.set_row_updated_at();
