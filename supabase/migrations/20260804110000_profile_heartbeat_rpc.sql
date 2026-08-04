create or replace function public.touch_profile_last_seen()
returns void
language sql
security definer
set search_path = public, pg_catalog
as $$
  update public.profiles
  set last_seen_at = now(), updated_at = now()
  where id = auth.uid();
$$;

revoke all on function public.touch_profile_last_seen() from public;
grant execute on function public.touch_profile_last_seen() to authenticated;