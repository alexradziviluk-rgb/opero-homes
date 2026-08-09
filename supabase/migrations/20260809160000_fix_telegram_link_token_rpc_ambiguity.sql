create or replace function public.support_accept_telegram_link_token(
  target_token_hash text,
  target_telegram_user_id text,
  target_telegram_chat_id text
)
returns table (organization_id uuid, user_id uuid, linked_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  linked_user uuid;
  linked_org uuid;
  linked_time timestamptz;
begin
  update public.support_telegram_link_tokens as link_token
  set used_at = now()
  where link_token.token_hash = target_token_hash
    and link_token.used_at is null
    and link_token.revoked_at is null
    and link_token.expires_at > now()
    and exists (
      select 1
      from public.organization_members as member
      where member.organization_id = link_token.organization_id
        and member.user_id = link_token.user_id
        and member.status = 'active'
        and lower(trim(member.role_code)) in ('owner', 'manager')
    )
  returning link_token.organization_id, link_token.user_id, link_token.used_at
    into linked_org, linked_user, linked_time;

  if linked_user is null then
    return;
  end if;

  insert into public.support_telegram_bindings(
    organization_id,
    user_id,
    telegram_user_id,
    telegram_chat_id,
    linked_at,
    updated_at
  )
  values (
    linked_org,
    linked_user,
    target_telegram_user_id,
    target_telegram_chat_id,
    linked_time,
    linked_time
  )
  on conflict on constraint support_telegram_bindings_pkey do update
    set telegram_user_id = excluded.telegram_user_id,
        telegram_chat_id = excluded.telegram_chat_id,
        linked_at = excluded.linked_at,
        updated_at = excluded.updated_at,
        revoked_at = null;

  return query
  select linked_org, linked_user, linked_time;
end;
$$;

revoke execute on function public.support_accept_telegram_link_token(text, text, text) from public, anon, authenticated;
grant execute on function public.support_accept_telegram_link_token(text, text, text) to service_role;
