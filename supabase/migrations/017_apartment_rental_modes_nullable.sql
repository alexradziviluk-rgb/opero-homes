alter table public.apartments
  alter column daily_price drop not null,
  alter column weekly_price drop not null,
  alter column monthly_price drop not null,
  alter column minimum_nights drop not null,
  alter column minimum_weeks drop not null,
  alter column minimum_months drop not null;
