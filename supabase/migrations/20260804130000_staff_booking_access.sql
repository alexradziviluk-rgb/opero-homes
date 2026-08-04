-- Employees and operational staff need the same booking workspace access as managers.
-- Keep the check organization-scoped and require an active staff membership.

DROP POLICY IF EXISTS bookings_staff_access ON public.bookings;
CREATE POLICY bookings_staff_access ON public.bookings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members member
      WHERE member.organization_id = bookings.organization_id
        AND member.user_id = auth.uid()
        AND member.status = 'active'
        AND lower(trim(coalesce(member.role_code, ''))) IN ('owner', 'manager', 'employee', 'cleaner', 'maintenance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members member
      WHERE member.organization_id = bookings.organization_id
        AND member.user_id = auth.uid()
        AND member.status = 'active'
        AND lower(trim(coalesce(member.role_code, ''))) IN ('owner', 'manager', 'employee', 'cleaner', 'maintenance')
    )
  );