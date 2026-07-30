create table if not exists public.employee_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  phone text,
  first_name text,
  last_name text,
  role_code text not null,
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  delivery_channel text not null default 'email',
  delivery_status text not null default 'pending',
  delivery_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_invitations_role_code_check check (role_code in ('manager', 'employee', 'cleaner', 'technician')),
  constraint employee_invitations_delivery_channel_check check (delivery_channel in ('email')),
  constraint employee_invitations_delivery_status_check check (delivery_status in ('pending', 'sent', 'failed', 'accepted', 'revoked'))
);

create index if not exists idx_employee_invitations_organization_id on public.employee_invitations(organization_id);
create index if not exists idx_employee_invitations_email on public.employee_invitations(lower(email));
create index if not exists idx_employee_invitations_expires_at on public.employee_invitations(expires_at);
create unique index if not exists idx_employee_invitations_active_email
  on public.employee_invitations(organization_id, lower(email))
  where accepted_at is null and revoked_at is null;

alter table public.employee_invitations enable row level security;

drop policy if exists employee_invitations_select_org_admin on public.employee_invitations;
create policy employee_invitations_select_org_admin on public.employee_invitations
  for select
  using (public.current_org_role_code(organization_id) in ('owner', 'admin'));

drop policy if exists employee_invitations_insert_org_admin on public.employee_invitations;
create policy employee_invitations_insert_org_admin on public.employee_invitations
  for insert
  with check (public.current_org_role_code(organization_id) in ('owner', 'admin'));

drop policy if exists employee_invitations_update_org_admin on public.employee_invitations;
create policy employee_invitations_update_org_admin on public.employee_invitations
  for update
  using (public.current_org_role_code(organization_id) in ('owner', 'admin'))
  with check (public.current_org_role_code(organization_id) in ('owner', 'admin'));

drop trigger if exists trg_employee_invitations_updated_at on public.employee_invitations;
create trigger trg_employee_invitations_updated_at
before update on public.employee_invitations
for each row execute function public.set_row_updated_at();

create or replace function public.get_employee_invitation(invite_token text)
returns table (
  invitation_id uuid,
  organization_id uuid,
  organization_name text,
  email text,
  phone text,
  first_name text,
  last_name text,
  role_code text,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  token_hash_value text;
begin
  token_hash_value := encode(digest(coalesce(invite_token, ''), 'sha256'), 'hex');

  return query
  select
    invitation.id,
    invitation.organization_id,
    organization.name,
    invitation.email,
    invitation.phone,
    invitation.first_name,
    invitation.last_name,
    invitation.role_code,
    invitation.expires_at,
    invitation.accepted_at,
    invitation.revoked_at
  from public.employee_invitations invitation
  join public.organizations organization on organization.id = invitation.organization_id
  where invitation.token_hash = token_hash_value
  limit 1;
end;
$$;

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

  if exists (
    select 1
    from public.organization_members member
    where member.organization_id = invitation_row.organization_id
      and member.user_id = current_uid
  ) then
    raise exception 'MEMBERSHIP_ALREADY_EXISTS';
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    role_code,
    status,
    invited_by,
    created_at,
    updated_at
  )
  values (
    invitation_row.organization_id,
    current_uid,
    invitation_row.role_code,
    invitation_row.role_code,
    'active',
    invitation_row.invited_by,
    now(),
    now()
  );

  update public.profiles
  set
    role = invitation_row.role_code,
    status = 'active',
    first_name = coalesce(nullif(public.profiles.first_name, ''), invitation_row.first_name),
    last_name = coalesce(nullif(public.profiles.last_name, ''), invitation_row.last_name),
    phone = coalesce(nullif(public.profiles.phone, ''), invitation_row.phone),
    updated_at = now()
  where public.profiles.id = current_uid;

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

grant execute on function public.get_employee_invitation(text) to anon, authenticated;
grant execute on function public.accept_employee_invitation(text) to authenticated;

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

  if public.current_org_role_code(target_org_id) not in ('owner', 'admin') then
    raise exception 'INVITER_NOT_ALLOWED';
  end if;

  select u.id
  into target_user_id
  from auth.users u
  where lower(trim(coalesce(u.email, ''))) = normalized_email
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

grant execute on function public.find_employee_invite_target(uuid, text) to authenticated;