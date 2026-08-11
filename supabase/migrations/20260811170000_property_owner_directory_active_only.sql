create or replace function public.search_property_owners(target_organization_id uuid, target_query text)
returns table (user_id uuid, owner_public_number text, owner_name text, owner_email text, owner_phone text, apartment_count bigint)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select access.user_id, profile.owner_public_number, max(access.owner_name), max(access.owner_email), max(access.owner_phone), count(*)
  from public.apartment_owner_access access
  left join public.profiles profile on profile.id = access.user_id
  where access.organization_id = target_organization_id
    and access.status = 'active'
    and access.user_id is not null
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

revoke all on function public.search_property_owners(uuid, text) from public;
grant execute on function public.search_property_owners(uuid, text) to authenticated;