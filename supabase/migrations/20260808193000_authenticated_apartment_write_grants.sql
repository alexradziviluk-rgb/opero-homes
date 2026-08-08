grant insert, update, delete on table public.apartments to authenticated;
grant insert, update, delete on table public.apartment_photos to authenticated;
grant select on table public.apartments, public.apartment_photos to service_role;
