alter table public.bookings
  add column if not exists booking_number text,
  add column if not exists adults integer,
  add column if not exists children integer,
  add column if not exists infants integer,
  add column if not exists pets integer,
  add column if not exists nightly_rate numeric,
  add column if not exists security_deposit numeric,
  add column if not exists taxes_total numeric,
  add column if not exists discount_total numeric,
  add column if not exists amount_paid numeric,
  add column if not exists currency text,
  add column if not exists metadata jsonb;

grant insert, update on table public.bookings to authenticated;
grant select, insert, update on table public.notification_events, public.notifications, public.notification_deliveries to authenticated;
grant all on table public.notification_events, public.notifications, public.notification_deliveries to service_role;
grant all on table public.operational_tasks, public.operational_task_assignees, public.operational_task_items to service_role;

create or replace function public.can_write_notification(
  target_organization_id uuid,
  target_event_id uuid,
  target_recipient_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and coalesce(member.status, 'active') = 'active'
  )
  or exists (
    select 1
    from public.notification_events event
    where event.id = target_event_id
      and event.organization_id = target_organization_id
      and event.created_by_user_id = auth.uid()
  )
  or (
    target_recipient_user_id = auth.uid()
    and exists (
      select 1
      from public.organization_members member
      where member.organization_id = target_organization_id
        and member.user_id = auth.uid()
    )
  );
$$;

grant execute on function public.can_write_notification(uuid, uuid, uuid) to authenticated;

drop policy if exists notifications_insert_staff on public.notifications;
create policy notifications_insert_staff on public.notifications
for insert with check (public.can_write_notification(organization_id, event_id, recipient_user_id));

drop policy if exists notifications_update_staff on public.notifications;
create policy notifications_update_staff on public.notifications
for update using (public.can_write_notification(organization_id, event_id, recipient_user_id))
with check (public.can_write_notification(organization_id, event_id, recipient_user_id));
