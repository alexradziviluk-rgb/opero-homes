drop function if exists public.search_property_owners(uuid, text);
create or replace function public.search_property_owners(target_organization_id uuid, target_query text)
returns table (guest_id uuid, user_id uuid, owner_public_number text, owner_name text, owner_email text, owner_phone text, apartment_count bigint)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  with guest_results as (
    select guest.id as guest_id,
      (array_agg(access.user_id) filter (where access.user_id is not null))[1] as user_id,
      max(profile.owner_public_number) as owner_public_number,
      concat_ws(' ', guest.first_name, guest.last_name) as owner_name,
      guest.email as owner_email,
      guest.phone as owner_phone,
      count(distinct access.apartment_id) as apartment_count,
      guest.created_at as sort_created_at
    from public.guests guest
    left join public.apartment_owner_access access
      on access.guest_id = guest.id
      and access.organization_id = target_organization_id
      and access.status in ('invited', 'active', 'paused')
    left join public.profiles profile on profile.id = access.user_id
    where (guest.organization_id = target_organization_id or guest.organization_id is null)
      and public.is_org_manager(target_organization_id)
      and (
        nullif(trim(target_query), '') is null
        or lower(trim(guest.email)) like '%' || lower(trim(target_query)) || '%'
        or lower(concat_ws(' ', guest.first_name, guest.last_name)) like '%' || lower(trim(target_query)) || '%'
        or regexp_replace(coalesce(guest.phone, ''), '[^0-9]+', '', 'g') like '%' || regexp_replace(trim(target_query), '[^0-9]+', '', 'g') || '%'
        or lower(coalesce(profile.owner_public_number, '')) = lower(trim(target_query))
      )
    group by guest.id, guest.first_name, guest.last_name, guest.email, guest.phone, guest.created_at
  ), access_results as (
    select access.guest_id,
      access.user_id,
      profile.owner_public_number,
      access.owner_name,
      access.owner_email,
      access.owner_phone,
      count(*)::bigint as apartment_count,
      max(access.created_at) as sort_created_at
    from public.apartment_owner_access access
    left join public.profiles profile on profile.id = access.user_id
    where access.organization_id = target_organization_id
      and access.status in ('invited', 'active', 'paused')
      and public.is_org_manager(target_organization_id)
      and (
        nullif(trim(target_query), '') is null
        or lower(trim(access.owner_email)) like '%' || lower(trim(target_query)) || '%'
        or lower(coalesce(access.owner_name, '')) like '%' || lower(trim(target_query)) || '%'
        or regexp_replace(coalesce(access.owner_phone, ''), '[^0-9]+', '', 'g') like '%' || regexp_replace(trim(target_query), '[^0-9]+', '', 'g') || '%'
        or lower(coalesce(profile.owner_public_number, '')) = lower(trim(target_query))
      )
    group by access.guest_id, access.user_id, profile.owner_public_number, access.owner_name, access.owner_email, access.owner_phone
  )
  select guest_id, user_id, owner_public_number, owner_name, owner_email, owner_phone, apartment_count
  from (
    select * from guest_results
    union all
    select * from access_results
  ) results
  order by sort_created_at desc
  limit 25;
$$;

revoke all on function public.search_property_owners(uuid, text) from public;
grant execute on function public.search_property_owners(uuid, text) to authenticated;

create or replace function public.assign_registered_client_as_property_owner(target_organization_id uuid, target_apartment_id uuid, target_guest_id uuid)
returns boolean
language plpgsql security definer
set search_path = public, auth, pg_catalog
as $$
declare
  client_row public.guests%rowtype;
  matching_user_id uuid;
  target_access_id uuid;
begin
  if not public.is_org_manager(target_organization_id) then raise exception 'OWNER_ACCESS_NOT_ALLOWED'; end if;
  select * into client_row from public.guests where id = target_guest_id and (organization_id = target_organization_id or organization_id is null);
  if client_row.id is null then
    if exists (select 1 from public.guests where id = target_guest_id and organization_id is not null and organization_id <> target_organization_id) then
      raise exception 'CLIENT_ORGANIZATION_MISMATCH';
    end if;
    raise exception 'CLIENT_NOT_FOUND';
  end if;
  if not exists (select 1 from public.apartments where id = target_apartment_id and organization_id = target_organization_id) then raise exception 'APARTMENT_NOT_FOUND'; end if;
  select id into matching_user_id from auth.users where lower(email) = lower(client_row.email) limit 1;
  if matching_user_id is not null then perform public.ensure_property_owner_public_number(matching_user_id); end if;

  insert into public.apartment_owner_access (organization_id, apartment_id, guest_id, user_id, owner_name, owner_email, owner_phone, status)
  values (target_organization_id, target_apartment_id, client_row.id, matching_user_id, concat_ws(' ', client_row.first_name, client_row.last_name), lower(trim(client_row.email)), client_row.phone, 'active')
  on conflict (apartment_id, lower(trim(owner_email))) where status in ('invited', 'active')
  do update set guest_id = excluded.guest_id, user_id = coalesce(excluded.user_id, public.apartment_owner_access.user_id), owner_name = excluded.owner_name, owner_phone = excluded.owner_phone, status = 'active', updated_at = now()
  returning id into target_access_id;

  insert into public.property_owner_audit_log (organization_id, apartment_id, owner_access_id, actor_user_id, action, metadata)
  values (target_organization_id, target_apartment_id, target_access_id, auth.uid(), 'owner_assigned', jsonb_build_object('guestId', target_guest_id, 'assignmentMode', 'registered_client'));
  return true;
end;
$$;

revoke all on function public.assign_registered_client_as_property_owner(uuid, uuid, uuid) from public;
grant execute on function public.assign_registered_client_as_property_owner(uuid, uuid, uuid) to authenticated;

revoke all on function public.assign_existing_property_owner(uuid, uuid, uuid) from public;
grant execute on function public.assign_existing_property_owner(uuid, uuid, uuid) to authenticated;
