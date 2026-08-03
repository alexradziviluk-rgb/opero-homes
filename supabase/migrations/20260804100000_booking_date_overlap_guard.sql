-- Prevent two active bookings for the same apartment from sharing dates.
-- The database guard is required because an API pre-check alone is race-prone.

CREATE OR REPLACE FUNCTION public.reject_booking_overlap_with_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF coalesce(NEW.status, 'pending') NOT IN ('cancelled', 'rejected', 'declined', 'expired')
     AND coalesce(NEW.request_status, NEW.status, 'pending') NOT IN ('cancelled', 'rejected')
     AND EXISTS (
       SELECT 1
       FROM public.bookings existing
       WHERE existing.organization_id = NEW.organization_id
         AND existing.apartment_id = NEW.apartment_id
         AND existing.id <> NEW.id
         AND coalesce(existing.status, 'pending') NOT IN ('cancelled', 'rejected', 'declined', 'expired')
         AND coalesce(existing.request_status, existing.status, 'pending') NOT IN ('cancelled', 'rejected')
         AND existing.check_in_date < NEW.check_out_date
         AND existing.check_out_date > NEW.check_in_date
     ) THEN
    RAISE EXCEPTION 'booking_conflict' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_booking_overlap ON public.bookings;
CREATE TRIGGER trg_reject_booking_overlap
BEFORE INSERT OR UPDATE OF organization_id, apartment_id, check_in_date, check_out_date, status, request_status
ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.reject_booking_overlap_with_booking();

REVOKE ALL ON FUNCTION public.reject_booking_overlap_with_booking() FROM PUBLIC;