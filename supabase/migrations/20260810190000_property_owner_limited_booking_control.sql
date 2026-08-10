-- Property Owner limited booking control.
-- Owner bookings remain availability blocks and never enter revenue/payment flows.

create sequence if not exists public.property_owner_public_number_seq;

alter table public.profiles
  add column if not exists owner_public_number text;

create unique index if not exists profiles_owner_public_number_uidx
  on public.profiles(owner_public_number)
  where owner_public_number is not null;

create or replace function public.ensure_property_owner_public_number(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  current_number text;
begin
  select owner_public_number into current_number
  from public.profiles
  where id = target_user_id
  for update;
  if current_number is null then
    update public.profiles
    set owner_public_number = 'OWN-' || lpad(nextval('public.property_owner_public_number_seq')::text, 4, '0'), updated_at = now()
    where id = target_user_id
    returning owner_public_number into current_number;
  end if;
  return current_number;
end;
$$;

revoke all on function public.ensure_property_owner_public_number(uuid) from public;
grant execute on function public.ensure_property_owner_public_number(uuid) to authenticated;

alter table public.availability_blocks
  add column if not exists owner_guest_name text,
  add column if not exists owner_guest_count integer,
  add column if not exists owner_comment text;

alter table public.availability_blocks
  drop constraint if exists availability_blocks_owner_guest_count_check;
alter table public.availability_blocks
  add constraint availability_blocks_owner_guest_count_check
  check (owner_guest_count is null or owner_guest_count > 0);

create table if not exists public.property_owner_audit_log (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid references public.apartments(id) on delete set null,
  owner_access_id uuid references public.apartment_owner_access(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('owner_assigned', 'owner_unassigned', 'owner_booking_created', 'owner_booking_updated', 'owner_booking_cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists property_owner_audit_org_created_idx
  on public.property_owner_audit_log(organization_id, created_at desc);
create index if not exists property_owner_audit_apartment_idx
  on public.property_owner_audit_log(apartment_id, created_at desc);

alter table public.property_owner_audit_log enable row level security;
drop policy if exists property_owner_audit_manager_select on public.property_owner_audit_log;
create policy property_owner_audit_manager_select on public.property_owner_audit_log
  for select to authenticated using (public.is_org_manager(organization_id));

grant select on public.property_owner_audit_log to authenticated;
grant all on public.property_owner_audit_log to service_role;

create or replace function public.assign_property_owner_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.user_id is not null then
    perform public.ensure_property_owner_public_number(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_property_owner_number on public.apartment_owner_access;
create trigger trg_assign_property_owner_number
after insert or update of user_id on public.apartment_owner_access
for each row execute function public.assign_property_owner_number();

do $$
declare owner_user_id uuid;
begin
  for owner_user_id in
    select distinct user_id from public.apartment_owner_access where user_id is not null
  loop
    perform public.ensure_property_owner_public_number(owner_user_id);
  end loop;
end;
$$;

create or replace function public.list_property_owner_access_for_manager(target_apartment_id uuid)
returns table (user_id uuid, owner_public_number text, owner_name text, owner_email text, owner_phone text, status text, created_at timestamptz)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select access.user_id, profile.owner_public_number, access.owner_name, access.owner_email, access.owner_phone, access.status, access.created_at
  from public.apartment_owner_access access
  left join public.profiles profile on profile.id = access.user_id
  where access.apartment_id = target_apartment_id
    and public.is_org_manager(access.organization_id)
  order by access.created_at asc;
$$;

create or replace function public.search_property_owners(target_organization_id uuid, target_query text)
returns table (user_id uuid, owner_public_number text, owner_name text, owner_email text, owner_phone text, apartment_count bigint)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select access.user_id, profile.owner_public_number, max(access.owner_name), max(access.owner_email), max(access.owner_phone), count(*)
  from public.apartment_owner_access access
  left join public.profiles profile on profile.id = access.user_id
  where access.organization_id = target_organization_id
    and access.status in ('invited', 'active', 'paused')
    and public.is_org_manager(target_organization_id)
    and (
      nullif(trim(target_query), '') is null
      or lower(coalesce(profile.owner_public_number, '')) = lower(trim(target_query))
      or lower(access.owner_email) like '%' || lower(trim(target_query)) || '%'
      or regexp_replace(coalesce(access.owner_phone, ''), '[^0-9]+', '', 'g') like '%' || regexp_replace(trim(target_query), '[^0-9]+', '', 'g') || '%'
    )
  group by access.user_id, profile.owner_public_number
  order by max(access.owner_name)
  limit 25;
$$;

revoke all on function public.list_property_owner_access_for_manager(uuid) from public;
grant execute on function public.list_property_owner_access_for_manager(uuid) to authenticated;
revoke all on function public.search_property_owners(uuid,text) from public;
grant execute on function public.search_property_owners(uuid,text) to authenticated;

create or replace function public.list_staff_availability_blocks(target_organization_id uuid, target_apartment_id uuid default null)
returns table (id uuid, apartment_id uuid, start_date date, end_date date, status text, reason_code text, private_note text, created_by uuid, created_at timestamptz, updated_at timestamptz, block_source text, owner_public_number text, owner_name text, owner_guest_name text, owner_guest_count integer, owner_comment text)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select ab.id, ab.apartment_id, ab.start_date, ab.end_date, ab.status, ab.reason_code, case when ab.block_source = 'owner' then null else ab.private_note end, ab.created_by, ab.created_at, ab.updated_at, ab.block_source, profile.owner_public_number, case when ab.block_source = 'owner' then access.owner_name end, ab.owner_guest_name, ab.owner_guest_count, ab.owner_comment
  from public.availability_blocks ab
  left join public.apartment_owner_access access on access.id = ab.owner_access_id
  left join public.profiles profile on profile.id = access.user_id
  where ab.organization_id = target_organization_id and ab.status = 'active'
    and (target_apartment_id is null or ab.apartment_id = target_apartment_id)
    and public.is_org_manager(target_organization_id)
  order by ab.start_date asc;
$$;

revoke all on function public.list_staff_availability_blocks(uuid,uuid) from public;
grant execute on function public.list_staff_availability_blocks(uuid,uuid) to authenticated;

create or replace function public.assign_existing_property_owner(target_organization_id uuid, target_apartment_id uuid, target_user_id uuid)
returns boolean
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare
  source_access public.apartment_owner_access%rowtype;
  target_access_id uuid;
begin
  if not public.is_org_manager(target_organization_id) then raise exception 'OWNER_ACCESS_NOT_ALLOWED'; end if;
  if not exists (select 1 from public.apartments where id = target_apartment_id and organization_id = target_organization_id) then raise exception 'APARTMENT_NOT_FOUND'; end if;
  select * into source_access from public.apartment_owner_access
  where organization_id = target_organization_id and user_id = target_user_id and status = 'active'
  order by created_at asc limit 1;
  if source_access.id is null then raise exception 'PROPERTY_OWNER_NOT_FOUND'; end if;
  perform public.ensure_property_owner_public_number(target_user_id);
  insert into public.apartment_owner_access (organization_id, apartment_id, user_id, owner_name, owner_email, owner_phone, status)
  values (target_organization_id, target_apartment_id, target_user_id, source_access.owner_name, source_access.owner_email, source_access.owner_phone, 'active')
  on conflict (apartment_id, user_id) where user_id is not null
  do update set owner_name = excluded.owner_name, owner_email = excluded.owner_email, owner_phone = excluded.owner_phone, status = 'active', updated_at = now()
  returning id into target_access_id;
  insert into public.property_owner_audit_log (organization_id, apartment_id, owner_access_id, actor_user_id, action, metadata)
  values (target_organization_id, target_apartment_id, target_access_id, auth.uid(), 'owner_assigned', jsonb_build_object('ownerPublicNumber', (select owner_public_number from public.profiles where id = target_user_id), 'assignmentMode', 'existing_owner'));
  return true;
end;
$$;

revoke all on function public.assign_existing_property_owner(uuid,uuid,uuid) from public;
grant execute on function public.assign_existing_property_owner(uuid,uuid,uuid) to authenticated;

create or replace function public.set_property_owner_access(target_organization_id uuid, target_apartment_id uuid, target_user_id uuid, target_status text)
returns boolean language plpgsql security definer set search_path = public, pg_catalog as $$
declare access_row public.apartment_owner_access%rowtype;
begin
  if not public.is_org_manager(target_organization_id) then raise exception 'OWNER_ACCESS_NOT_ALLOWED'; end if;
  if target_status not in ('active', 'paused', 'revoked') then raise exception 'INVALID_OWNER_STATUS'; end if;
  update public.apartment_owner_access set status = target_status, updated_at = now()
  where organization_id = target_organization_id and apartment_id = target_apartment_id and user_id = target_user_id
  returning * into access_row;
  if access_row.id is null then return false; end if;
  if target_status = 'revoked' then
    insert into public.property_owner_audit_log (organization_id, apartment_id, owner_access_id, actor_user_id, action, metadata)
    values (target_organization_id, target_apartment_id, access_row.id, auth.uid(), 'owner_unassigned', jsonb_build_object('ownerPublicNumber', (select owner_public_number from public.profiles where id = target_user_id)));
  end if;
  return true;
end;
$$;

revoke all on function public.set_property_owner_access(uuid,uuid,uuid,text) from public;
grant execute on function public.set_property_owner_access(uuid,uuid,uuid,text) to authenticated;

alter table public.notification_events
  drop constraint if exists notification_events_event_type_check;
alter table public.notification_events
  add constraint notification_events_event_type_check check (
    event_type in (
      'booking_created', 'booking_confirmed', 'booking_payment_succeeded', 'booking_payment_failed',
      'booking_changed', 'booking_cancelled', 'booking_checkin_upcoming', 'booking_checkout_upcoming',
      'booking_unassigned', 'new_guest_message', 'owner_invitation_accepted', 'apartment_published',
      'apartment_unpublished', 'calendar_conflict', 'maintenance_created', 'maintenance_completed',
      'booking_ready_for_checkin', 'task_due_soon', 'task_overdue', 'support_ticket_created',
      'support_manager_replied', 'support_conversation_closed', 'owner_booking_created'
    )
  );

alter table public.notification_preferences
  drop constraint if exists notification_preferences_event_type_check;
alter table public.notification_preferences
  add constraint notification_preferences_event_type_check check (
    event_type in (
      'booking_created', 'booking_confirmed', 'booking_payment_succeeded', 'booking_payment_failed',
      'booking_changed', 'booking_cancelled', 'booking_checkin_upcoming', 'booking_checkout_upcoming',
      'booking_unassigned', 'new_guest_message', 'owner_invitation_accepted', 'apartment_published',
      'apartment_unpublished', 'calendar_conflict', 'maintenance_created', 'maintenance_completed',
      'booking_ready_for_checkin', 'task_due_soon', 'task_overdue', 'support_ticket_created',
      'support_manager_replied', 'support_conversation_closed', 'owner_booking_created'
    )
  );

drop function if exists public.create_property_owner_block(uuid, date, date, text, text);
create or replace function public.create_property_owner_block(
  target_apartment_id uuid,
  target_start_date date,
  target_end_date date,
  target_reason_code text,
  target_private_note text default null,
  target_guest_name text default null,
  target_guest_count integer default null,
  target_owner_comment text default null
)
returns public.availability_blocks
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare
  target_organization_id uuid;
  access_id uuid;
  inserted_block public.availability_blocks;
  conflict_exists boolean;
  created_event_id uuid;
  property_name text;
  public_number text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target_end_date <= target_start_date or target_start_date < current_date then raise exception 'Invalid block dates'; end if;
  if target_reason_code not in ('owner_stay', 'family_or_guests', 'renovation', 'maintenance', 'unavailable', 'other') then raise exception 'Invalid reason code'; end if;
  if target_guest_count is not null and target_guest_count <= 0 then raise exception 'Invalid guest count'; end if;
  select a.organization_id, coalesce(a.name, a.title, 'Объект') into target_organization_id, property_name
  from public.apartments a where a.id = target_apartment_id;
  select access.id into access_id from public.apartment_owner_access access
  where access.apartment_id = target_apartment_id and access.user_id = auth.uid() and access.status = 'active';
  if target_organization_id is null or access_id is null then raise exception 'Apartment ownership required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(target_apartment_id::text, 0));
  select exists (
    select 1 from public.bookings b
    where b.apartment_id = target_apartment_id and b.status in ('confirmed', 'checked_in')
      and b.check_in_date < target_end_date and b.check_out_date > target_start_date
    union all
    select 1 from public.availability_blocks ab
    where ab.apartment_id = target_apartment_id and ab.status = 'active'
      and ab.start_date < target_end_date and ab.end_date > target_start_date
  ) into conflict_exists;
  if conflict_exists then raise exception 'Dates conflict with an existing booking or block'; end if;

  insert into public.availability_blocks (organization_id, apartment_id, start_date, end_date, block_type, reason, reason_code, private_note, owner_access_id, block_source, created_by, status, owner_guest_name, owner_guest_count, owner_comment)
  values (target_organization_id, target_apartment_id, target_start_date, target_end_date, 'owner_booking', coalesce(target_owner_comment, target_reason_code), target_reason_code, nullif(trim(target_private_note), ''), access_id, 'owner', auth.uid(), 'active', nullif(trim(target_guest_name), ''), target_guest_count, nullif(trim(target_owner_comment), ''))
  returning * into inserted_block;

  select profile.owner_public_number into public_number from public.profiles profile where profile.id = auth.uid();
  insert into public.property_owner_audit_log (organization_id, apartment_id, owner_access_id, actor_user_id, action, metadata)
  values (target_organization_id, target_apartment_id, access_id, auth.uid(), 'owner_booking_created', jsonb_build_object('startDate', target_start_date, 'endDate', target_end_date, 'guestCount', target_guest_count, 'ownerPublicNumber', public_number));

  insert into public.notification_events (organization_id, event_type, entity_type, entity_id, apartment_id, payload, idempotency_key, created_by_user_id)
  values (target_organization_id, 'owner_booking_created', 'availability_block', inserted_block.id::text, target_apartment_id::text, jsonb_build_object('propertyName', property_name, 'startDate', target_start_date, 'endDate', target_end_date, 'ownerPublicNumber', public_number), 'owner-booking:' || inserted_block.id, auth.uid())
  on conflict (organization_id, idempotency_key) do nothing
  returning id into created_event_id;
  if created_event_id is null then select id into created_event_id from public.notification_events where organization_id = target_organization_id and idempotency_key = 'owner-booking:' || inserted_block.id; end if;
  insert into public.notifications (organization_id, recipient_user_id, event_id, title, message, action_url)
  select target_organization_id, member.user_id, created_event_id, 'Новая бронь собственника',
    format('Владелец добавил бронь для %s на %s — %s.', property_name, target_start_date, target_end_date), '/calendar'
  from public.organization_members member
  where member.organization_id = target_organization_id and member.status = 'active' and member.role_code in ('owner', 'manager')
  on conflict (organization_id, event_id, recipient_user_id) do nothing;

  return inserted_block;
end;
$$;

drop function if exists public.update_property_owner_block(uuid, date, date, text, text);
create or replace function public.update_property_owner_block(target_block_id uuid, target_start_date date, target_end_date date, target_reason_code text, target_private_note text default null, target_guest_name text default null, target_guest_count integer default null, target_owner_comment text default null)
returns public.availability_blocks
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare current_block public.availability_blocks; updated_block public.availability_blocks; conflict_exists boolean;
begin
  select * into current_block from public.availability_blocks where id = target_block_id and created_by = auth.uid() and block_source = 'owner' and status = 'active';
  if current_block.id is null then raise exception 'Block not found or not editable'; end if;
  if target_end_date <= target_start_date or target_start_date < current_date then raise exception 'Invalid block dates'; end if;
  if target_reason_code not in ('owner_stay', 'family_or_guests', 'renovation', 'maintenance', 'unavailable', 'other') then raise exception 'Invalid reason code'; end if;
  if target_guest_count is not null and target_guest_count <= 0 then raise exception 'Invalid guest count'; end if;
  if not public.is_active_property_owner_for_apartment(current_block.apartment_id) then raise exception 'Active ownership required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_block.apartment_id::text, 0));
  select exists (
    select 1 from public.bookings b where b.apartment_id = current_block.apartment_id and b.status in ('confirmed', 'checked_in') and b.check_in_date < target_end_date and b.check_out_date > target_start_date
    union all
    select 1 from public.availability_blocks ab where ab.id <> target_block_id and ab.apartment_id = current_block.apartment_id and ab.status = 'active' and ab.start_date < target_end_date and ab.end_date > target_start_date
  ) into conflict_exists;
  if conflict_exists then raise exception 'Dates conflict with an existing booking or block'; end if;
  update public.availability_blocks set start_date = target_start_date, end_date = target_end_date, reason = coalesce(target_owner_comment, target_reason_code), reason_code = target_reason_code, private_note = nullif(trim(target_private_note), ''), owner_guest_name = nullif(trim(target_guest_name), ''), owner_guest_count = target_guest_count, owner_comment = nullif(trim(target_owner_comment), ''), updated_at = now() where id = target_block_id returning * into updated_block;
  insert into public.property_owner_audit_log (organization_id, apartment_id, owner_access_id, actor_user_id, action, metadata)
  values (updated_block.organization_id, updated_block.apartment_id, updated_block.owner_access_id, auth.uid(), 'owner_booking_updated', jsonb_build_object('startDate', target_start_date, 'endDate', target_end_date, 'guestCount', target_guest_count));
  return updated_block;
end;
$$;

create or replace function public.cancel_property_owner_block(target_block_id uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare cancelled_block public.availability_blocks;
begin
  update public.availability_blocks set status = 'cancelled', updated_at = now()
  where id = target_block_id and created_by = auth.uid() and block_source = 'owner' and status = 'active' and start_date >= current_date
    and public.is_active_property_owner_for_apartment(apartment_id)
  returning * into cancelled_block;
  if cancelled_block.id is null then return false; end if;
  insert into public.property_owner_audit_log (organization_id, apartment_id, owner_access_id, actor_user_id, action, metadata)
  values (cancelled_block.organization_id, cancelled_block.apartment_id, cancelled_block.owner_access_id, auth.uid(), 'owner_booking_cancelled', jsonb_build_object('startDate', cancelled_block.start_date, 'endDate', cancelled_block.end_date));
  return true;
end;
$$;

revoke all on function public.create_property_owner_block(uuid,date,date,text,text,text,integer,text) from public;
grant execute on function public.create_property_owner_block(uuid,date,date,text,text,text,integer,text) to authenticated;
revoke all on function public.update_property_owner_block(uuid,date,date,text,text,text,integer,text) from public;
grant execute on function public.update_property_owner_block(uuid,date,date,text,text,text,integer,text) to authenticated;
revoke all on function public.cancel_property_owner_block(uuid) from public;
grant execute on function public.cancel_property_owner_block(uuid) to authenticated;
