create extension if not exists "pgcrypto";

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  avatar_url text,
  role text not null default 'employee',
  status text not null default 'invited',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'employee',
  role_code text not null default 'employee',
  status text not null default 'invited',
  invited_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organization_id, user_id)
);

create table if not exists apartments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  city text,
  rooms integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists apartment_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  apartment_id uuid not null references apartments(id) on delete cascade,
  storage_path text not null,
  is_cover boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  apartment_id uuid references apartments(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  guest_name text not null,
  check_in date not null,
  check_out date not null,
  total_amount numeric,
  status text default 'pending',
  payment_status text default 'pending',
  source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  apartment_id uuid references apartments(id) on delete set null,
  booking_id uuid references bookings(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  task_type text not null default 'cleaning',
  status text not null default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_organizations_owner_id on organizations(owner_id);
create index if not exists idx_organization_members_organization_id on organization_members(organization_id);
create index if not exists idx_organization_members_user_id on organization_members(user_id);
create index if not exists idx_apartments_organization_id on apartments(organization_id);
create index if not exists idx_apartment_photos_organization_id on apartment_photos(organization_id);
create index if not exists idx_apartment_photos_apartment_id on apartment_photos(apartment_id);
create index if not exists idx_clients_organization_id on clients(organization_id);
create index if not exists idx_bookings_organization_id on bookings(organization_id);
create index if not exists idx_bookings_apartment_id on bookings(apartment_id);
create index if not exists idx_bookings_client_id on bookings(client_id);
create index if not exists idx_tasks_organization_id on tasks(organization_id);
create index if not exists idx_tasks_apartment_id on tasks(apartment_id);
create index if not exists idx_tasks_booking_id on tasks(booking_id);
create index if not exists idx_tasks_assigned_user_id on tasks(assigned_user_id);

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table organization_members enable row level security;
alter table apartments enable row level security;
alter table apartment_photos enable row level security;
alter table clients enable row level security;
alter table bookings enable row level security;
alter table tasks enable row level security;

drop policy if exists organizations_select on organizations;
create policy organizations_select on organizations
  for select using (
    exists (
      select 1 from organization_members om
      where om.organization_id = organizations.id and om.user_id = auth.uid()
    )
  );

drop policy if exists organizations_manage on organizations;
create policy organizations_manage on organizations
  for all using (
    exists (
      select 1 from organization_members om
      where om.organization_id = organizations.id and om.user_id = auth.uid() and om.role = 'owner'
    )
  ) with check (
    exists (
      select 1 from organization_members om
      where om.organization_id = organizations.id and om.user_id = auth.uid() and om.role = 'owner'
    )
  );

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select using (
    exists (
      select 1
      from organization_members caller
      join organization_members target on target.organization_id = caller.organization_id
      where caller.user_id = auth.uid() and target.user_id = profiles.id
    )
  );

drop policy if exists profiles_manage on profiles;
create policy profiles_manage on profiles
  for all using (
    exists (
      select 1
      from organization_members caller
      join organization_members target on target.organization_id = caller.organization_id
      where caller.user_id = auth.uid() and target.user_id = profiles.id and caller.role in ('owner', 'manager')
    )
  ) with check (
    exists (
      select 1
      from organization_members caller
      join organization_members target on target.organization_id = caller.organization_id
      where caller.user_id = auth.uid() and target.user_id = profiles.id and caller.role in ('owner', 'manager')
    )
  );

drop policy if exists organization_members_select on organization_members;
create policy organization_members_select on organization_members
  for select using (
    exists (
      select 1 from organization_members om
      where om.organization_id = organization_members.organization_id and om.user_id = auth.uid()
    )
  );

drop policy if exists organization_members_manage on organization_members;
create policy organization_members_manage on organization_members
  for all using (
    exists (
      select 1 from organization_members om
      where om.organization_id = organization_members.organization_id and om.user_id = auth.uid() and om.role = 'owner'
    )
  ) with check (
    exists (
      select 1 from organization_members om
      where om.organization_id = organization_members.organization_id and om.user_id = auth.uid() and om.role = 'owner'
    )
  );

drop policy if exists apartments_select on apartments;
create policy apartments_select on apartments
  for select using (
    exists (
      select 1 from organization_members om
      where om.organization_id = apartments.organization_id and om.user_id = auth.uid()
    )
  );

drop policy if exists apartments_manage on apartments;
create policy apartments_manage on apartments
  for all using (
    exists (
      select 1 from organization_members om
      where om.organization_id = apartments.organization_id and om.user_id = auth.uid() and om.role in ('owner', 'manager')
    )
  ) with check (
    exists (
      select 1 from organization_members om
      where om.organization_id = apartments.organization_id and om.user_id = auth.uid() and om.role in ('owner', 'manager')
    )
  );

drop policy if exists apartment_photos_select on apartment_photos;
create policy apartment_photos_select on apartment_photos
  for select using (
    exists (
      select 1 from organization_members om
      where om.organization_id = apartment_photos.organization_id and om.user_id = auth.uid()
    )
  );

drop policy if exists apartment_photos_manage on apartment_photos;
create policy apartment_photos_manage on apartment_photos
  for all using (
    exists (
      select 1 from organization_members om
      where om.organization_id = apartment_photos.organization_id and om.user_id = auth.uid() and om.role in ('owner', 'manager')
    )
  ) with check (
    exists (
      select 1 from organization_members om
      where om.organization_id = apartment_photos.organization_id and om.user_id = auth.uid() and om.role in ('owner', 'manager')
    )
  );

drop policy if exists clients_select on clients;
create policy clients_select on clients
  for select using (
    exists (
      select 1 from organization_members om
      where om.organization_id = clients.organization_id and om.user_id = auth.uid()
    )
  );

drop policy if exists clients_manage on clients;
create policy clients_manage on clients
  for all using (
    exists (
      select 1 from organization_members om
      where om.organization_id = clients.organization_id and om.user_id = auth.uid() and om.role in ('owner', 'manager')
    )
  ) with check (
    exists (
      select 1 from organization_members om
      where om.organization_id = clients.organization_id and om.user_id = auth.uid() and om.role in ('owner', 'manager')
    )
  );

drop policy if exists bookings_select on bookings;
create policy bookings_select on bookings
  for select using (
    exists (
      select 1 from organization_members om
      where om.organization_id = bookings.organization_id and om.user_id = auth.uid()
    )
  );

drop policy if exists bookings_manage on bookings;
create policy bookings_manage on bookings
  for all using (
    exists (
      select 1 from organization_members om
      where om.organization_id = bookings.organization_id and om.user_id = auth.uid() and om.role in ('owner', 'manager')
    )
  ) with check (
    exists (
      select 1 from organization_members om
      where om.organization_id = bookings.organization_id and om.user_id = auth.uid() and om.role in ('owner', 'manager')
    )
  );

drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks
  for select using (
    exists (
      select 1 from organization_members om
      where om.organization_id = tasks.organization_id and om.user_id = auth.uid()
    )
  );

drop policy if exists tasks_manage on tasks;
create policy tasks_manage on tasks
  for all using (
    exists (
      select 1 from organization_members om
      where om.organization_id = tasks.organization_id and om.user_id = auth.uid() and om.role in ('owner', 'manager', 'cleaner', 'maintenance')
    )
  ) with check (
    exists (
      select 1 from organization_members om
      where om.organization_id = tasks.organization_id and om.user_id = auth.uid() and om.role in ('owner', 'manager', 'cleaner', 'maintenance')
    )
  );
