-- Public booking requests: no guest authentication and no online payment.
-- Apply only after reviewing in a non-production environment.

alter table public.bookings
  add column if not exists guest_comment text not null default '',
  add column if not exists guests_count integer not null default 1,
  add column if not exists request_status text;

update public.bookings
set request_status = case status
  when 'pending' then 'pending'
  when 'confirmed' then 'confirmed'
  when 'cancelled' then 'cancelled'
    when 'checked_in' then 'confirmed'
    when 'checked_out' then 'confirmed'
    when 'no_show' then 'confirmed'
    else 'pending'
  end
where request_status is null;

alter table public.bookings
  alter column request_status set default 'pending',
  alter column request_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_public_request_status_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_public_request_status_check
      check (request_status in ('pending', 'confirmed', 'rejected', 'cancelled'))
      not valid;
  end if;

  if exists (
    select 1 from pg_constraint
    where conname = 'bookings_public_request_status_check'
      and conrelid = 'public.bookings'::regclass
      and not convalidated
  ) then
    alter table public.bookings
      validate constraint bookings_public_request_status_check;
  end if;
end;
$$;

create index if not exists idx_bookings_public_request_status
  on public.bookings (organization_id, request_status, created_at desc);

create or replace function public.sync_booking_request_status()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.request_status is null then
    new.request_status := case new.status
      when 'pending' then 'pending'
      when 'confirmed' then 'confirmed'
      when 'cancelled' then 'cancelled'
      when 'checked_in' then 'confirmed'
      when 'checked_out' then 'confirmed'
      when 'no_show' then 'confirmed'
      else 'pending'
    end;
  elsif new.request_status <> 'rejected'
    and tg_op = 'UPDATE'
    and new.status is distinct from old.status
    and new.request_status is not distinct from old.request_status then
    new.request_status := case new.status
      when 'pending' then 'pending'
      when 'confirmed' then 'confirmed'
      when 'cancelled' then 'cancelled'
      when 'checked_in' then 'confirmed'
      when 'checked_out' then 'confirmed'
      when 'no_show' then 'confirmed'
      else new.request_status
    end;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_sync_booking_request_status'
      and tgrelid = 'public.bookings'::regclass
      and not tgisinternal
  ) then
    create trigger trg_sync_booking_request_status
    before insert or update of status, request_status on public.bookings
    for each row execute function public.sync_booking_request_status();
  end if;
end;
$$;

revoke all on table public.bookings from anon;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bookings'
      and policyname = 'internal_bookings_all'
      and roles = array['authenticated']::name[]
      and cmd = 'ALL'
      and qual = 'is_internal_user()'
      and with_check = 'is_internal_user()'
  ) then
    alter policy internal_bookings_all on public.bookings
      using (public.is_org_manager(organization_id))
      with check (public.is_org_manager(organization_id));
  elsif exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bookings'
      and policyname = 'internal_bookings_all'
  ) then
    raise exception 'internal_bookings_all exists with an unexpected definition; review before rollout';
  elsif not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bookings'
      and policyname = 'bookings_org_managers'
  ) then
    create policy bookings_org_managers on public.bookings
      for all to authenticated
      using (public.is_org_manager(organization_id))
      with check (public.is_org_manager(organization_id));
  end if;
end;
$$;

create or replace function public.create_public_booking_request(
  requested_apartment_id uuid,
  requested_check_in date,
  requested_check_out date,
  requested_guests_count integer,
  requested_rental_type text,
  requested_guest_name text,
  requested_guest_email text,
  requested_guest_phone text,
  requested_guest_comment text
)
returns table (booking_id uuid, organization_id uuid, total_amount numeric, currency text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  apartment_row public.apartments%rowtype;
  booking_row public.bookings%rowtype;
  price_per_period numeric;
  periods_count integer;
  nights integer;
  accommodation_total numeric;
  cleaning_fee_value numeric;
  deposit_value numeric;
  total_value numeric;
  source_value text;
  event_id uuid;
begin
  if requested_guest_name is null or length(trim(requested_guest_name)) < 2 then
    raise exception using errcode = '22023', message = 'guest_name_required';
  end if;
  if requested_guest_email is null or position('@' in trim(requested_guest_email)) < 2 then
    raise exception using errcode = '22023', message = 'guest_email_invalid';
  end if;
  if requested_guest_phone is null or length(trim(requested_guest_phone)) < 5 then
    raise exception using errcode = '22023', message = 'guest_phone_required';
  end if;
  if requested_check_in < current_date or requested_check_out <= requested_check_in then
    raise exception using errcode = '22023', message = 'invalid_dates';
  end if;
  if requested_guests_count is null or requested_guests_count < 1 then
    raise exception using errcode = '22023', message = 'invalid_guest_count';
  end if;
  if requested_rental_type not in ('daily', 'weekly', 'monthly') then
    raise exception using errcode = '22023', message = 'invalid_rental_type';
  end if;

  select * into apartment_row
  from public.apartments
  where id = requested_apartment_id
  for share;

  if apartment_row.id is null or apartment_row.organization_id is null then
    raise exception using errcode = 'P0002', message = 'apartment_not_found';
  end if;
  if coalesce(apartment_row.publication_status, '') <> 'published'
     and coalesce(apartment_row.publish_status, '') <> 'Опубликован' then
    raise exception using errcode = '42501', message = 'apartment_unavailable';
  end if;
  if lower(coalesce(apartment_row.status, '')) = 'черновик'
     or lower(coalesce(apartment_row.availability, '')) = 'на обслуживании' then
    raise exception using errcode = '42501', message = 'apartment_unavailable';
  end if;
  if apartment_row.max_guests is not null and requested_guests_count > apartment_row.max_guests then
    raise exception using errcode = '22023', message = 'capacity_exceeded';
  end if;
  if not coalesce((apartment_row.rental_types ->> requested_rental_type)::boolean, false) then
    raise exception using errcode = '22023', message = 'rental_type_not_allowed';
  end if;

  price_per_period := case requested_rental_type
    when 'daily' then apartment_row.daily_price
    when 'weekly' then apartment_row.weekly_price
    when 'monthly' then apartment_row.monthly_price
  end;
  if coalesce(price_per_period, 0) <= 0 then
    raise exception using errcode = '22023', message = 'pricing_not_configured';
  end if;

  nights := requested_check_out - requested_check_in;
  if requested_rental_type = 'daily' and apartment_row.minimum_nights is not null and nights < apartment_row.minimum_nights then
    raise exception using errcode = '22023', message = 'minimum_stay_not_met';
  end if;
  if requested_rental_type = 'weekly' and apartment_row.minimum_weeks is not null and ceil(nights / 7.0) < apartment_row.minimum_weeks then
    raise exception using errcode = '22023', message = 'minimum_stay_not_met';
  end if;
  if requested_rental_type = 'monthly' and apartment_row.minimum_months is not null and ceil(nights / 30.0) < apartment_row.minimum_months then
    raise exception using errcode = '22023', message = 'minimum_stay_not_met';
  end if;

  periods_count := case requested_rental_type when 'daily' then nights when 'weekly' then ceil(nights / 7.0) else ceil(nights / 30.0) end;
  accommodation_total := price_per_period * periods_count;
  cleaning_fee_value := greatest(coalesce(apartment_row.cleaning_fee, 0), 0);
  deposit_value := greatest(coalesce(apartment_row.deposit, 0), 0);
  total_value := greatest(accommodation_total + cleaning_fee_value + deposit_value, 0);

  if exists (
    select 1 from public.bookings booking
    where booking.apartment_id = requested_apartment_id
      and coalesce(booking.status, 'pending') not in ('cancelled', 'rejected', 'declined', 'expired')
      and coalesce(booking.request_status, booking.status, 'pending') not in ('cancelled', 'rejected')
      and booking.check_in < requested_check_out
      and booking.check_out > requested_check_in
  ) then
    raise exception using errcode = '23P01', message = 'booking_conflict';
  end if;

  -- Production currently allows website but not public_website in source check.
  -- Use public_website only when the existing check already supports it.
  select case
    when position('public_website' in pg_get_constraintdef(oid)) > 0 then 'public_website'
    else 'website'
  end
  into source_value
  from pg_constraint
  where conrelid = 'public.bookings'::regclass
    and conname = 'bookings_source_check';
  source_value := coalesce(source_value, 'website');

  insert into public.bookings (
    organization_id, apartment_id, check_in, check_out,
    guests_count, guest_name, guest_email, guest_phone, guest_comment,
    rental_type, price_per_period, accommodation_total, cleaning_fee,
    deposit, discount, total_amount, status, request_status,
    payment_status, source, created_at, updated_at
  ) values (
    apartment_row.organization_id, apartment_row.id,
    requested_check_in, requested_check_out,
    requested_guests_count,
    trim(requested_guest_name), lower(trim(requested_guest_email)), trim(requested_guest_phone), coalesce(trim(requested_guest_comment), ''),
    requested_rental_type, price_per_period, accommodation_total, cleaning_fee_value,
    deposit_value, 0, total_value, 'pending', 'pending',
    'unpaid', source_value, now(), now()
  ) returning * into booking_row;

  if to_regclass('public.notification_events') is not null then
    insert into public.notification_events (
      organization_id, event_type, entity_type, entity_id, booking_id, apartment_id,
      payload, idempotency_key, created_by_user_id
    ) values (
      booking_row.organization_id, 'booking_created', 'booking', booking_row.id::text, booking_row.id::text, booking_row.apartment_id::text,
      jsonb_build_object('bookingId', booking_row.id, 'apartmentId', booking_row.apartment_id, 'guestName', booking_row.guest_name, 'guestEmail', booking_row.guest_email, 'checkIn', booking_row.check_in, 'checkOut', booking_row.check_out, 'totalAmount', booking_row.total_amount, 'currency', 'EUR', 'bookingStatus', 'pending', 'paymentStatus', 'unpaid', 'actionUrl', '/bookings/' || booking_row.id),
      'public-booking-request:' || booking_row.id, null
    ) returning id into event_id;

    insert into public.notifications (organization_id, recipient_user_id, event_id, title, message, action_url)
    select booking_row.organization_id, recipient.user_id, event_id,
      'Новый запрос на бронирование',
      trim(booking_row.guest_name) || ': ' || booking_row.check_in || ' - ' || booking_row.check_out,
      '/bookings/' || booking_row.id
    from (
      select organization_row.owner_id as user_id
      from public.organizations organization_row
      where organization_row.id = booking_row.organization_id
      union
      select member.user_id
      from public.organization_members member
      where member.organization_id = booking_row.organization_id
        and member.status = 'active'
        and member.role_code in ('owner', 'manager')
    ) recipient
    where recipient.user_id is not null
    on conflict (organization_id, event_id, recipient_user_id) do nothing;
  end if;

  return query select booking_row.id, booking_row.organization_id, booking_row.total_amount, 'EUR'::text;
end;
$$;

revoke all on function public.create_public_booking_request(uuid, date, date, integer, text, text, text, text, text) from public;
grant execute on function public.create_public_booking_request(uuid, date, date, integer, text, text, text, text, text) to anon, authenticated;
