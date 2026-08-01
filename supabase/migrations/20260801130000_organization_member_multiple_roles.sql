alter table public.organization_members
  add column if not exists additional_role_codes text[] not null default '{}';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organization_members_additional_roles_check'
      and conrelid = 'public.organization_members'::regclass
  ) then
    alter table public.organization_members
      add constraint organization_members_additional_roles_check
      check (
        additional_role_codes <@ array['employee', 'cleaner', 'maintenance']::text[]
        and not (role_code = any(additional_role_codes))
      );
  end if;
end;
$$;

drop function if exists public.list_organization_users(uuid);

create function public.list_organization_users(target_organization_id uuid)
returns table (
  user_id uuid,
  organization_id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  role_code text,
  additional_role_codes text[],
  member_status text,
  joined_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  additional_permissions text[],
  denied_permissions text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.organization_members caller
    where caller.organization_id = target_organization_id
      and caller.user_id = auth.uid()
      and caller.role_code in ('owner', 'manager')
      and caller.status = 'active'
  ) then
    raise exception 'MEMBER_LIST_NOT_ALLOWED';
  end if;

  return query
  select
    member.user_id,
    member.organization_id,
    coalesce(profile.first_name, ''),
    coalesce(profile.last_name, ''),
    coalesce(profile.email, ''),
    coalesce(profile.phone, ''),
    member.role_code,
    coalesce(member.additional_role_codes, '{}'),
    member.status,
    member.joined_at,
    member.created_at,
    member.updated_at,
    coalesce(profile.additional_permissions, '{}'),
    coalesce(profile.denied_permissions, '{}')
  from public.organization_members member
  left join public.profiles profile on profile.id = member.user_id
  where member.organization_id = target_organization_id
  order by member.created_at desc;
end;
$$;

revoke all on function public.list_organization_users(uuid) from public;
grant execute on function public.list_organization_users(uuid) to authenticated;

revoke all on function public.update_organization_user(uuid, uuid, text, text, text, text, text, text[], text[]) from authenticated;

create or replace function public.update_organization_user(
  target_organization_id uuid,
  target_user_id uuid,
  next_first_name text,
  next_last_name text,
  next_phone text,
  next_role_code text,
  next_additional_role_codes text[],
  next_status text,
  next_additional_permissions text[],
  next_denied_permissions text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role_code text;
  normalized_additional_roles text[];
begin
  if not exists (
    select 1
    from public.organization_members caller
    where caller.organization_id = target_organization_id
      and caller.user_id = auth.uid()
      and caller.role_code in ('owner', 'manager')
      and caller.status = 'active'
  ) then
    raise exception 'MEMBER_UPDATE_NOT_ALLOWED';
  end if;

  select member.role_code
  into target_role_code
  from public.organization_members member
  where member.organization_id = target_organization_id
    and member.user_id = target_user_id
  for update;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if target_role_code = 'owner' then
    raise exception 'OWNER_CANNOT_BE_MODIFIED';
  end if;

  if next_role_code not in ('manager', 'employee', 'cleaner', 'maintenance') then
    raise exception 'INVALID_MEMBER_ROLE';
  end if;

  if exists (
    select 1
    from unnest(coalesce(next_additional_role_codes, '{}')) additional_role
    where additional_role not in ('employee', 'cleaner', 'maintenance')
  ) then
    raise exception 'INVALID_ADDITIONAL_MEMBER_ROLE';
  end if;

  select coalesce(array_agg(distinct additional_role), '{}')
  into normalized_additional_roles
  from unnest(coalesce(next_additional_role_codes, '{}')) additional_role;

  if next_role_code = any(normalized_additional_roles) then
    raise exception 'PRIMARY_ROLE_CANNOT_BE_ADDITIONAL';
  end if;

  if next_status not in ('active', 'paused') then
    raise exception 'INVALID_MEMBER_STATUS';
  end if;

  update public.organization_members
  set
    role_code = next_role_code,
    additional_role_codes = normalized_additional_roles,
    status = next_status,
    updated_at = now()
  where organization_id = target_organization_id
    and user_id = target_user_id;

  update public.profiles
  set
    first_name = trim(next_first_name),
    last_name = trim(next_last_name),
    phone = nullif(trim(next_phone), ''),
    status = case when next_status = 'active' then 'active' else 'inactive' end,
    additional_permissions = coalesce(next_additional_permissions, '{}'),
    denied_permissions = coalesce(next_denied_permissions, '{}'),
    updated_at = now()
  where id = target_user_id;
end;
$$;

revoke all on function public.update_organization_user(uuid, uuid, text, text, text, text, text[], text, text[], text[]) from public;
grant execute on function public.update_organization_user(uuid, uuid, text, text, text, text, text[], text, text[], text[]) to authenticated;
