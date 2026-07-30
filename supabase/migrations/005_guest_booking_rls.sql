-- Allow guest users to manage their own client and booking rows.

alter table public.clients enable row level security;
alter table public.bookings enable row level security;

drop policy if exists clients_select_own on public.clients;
create policy clients_select_own on public.clients
for select using (id = auth.uid());

drop policy if exists clients_insert_own on public.clients;
create policy clients_insert_own on public.clients
for insert with check (id = auth.uid());

drop policy if exists clients_update_own on public.clients;
create policy clients_update_own on public.clients
for update using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists bookings_select_own on public.bookings;
create policy bookings_select_own on public.bookings
for select using (client_id = auth.uid());

drop policy if exists bookings_insert_own on public.bookings;
create policy bookings_insert_own on public.bookings
for insert with check (client_id = auth.uid());
