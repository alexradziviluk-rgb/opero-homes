create or replace function public.can_manage_apartment_photo_storage(object_name text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.apartments a
    join public.organization_members om
      on om.organization_id = a.organization_id
    where a.id::text = split_part(object_name, '/', 4)
      and a.organization_id::text = split_part(object_name, '/', 2)
      and split_part(object_name, '/', 1) = 'organizations'
      and split_part(object_name, '/', 3) = 'apartments'
      and om.user_id = auth.uid()
      and lower(trim(coalesce(om.role_code, ''))) in ('owner', 'manager')
  );
$$;

revoke all on function public.can_manage_apartment_photo_storage(text) from public;
grant execute on function public.can_manage_apartment_photo_storage(text) to authenticated;

drop policy if exists apartment_photos_storage_insert on storage.objects;
create policy apartment_photos_storage_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'apartment-photos'
    and public.can_manage_apartment_photo_storage(name)
  );

drop policy if exists apartment_photos_storage_update on storage.objects;
create policy apartment_photos_storage_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'apartment-photos'
    and public.can_manage_apartment_photo_storage(name)
  )
  with check (
    bucket_id = 'apartment-photos'
    and public.can_manage_apartment_photo_storage(name)
  );

drop policy if exists apartment_photos_storage_delete on storage.objects;
create policy apartment_photos_storage_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'apartment-photos'
    and public.can_manage_apartment_photo_storage(name)
  );

create or replace function public.get_public_apartment_booking_periods(target_apartment_id uuid)
returns table (
  id uuid,
  apartment_id uuid,
  check_in date,
  check_out date,
  status text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    b.id,
    b.apartment_id,
    b.check_in_date,
    b.check_out_date,
    b.status
  from public.bookings b
  join public.apartments a on a.id = b.apartment_id
  where b.apartment_id = target_apartment_id
    and a.publication_status = 'published'
    and b.status in ('pending', 'confirmed', 'checked_in');
$$;

revoke all on function public.get_public_apartment_booking_periods(uuid) from public;
grant execute on function public.get_public_apartment_booking_periods(uuid) to anon, authenticated;

create or replace function public.can_guest_book_apartment(target_apartment_id uuid, target_organization_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(trim(coalesce(p.role, ''))) = 'guest'
        and lower(trim(coalesce(p.status, 'active'))) = 'active'
    )
    and exists (
      select 1
      from public.apartments a
      where a.id = target_apartment_id
        and a.organization_id = target_organization_id
        and a.publication_status = 'published'
    );
$$;

revoke all on function public.can_guest_book_apartment(uuid, uuid) from public;
grant execute on function public.can_guest_book_apartment(uuid, uuid) to authenticated;

drop policy if exists guests_select_own on public.guests;
create policy guests_select_own on public.guests
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists guests_insert_own on public.guests;
create policy guests_insert_own on public.guests
  for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists guests_update_own on public.guests;
create policy guests_update_own on public.guests
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists bookings_select_own on public.bookings;
create policy bookings_select_own on public.bookings
  for select
  to authenticated
  using (primary_guest_id = auth.uid());

drop policy if exists bookings_insert_own on public.bookings;
create policy bookings_insert_own on public.bookings
  for insert
  to authenticated
  with check (
    primary_guest_id = auth.uid()
    and public.can_guest_book_apartment(apartment_id, organization_id)
  );