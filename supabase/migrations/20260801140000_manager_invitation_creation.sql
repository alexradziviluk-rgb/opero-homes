drop policy if exists employee_invitations_select_org_admin on public.employee_invitations;
create policy employee_invitations_select_org_admin on public.employee_invitations
  for select
  using (
    exists (
      select 1
      from public.organization_members member
      where member.organization_id = employee_invitations.organization_id
        and member.user_id = auth.uid()
        and member.role_code in ('owner', 'manager')
        and member.status = 'active'
    )
  );

drop policy if exists employee_invitations_insert_org_admin on public.employee_invitations;
create policy employee_invitations_insert_org_admin on public.employee_invitations
  for insert
  with check (
    exists (
      select 1
      from public.organization_members member
      where member.organization_id = employee_invitations.organization_id
        and member.user_id = auth.uid()
        and member.role_code in ('owner', 'manager')
        and member.status = 'active'
    )
  );

drop policy if exists employee_invitations_update_org_admin on public.employee_invitations;
create policy employee_invitations_update_org_admin on public.employee_invitations
  for update
  using (
    exists (
      select 1
      from public.organization_members member
      where member.organization_id = employee_invitations.organization_id
        and member.user_id = auth.uid()
        and member.role_code in ('owner', 'manager')
        and member.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.organization_members member
      where member.organization_id = employee_invitations.organization_id
        and member.user_id = auth.uid()
        and member.role_code in ('owner', 'manager')
        and member.status = 'active'
    )
  );

create or replace function public.find_employee_invite_target(target_org_id uuid, target_email text)
returns table (
  existing_user_id uuid,
  already_member boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text;
  target_user_id uuid;
begin
  normalized_email := lower(trim(coalesce(target_email, '')));

  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_org_id
      and member.user_id = auth.uid()
      and member.role_code in ('owner', 'manager')
      and member.status = 'active'
  ) then
    raise exception 'INVITER_NOT_ALLOWED';
  end if;

  select auth_user.id
  into target_user_id
  from auth.users auth_user
  where lower(trim(coalesce(auth_user.email, ''))) = normalized_email
  limit 1;

  return query
  select
    target_user_id,
    exists (
      select 1
      from public.organization_members member
      where member.organization_id = target_org_id
        and member.user_id = target_user_id
    );
end;
$$;

revoke all on function public.find_employee_invite_target(uuid, text) from public;
grant execute on function public.find_employee_invite_target(uuid, text) to authenticated;
