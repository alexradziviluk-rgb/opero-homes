-- Ensure every active workspace role can see bookings in the staff workspace.
-- This is additive and preserves the stricter write policies already in place.

drop policy if exists bookings_staff_workspace_select on public.bookings;

create policy bookings_staff_workspace_select on public.bookings
  for select to authenticated
  using (
    exists (
      select 1
      from public.organization_members member
      where member.organization_id = bookings.organization_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and lower(trim(coalesce(member.role_code, member.role, ''))) in (
          'owner', 'manager', 'employee', 'cleaner', 'maintenance', 'admin'
        )
    )
  );