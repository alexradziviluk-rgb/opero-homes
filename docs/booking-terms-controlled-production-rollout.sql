-- CONTROLLED PRODUCTION ROLLOUT RUNBOOK
-- Migration: 20260801100000_booking_terms_and_times.sql
--
-- This file is intentionally not wired into the migration runner and has not
-- been executed. Run each step separately only after the preceding result is
-- reviewed. Do not run policy DDL from 20260731165000 here.

-- Step 1: preflight queries. Abort unless every expected dependency is present
-- and every violation count is zero or explicitly approved.
select to_regclass('public.bookings') as bookings_table;

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bookings'
order by ordinal_position;

select conname, convalidated, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.bookings'::regclass
order by conname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'bookings'
order by policyname;

select trigger_name, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'bookings'
order by trigger_name, event_manipulation;

select n.nspname as schema_name, p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.prosrc ilike '%bookings%' or p.prosrc ilike '%primary_guest_id%')
order by p.proname, arguments;

select count(*) as booking_rows from public.bookings;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bookings'
  and column_name in (
    'nightly_rate', 'accommodation_total', 'security_deposit',
    'amount_paid', 'cleaning_fee', 'guest_name', 'guest_email',
    'guest_phone', 'rental_type', 'price_per_period', 'check_in_time',
    'check_out_time', 'deposit', 'discount', 'paid_amount',
    'balance_due', 'complimentary'
  )
order by column_name;

select
  count(*) filter (where price_per_period < 0) as negative_price,
  count(*) filter (where accommodation_total < 0) as negative_accommodation,
  count(*) filter (where cleaning_fee < 0) as negative_cleaning,
  count(*) filter (where deposit < 0) as negative_deposit,
  count(*) filter (where discount < 0) as negative_discount,
  count(*) filter (where paid_amount < 0) as negative_paid,
  count(*) filter (where rental_type is not null
                         and rental_type not in ('daily', 'weekly', 'monthly')) as invalid_rental_type,
  count(*) filter (where price_per_period = 0 and complimentary is false) as zero_price_non_complimentary
from public.bookings;

-- Step 2: add columns only. This statement does not drop or alter existing
-- columns and deliberately adds no default or NOT NULL requirement yet.
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

-- Step 3: backfill only NULL targets. The source-column guards prevent this
-- runbook from assuming a production column that was not confirmed in preflight.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'bookings'
               and column_name = 'nightly_rate') then
    update public.bookings
    set price_per_period = nightly_rate
    where price_per_period is null and nightly_rate is not null;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'bookings'
               and column_name = 'security_deposit') then
    update public.bookings
    set deposit = security_deposit
    where deposit is null and security_deposit is not null;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'bookings'
               and column_name = 'amount_paid') then
    update public.bookings
    set paid_amount = amount_paid
    where paid_amount is null and amount_paid is not null;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'bookings'
               and column_name = 'total_amount') then
    update public.bookings
    set balance_due = greatest(coalesce(total_amount, 0) - coalesce(paid_amount, 0), 0)
    where balance_due is null;
  end if;
end;
$$;

update public.bookings set check_in_time = time '15:00'
where check_in_time is null;

update public.bookings set check_out_time = time '11:00'
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

update public.bookings set discount = 0
where discount is null;

update public.bookings set complimentary = false
where complimentary is null;

update public.bookings set complimentary = true
where complimentary is false
  and coalesce(price_per_period, 0) = 0
  and coalesce(total_amount, 0) = 0;

-- Step 4: validation. Stop if any result is non-zero. Keep these queries in
-- the change record with their result.
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
where price_per_period = 0 and complimentary is false;

select count(*) as invalid_rental_type_rows
from public.bookings
where rental_type is not null
  and rental_type not in ('daily', 'weekly', 'monthly');

-- Step 5: promote only fields with a deterministic backfill.
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

-- Step 6: add constraints as NOT VALID, then validate each separately.
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.bookings'::regclass
                   and conname = 'bookings_rental_type_check') then
    alter table public.bookings add constraint bookings_rental_type_check
      check (rental_type is null or rental_type in ('daily', 'weekly', 'monthly'))
      not valid;
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.bookings'::regclass
                   and conname = 'bookings_nonnegative_terms_check') then
    alter table public.bookings add constraint bookings_nonnegative_terms_check
      check (price_per_period is null or price_per_period >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.bookings'::regclass
                   and conname = 'bookings_nonnegative_amounts_check') then
    alter table public.bookings add constraint bookings_nonnegative_amounts_check
      check (accommodation_total is null or accommodation_total >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.bookings'::regclass
                   and conname = 'bookings_nonnegative_fees_check') then
    alter table public.bookings add constraint bookings_nonnegative_fees_check
      check ((cleaning_fee is null or cleaning_fee >= 0)
         and (deposit is null or deposit >= 0)
         and (discount is null or discount >= 0)
         and (paid_amount is null or paid_amount >= 0)
         and (balance_due is null or balance_due >= 0)) not valid;
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.bookings'::regclass
                   and conname = 'bookings_positive_price_or_complimentary_check') then
    alter table public.bookings add constraint bookings_positive_price_or_complimentary_check
      check (price_per_period is null or price_per_period > 0 or complimentary is true)
      not valid;
  end if;
end;
$$;

alter table public.bookings validate constraint bookings_rental_type_check;
alter table public.bookings validate constraint bookings_nonnegative_terms_check;
alter table public.bookings validate constraint bookings_nonnegative_amounts_check;
alter table public.bookings validate constraint bookings_nonnegative_fees_check;
alter table public.bookings validate constraint bookings_positive_price_or_complimentary_check;

-- Step 7: post-check.
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bookings'
  and column_name in ('check_in_time', 'check_out_time', 'discount', 'complimentary')
order by column_name;

select conname, convalidated
from pg_constraint
where conrelid = 'public.bookings'::regclass
  and conname in (
    'bookings_rental_type_check',
    'bookings_nonnegative_terms_check',
    'bookings_nonnegative_amounts_check',
    'bookings_nonnegative_fees_check',
    'bookings_positive_price_or_complimentary_check'
  )
order by conname;

-- Step 8: application deployment is a separate approved action.
-- Step 9: after deployment, run the authenticated Playwright smoke test.
-- No policy DDL belongs in this rollout until guests and primary_guest_id
-- are confirmed in production and their dependency order is documented.
