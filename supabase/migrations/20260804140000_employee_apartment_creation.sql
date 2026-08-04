drop policy if exists apartments_manage_member on public.apartments;
create policy apartments_manage_member on public.apartments
  for all
  using (
    exists (
      select 1
      from public.organization_members member
      where member.organization_id = apartments.organization_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and lower(trim(coalesce(member.role_code, ''))) in ('owner', 'manager', 'employee')
    )
  )
  with check (
    exists (
      select 1
      from public.organization_members member
      where member.organization_id = apartments.organization_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and lower(trim(coalesce(member.role_code, ''))) in ('owner', 'manager', 'employee')
    )
  );

drop policy if exists apartment_photos_manage_member on public.apartment_photos;
create policy apartment_photos_manage_member on public.apartment_photos
  for all
  using (
    exists (
      select 1
      from public.organization_members member
      where member.organization_id = apartment_photos.organization_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and lower(trim(coalesce(member.role_code, ''))) in ('owner', 'manager', 'employee')
    )
  )
  with check (
    exists (
      select 1
      from public.organization_members member
      where member.organization_id = apartment_photos.organization_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and lower(trim(coalesce(member.role_code, ''))) in ('owner', 'manager', 'employee')
    )
  );

create or replace function public.can_manage_apartment_photo_storage(object_name text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.apartments apartment
    join public.organization_members member
      on member.organization_id = apartment.organization_id
    where apartment.id::text = split_part(object_name, '/', 4)
      and apartment.organization_id::text = split_part(object_name, '/', 2)
      and split_part(object_name, '/', 1) = 'organizations'
      and split_part(object_name, '/', 3) = 'apartments'
      and member.user_id = auth.uid()
      and member.status = 'active'
      and lower(trim(coalesce(member.role_code, ''))) in ('owner', 'manager', 'employee')
  );
$$;