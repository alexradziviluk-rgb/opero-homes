alter table public.apartments
  add column if not exists country text,
  add column if not exists beds integer,
  add column if not exists amenities jsonb not null default '[]'::jsonb,
  add column if not exists house_rules jsonb;