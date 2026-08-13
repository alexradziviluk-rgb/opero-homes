-- Public catalog access must never grant anonymous column-level access to the
-- operational apartments tables. Keep the public contract in dedicated views.
create or replace view public.public_apartments as
select
  id,
  slug,
  name,
  type,
  google_link,
  country,
  city,
  district,
  address,
  latitude,
  longitude,
  short_desc,
  rooms,
  bedrooms,
  beds,
  bathrooms,
  floor,
  area,
  max_guests,
  price,
  deposit,
  cleaning_fee,
  rental_types,
  daily_price,
  weekly_price,
  monthly_price,
  minimum_nights,
  minimum_weeks,
  minimum_months,
  status,
  availability,
  publish_status,
  publication_status,
  bookings,
  cover_photo_url,
  amenities,
  house_rules,
  created_at,
  updated_at
from public.apartments
where publication_status = 'published'
  and lower(concat_ws(' ', slug, name, short_desc)) !~
    '(test|do[[:space:]-]*not[[:space:]-]*book|opero[[:space:]-]*ai[[:space:]-]*phase|dogfood|internal|qa|sample|mock)';

create or replace view public.public_apartment_photos as
select
  id,
  apartment_id,
  storage_path,
  file_name,
  mime_type,
  size,
  width,
  height,
  sort_order,
  is_cover,
  created_at,
  updated_at
from public.apartment_photos
where exists (
  select 1
  from public.public_apartments a
  where a.id = apartment_photos.apartment_id
);

revoke select on table public.apartments, public.apartment_photos from anon;
grant select on table public.public_apartments, public.public_apartment_photos to anon, authenticated;