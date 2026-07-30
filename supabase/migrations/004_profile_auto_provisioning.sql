-- Auto-provision client profile for every new auth user without creating organization membership.

create or replace function public.upsert_profile_from_auth_user(
  target_user_id uuid,
  target_email text,
  target_meta jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  first_name_value text;
  last_name_value text;
  phone_value text;
  avatar_url_value text;
  role_value text;
  status_value text;
begin
  first_name_value := nullif(trim(coalesce(target_meta ->> 'first_name', '')), '');
  last_name_value := nullif(trim(coalesce(target_meta ->> 'last_name', '')), '');
  phone_value := nullif(trim(coalesce(target_meta ->> 'phone', '')), '');
  avatar_url_value := nullif(trim(coalesce(target_meta ->> 'avatar_url', '')), '');
  role_value := lower(trim(coalesce(target_meta ->> 'role', 'guest')));
  status_value := lower(trim(coalesce(target_meta ->> 'status', 'active')));

  insert into public.profiles (
    id,
    first_name,
    last_name,
    email,
    phone,
    avatar_url,
    role,
    status,
    created_at,
    updated_at
  )
  values (
    target_user_id,
    first_name_value,
    last_name_value,
    lower(trim(target_email)),
    phone_value,
    avatar_url_value,
    role_value,
    status_value,
    now(),
    now()
  )
  on conflict (id) do update
  set
    email = coalesce(public.profiles.email, excluded.email),
    first_name = coalesce(public.profiles.first_name, excluded.first_name),
    last_name = coalesce(public.profiles.last_name, excluded.last_name),
    phone = coalesce(public.profiles.phone, excluded.phone),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    role = coalesce(public.profiles.role, excluded.role),
    status = coalesce(public.profiles.status, excluded.status),
    updated_at = now();
end;
$$;

create or replace function public.handle_auth_user_created_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.upsert_profile_from_auth_user(
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute function public.handle_auth_user_created_profile();

create or replace function public.ensure_profile_for_current_user()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_uid uuid;
  user_email text;
  user_meta jsonb;
begin
  current_uid := auth.uid();

  if current_uid is null then
    raise exception 'ensure_profile_for_current_user requires authenticated user';
  end if;

  select
    u.email,
    coalesce(u.raw_user_meta_data, '{}'::jsonb)
  into user_email, user_meta
  from auth.users u
  where u.id = current_uid;

  if user_email is null then
    raise exception 'auth user not found for %', current_uid;
  end if;

  perform public.upsert_profile_from_auth_user(current_uid, user_email, user_meta);

  return current_uid;
end;
$$;

grant execute on function public.ensure_profile_for_current_user() to authenticated;
