create or replace function public.is_active_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
  );
$$;

revoke all on function public.is_active_organization_member(uuid) from public;
grant execute on function public.is_active_organization_member(uuid) to anon, authenticated;

drop trigger if exists trg_sync_organization_member_role_code on public.organization_members;
drop function if exists public.sync_organization_member_role_code();

alter table public.organization_members
  add column if not exists joined_at timestamptz;

drop policy if exists organization_members_select on public.organization_members;
create policy organization_members_select on public.organization_members
  for select
  using (public.is_active_organization_member(organization_id));

drop policy if exists organization_members_manage on public.organization_members;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select
  using (
    exists (
      select 1
      from public.organization_members caller
      join public.organization_members target
        on target.organization_id = caller.organization_id
      where caller.user_id = auth.uid()
        and caller.status = 'active'
        and target.user_id = profiles.id
        and target.status = 'active'
    )
  );

insert into public.organization_members (
  organization_id,
  user_id,
  role_code,
  status,
  invited_by,
  joined_at,
  created_at,
  updated_at
)
select
  invitation.organization_id,
  invitation.accepted_by_user_id,
  invitation.role_code,
  'active',
  invitation.invited_by,
  coalesce(invitation.accepted_at, now()),
  coalesce(invitation.accepted_at, invitation.created_at, now()),
  now()
from public.employee_invitations invitation
where invitation.accepted_at is not null
  and invitation.accepted_by_user_id is not null
on conflict (organization_id, user_id) do nothing;

insert into public.profiles (
  id,
  first_name,
  last_name,
  email,
  phone,
  role,
  status,
  created_at,
  updated_at
)
select
  invitation.accepted_by_user_id,
  coalesce(nullif(trim(invitation.first_name), ''), 'Сотрудник'),
  coalesce(nullif(trim(invitation.last_name), ''), 'Opero Homes'),
  lower(trim(invitation.email)),
  nullif(trim(invitation.phone), ''),
  invitation.role_code,
  'active',
  coalesce(invitation.accepted_at, invitation.created_at, now()),
  now()
from public.employee_invitations invitation
where invitation.accepted_at is not null
  and invitation.accepted_by_user_id is not null
on conflict (id) do update
set
  first_name = coalesce(nullif(public.profiles.first_name, ''), excluded.first_name),
  last_name = coalesce(nullif(public.profiles.last_name, ''), excluded.last_name),
  email = coalesce(nullif(public.profiles.email, ''), excluded.email),
  phone = coalesce(nullif(public.profiles.phone, ''), excluded.phone),
  updated_at = now();

create or replace function public.list_organization_users(target_organization_id uuid)
returns table (
  user_id uuid,
  organization_id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  role_code text,
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
      and caller.role_code = 'owner'
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

create or replace function public.update_organization_user(
  target_organization_id uuid,
  target_user_id uuid,
  next_first_name text,
  next_last_name text,
  next_phone text,
  next_role_code text,
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
begin
  if not exists (
    select 1
    from public.organization_members caller
    where caller.organization_id = target_organization_id
      and caller.user_id = auth.uid()
      and caller.role_code = 'owner'
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

  if next_status not in ('active', 'paused') then
    raise exception 'INVALID_MEMBER_STATUS';
  end if;

  update public.organization_members
  set
    role_code = next_role_code,
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

revoke all on function public.update_organization_user(uuid, uuid, text, text, text, text, text, text[], text[]) from public;
grant execute on function public.update_organization_user(uuid, uuid, text, text, text, text, text, text[], text[]) to authenticated;