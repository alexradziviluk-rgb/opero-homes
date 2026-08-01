-- Stage 1: add every requested field as nullable. Existing columns are preserved.
alter table public.bookings
  add column if not exists guest_name text,
  add column if not exists guest_email text,
  add column if not exists guest_phone text,
  add column if not exists rental_type text,
  add column if not exists price_per_period numeric,
  add column if not exists check_in_time time,
  add column if not exists check_out_time time,
  add column if not exists accommodation_total numeric,
  add column if not exists cleaning_fee numeric,
  add column if not exists deposit numeric,
  add column if not exists discount numeric,
  add column if not exists paid_amount numeric,
  add column if not exists balance_due numeric,
  add column if not exists complimentary boolean;

-- Stage 2: backfill only NULL targets. Dynamic SQL keeps this migration compatible
-- with both the legacy production schema and the local schema snapshot.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'nightly_rate'
  ) then
    execute 'update public.bookings
      set price_per_period = nightly_rate
      where price_per_period is null and nightly_rate is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'security_deposit'
  ) then
    execute 'update public.bookings
      set deposit = security_deposit
      where deposit is null and security_deposit is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'amount_paid'
  ) then
    execute 'update public.bookings
      set paid_amount = amount_paid
      where paid_amount is null and amount_paid is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'total_amount'
  ) then
    execute 'update public.bookings
      set balance_due = greatest(coalesce(total_amount, 0) - coalesce(paid_amount, 0), 0)
      where balance_due is null';
  end if;
end;
$$;

update public.bookings
set check_in_time = time '15:00'
where check_in_time is null;

update public.bookings
set check_out_time = time '11:00'
where check_out_time is null;

update public.bookings
set price_per_period = total_amount
where coalesce(price_per_period, 0) = 0
  and coalesce(total_amount, 0) > 0
  and coalesce(accommodation_total, 0) = 0
  and coalesce(cleaning_fee, 0) = 0
  and coalesce(security_deposit, 0) = 0;

update public.bookings
set accommodation_total = total_amount
where coalesce(accommodation_total, 0) = 0
  and coalesce(total_amount, 0) > 0
  and coalesce(cleaning_fee, 0) = 0
  and coalesce(security_deposit, 0) = 0;

update public.bookings
set discount = 0
where discount is null;

update public.bookings
set complimentary = false
where complimentary is null;

update public.bookings
set complimentary = true
where complimentary is false
  and coalesce(price_per_period, 0) = 0
  and coalesce(total_amount, 0) = 0;

-- The legacy table has no source for these optional fields. They intentionally
-- remain nullable instead of inventing guest or rental data.

-- Stage 3: read-only validation results. A non-zero count must be investigated
-- before promoting the columns below to defaults/NOT NULL.
select
  count(*) filter (where check_in_time is null) as null_check_in_time,
  count(*) filter (where check_out_time is null) as null_check_out_time,
  count(*) filter (where price_per_period is null) as null_price_per_period,
  count(*) filter (where accommodation_total is null) as null_accommodation_total,
  count(*) filter (where cleaning_fee is null) as null_cleaning_fee,
  count(*) filter (where deposit is null) as null_deposit,
  count(*) filter (where discount is null) as null_discount,
  count(*) filter (where paid_amount is null) as null_paid_amount,
  count(*) filter (where balance_due is null) as null_balance_due,
  count(*) filter (where complimentary is null) as null_complimentary
from public.bookings;

select count(*) as negative_amount_rows
from public.bookings
where price_per_period < 0
   or accommodation_total < 0
   or cleaning_fee < 0
   or deposit < 0
   or discount < 0
   or paid_amount < 0
   or balance_due < 0;

select count(*) as zero_price_non_complimentary_rows
from public.bookings
where price_per_period = 0
  and complimentary is false;

select count(*) as invalid_rental_type_rows
from public.bookings
where rental_type is not null
  and rental_type not in ('daily', 'weekly', 'monthly');

-- Stage 4: add constraints without scanning the table while taking the
-- validation lock. The guards make reruns no-ops for existing constraints.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_rental_type_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_rental_type_check
      check (rental_type is null or rental_type in ('daily', 'weekly', 'monthly'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_nonnegative_terms_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_nonnegative_terms_check
      check (
        price_per_period is null or price_per_period >= 0
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_nonnegative_amounts_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_nonnegative_amounts_check
      check (
        accommodation_total is null or accommodation_total >= 0
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_nonnegative_fees_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_nonnegative_fees_check
      check (
        (cleaning_fee is null or cleaning_fee >= 0)
        and (deposit is null or deposit >= 0)
        and (discount is null or discount >= 0)
        and (paid_amount is null or paid_amount >= 0)
        and (balance_due is null or balance_due >= 0)
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_positive_price_or_complimentary_check'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_positive_price_or_complimentary_check
      check (price_per_period is null or price_per_period > 0 or complimentary is true)
      not valid;
  end if;
end;
$$;

-- Stage 5: validate each constraint as a separate operation.
alter table public.bookings validate constraint bookings_rental_type_check;
alter table public.bookings validate constraint bookings_nonnegative_terms_check;
alter table public.bookings validate constraint bookings_nonnegative_amounts_check;
alter table public.bookings validate constraint bookings_nonnegative_fees_check;
alter table public.bookings validate constraint bookings_positive_price_or_complimentary_check;

-- Stage 6: only fields with a complete, deterministic backfill become required.
alter table public.bookings
  alter column check_in_time set default time '15:00',
  alter column check_out_time set default time '11:00',
  alter column discount set default 0,
  alter column complimentary set default false;

alter table public.bookings
  alter column check_in_time set not null,
  alter column check_out_time set not null,
  alter column discount set not null,
  alter column complimentary set not null;