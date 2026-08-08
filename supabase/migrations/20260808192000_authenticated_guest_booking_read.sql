-- Allow an authenticated guest to read bookings linked to their guest identity.
-- The booking trigger stores auth.uid() in primary_guest_id for authenticated requests.
drop policy if exists bookings_select_own on public.bookings;
create policy bookings_select_own on public.bookings
for select
to authenticated
using (primary_guest_id = auth.uid());
