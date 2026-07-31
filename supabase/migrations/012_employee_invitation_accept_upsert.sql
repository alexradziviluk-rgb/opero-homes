create extension if not exists "pgcrypto";

create or replace function public.accept_employee_invitation(invite_token text)
returns table (
  invitation_id uuid,
  organization_id uuid,
  role_code text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_uid uuid;
  current_email text;
  invitation_row public.employee_invitations%rowtype;
begin
  current_uid := auth.uid();

  if current_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select lower(trim(coalesce(u.email, '')))
  into current_email
  from auth.users u
  where u.id = current_uid;

  if current_email is null or current_email = '' then
    raise exception 'AUTH_EMAIL_MISSING';
  end if;

  select *
  into invitation_row
  from public.employee_invitations invitation
  where invitation.token_hash = encode(digest(coalesce(invite_token, ''), 'sha256'), 'hex')
  limit 1;

  if not found then
    raise exception 'INVITATION_NOT_FOUND';
  end if;

  if invitation_row.revoked_at is not null then
    raise exception 'INVITATION_REVOKED';
  end if;

  if invitation_row.accepted_at is not null then
    raise exception 'INVITATION_ALREADY_ACCEPTED';
  end if;

  if invitation_row.expires_at <= now() then
    raise exception 'INVITATION_EXPIRED';
  end if;

  if lower(trim(invitation_row.email)) <> current_email then
    raise exception 'INVITATION_EMAIL_MISMATCH';
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role_code,
    status,
    invited_by
  )
  values (
    invitation_row.organization_id,
    current_uid,
    invitation_row.role_code,
    'active',
    invitation_row.invited_by
  )
  on conflict (organization_id, user_id) do update
  set
    role_code = excluded.role_code,
    status = 'active',
    invited_by = coalesce(public.organization_members.invited_by, excluded.invited_by),
    updated_at = now();

  insert into public.profiles (
    id,
    organization_id,
    first_name,
    last_name,
    email,
    phone,
    role,
    status,
    created_at,
    updated_at
  )
  values (
    current_uid,
    invitation_row.organization_id,
    coalesce(nullif(trim(invitation_row.first_name), ''), 'Сотрудник'),
    coalesce(nullif(trim(invitation_row.last_name), ''), 'Opero Homes'),
    current_email,
    nullif(trim(invitation_row.phone), ''),
    invitation_row.role_code,
    'active',
    now(),
    now()
  )
  on conflict (id) do update
  set
    organization_id = excluded.organization_id,
    first_name = coalesce(nullif(public.profiles.first_name, ''), excluded.first_name),
    last_name = coalesce(nullif(public.profiles.last_name, ''), excluded.last_name),
    email = excluded.email,
    phone = coalesce(nullif(public.profiles.phone, ''), excluded.phone),
    role = coalesce(nullif(public.profiles.role, ''), excluded.role),
    status = coalesce(nullif(public.profiles.status, ''), excluded.status),
    updated_at = now();

  update public.employee_invitations
  set
    accepted_at = now(),
    accepted_by_user_id = current_uid,
    delivery_status = 'accepted',
    updated_at = now()
  where id = invitation_row.id;

  return query
  select invitation_row.id, invitation_row.organization_id, invitation_row.role_code;
end;
$$;

grant execute on function public.accept_employee_invitation(text) to authenticated;
