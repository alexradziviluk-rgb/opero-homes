alter table public.apartment_owner_access
  add column if not exists guest_id uuid references public.guests(id) on delete set null;

create unique index if not exists apartment_owner_access_apartment_guest_uidx
  on public.apartment_owner_access (apartment_id, guest_id)
  where guest_id is not null;

create index if not exists apartment_owner_access_guest_status_idx
  on public.apartment_owner_access (guest_id, status)
  where guest_id is not null;

update public.apartment_owner_access access
set guest_id = guest.id
from public.guests guest
where access.guest_id is null
  and access.organization_id = guest.organization_id
  and lower(trim(access.owner_email)) = lower(trim(guest.email));

drop function if exists public.search_property_owners(uuid, text);
create or replace function public.search_property_owners(target_organization_id uuid, target_query text)
returns table (guest_id uuid, user_id uuid, owner_public_number text, owner_name text, owner_email text, owner_phone text, apartment_count bigint)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select guest.id, (array_agg(access.user_id) filter (where access.user_id is not null))[1], max(profile.owner_public_number),
    concat_ws(' ', guest.first_name, guest.last_name), guest.email, guest.phone,
    count(distinct access.apartment_id)
  from public.guests guest
  left join public.apartment_owner_access access
    on access.guest_id = guest.id and access.organization_id = target_organization_id and access.status in ('invited', 'active', 'paused')
  left join public.profiles profile on profile.id = access.user_id
  where guest.organization_id = target_organization_id
    and public.is_org_manager(target_organization_id)
    and (
      nullif(trim(target_query), '') is null
      or lower(concat_ws(' ', guest.first_name, guest.last_name)) like '%' || lower(trim(target_query)) || '%'
      or lower(guest.email) like '%' || lower(trim(target_query)) || '%'
      or regexp_replace(coalesce(guest.phone, ''), '[^0-9]+', '', 'g') like '%' || regexp_replace(trim(target_query), '[^0-9]+', '', 'g') || '%'
      or lower(coalesce(profile.owner_public_number, '')) = lower(trim(target_query))
    )
  group by guest.id, guest.first_name, guest.last_name, guest.email, guest.phone
  order by guest.created_at desc
  limit 25;
$$;

drop function if exists public.list_property_owner_access_for_manager(uuid);
create or replace function public.list_property_owner_access_for_manager(target_apartment_id uuid)
returns table (guest_id uuid, user_id uuid, owner_public_number text, owner_name text, owner_email text, owner_phone text, status text, created_at timestamptz)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select access.guest_id, access.user_id, profile.owner_public_number, access.owner_name, access.owner_email, access.owner_phone, access.status, access.created_at
  from public.apartment_owner_access access
  left join public.profiles profile on profile.id = access.user_id
  where access.apartment_id = target_apartment_id
    and public.is_org_manager(access.organization_id)
  order by access.created_at asc;
$$;

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
  select * into client_row from public.guests where id = target_guest_id and organization_id = target_organization_id;
  if client_row.id is null then raise exception 'CLIENT_NOT_FOUND'; end if;
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

create or replace function public.link_property_owner_access_after_auth_user()
returns trigger
language plpgsql security definer
set search_path = public, auth, pg_catalog
as $$
begin
  update public.apartment_owner_access
  set user_id = new.id, status = 'active', updated_at = now()
  where lower(trim(owner_email)) = lower(trim(new.email))
    and status in ('invited', 'active')
    and user_id is null;
  return new;
end;
$$;

create or replace function public.set_property_owner_access_by_guest(target_organization_id uuid, target_apartment_id uuid, target_guest_id uuid, target_status text)
returns boolean language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if not public.is_org_manager(target_organization_id) then raise exception 'OWNER_ACCESS_NOT_ALLOWED'; end if;
  if target_status not in ('active', 'paused', 'revoked') then raise exception 'INVALID_OWNER_STATUS'; end if;
  update public.apartment_owner_access
  set status = target_status, updated_at = now()
  where organization_id = target_organization_id and apartment_id = target_apartment_id and guest_id = target_guest_id;
  if target_status = 'revoked' and found then
    insert into public.property_owner_audit_log (organization_id, apartment_id, owner_access_id, actor_user_id, action, metadata)
    select target_organization_id, target_apartment_id, id, auth.uid(), 'owner_unassigned', jsonb_build_object('guestId', target_guest_id)
    from public.apartment_owner_access
    where organization_id = target_organization_id and apartment_id = target_apartment_id and guest_id = target_guest_id;
  end if;
  return found;
end;
$$;

drop trigger if exists on_auth_user_created_property_owner_access on auth.users;
create trigger on_auth_user_created_property_owner_access
after insert on auth.users
for each row execute function public.link_property_owner_access_after_auth_user();

revoke all on function public.search_property_owners(uuid, text) from public;
grant execute on function public.search_property_owners(uuid, text) to authenticated;
revoke all on function public.list_property_owner_access_for_manager(uuid) from public;
grant execute on function public.list_property_owner_access_for_manager(uuid) to authenticated;
revoke all on function public.assign_registered_client_as_property_owner(uuid, uuid, uuid) from public;
grant execute on function public.assign_registered_client_as_property_owner(uuid, uuid, uuid) to authenticated;
revoke all on function public.set_property_owner_access_by_guest(uuid, uuid, uuid, text) from public;
grant execute on function public.set_property_owner_access_by_guest(uuid, uuid, uuid, text) to authenticated;