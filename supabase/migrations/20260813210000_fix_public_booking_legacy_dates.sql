create or replace function public.sync_legacy_booking_dates()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.check_in is null then
    new.check_in := new.check_in_date;
  end if;
  if new.check_out is null then
    new.check_out := new.check_out_date;
  end if;
  if new.check_in_date is null then
    new.check_in_date := new.check_in;
  end if;
  if new.check_out_date is null then
    new.check_out_date := new.check_out;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_legacy_booking_dates on public.bookings;
create trigger sync_legacy_booking_dates
before insert or update on public.bookings
for each row execute function public.sync_legacy_booking_dates();

revoke all on function public.sync_legacy_booking_dates() from public;
