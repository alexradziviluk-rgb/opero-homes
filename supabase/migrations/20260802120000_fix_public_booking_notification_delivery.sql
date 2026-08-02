-- Make public booking notifications best-effort and compatible with the production notification schema.
-- Apply only after local validation and controlled rollout approval.

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
      and booking.check_in_date < requested_check_out
      and booking.check_out_date > requested_check_in
  ) then
    raise exception using errcode = '23P01', message = 'booking_conflict';
  end if;

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
    organization_id, apartment_id, booking_number, check_in_date, check_out_date,
    adults, guests_count, guest_name, guest_email, guest_phone, guest_comment,
    rental_type, price_per_period, nightly_rate, accommodation_total, cleaning_fee,
    deposit, security_deposit, discount, total_amount, currency, status, request_status,
    payment_status, source, created_at, updated_at
  ) values (
    apartment_row.organization_id, apartment_row.id, 'WEB-' || upper(substr(gen_random_uuid()::text, 1, 8)),
    requested_check_in, requested_check_out,
    requested_guests_count, requested_guests_count,
    trim(requested_guest_name), lower(trim(requested_guest_email)), trim(requested_guest_phone), coalesce(trim(requested_guest_comment), ''),
    requested_rental_type, price_per_period, price_per_period, accommodation_total, cleaning_fee_value,
    deposit_value, deposit_value, 0, total_value, 'EUR', 'pending', 'pending', 'unpaid', source_value, now(), now()
  ) returning * into booking_row;

  if to_regclass('public.notification_events') is not null then
    begin
      set local row_security = off;

      insert into public.notification_events (
        organization_id, event_type, entity_type, entity_id, booking_id, apartment_id,
        payload, idempotency_key, created_by_user_id
      ) values (
        booking_row.organization_id, 'booking_created', 'booking', booking_row.id::text, booking_row.id::text, booking_row.apartment_id::text,
        jsonb_build_object('bookingId', booking_row.id, 'apartmentId', booking_row.apartment_id, 'guestName', booking_row.guest_name, 'guestEmail', booking_row.guest_email, 'checkIn', booking_row.check_in_date, 'checkOut', booking_row.check_out_date, 'totalAmount', booking_row.total_amount, 'currency', booking_row.currency, 'bookingStatus', 'pending', 'paymentStatus', 'unpaid', 'actionUrl', '/bookings/' || booking_row.id),
        'public-booking-request:' || booking_row.id, null
      )
      on conflict (organization_id, idempotency_key) do nothing
      returning id into event_id;

      if event_id is null then
        select id into event_id
        from public.notification_events
        where organization_id = booking_row.organization_id
          and idempotency_key = 'public-booking-request:' || booking_row.id;
      end if;

      if event_id is null then
        raise exception using errcode = 'P0001', message = 'booking_notification_event_missing';
      end if;

      insert into public.notifications (
        user_id, organization_id, recipient_user_id, event_id, type, title, message,
        entity_type, entity_id, action_url
      )
      select member.user_id, booking_row.organization_id, member.user_id, event_id, 'booking',
        'Новый запрос на бронирование',
        trim(booking_row.guest_name) || ': ' || booking_row.check_in_date || ' - ' || booking_row.check_out_date,
        'booking', booking_row.id, '/bookings/' || booking_row.id
      from public.organization_members member
      where member.organization_id = booking_row.organization_id
        and member.status = 'active'
        and lower(trim(member.role_code)) in ('owner', 'manager')
      on conflict (organization_id, event_id, recipient_user_id) do nothing;
    exception when others then
      raise warning 'public booking notification delivery failed for booking % [%]: %', booking_row.id, sqlstate, sqlerrm;
    end;
  end if;

  return query select booking_row.id, booking_row.organization_id, booking_row.total_amount, coalesce(booking_row.currency, 'EUR');
end;
$$;

revoke all on function public.create_public_booking_request(uuid, date, date, integer, text, text, text, text, text) from public;
grant execute on function public.create_public_booking_request(uuid, date, date, integer, text, text, text, text, text) to anon, authenticated;
