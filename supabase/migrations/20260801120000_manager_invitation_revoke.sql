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

create or replace function public.list_active_employee_invitations(target_organization_id uuid)
returns table (
  invitation_id uuid,
  email text,
  phone text,
  first_name text,
  last_name text,
  role_code text,
  delivery_status text,
  expires_at timestamptz,
  created_at timestamptz
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
    raise exception 'INVITATION_LIST_NOT_ALLOWED';
  end if;

  return query
  select
    invitation.id,
    invitation.email,
    invitation.phone,
    invitation.first_name,
    invitation.last_name,
    invitation.role_code,
    invitation.delivery_status,
    invitation.expires_at,
    invitation.created_at
  from public.employee_invitations invitation
  where invitation.organization_id = target_organization_id
    and invitation.accepted_at is null
    and invitation.revoked_at is null
  order by invitation.created_at desc;
end;
$$;

revoke all on function public.list_active_employee_invitations(uuid) from public;
grant execute on function public.list_active_employee_invitations(uuid) to authenticated;

create or replace function public.revoke_employee_invitation(
  target_organization_id uuid,
  target_invitation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  revoked_invitation_id uuid;
begin
  if not exists (
    select 1
    from public.organization_members caller
    where caller.organization_id = target_organization_id
      and caller.user_id = auth.uid()
      and caller.role_code in ('owner', 'manager')
      and caller.status = 'active'
  ) then
    raise exception 'INVITATION_REVOKE_NOT_ALLOWED';
  end if;

  update public.employee_invitations invitation
  set
    revoked_at = now(),
    delivery_status = 'revoked',
    updated_at = now()
  where invitation.id = target_invitation_id
    and invitation.organization_id = target_organization_id
    and invitation.accepted_at is null
    and invitation.revoked_at is null
  returning invitation.id into revoked_invitation_id;

  if revoked_invitation_id is null then
    raise exception 'INVITATION_NOT_ACTIVE';
  end if;

  return revoked_invitation_id;
end;
$$;

revoke all on function public.revoke_employee_invitation(uuid, uuid) from public;
grant execute on function public.revoke_employee_invitation(uuid, uuid) to authenticated;
