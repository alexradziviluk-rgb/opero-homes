alter table public.operational_tasks
  add column if not exists sla_warning_at timestamptz,
  add column if not exists sla_due_at timestamptz,
  add column if not exists escalation_level integer not null default 0,
  add column if not exists last_reminder_at timestamptz;

create table if not exists public.operation_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.operational_tasks(id) on delete cascade,
  reminder_type text not null,
  escalation_level integer not null default 0,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create index if not exists operation_reminders_task_idx on public.operation_reminders(task_id, created_at desc);
create index if not exists operational_tasks_sla_idx on public.operational_tasks(organization_id, sla_due_at, status);

alter table public.operation_reminders enable row level security;

drop policy if exists operation_reminders_staff_select on public.operation_reminders;
create policy operation_reminders_staff_select on public.operation_reminders
  for select using (exists (
    select 1 from public.organization_members member
    where member.organization_id = operation_reminders.organization_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.role_code in ('owner', 'manager')
  ));

revoke all on public.operation_reminders from public, anon, authenticated;
grant select on public.operation_reminders to authenticated;
grant all on public.operation_reminders to service_role;