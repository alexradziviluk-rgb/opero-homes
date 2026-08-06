-- Link authenticated guest bookings to the existing auth identity.
-- Anonymous public requests continue to use the email-based guest record.
create or replace function public.set_booking_primary_guest()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  authenticated_guest_id uuid;
begin
  authenticated_guest_id := auth.uid();

  if authenticated_guest_id is not null then
    insert into public.guests (
      id,
      first_name,
      last_name,
      email,
      phone,
      organization_id
    ) values (
      authenticated_guest_id,
      coalesce(nullif(split_part(trim(new.guest_name), ' ', 1), ''), 'Гость'),
      coalesce(nullif(trim(substring(trim(new.guest_name) from position(' ' in trim(new.guest_name)) + 1)), ''), 'Гость'),
      lower(trim(new.guest_email)),
      trim(new.guest_phone),
      new.organization_id
    )
    on conflict (id) do update
    set first_name = excluded.first_name,
        last_name = excluded.last_name,
        email = excluded.email,
        phone = excluded.phone,
        organization_id = coalesce(public.guests.organization_id, excluded.organization_id),
        updated_at = now();

    new.primary_guest_id := authenticated_guest_id;
    return new;
  end if;

  if new.primary_guest_id is null and new.guest_email is not null then
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

  return new;
end;
$$;

revoke all on function public.set_booking_primary_guest() from public;
