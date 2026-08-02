drop policy if exists operational_tasks_insert on public.operational_tasks;

create policy operational_tasks_insert on public.operational_tasks
  for insert
  with check (
    exists (
      select 1
      from public.organization_members member
      where member.organization_id = operational_tasks.organization_id
        and member.user_id = auth.uid()
        and member.role_code in ('owner', 'manager')
        and member.status = 'active'
    )
  );