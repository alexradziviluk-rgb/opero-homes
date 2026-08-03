create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  first_name text not null default 'Гость',
  last_name text not null default 'Гость',
  email text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_guests_organization_email
  on public.guests (organization_id, lower(email));

create index if not exists idx_guests_email
  on public.guests (lower(email));

alter table public.bookings
  add column if not exists primary_guest_id uuid references public.guests(id) on delete set null;

create index if not exists idx_bookings_primary_guest_id
  on public.bookings (primary_guest_id);

alter table public.guests enable row level security;

revoke all on table public.guests from anon, authenticated;

create or replace function public.guests_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guests_updated_at on public.guests;
create trigger trg_guests_updated_at
before update on public.guests
for each row execute function public.guests_set_updated_at();
