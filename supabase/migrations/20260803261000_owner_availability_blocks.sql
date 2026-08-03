-- Owner blocks use the existing production availability_blocks relation.
-- Controlled rollout only. Do not apply directly to production.

DO $$
BEGIN
  IF to_regclass('public.availability_blocks') IS NULL THEN
    CREATE TABLE public.availability_blocks (
      id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      apartment_id uuid NOT NULL REFERENCES public.apartments(id) ON DELETE CASCADE,
      start_date date NOT NULL,
      end_date date NOT NULL,
      block_type text NOT NULL DEFAULT 'owner_block',
      reason text,
      created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT availability_blocks_dates_check CHECK (end_date > start_date)
    );
  END IF;
END $$;

ALTER TABLE public.availability_blocks
  ADD COLUMN IF NOT EXISTS block_source text NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS reason_code text,
  ADD COLUMN IF NOT EXISTS private_note text,
  ADD COLUMN IF NOT EXISTS owner_access_id uuid REFERENCES public.apartment_owner_access(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.availability_blocks
SET reason_code = coalesce(nullif(reason_code, ''), CASE block_type WHEN 'owner_block' THEN 'owner_stay' WHEN 'maintenance' THEN 'maintenance' ELSE 'other' END),
    block_source = coalesce(nullif(block_source, ''), 'staff'),
    status = coalesce(nullif(status, ''), 'active')
WHERE reason_code IS NULL OR block_source IS NULL OR status IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'availability_blocks_status_check') THEN
    ALTER TABLE public.availability_blocks ADD CONSTRAINT availability_blocks_status_check CHECK (status IN ('active', 'cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'availability_blocks_reason_code_check') THEN
    ALTER TABLE public.availability_blocks ADD CONSTRAINT availability_blocks_reason_code_check CHECK (reason_code IN ('owner_stay', 'family_or_guests', 'renovation', 'maintenance', 'unavailable', 'other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS availability_blocks_active_dates_idx
  ON public.availability_blocks (apartment_id, start_date, end_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS availability_blocks_owner_access_idx
  ON public.availability_blocks (owner_access_id, status) WHERE owner_access_id IS NOT NULL;

ALTER TABLE public.availability_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS availability_blocks_owner_select ON public.availability_blocks;
CREATE POLICY availability_blocks_owner_select ON public.availability_blocks
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() AND block_source = 'owner' AND public.is_active_property_owner_for_apartment(apartment_id));

CREATE OR REPLACE FUNCTION public.get_property_owner_occupied_periods(target_apartment_id uuid)
RETURNS TABLE (apartment_id uuid, start_date date, end_date date, status text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT b.apartment_id, b.check_in_date, b.check_out_date, 'occupied'::text
  FROM public.bookings b
  WHERE b.apartment_id = target_apartment_id
    AND public.is_active_property_owner_for_apartment(b.apartment_id)
    AND b.status IN ('pending', 'confirmed', 'checked_in')
  UNION ALL
  SELECT ab.apartment_id, ab.start_date, ab.end_date, 'blocked'::text
  FROM public.availability_blocks ab
  WHERE ab.apartment_id = target_apartment_id
    AND ab.status = 'active'
    AND public.is_active_property_owner_for_apartment(ab.apartment_id);
$$;

CREATE OR REPLACE FUNCTION public.create_property_owner_block(target_apartment_id uuid, target_start_date date, target_end_date date, target_reason_code text, target_private_note text DEFAULT NULL)
RETURNS public.availability_blocks
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  target_organization_id uuid;
  access_id uuid;
  inserted_block public.availability_blocks;
  conflict_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF target_end_date <= target_start_date OR target_start_date < current_date THEN RAISE EXCEPTION 'Invalid block dates'; END IF;
  IF target_reason_code NOT IN ('owner_stay', 'family_or_guests', 'renovation', 'maintenance', 'unavailable', 'other') THEN RAISE EXCEPTION 'Invalid reason code'; END IF;
  SELECT a.organization_id INTO target_organization_id FROM public.apartments a WHERE a.id = target_apartment_id;
  SELECT access.id INTO access_id FROM public.apartment_owner_access access WHERE access.apartment_id = target_apartment_id AND access.user_id = auth.uid() AND access.status = 'active';
  IF target_organization_id IS NULL OR access_id IS NULL THEN RAISE EXCEPTION 'Apartment ownership required'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(target_apartment_id::text, 0));
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.apartment_id = target_apartment_id AND b.status IN ('confirmed', 'checked_in')
      AND b.check_in_date < target_end_date AND b.check_out_date > target_start_date
    UNION ALL
    SELECT 1 FROM public.availability_blocks ab
    WHERE ab.apartment_id = target_apartment_id AND ab.status = 'active'
      AND ab.start_date < target_end_date AND ab.end_date > target_start_date
  ) INTO conflict_exists;
  IF conflict_exists THEN RAISE EXCEPTION 'Dates conflict with an existing booking or block'; END IF;

  INSERT INTO public.availability_blocks (organization_id, apartment_id, start_date, end_date, block_type, reason, reason_code, private_note, owner_access_id, block_source, created_by, status)
  VALUES (target_organization_id, target_apartment_id, target_start_date, target_end_date, 'owner_block', target_reason_code, target_reason_code, nullif(trim(target_private_note), ''), access_id, 'owner', auth.uid(), 'active')
  RETURNING * INTO inserted_block;
  RETURN inserted_block;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_property_owner_block(target_block_id uuid, target_start_date date, target_end_date date, target_reason_code text, target_private_note text DEFAULT NULL)
RETURNS public.availability_blocks
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE current_block public.availability_blocks; updated_block public.availability_blocks; conflict_exists boolean;
BEGIN
  SELECT * INTO current_block FROM public.availability_blocks WHERE id = target_block_id AND created_by = auth.uid() AND block_source = 'owner' AND status = 'active';
  IF current_block.id IS NULL THEN RAISE EXCEPTION 'Block not found or not editable'; END IF;
  IF target_end_date <= target_start_date OR target_start_date < current_date THEN RAISE EXCEPTION 'Invalid block dates'; END IF;
  IF target_reason_code NOT IN ('owner_stay', 'family_or_guests', 'renovation', 'maintenance', 'unavailable', 'other') THEN RAISE EXCEPTION 'Invalid reason code'; END IF;
  IF NOT public.is_active_property_owner_for_apartment(current_block.apartment_id) THEN RAISE EXCEPTION 'Active ownership required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(current_block.apartment_id::text, 0));
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.apartment_id = current_block.apartment_id AND b.status IN ('confirmed', 'checked_in')
      AND b.check_in_date < target_end_date AND b.check_out_date > target_start_date
    UNION ALL
    SELECT 1 FROM public.availability_blocks ab
    WHERE ab.id <> target_block_id AND ab.apartment_id = current_block.apartment_id AND ab.status = 'active'
      AND ab.start_date < target_end_date AND ab.end_date > target_start_date
  ) INTO conflict_exists;
  IF conflict_exists THEN RAISE EXCEPTION 'Dates conflict with an existing booking or block'; END IF;
  UPDATE public.availability_blocks SET start_date = target_start_date, end_date = target_end_date, reason = target_reason_code, reason_code = target_reason_code, private_note = nullif(trim(target_private_note), ''), updated_at = now() WHERE id = target_block_id RETURNING * INTO updated_block;
  RETURN updated_block;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_property_owner_block(target_block_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.availability_blocks SET status = 'cancelled', updated_at = now()
  WHERE id = target_block_id AND created_by = auth.uid() AND block_source = 'owner' AND status = 'active' AND start_date >= current_date
    AND public.is_active_property_owner_for_apartment(apartment_id)
  RETURNING true;
$$;

REVOKE ALL ON FUNCTION public.get_property_owner_occupied_periods(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_property_owner_occupied_periods(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_property_owner_block(uuid,date,date,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_property_owner_block(uuid,date,date,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.update_property_owner_block(uuid,date,date,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_property_owner_block(uuid,date,date,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_property_owner_block(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_property_owner_block(uuid) TO authenticated;
