create or replace function public.sync_guest_auth_account_to_client()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  role_value text := lower(trim(coalesce(new.raw_user_meta_data ->> 'role', '')));
  target_organization_id uuid;
  first_name_value text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''), 'Гость');
  last_name_value text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''), 'Гость');
  phone_value text := nullif(trim(new.raw_user_meta_data ->> 'phone'), '');
begin
  if new.email is null or role_value not in ('guest', 'property_owner') then
    return new;
  end if;

  begin
    target_organization_id := nullif(trim(new.raw_user_meta_data ->> 'organization_id'), '')::uuid;
  exception when invalid_text_representation then
    target_organization_id := null;
  end;

  if target_organization_id is null and (select count(*) from public.organizations) = 1 then
    select id into target_organization_id from public.organizations limit 1;
  end if;

  insert into public.guests (id, organization_id, first_name, last_name, email, phone, email_verified, email_verified_at)
  values (new.id, target_organization_id, first_name_value, last_name_value, lower(trim(new.email)), phone_value, new.email_confirmed_at is not null, new.email_confirmed_at)
  on conflict (id) do update set
    organization_id = coalesce(public.guests.organization_id, excluded.organization_id),
    first_name = coalesce(nullif(public.guests.first_name, ''), excluded.first_name),
    last_name = coalesce(nullif(public.guests.last_name, ''), excluded.last_name),
    phone = coalesce(public.guests.phone, excluded.phone),
    email_verified = public.guests.email_verified or excluded.email_verified,
    email_verified_at = coalesce(public.guests.email_verified_at, excluded.email_verified_at),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_guest_client on auth.users;
create trigger on_auth_user_created_guest_client
after insert on auth.users
for each row execute function public.sync_guest_auth_account_to_client();

insert into public.guests (id, organization_id, first_name, last_name, email, phone, email_verified, email_verified_at)
select
  auth_user.id,
  case
    when nullif(trim(auth_user.raw_user_meta_data ->> 'organization_id'), '') is not null
      then (auth_user.raw_user_meta_data ->> 'organization_id')::uuid
    when (select count(*) from public.organizations) = 1
      then (select id from public.organizations limit 1)
    else null
  end,
  coalesce(nullif(trim(auth_user.raw_user_meta_data ->> 'first_name'), ''), 'Гость'),
  coalesce(nullif(trim(auth_user.raw_user_meta_data ->> 'last_name'), ''), 'Гость'),
  lower(trim(auth_user.email)),
  nullif(trim(auth_user.raw_user_meta_data ->> 'phone'), ''),
  auth_user.email_confirmed_at is not null,
  auth_user.email_confirmed_at
from auth.users auth_user
where auth_user.email is not null
  and lower(trim(coalesce(auth_user.raw_user_meta_data ->> 'role', ''))) in ('guest', 'property_owner')
  and not exists (select 1 from public.guests guest where lower(trim(guest.email)) = lower(trim(auth_user.email)));