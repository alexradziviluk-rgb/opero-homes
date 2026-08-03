alter table if exists public.profiles
  add column if not exists address text;

comment on column public.profiles.address is 'Guest residential address';
