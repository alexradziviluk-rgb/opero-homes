alter table public.support_telegram_updates
  add column if not exists rpc_called boolean not null default false,
  add column if not exists rpc_error_code text,
  add column if not exists rpc_error_class text,
  add column if not exists rpc_result_present boolean not null default false,
  add column if not exists linked boolean not null default false,
  add column if not exists token_consumed boolean not null default false,
  add column if not exists binding_created boolean not null default false;
