alter table public.operational_tasks
  add column if not exists ai_idempotency_key text,
  add column if not exists support_ticket_id uuid references public.support_tickets(id) on delete set null;

alter table public.support_tickets
  drop constraint if exists support_tickets_delivery_check;

alter table public.support_tickets
  add constraint support_tickets_delivery_check
  check (delivery_status in ('pending', 'sent', 'failed', 'retrying', 'no_recipients', 'partially_sent', 'all_failed'));

create unique index if not exists operational_tasks_ai_idempotency_key_uidx
  on public.operational_tasks (organization_id, ai_idempotency_key)
  where ai_idempotency_key is not null;

create table if not exists public.ai_operation_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  conversation_id text,
  intent text not null,
  action text not null,
  action_result text not null,
  ticket_reference text,
  task_reference text,
  fallback_used boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_operation_audit_org_created_idx
  on public.ai_operation_audit (organization_id, created_at desc);

alter table public.ai_operation_audit enable row level security;
revoke all on table public.ai_operation_audit from public, anon, authenticated;
grant insert, select on table public.ai_operation_audit to service_role;

grant all on table public.operational_tasks to service_role;
