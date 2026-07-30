alter table if exists public.apartments
  add column if not exists type text,
  add column if not exists google_link text,
  add column if not exists city text,
  add column if not exists district text,
  add column if not exists address text,
  add column if not exists latitude text,
  add column if not exists longitude text,
  add column if not exists short_desc text,
  add column if not exists bedrooms integer,
  add column if not exists bathrooms integer,
  add column if not exists floor integer,
  add column if not exists area numeric,
  add column if not exists max_guests integer,
  add column if not exists price text,
  add column if not exists deposit numeric,
  add column if not exists cleaning_fee numeric,
  add column if not exists rental_types jsonb not null default '{}'::jsonb,
  add column if not exists daily_price numeric,
  add column if not exists weekly_price numeric,
  add column if not exists monthly_price numeric,
  add column if not exists minimum_nights integer,
  add column if not exists minimum_weeks integer,
  add column if not exists minimum_months integer,
  add column if not exists owner_name text,
  add column if not exists owner_phone text,
  add column if not exists owner_email text,
  add column if not exists responsible_user_id uuid references auth.users(id) on delete set null,
  add column if not exists backup_manager_user_id uuid references auth.users(id) on delete set null,
  add column if not exists availability text,
  add column if not exists publish_status text,
  add column if not exists publication_status text,
  add column if not exists bookings integer not null default 0,
  add column if not exists cover_photo_url text;

update public.apartments
set
  publication_status = coalesce(publication_status, case when publish_status = 'Опубликован' then 'published' else 'draft' end),
  publish_status = coalesce(publish_status, case when publication_status = 'published' then 'Опубликован' else 'Черновик' end),
  status = coalesce(status, case when publication_status = 'published' then 'Свободно' else 'Черновик' end),
  availability = coalesce(availability, case when publication_status = 'published' then 'Свободен' else 'На обслуживании' end),
  rental_types = coalesce(rental_types, '{}'::jsonb),
  bookings = coalesce(bookings, 0)
where true;

alter table if exists public.apartments
  alter column title set default '',
  alter column rental_types set default '{}'::jsonb,
  alter column bookings set default 0;

alter table if exists public.apartments
  enable row level security;

drop policy if exists apartments_select_public on public.apartments;
create policy apartments_select_public on public.apartments
  for select
  using (publication_status = 'published');

drop policy if exists apartments_select_member on public.apartments;
create policy apartments_select_member on public.apartments
  for select
  using (public.is_org_member(organization_id));

drop policy if exists apartments_manage_member on public.apartments;
create policy apartments_manage_member on public.apartments
  for all
  using (public.is_org_manager(organization_id))
  with check (public.is_org_manager(organization_id));

alter table if exists public.apartment_photos
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists size bigint,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_cover boolean not null default false,
  add column if not exists updated_at timestamptz default now();

update public.apartment_photos ap
set organization_id = a.organization_id
from public.apartments a
where a.id = ap.apartment_id and ap.organization_id is null;

alter table if exists public.apartment_photos
  alter column organization_id set not null,
  alter column storage_path set not null,
  alter column file_name set not null,
  alter column mime_type set not null,
  alter column size set not null;

alter table if exists public.apartment_photos
  enable row level security;

drop policy if exists apartment_photos_select_public on public.apartment_photos;
create policy apartment_photos_select_public on public.apartment_photos
  for select
  using (
    exists (
      select 1
      from public.apartments a
      where a.id = apartment_photos.apartment_id
        and a.publication_status = 'published'
    )
  );

drop policy if exists apartment_photos_select_member on public.apartment_photos;
create policy apartment_photos_select_member on public.apartment_photos
  for select
  using (public.is_org_member(organization_id));

drop policy if exists apartment_photos_manage_member on public.apartment_photos;
create policy apartment_photos_manage_member on public.apartment_photos
  for all
  using (public.is_org_manager(organization_id))
  with check (public.is_org_manager(organization_id));
