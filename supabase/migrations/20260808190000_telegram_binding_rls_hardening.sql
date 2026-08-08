alter table public.support_telegram_link_tokens enable row level security;
alter table public.support_telegram_bindings enable row level security;

revoke all on table public.support_telegram_link_tokens from public, anon, authenticated;
revoke all on table public.support_telegram_bindings from public, anon, authenticated;

grant execute on function public.support_create_telegram_link_token(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.support_consume_telegram_link_token(text) to service_role;
grant execute on function public.support_accept_telegram_link_token(text, text, text) to service_role;
grant execute on function public.support_route_telegram_message(uuid, uuid, text, text) to service_role;