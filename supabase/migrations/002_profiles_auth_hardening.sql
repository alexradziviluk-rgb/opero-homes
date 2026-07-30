alter table if exists public.profiles
  add column if not exists additional_permissions text[] not null default '{}',
  add column if not exists denied_permissions text[] not null default '{}';

alter table if exists public.profiles
  alter column status set default 'active';

alter table if exists public.profiles
  enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );
