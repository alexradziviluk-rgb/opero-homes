-- Keep public booking requests visible in the authenticated guest account.
create or replace function public.set_booking_primary_guest()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if new.primary_guest_id is null then
    if new.guest_email is not null then
      select id
      into new.primary_guest_id
      from public.guests
      where lower(email) = lower(trim(new.guest_email))
        and (organization_id = new.organization_id or organization_id is null)
      order by organization_id nulls last
      limit 1;
    end if;

    if new.primary_guest_id is null then
      insert into public.guests (
        first_name,
        last_name,
        email,
        phone,
        organization_id
      ) values (
        coalesce(nullif(split_part(trim(new.guest_name), ' ', 1), ''), 'Гость'),
        coalesce(nullif(trim(substring(trim(new.guest_name) from position(' ' in trim(new.guest_name)) + 1)), ''), 'Гость'),
        lower(trim(new.guest_email)),
        trim(new.guest_phone),
        new.organization_id
      )
      returning id into new.primary_guest_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_set_primary_guest on public.bookings;

create trigger bookings_set_primary_guest
before insert on public.bookings
for each row
execute function public.set_booking_primary_guest();

insert into public.guests (first_name, last_name, email, phone, organization_id)
select
  coalesce(nullif(split_part(trim(booking.guest_name), ' ', 1), ''), 'Гость'),
  coalesce(nullif(trim(substring(trim(booking.guest_name) from position(' ' in trim(booking.guest_name)) + 1)), ''), 'Гость'),
  lower(trim(booking.guest_email)),
  trim(booking.guest_phone),
  booking.organization_id
from public.bookings booking
where booking.primary_guest_id is null
  and booking.guest_email is not null
  and not exists (
    select 1
    from public.guests guest
    where lower(guest.email) = lower(trim(booking.guest_email))
      and (guest.organization_id = booking.organization_id or guest.organization_id is null)
  );

update public.bookings booking
set primary_guest_id = guest.id
from public.guests guest
where booking.primary_guest_id is null
  and booking.guest_email is not null
  and lower(trim(booking.guest_email)) = lower(trim(guest.email))
  and (guest.organization_id = booking.organization_id or guest.organization_id is null);