create extension if not exists "pgcrypto";

create or replace function public.notification_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.notification_is_org_member(target_org_id uuid)
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

create or replace function public.notification_is_org_manager(target_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_org_id
      and om.user_id = auth.uid()
      and lower(trim(coalesce(om.role_code, ''))) in ('owner', 'manager')
  );
$$;

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

alter table public.notifications
  add column if not exists recipient_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists event_id uuid references public.notification_events(id) on delete cascade;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'user_id'
  ) then
    alter table public.notifications alter column user_id drop not null;
    execute 'update public.notifications set recipient_user_id = user_id where recipient_user_id is null';
  end if;
end;
$$;

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
  primary key (organization_id, user_id, event_type)
);

alter table public.notification_events
  drop constraint if exists notification_events_event_type_check;
alter table public.notification_events
  add constraint notification_events_event_type_check check (
    event_type in (
      'booking_created',
      'booking_confirmed',
      'booking_cancelled',
      'booking_payment_succeeded',
      'booking_payment_failed',
      'new_guest_message',
      'owner_invitation_accepted',
      'apartment_published',
      'apartment_unpublished',
      'calendar_conflict',
      'maintenance_created',
      'maintenance_completed',
      'booking_changed',
      'booking_checkin_upcoming',
      'booking_checkout_upcoming',
      'booking_unassigned'
    )
  );

alter table public.notification_preferences
  drop constraint if exists notification_preferences_event_type_check;
alter table public.notification_preferences
  add constraint notification_preferences_event_type_check check (
    event_type in (
      'booking_created',
      'booking_confirmed',
      'booking_cancelled',
      'booking_payment_succeeded',
      'booking_payment_failed',
      'new_guest_message',
      'owner_invitation_accepted',
      'apartment_published',
      'apartment_unpublished',
      'calendar_conflict',
      'maintenance_created',
      'maintenance_completed',
      'booking_changed',
      'booking_checkin_upcoming',
      'booking_checkout_upcoming',
      'booking_unassigned'
    )
  );

create index if not exists idx_notification_events_org_created
  on public.notification_events (organization_id, created_at desc);
create index if not exists idx_notification_events_booking
  on public.notification_events (booking_id);
create index if not exists idx_notifications_recipient_unread
  on public.notifications (recipient_user_id, read_at, created_at desc);
create unique index if not exists idx_notifications_event_recipient_unique
  on public.notifications (organization_id, event_id, recipient_user_id);
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
for select using (public.notification_is_org_member(organization_id));

drop policy if exists organization_notification_settings_manage on public.organization_notification_settings;
create policy organization_notification_settings_manage on public.organization_notification_settings
for all using (public.notification_is_org_manager(organization_id))
with check (public.notification_is_org_manager(organization_id));

drop policy if exists notification_events_select on public.notification_events;
create policy notification_events_select on public.notification_events
for select using (public.notification_is_org_member(organization_id));

drop policy if exists notification_events_insert on public.notification_events;
create policy notification_events_insert on public.notification_events
for insert with check (public.notification_is_org_member(organization_id));

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select using (
  public.notification_is_org_member(organization_id)
  and recipient_user_id = auth.uid()
);

drop policy if exists notifications_insert_staff on public.notifications;
create policy notifications_insert_staff on public.notifications
for insert with check (
  public.notification_is_org_member(organization_id)
  and (recipient_user_id = auth.uid() or public.notification_is_org_manager(organization_id))
);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update using (
  public.notification_is_org_member(organization_id)
  and recipient_user_id = auth.uid()
)
with check (
  public.notification_is_org_member(organization_id)
  and recipient_user_id = auth.uid()
);

drop policy if exists notification_deliveries_select_staff on public.notification_deliveries;
create policy notification_deliveries_select_staff on public.notification_deliveries
for select using (public.notification_is_org_member(organization_id));

drop policy if exists notification_deliveries_insert_staff on public.notification_deliveries;
create policy notification_deliveries_insert_staff on public.notification_deliveries
for insert with check (public.notification_is_org_manager(organization_id));

drop policy if exists notification_deliveries_update_staff on public.notification_deliveries;
create policy notification_deliveries_update_staff on public.notification_deliveries
for update using (public.notification_is_org_manager(organization_id))
with check (public.notification_is_org_manager(organization_id));

drop policy if exists notification_preferences_select on public.notification_preferences;
create policy notification_preferences_select on public.notification_preferences
for select using (
  public.notification_is_org_member(organization_id)
  and (user_id = auth.uid() or public.notification_is_org_manager(organization_id))
);

drop policy if exists notification_preferences_insert on public.notification_preferences;
create policy notification_preferences_insert on public.notification_preferences
for insert with check (
  public.notification_is_org_member(organization_id)
  and (user_id = auth.uid() or public.notification_is_org_manager(organization_id))
);

drop policy if exists notification_preferences_update on public.notification_preferences;
create policy notification_preferences_update on public.notification_preferences
for update using (
  public.notification_is_org_member(organization_id)
  and (user_id = auth.uid() or public.notification_is_org_manager(organization_id))
)
with check (
  public.notification_is_org_member(organization_id)
  and (user_id = auth.uid() or public.notification_is_org_manager(organization_id))
);

drop trigger if exists trg_org_notification_settings_updated_at on public.organization_notification_settings;
create trigger trg_org_notification_settings_updated_at
before update on public.organization_notification_settings
for each row execute function public.notification_set_updated_at();

drop trigger if exists trg_notification_deliveries_updated_at on public.notification_deliveries;
create trigger trg_notification_deliveries_updated_at
before update on public.notification_deliveries
for each row execute function public.notification_set_updated_at();

drop trigger if exists trg_notification_preferences_updated_at on public.notification_preferences;
create trigger trg_notification_preferences_updated_at
before update on public.notification_preferences
for each row execute function public.notification_set_updated_at();