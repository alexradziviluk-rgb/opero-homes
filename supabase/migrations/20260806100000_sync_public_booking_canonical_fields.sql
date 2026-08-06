-- Keep public booking requests compatible with the canonical staff booking fields.
-- The public RPC still writes the legacy columns used by older deployments.

create or replace function public.sync_booking_canonical_fields()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.check_in_date is null and new.check_in is not null then
    new.check_in_date := new.check_in;
  end if;

  if new.check_out_date is null and new.check_out is not null then
    new.check_out_date := new.check_out;
  end if;

  if new.check_in is null and new.check_in_date is not null then
    new.check_in := new.check_in_date;
  end if;

  if new.check_out is null and new.check_out_date is not null then
    new.check_out := new.check_out_date;
  end if;

  if new.adults is null and new.guests_count is not null then
    new.adults := new.guests_count;
  end if;

  if new.guests_count is null and new.adults is not null then
    new.guests_count := new.adults;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_sync_canonical_fields on public.bookings;

create trigger bookings_sync_canonical_fields
before insert or update on public.bookings
for each row
execute function public.sync_booking_canonical_fields();

update public.bookings
set check_in_date = coalesce(check_in_date, check_in),
    check_out_date = coalesce(check_out_date, check_out),
    check_in = coalesce(check_in, check_in_date),
    check_out = coalesce(check_out, check_out_date),
    adults = coalesce(adults, guests_count),
    guests_count = coalesce(guests_count, adults)
where check_in_date is null
   or check_out_date is null
   or check_in is null
   or check_out is null
   or adults is null
   or guests_count is null;

revoke all on function public.sync_booking_canonical_fields() from public;