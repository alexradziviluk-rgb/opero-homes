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
  values (target_organization_id, target_apartment_id, target_start_date, target_end_date, 'owner_block', coalesce(target_owner_comment, target_reason_code), target_reason_code, nullif(trim(target_private_note), ''), access_id, 'owner', auth.uid(), 'active', nullif(trim(target_guest_name), ''), target_guest_count, nullif(trim(target_owner_comment), ''))
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

revoke all on function public.create_property_owner_block(uuid,date,date,text,text,text,integer,text) from public;
grant execute on function public.create_property_owner_block(uuid,date,date,text,text,text,integer,text) to authenticated;
