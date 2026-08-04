alter table if exists public.apartments
  add column if not exists unit_number text;