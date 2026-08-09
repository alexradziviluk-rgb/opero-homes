-- Focused local contract assertions for Telegram staff binding RPC.
-- Run after `supabase db reset --local`.

select
  to_regprocedure('public.support_accept_telegram_link_token(text,text,text)') is not null as accept_signature,
  has_function_privilege('service_role', to_regprocedure('public.support_accept_telegram_link_token(text,text,text)'), 'EXECUTE') as service_role_execute,
  not has_function_privilege('anon', to_regprocedure('public.support_accept_telegram_link_token(text,text,text)'), 'EXECUTE') as anon_execute_denied,
  not has_function_privilege('authenticated', to_regprocedure('public.support_accept_telegram_link_token(text,text,text)'), 'EXECUTE') as authenticated_execute_denied,
  (select prosecdef from pg_proc where oid = to_regprocedure('public.support_accept_telegram_link_token(text,text,text)')) as security_definer,
  (select proconfig @> array['search_path=public, pg_catalog'] from pg_proc where oid = to_regprocedure('public.support_accept_telegram_link_token(text,text,text)')) as fixed_search_path,
  pg_get_functiondef(to_regprocedure('public.support_accept_telegram_link_token(text,text,text)')) like '%on conflict on constraint support_telegram_bindings_pkey%' as qualified_conflict_target,
  pg_get_functiondef(to_regprocedure('public.support_accept_telegram_link_token(text,text,text)')) like '%link_token.revoked_at is null%' as revoked_token_guard,
  exists (select 1 from pg_indexes where indexname = 'support_telegram_bindings_active_user_unique') as active_user_unique,
  exists (select 1 from pg_indexes where indexname = 'support_telegram_bindings_active_chat_unique') as active_chat_unique;
