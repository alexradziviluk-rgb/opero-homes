-- Keep public booking requests aligned with the canonical booking date fields.

create or replace function public.sync_booking_canonical_fields()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  return new;
end;
$$;

drop trigger if exists bookings_sync_canonical_fields on public.bookings;

create trigger bookings_sync_canonical_fields
before insert or update on public.bookings
for each row
execute function public.sync_booking_canonical_fields();

revoke all on function public.sync_booking_canonical_fields() from public;