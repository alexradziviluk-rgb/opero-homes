-- Guard every booking lifecycle write against active availability blocks.
-- Production booking dates are check_in_date/check_out_date.
-- Controlled rollout only. Do not apply directly to production.

CREATE OR REPLACE FUNCTION public.reject_booking_overlap_with_availability_block()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF coalesce(NEW.status, 'pending') NOT IN ('cancelled', 'rejected', 'declined', 'expired')
     AND EXISTS (
       SELECT 1 FROM public.availability_blocks ab
       WHERE ab.apartment_id = NEW.apartment_id
         AND ab.status = 'active'
         AND ab.start_date < NEW.check_out_date
         AND ab.end_date > NEW.check_in_date
     ) THEN
    RAISE EXCEPTION 'booking_conflict_availability_block' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_booking_availability_block ON public.bookings;
CREATE TRIGGER trg_reject_booking_availability_block
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.reject_booking_overlap_with_availability_block();

REVOKE ALL ON FUNCTION public.reject_booking_overlap_with_availability_block() FROM PUBLIC;
