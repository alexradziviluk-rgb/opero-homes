-- Public availability remains a safe date/status projection; owner notes and identity never leave the database.
-- Controlled rollout only. Do not apply directly to production.

CREATE OR REPLACE FUNCTION public.get_public_apartment_booking_periods(target_apartment_id uuid)
RETURNS TABLE (
  id uuid,
  apartment_id uuid,
  check_in date,
  check_out date,
  status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT b.id, b.apartment_id, b.check_in_date, b.check_out_date, b.status
  FROM public.bookings b
  JOIN public.apartments a ON a.id = b.apartment_id
  WHERE b.apartment_id = target_apartment_id
    AND a.publication_status = 'published'
    AND b.status IN ('pending', 'confirmed', 'checked_in')
  UNION ALL
  SELECT ab.id, ab.apartment_id, ab.start_date, ab.end_date, 'blocked'::text
  FROM public.availability_blocks ab
  JOIN public.apartments a ON a.id = ab.apartment_id
  WHERE ab.apartment_id = target_apartment_id
    AND a.publication_status = 'published'
    AND ab.status = 'active';
$$;

REVOKE ALL ON FUNCTION public.get_public_apartment_booking_periods(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_apartment_booking_periods(uuid) TO anon, authenticated;
