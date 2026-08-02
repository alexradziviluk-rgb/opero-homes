create or replace function public.user_can_manage_operational_tasks(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = auth.uid()
      and member.role_code in ('owner', 'manager')
      and member.status = 'active'
  );
$$;

drop policy if exists operational_tasks_insert on public.operational_tasks;
create policy operational_tasks_insert on public.operational_tasks
  for insert
  with check (public.user_can_manage_operational_tasks(organization_id));

grant execute on function public.user_can_manage_operational_tasks(uuid) to authenticated;