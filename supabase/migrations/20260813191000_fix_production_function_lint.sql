-- Correct production function definitions found by `supabase db lint --linked`.
-- These are compatibility and qualification fixes; no data is modified here.

create or replace function public.accept_property_owner_invitation(invite_token text)
returns table (invitation_id uuid, organization_id uuid, access_count integer)
language plpgsql security definer set search_path = public, pg_catalog
as $$
declare
  current_uid uuid := auth.uid();
  current_email text;
  invitation_row public.property_owner_invitations%rowtype;
  updated_count integer;
begin
  if current_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select lower(trim(u.email)) into current_email from auth.users u where u.id = current_uid;
  select * into invitation_row
  from public.property_owner_invitations invitation
  where invitation.token_hash = encode(extensions.digest(coalesce(invite_token, ''), 'sha256'), 'hex')
  for update;
  if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
  if invitation_row.revoked_at is not null or invitation_row.status = 'revoked' then raise exception 'INVITATION_REVOKED'; end if;
  if invitation_row.used_at is not null or invitation_row.accepted_at is not null or invitation_row.status = 'accepted' then raise exception 'INVITATION_ALREADY_ACCEPTED'; end if;
  if invitation_row.expires_at <= now() then raise exception 'INVITATION_EXPIRED'; end if;
  if current_email is null or current_email <> invitation_row.email then raise exception 'INVITATION_EMAIL_MISMATCH'; end if;
  if exists (
    select 1
    from public.apartment_owner_access owner_access
    where owner_access.organization_id = invitation_row.organization_id
      and owner_access.apartment_id = any(invitation_row.apartment_ids)
      and owner_access.owner_email = invitation_row.email
      and owner_access.status = 'paused'
  ) then raise exception 'OWNER_ACCESS_PAUSED'; end if;
  update public.apartment_owner_access owner_access
  set user_id = current_uid, status = 'active', updated_at = now()
  where owner_access.organization_id = invitation_row.organization_id
    and owner_access.owner_email = invitation_row.email
    and owner_access.apartment_id = any(invitation_row.apartment_ids)
    and owner_access.status = 'invited';
  get diagnostics updated_count = row_count;
  if updated_count = 0 then raise exception 'OWNER_ACCESS_NOT_FOUND'; end if;
  update public.property_owner_invitations invitation
  set accepted_at = now(), used_at = now(), accepted_by_user_id = current_uid,
      status = 'accepted', delivery_status = 'accepted', updated_at = now()
  where invitation.id = invitation_row.id;
  return query select invitation_row.id, invitation_row.organization_id, updated_count;
end;
$$;

create or replace function public.create_organization_onboarding(
  organization_name text,
  organization_slug text,
  selected_plan_code text,
  selected_country text,
  selected_currency text,
  selected_timezone text,
  trial_started timestamptz,
  trial_ends timestamptz
)
returns uuid
language plpgsql security definer set search_path = public, pg_catalog
as $$
declare
  new_organization_id uuid;
  owner_column text;
  member_role_column_exists boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'organizations' and column_name = 'owner_id') then
    owner_column := 'owner_id';
  elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'organizations' and column_name = 'created_by') then
    owner_column := 'created_by';
  else
    raise exception 'organizations owner column is missing';
  end if;

  member_role_column_exists := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organization_members' and column_name = 'role'
  );

  execute format(
    'select organization.id from public.organizations organization where organization.slug = $1 and organization.%I = auth.uid() for update',
    owner_column
  ) into new_organization_id using organization_slug;

  if new_organization_id is null then
    execute format(
      'insert into public.organizations (name, slug, %I) values ($1, $2, auth.uid()) on conflict (slug) do nothing returning id',
      owner_column
    ) into new_organization_id using organization_name, organization_slug;
  end if;

  if new_organization_id is null then
    execute format(
      'select organization.id from public.organizations organization where organization.slug = $1 and organization.%I = auth.uid() for update',
      owner_column
    ) into new_organization_id using organization_slug;
  end if;

  if new_organization_id is null then raise exception 'Organization slug is already owned by another user'; end if;

  if member_role_column_exists then
    execute 'insert into public.organization_members (organization_id, user_id, role_code, role, status)
      values ($1, auth.uid(), ''owner'', ''owner'', ''active'')
      on conflict (organization_id, user_id) do update set role_code = ''owner'', role = ''owner'', status = ''active'''
      using new_organization_id;
  else
    insert into public.organization_members (organization_id, user_id, role_code, status)
    values (new_organization_id, auth.uid(), 'owner', 'active')
    on conflict (organization_id, user_id) do update set role_code = 'owner', status = 'active';
  end if;

  insert into public.organization_settings (organization_id, country, currency, timezone)
  values (new_organization_id, coalesce(selected_country, ''), coalesce(selected_currency, 'EUR'), coalesce(selected_timezone, 'UTC'))
  on conflict (organization_id) do update set country = excluded.country, currency = excluded.currency, timezone = excluded.timezone, updated_at = now();

  insert into public.subscriptions (organization_id, plan_code, status, trial_started_at, trial_ends_at, current_period_start, current_period_end, payment_provider, cancel_at_period_end)
  values (new_organization_id, selected_plan_code, 'trialing', trial_started, trial_ends, trial_started, trial_ends, 'none', false)
  on conflict (organization_id) do update set plan_code = excluded.plan_code, updated_at = now();

  return new_organization_id;
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
language plpgsql security definer set search_path = public, pg_catalog
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
  if requested_guest_name is null or length(trim(requested_guest_name)) < 2 then raise exception using errcode = '22023', message = 'guest_name_required'; end if;
  if requested_guest_email is null or position('@' in trim(requested_guest_email)) < 2 then raise exception using errcode = '22023', message = 'guest_email_invalid'; end if;
  if requested_guest_phone is null or length(trim(requested_guest_phone)) < 5 then raise exception using errcode = '22023', message = 'guest_phone_required'; end if;
  if requested_check_in < current_date or requested_check_out <= requested_check_in then raise exception using errcode = '22023', message = 'invalid_dates'; end if;
  if requested_guests_count is null or requested_guests_count < 1 then raise exception using errcode = '22023', message = 'invalid_guest_count'; end if;
  if requested_rental_type not in ('daily', 'weekly', 'monthly') then raise exception using errcode = '22023', message = 'invalid_rental_type'; end if;

  select * into apartment_row from public.apartments apartment where apartment.id = requested_apartment_id for share;
  if apartment_row.id is null or apartment_row.organization_id is null then raise exception using errcode = 'P0002', message = 'apartment_not_found'; end if;
  if coalesce(apartment_row.publication_status, '') <> 'published' and coalesce(apartment_row.publish_status, '') <> 'Опубликован' then raise exception using errcode = '42501', message = 'apartment_unavailable'; end if;
  if lower(coalesce(apartment_row.status, '')) = 'черновик' or lower(coalesce(apartment_row.availability, '')) = 'на обслуживании' then raise exception using errcode = '42501', message = 'apartment_unavailable'; end if;
  if apartment_row.max_guests is not null and requested_guests_count > apartment_row.max_guests then raise exception using errcode = '22023', message = 'capacity_exceeded'; end if;
  if not coalesce((apartment_row.rental_types ->> requested_rental_type)::boolean, false) then raise exception using errcode = '22023', message = 'rental_type_not_allowed'; end if;

  price_per_period := case requested_rental_type when 'daily' then apartment_row.daily_price when 'weekly' then apartment_row.weekly_price when 'monthly' then apartment_row.monthly_price end;
  if coalesce(price_per_period, 0) <= 0 then raise exception using errcode = '22023', message = 'pricing_not_configured'; end if;
  nights := requested_check_out - requested_check_in;
  if requested_rental_type = 'daily' and apartment_row.minimum_nights is not null and nights < apartment_row.minimum_nights then raise exception using errcode = '22023', message = 'minimum_stay_not_met'; end if;
  if requested_rental_type = 'weekly' and apartment_row.minimum_weeks is not null and ceil(nights / 7.0) < apartment_row.minimum_weeks then raise exception using errcode = '22023', message = 'minimum_stay_not_met'; end if;
  if requested_rental_type = 'monthly' and apartment_row.minimum_months is not null and ceil(nights / 30.0) < apartment_row.minimum_months then raise exception using errcode = '22023', message = 'minimum_stay_not_met'; end if;

  periods_count := case requested_rental_type when 'daily' then nights when 'weekly' then ceil(nights / 7.0) else ceil(nights / 30.0) end;
  accommodation_total := price_per_period * periods_count;
  cleaning_fee_value := greatest(coalesce(apartment_row.cleaning_fee, 0), 0);
  deposit_value := greatest(coalesce(apartment_row.deposit, 0), 0);
  total_value := greatest(accommodation_total + cleaning_fee_value + deposit_value, 0);

  if exists (select 1 from public.bookings booking where booking.apartment_id = requested_apartment_id and coalesce(booking.status, 'pending') not in ('cancelled', 'rejected', 'declined', 'expired') and coalesce(booking.request_status, booking.status, 'pending') not in ('cancelled', 'rejected') and booking.check_in_date < requested_check_out and booking.check_out_date > requested_check_in) then
    raise exception using errcode = '23P01', message = 'booking_conflict';
  end if;

  select case when position('public_website' in pg_get_constraintdef(constraint_row.oid)) > 0 then 'public_website' else 'website' end
  into source_value from pg_constraint constraint_row where constraint_row.conrelid = 'public.bookings'::regclass and constraint_row.conname = 'bookings_source_check';
  source_value := coalesce(source_value, 'website');

  insert into public.bookings (organization_id, apartment_id, booking_number, check_in_date, check_out_date, adults, guests_count, guest_name, guest_email, guest_phone, guest_comment, rental_type, price_per_period, nightly_rate, accommodation_total, cleaning_fee, deposit, security_deposit, discount, total_amount, currency, status, request_status, payment_status, source, created_at, updated_at)
  values (apartment_row.organization_id, apartment_row.id, 'WEB-' || upper(substr(gen_random_uuid()::text, 1, 8)), requested_check_in, requested_check_out, requested_guests_count, requested_guests_count, trim(requested_guest_name), lower(trim(requested_guest_email)), trim(requested_guest_phone), coalesce(trim(requested_guest_comment), ''), requested_rental_type, price_per_period, price_per_period, accommodation_total, cleaning_fee_value, deposit_value, deposit_value, 0, total_value, 'EUR', 'pending', 'pending', 'unpaid', source_value, now(), now())
  returning * into booking_row;

  if to_regclass('public.notification_events') is not null then
    begin
      set local row_security = off;
      insert into public.notification_events (organization_id, event_type, entity_type, entity_id, booking_id, apartment_id, payload, idempotency_key, created_by_user_id)
      values (booking_row.organization_id, 'booking_created', 'booking', booking_row.id::text, booking_row.id::text, booking_row.apartment_id::text, jsonb_build_object('bookingId', booking_row.id, 'apartmentId', booking_row.apartment_id, 'guestName', booking_row.guest_name, 'guestEmail', booking_row.guest_email, 'checkIn', booking_row.check_in_date, 'checkOut', booking_row.check_out_date, 'totalAmount', booking_row.total_amount, 'currency', booking_row.currency, 'bookingStatus', 'pending', 'paymentStatus', 'unpaid', 'actionUrl', '/bookings/' || booking_row.id), 'public-booking-request:' || booking_row.id, null)
      on conflict on constraint notification_events_idempotency_unique do nothing
      returning id into event_id;
      if event_id is null then select notification_event.id into event_id from public.notification_events notification_event where notification_event.organization_id = booking_row.organization_id and notification_event.idempotency_key = 'public-booking-request:' || booking_row.id; end if;
      if event_id is null then raise exception using errcode = 'P0001', message = 'booking_notification_event_missing'; end if;
      insert into public.notifications (user_id, organization_id, recipient_user_id, event_id, type, title, message, entity_type, entity_id, action_url)
      select member.user_id, booking_row.organization_id, member.user_id, event_id, 'booking', 'Новый запрос на бронирование', trim(booking_row.guest_name) || ': ' || booking_row.check_in_date || ' - ' || booking_row.check_out_date, 'booking', booking_row.id, '/bookings/' || booking_row.id
      from public.organization_members member where member.organization_id = booking_row.organization_id and member.status = 'active' and lower(trim(member.role_code)) in ('owner', 'manager') on conflict (organization_id, event_id, recipient_user_id) do nothing;
    exception when others then
      raise warning 'public booking notification delivery failed for booking % [%]: %', booking_row.id, sqlstate, sqlerrm;
    end;
  end if;

  return query select booking_row.id, booking_row.organization_id, booking_row.total_amount, coalesce(booking_row.currency, 'EUR');
end;
$$;

revoke all on function public.accept_property_owner_invitation(text) from public;
grant execute on function public.accept_property_owner_invitation(text) to authenticated;
revoke all on function public.create_organization_onboarding(text, text, text, text, text, text, timestamptz, timestamptz) from public;
grant execute on function public.create_organization_onboarding(text, text, text, text, text, text, timestamptz, timestamptz) to authenticated;
revoke all on function public.create_public_booking_request(uuid, date, date, integer, text, text, text, text, text) from public;
grant execute on function public.create_public_booking_request(uuid, date, date, integer, text, text, text, text, text) to anon, authenticated;
