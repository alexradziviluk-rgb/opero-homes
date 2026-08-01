create table if not exists public.operational_task_assignees (
  task_id uuid not null references public.operational_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

insert into public.operational_task_assignees (task_id, user_id)
select id, assigned_user_id
from public.operational_tasks
on conflict do nothing;

create index if not exists idx_operational_task_assignees_user on public.operational_task_assignees(user_id, task_id);

alter table public.operational_task_assignees enable row level security;

drop policy if exists operational_task_assignees_select on public.operational_task_assignees;
create policy operational_task_assignees_select on public.operational_task_assignees
  for select using (
    exists (
      select 1
      from public.operational_tasks task
      where task.id = operational_task_assignees.task_id
        and (
          task.assigned_user_id = auth.uid()
          or operational_task_assignees.user_id = auth.uid()
          or exists (
            select 1 from public.organization_members member
            where member.organization_id = task.organization_id
              and member.user_id = auth.uid()
              and member.role_code in ('owner', 'manager')
              and member.status = 'active'
          )
        )
    )
  );

drop policy if exists operational_task_assignees_manage on public.operational_task_assignees;
create policy operational_task_assignees_manage on public.operational_task_assignees
  for all using (
    exists (
      select 1 from public.operational_tasks task
      join public.organization_members member on member.organization_id = task.organization_id
      where task.id = operational_task_assignees.task_id
        and member.user_id = auth.uid()
        and member.role_code in ('owner', 'manager')
        and member.status = 'active'
    )
  ) with check (
    exists (
      select 1 from public.operational_tasks task
      join public.organization_members member on member.organization_id = task.organization_id
      where task.id = operational_task_assignees.task_id
        and member.user_id = auth.uid()
        and member.role_code in ('owner', 'manager')
        and member.status = 'active'
    )
  );

grant select, insert, update, delete on public.operational_task_assignees to authenticated;

drop policy if exists operational_tasks_select on public.operational_tasks;
create policy operational_tasks_select on public.operational_tasks
  for select using (
    exists (
      select 1 from public.organization_members member
      where member.organization_id = operational_tasks.organization_id
        and member.user_id = auth.uid()
        and member.role_code in ('owner', 'manager')
        and member.status = 'active'
    )
    or exists (
      select 1 from public.operational_task_assignees assignment
      where assignment.task_id = operational_tasks.id
        and assignment.user_id = auth.uid()
    )
  );
