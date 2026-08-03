create table if not exists public.operational_task_archive (
  archive_id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid references public.apartments(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  title text not null,
  description text not null default '',
  task_type text not null,
  priority text not null,
  status text not null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  due_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  archived_at timestamptz not null default now(),
  unique (organization_id, task_id)
);

create index if not exists idx_operational_task_archive_org on public.operational_task_archive(organization_id, archived_at);
create index if not exists idx_operational_task_archive_assignee on public.operational_task_archive(assigned_user_id, completed_at);

alter table public.operational_task_archive enable row level security;

drop policy if exists operational_task_archive_select on public.operational_task_archive;
create policy operational_task_archive_select on public.operational_task_archive
  for select using (
    exists (
      select 1 from public.organization_members member
      where member.organization_id = operational_task_archive.organization_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and member.role_code in ('owner', 'manager')
    )
    or (
      assigned_user_id = auth.uid()
      and exists (
        select 1 from public.organization_members member
        where member.organization_id = operational_task_archive.organization_id
          and member.user_id = auth.uid()
          and member.status = 'active'
      )
    )
  );

grant select on public.operational_task_archive to authenticated;

drop policy if exists operational_task_archive_insert on public.operational_task_archive;
create policy operational_task_archive_insert on public.operational_task_archive
  for insert with check (
    exists (
      select 1 from public.organization_members member
      where member.organization_id = operational_task_archive.organization_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and member.role_code in ('owner', 'manager')
    )
  );

drop policy if exists operational_tasks_cleanup_delete on public.operational_tasks;
create policy operational_tasks_cleanup_delete on public.operational_tasks
  for delete using (
    status in ('completed', 'verified')
    and exists (
      select 1 from public.organization_members member
      where member.organization_id = operational_tasks.organization_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and member.role_code in ('owner', 'manager')
    )
  );
