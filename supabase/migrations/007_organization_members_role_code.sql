alter table if exists public.organization_members
  add column if not exists role_code text;

update public.organization_members
set role_code = coalesce(nullif(trim(role_code), ''), nullif(trim(role), ''), 'viewer')
where role_code is null or trim(role_code) = '';

alter table if exists public.organization_members
  alter column role_code set default 'viewer';

create or replace function public.sync_organization_member_role_code()
returns trigger
language plpgsql
as $$
begin
  new.role_code := lower(trim(coalesce(new.role_code, new.role, 'viewer')));
  new.role := coalesce(new.role, new.role_code);
  if new.role is null or trim(new.role) = '' then
    new.role := new.role_code;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_organization_member_role_code on public.organization_members;
create trigger trg_sync_organization_member_role_code
before insert or update on public.organization_members
for each row
execute function public.sync_organization_member_role_code();