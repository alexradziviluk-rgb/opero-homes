create table if not exists public.support_telegram_link_attempt_diagnostics (
  id bigint generated always as identity primary key,
  update_id_hash text not null,
  rpc_called boolean not null,
  rpc_error_code text,
  rpc_error_class text,
  rpc_result_present boolean not null,
  linked boolean not null,
  token_consumed boolean not null,
  binding_created boolean not null,
  created_at timestamptz not null default now()
);

alter table public.support_telegram_link_attempt_diagnostics enable row level security;
revoke all on table public.support_telegram_link_attempt_diagnostics from public, anon, authenticated;
grant insert, select on table public.support_telegram_link_attempt_diagnostics to service_role;
