create or replace function public.user_can_access_operational_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.operational_tasks task
    where task.id = target_task_id
      and (
        task.assigned_user_id = auth.uid()
        or exists (
          select 1 from public.operational_task_assignees assignment
          where assignment.task_id = task.id and assignment.user_id = auth.uid()
        )
        or exists (
          select 1 from public.organization_members member
          where member.organization_id = task.organization_id
            and member.user_id = auth.uid()
            and member.role_code in ('owner', 'manager')
            and member.status = 'active'
        )
      )
  );
$$;

drop policy if exists operational_tasks_select on public.operational_tasks;
create policy operational_tasks_select on public.operational_tasks
  for select using (public.user_can_access_operational_task(id));

drop policy if exists operational_task_assignees_select on public.operational_task_assignees;
create policy operational_task_assignees_select on public.operational_task_assignees
  for select using (public.user_can_access_operational_task(task_id));

drop policy if exists operational_task_assignees_manage on public.operational_task_assignees;
create policy operational_task_assignees_manage on public.operational_task_assignees
  for all using (public.user_can_access_operational_task(task_id)) with check (public.user_can_access_operational_task(task_id));

drop policy if exists operational_task_items_select on public.operational_task_items;
create policy operational_task_items_select on public.operational_task_items
  for select using (public.user_can_access_operational_task(task_id));

drop policy if exists operational_task_items_manage on public.operational_task_items;
create policy operational_task_items_manage on public.operational_task_items
  for all using (public.user_can_access_operational_task(task_id)) with check (public.user_can_access_operational_task(task_id));

grant execute on function public.user_can_access_operational_task(uuid) to authenticated;
