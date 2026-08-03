-- Owner access foundation compatible with production identity and organization models.
-- Controlled rollout only. Do not apply directly to production.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'check_in_date') THEN
    ALTER TABLE public.bookings ADD COLUMN check_in_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'check_out_date') THEN
    ALTER TABLE public.bookings ADD COLUMN check_out_date date;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'check_in') THEN
    UPDATE public.bookings SET check_in_date = check_in WHERE check_in_date IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'check_out') THEN
    UPDATE public.bookings SET check_out_date = check_out WHERE check_out_date IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apartments_id_organization_id_key') THEN
    ALTER TABLE public.apartments ADD CONSTRAINT apartments_id_organization_id_key UNIQUE (id, organization_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.apartment_owner_access (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  organization_id uuid NOT NULL,
  apartment_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_name text NOT NULL,
  owner_email text NOT NULL,
  owner_phone text,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'paused', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT apartment_owner_access_apartment_fk FOREIGN KEY (apartment_id, organization_id)
    REFERENCES public.apartments (id, organization_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS apartment_owner_access_apartment_user_uidx
  ON public.apartment_owner_access (apartment_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS apartment_owner_access_apartment_email_uidx
  ON public.apartment_owner_access (apartment_id, lower(trim(owner_email)))
  WHERE status IN ('invited', 'active');
CREATE INDEX IF NOT EXISTS apartment_owner_access_user_status_idx
  ON public.apartment_owner_access (user_id, status) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS apartment_owner_access_apartment_status_idx
  ON public.apartment_owner_access (apartment_id, status);
CREATE INDEX IF NOT EXISTS apartment_owner_access_organization_status_idx
  ON public.apartment_owner_access (organization_id, status);

ALTER TABLE public.apartment_owner_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS apartment_owner_access_self_select ON public.apartment_owner_access;
CREATE POLICY apartment_owner_access_self_select ON public.apartment_owner_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND status = 'active');
DROP POLICY IF EXISTS apartment_owner_access_manager_all ON public.apartment_owner_access;
CREATE POLICY apartment_owner_access_manager_all ON public.apartment_owner_access
  FOR ALL TO authenticated
  USING (public.is_org_manager(organization_id))
  WITH CHECK (public.is_org_manager(organization_id));

CREATE OR REPLACE FUNCTION public.is_active_property_owner_for_apartment(target_apartment_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.apartment_owner_access access
    WHERE access.apartment_id = target_apartment_id
      AND access.user_id = auth.uid()
      AND access.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_property_owner_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.apartment_owner_access access
    WHERE access.user_id = auth.uid() AND access.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_property_owner_properties()
RETURNS TABLE (id uuid, organization_id uuid, name text, title text, city text, district text, address text, publication_status text, cover_photo_url text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT a.id, a.organization_id, coalesce(a.name, ''), coalesce(a.name, ''), a.city, a.district, a.address, a.publication_status, a.cover_photo_url
  FROM public.apartments a
  WHERE EXISTS (
    SELECT 1 FROM public.apartment_owner_access access
    WHERE access.apartment_id = a.id AND access.user_id = auth.uid() AND access.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_property_owner_for_apartment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_property_owner_for_apartment(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_active_property_owner_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_property_owner_user() TO authenticated;
REVOKE ALL ON FUNCTION public.get_property_owner_properties() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_property_owner_properties() TO authenticated;
