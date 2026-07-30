insert into storage.buckets (id, name, public)
values ('apartment-photos', 'apartment-photos', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists apartment_photos_storage_select on storage.objects;
create policy apartment_photos_storage_select on storage.objects
  for select
  using (bucket_id = 'apartment-photos');

drop policy if exists apartment_photos_storage_insert on storage.objects;
create policy apartment_photos_storage_insert on storage.objects
  for insert
  with check (
    bucket_id = 'apartment-photos'
    and exists (
      select 1
      from public.apartments a
      join public.organization_members om on om.organization_id = a.organization_id
      where a.id::text = split_part(name, '/', 4)
        and a.organization_id::text = split_part(name, '/', 2)
        and om.user_id = auth.uid()
        and lower(trim(coalesce(om.role_code, ''))) in ('owner', 'admin', 'manager')
    )
  );

drop policy if exists apartment_photos_storage_update on storage.objects;
create policy apartment_photos_storage_update on storage.objects
  for update
  using (
    bucket_id = 'apartment-photos'
    and exists (
      select 1
      from public.apartments a
      join public.organization_members om on om.organization_id = a.organization_id
      where a.id::text = split_part(name, '/', 4)
        and a.organization_id::text = split_part(name, '/', 2)
        and om.user_id = auth.uid()
        and lower(trim(coalesce(om.role_code, ''))) in ('owner', 'admin', 'manager')
    )
  )
  with check (
    bucket_id = 'apartment-photos'
    and exists (
      select 1
      from public.apartments a
      join public.organization_members om on om.organization_id = a.organization_id
      where a.id::text = split_part(name, '/', 4)
        and a.organization_id::text = split_part(name, '/', 2)
        and om.user_id = auth.uid()
        and lower(trim(coalesce(om.role_code, ''))) in ('owner', 'admin', 'manager')
    )
  );

drop policy if exists apartment_photos_storage_delete on storage.objects;
create policy apartment_photos_storage_delete on storage.objects
  for delete
  using (
    bucket_id = 'apartment-photos'
    and exists (
      select 1
      from public.apartments a
      join public.organization_members om on om.organization_id = a.organization_id
      where a.id::text = split_part(name, '/', 4)
        and a.organization_id::text = split_part(name, '/', 2)
        and om.user_id = auth.uid()
        and lower(trim(coalesce(om.role_code, ''))) in ('owner', 'admin', 'manager')
    )
  );