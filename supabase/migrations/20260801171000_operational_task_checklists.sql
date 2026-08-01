create table if not exists public.operational_task_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.operational_tasks(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_operational_task_items_task on public.operational_task_items(task_id, position);

alter table public.operational_task_items enable row level security;

drop policy if exists operational_task_items_select on public.operational_task_items;
create policy operational_task_items_select on public.operational_task_items
  for select using (
    exists (
      select 1 from public.operational_tasks task
      where task.id = operational_task_items.task_id
        and (
          task.assigned_user_id = auth.uid()
          or exists (
            select 1 from public.organization_members member
            where member.organization_id = task.organization_id
              and member.user_id = auth.uid()
              and member.role_code in ('owner', 'manager')
              and member.status = 'active'
          )
        )
    )
  );

drop policy if exists operational_task_items_manage on public.operational_task_items;
create policy operational_task_items_manage on public.operational_task_items
  for all using (
    exists (
      select 1 from public.operational_tasks task
      where task.id = operational_task_items.task_id
        and (
          task.assigned_user_id = auth.uid()
          or exists (
            select 1 from public.organization_members member
            where member.organization_id = task.organization_id
              and member.user_id = auth.uid()
              and member.role_code in ('owner', 'manager')
              and member.status = 'active'
          )
        )
    )
  ) with check (
    exists (
      select 1 from public.operational_tasks task
      where task.id = operational_task_items.task_id
        and (
          task.assigned_user_id = auth.uid()
          or exists (
            select 1 from public.organization_members member
            where member.organization_id = task.organization_id
              and member.user_id = auth.uid()
              and member.role_code in ('owner', 'manager')
              and member.status = 'active'
          )
        )
    )
  );

grant select, insert, update, delete on public.operational_task_items to authenticated;

alter table public.notification_events
  drop constraint if exists notification_events_event_type_check;

alter table public.notification_events
  add constraint notification_events_event_type_check check (
    event_type in (
      'booking_created', 'booking_confirmed', 'booking_cancelled', 'booking_payment_succeeded',
      'booking_payment_failed', 'new_guest_message', 'owner_invitation_accepted', 'apartment_published',
      'apartment_unpublished', 'calendar_conflict', 'maintenance_created', 'maintenance_completed',
      'booking_changed', 'booking_checkin_upcoming', 'booking_checkout_upcoming', 'booking_unassigned',
      'task_due_soon', 'task_overdue'
    )
  );

alter table public.notification_preferences
  drop constraint if exists notification_preferences_event_type_check;

alter table public.notification_preferences
  add constraint notification_preferences_event_type_check check (
    event_type in (
      'booking_created', 'booking_confirmed', 'booking_cancelled', 'booking_payment_succeeded',
      'booking_payment_failed', 'new_guest_message', 'owner_invitation_accepted', 'apartment_published',
      'apartment_unpublished', 'calendar_conflict', 'maintenance_created', 'maintenance_completed',
      'booking_changed', 'booking_checkin_upcoming', 'booking_checkout_upcoming', 'booking_unassigned',
      'task_due_soon', 'task_overdue'
    )
  );
