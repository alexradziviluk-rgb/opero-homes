create table if not exists public.operational_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  title text not null,
  description text not null default '',
  task_type text not null,
  priority text not null default 'normal',
  status text not null default 'pending',
  assigned_user_id uuid not null references auth.users(id) on delete restrict,
  due_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_tasks_type_check check (task_type in ('cleaning', 'technical', 'linen', 'purchase', 'inspection', 'keys', 'payment', 'instructions', 'other')),
  constraint operational_tasks_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint operational_tasks_status_check check (status in ('pending', 'assigned', 'in_progress', 'completed', 'verified', 'cancelled'))
);

create index if not exists idx_operational_tasks_organization on public.operational_tasks(organization_id);
create index if not exists idx_operational_tasks_assignee on public.operational_tasks(assigned_user_id, status);
create index if not exists idx_operational_tasks_apartment on public.operational_tasks(apartment_id, due_at);
create index if not exists idx_operational_tasks_due on public.operational_tasks(organization_id, due_at, status);

create table if not exists public.booking_operation_checklists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  guest_arrived boolean not null default false,
  guest_registered boolean not null default false,
  documents_verified boolean not null default false,
  key_handed_over boolean not null default false,
  balance_received boolean not null default false,
  deposit_received boolean not null default false,
  check_in_completed boolean not null default false,
  cleaning_assigned boolean not null default false,
  cleaning_completed boolean not null default false,
  maintenance_completed boolean not null default false,
  key_returned boolean not null default false,
  apartment_inspected boolean not null default false,
  damages_found boolean not null default false,
  damage_notes text,
  deposit_refunded boolean not null default false,
  check_out_completed boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_operation_checklists_booking_unique unique (booking_id)
);

create index if not exists idx_booking_operation_checklists_org on public.booking_operation_checklists(organization_id);

alter table if exists public.profiles
  add column if not exists last_seen_at timestamptz;

alter table if exists public.apartments
  add column if not exists responsible_user_id uuid references auth.users(id) on delete set null,
  add column if not exists backup_manager_user_id uuid references auth.users(id) on delete set null;

create or replace function public.set_manager_operations_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_operational_tasks_updated_at on public.operational_tasks;
create trigger trg_operational_tasks_updated_at
before update on public.operational_tasks
for each row execute function public.set_manager_operations_updated_at();

drop trigger if exists trg_booking_operation_checklists_updated_at on public.booking_operation_checklists;
create trigger trg_booking_operation_checklists_updated_at
before update on public.booking_operation_checklists
for each row execute function public.set_manager_operations_updated_at();

alter table public.operational_tasks enable row level security;
alter table public.booking_operation_checklists enable row level security;

drop policy if exists operational_tasks_select on public.operational_tasks;
create policy operational_tasks_select on public.operational_tasks
  for select
  using (
    assigned_user_id = auth.uid()
    or exists (
      select 1
      from public.organization_members member
      where member.organization_id = operational_tasks.organization_id
        and member.user_id = auth.uid()
        and member.role_code in ('owner', 'manager')
        and member.status = 'active'
    )
  );

drop policy if exists operational_tasks_insert on public.operational_tasks;
create policy operational_tasks_insert on public.operational_tasks
  for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.organization_members member
      where member.organization_id = operational_tasks.organization_id
        and member.user_id = auth.uid()
        and member.role_code in ('owner', 'manager')
        and member.status = 'active'
    )
  );

drop policy if exists operational_tasks_update on public.operational_tasks;
create policy operational_tasks_update on public.operational_tasks
  for update
  using (
    assigned_user_id = auth.uid()
    or exists (
      select 1
      from public.organization_members member
      where member.organization_id = operational_tasks.organization_id
        and member.user_id = auth.uid()
        and member.role_code in ('owner', 'manager')
        and member.status = 'active'
    )
  )
  with check (
    assigned_user_id = auth.uid()
    or exists (
      select 1
      from public.organization_members member
      where member.organization_id = operational_tasks.organization_id
        and member.user_id = auth.uid()
        and member.role_code in ('owner', 'manager')
        and member.status = 'active'
    )
  );

drop policy if exists operational_tasks_delete on public.operational_tasks;
create policy operational_tasks_delete on public.operational_tasks
  for delete
  using (
    exists (
      select 1
      from public.organization_members member
      where member.organization_id = operational_tasks.organization_id
        and member.user_id = auth.uid()
        and member.role_code = 'owner'
        and member.status = 'active'
    )
  );

drop policy if exists booking_operation_checklists_select on public.booking_operation_checklists;
create policy booking_operation_checklists_select on public.booking_operation_checklists
  for select
  using (
    exists (
      select 1
      from public.organization_members member
      where member.organization_id = booking_operation_checklists.organization_id
        and member.user_id = auth.uid()
        and member.role_code in ('owner', 'manager')
        and member.status = 'active'
    )
  );

drop policy if exists booking_operation_checklists_insert on public.booking_operation_checklists;
create policy booking_operation_checklists_insert on public.booking_operation_checklists
  for insert
  with check (
    updated_by = auth.uid()
    and exists (
      select 1
      from public.organization_members member
      where member.organization_id = booking_operation_checklists.organization_id
        and member.user_id = auth.uid()
        and member.role_code in ('owner', 'manager')
        and member.status = 'active'
    )
  );

drop policy if exists booking_operation_checklists_update on public.booking_operation_checklists;
create policy booking_operation_checklists_update on public.booking_operation_checklists
  for update
  using (
    exists (
      select 1
      from public.organization_members member
      where member.organization_id = booking_operation_checklists.organization_id
        and member.user_id = auth.uid()
        and member.role_code in ('owner', 'manager')
        and member.status = 'active'
    )
  )
  with check (
    updated_by = auth.uid()
    and exists (
      select 1
      from public.organization_members member
      where member.organization_id = booking_operation_checklists.organization_id
        and member.user_id = auth.uid()
        and member.role_code in ('owner', 'manager')
        and member.status = 'active'
    )
  );

grant select, insert, update, delete on public.operational_tasks to authenticated;
grant select, insert, update on public.booking_operation_checklists to authenticated;
