-- Owner invitation lifecycle. Property owners never become organization_members.
-- Tokens are generated and hashed inside PostgreSQL; raw tokens are never persisted.
-- Controlled rollout only. Do not apply directly to production.

CREATE OR REPLACE FUNCTION public.canonicalize_property_owner_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_TABLE_NAME = 'apartment_owner_access' THEN
    NEW.owner_email := lower(trim(coalesce(NEW.owner_email, '')));
  ELSE
    NEW.email := lower(trim(coalesce(NEW.email, '')));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.property_owner_invitations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  phone text,
  first_name text NOT NULL,
  last_name text,
  apartment_ids uuid[] NOT NULL,
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  used_at timestamptz,
  accepted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'revoked')),
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed', 'accepted', 'revoked')),
  delivery_error text,
  resend_count integer NOT NULL DEFAULT 0 CHECK (resend_count >= 0),
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.property_owner_invitations
  ADD COLUMN IF NOT EXISTS used_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'invited',
  ADD COLUMN IF NOT EXISTS resend_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz;

UPDATE public.property_owner_invitations
SET email = lower(trim(email)),
    status = CASE WHEN revoked_at IS NOT NULL THEN 'revoked' WHEN accepted_at IS NOT NULL THEN 'accepted' ELSE 'invited' END,
    used_at = coalesce(used_at, accepted_at)
WHERE email <> lower(trim(email)) OR status IS NULL OR used_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apartment_owner_access_email_not_empty') THEN
    ALTER TABLE public.apartment_owner_access ADD CONSTRAINT apartment_owner_access_email_not_empty CHECK (owner_email <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_owner_invitations_email_not_empty') THEN
    ALTER TABLE public.property_owner_invitations ADD CONSTRAINT property_owner_invitations_email_not_empty CHECK (email <> '');
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_canonicalize_apartment_owner_email ON public.apartment_owner_access;
CREATE TRIGGER trg_canonicalize_apartment_owner_email
BEFORE INSERT OR UPDATE OF owner_email ON public.apartment_owner_access
FOR EACH ROW EXECUTE FUNCTION public.canonicalize_property_owner_email();

DROP TRIGGER IF EXISTS trg_canonicalize_property_owner_invitation_email ON public.property_owner_invitations;
CREATE TRIGGER trg_canonicalize_property_owner_invitation_email
BEFORE INSERT OR UPDATE OF email ON public.property_owner_invitations
FOR EACH ROW EXECUTE FUNCTION public.canonicalize_property_owner_email();

CREATE INDEX IF NOT EXISTS property_owner_invitations_org_idx ON public.property_owner_invitations (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS property_owner_invitations_email_idx ON public.property_owner_invitations (lower(trim(email)));
CREATE UNIQUE INDEX IF NOT EXISTS property_owner_invitations_active_email_idx
  ON public.property_owner_invitations (organization_id, lower(trim(email)))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.property_owner_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS property_owner_invitations_manager_select ON public.property_owner_invitations;
CREATE POLICY property_owner_invitations_manager_select ON public.property_owner_invitations
  FOR SELECT TO authenticated USING (public.is_org_manager(organization_id));
DROP POLICY IF EXISTS property_owner_invitations_manager_manage ON public.property_owner_invitations;
CREATE POLICY property_owner_invitations_manager_manage ON public.property_owner_invitations
  FOR ALL TO authenticated USING (public.is_org_manager(organization_id)) WITH CHECK (public.is_org_manager(organization_id));

CREATE OR REPLACE FUNCTION public.set_property_owner_invitation_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_property_owner_invitation_updated_at ON public.property_owner_invitations;
CREATE TRIGGER trg_property_owner_invitation_updated_at BEFORE UPDATE ON public.property_owner_invitations FOR EACH ROW EXECUTE FUNCTION public.set_property_owner_invitation_updated_at();

DROP FUNCTION IF EXISTS public.create_property_owner_invitation(uuid,text,text,text,text,uuid[],text,timestamptz);
CREATE OR REPLACE FUNCTION public.create_property_owner_invitation(target_organization_id uuid, target_email text, target_first_name text, target_last_name text, target_phone text, target_apartment_ids uuid[], target_expires_at timestamptz)
RETURNS TABLE (invitation_id uuid, raw_token text, expires_at timestamptz, normalized_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  invitation_row public.property_owner_invitations%rowtype;
  requested_apartment_id uuid;
  canonical_email text := lower(trim(coalesce(target_email, '')));
  generated_token text := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  IF NOT public.is_org_manager(target_organization_id) THEN RAISE EXCEPTION 'INVITATION_NOT_ALLOWED'; END IF;
  IF canonical_email = '' OR position('@' IN canonical_email) = 0 THEN RAISE EXCEPTION 'INVALID_EMAIL'; END IF;
  IF nullif(trim(target_first_name), '') IS NULL THEN RAISE EXCEPTION 'FIRST_NAME_REQUIRED'; END IF;
  IF target_expires_at <= now() THEN RAISE EXCEPTION 'INVALID_EXPIRATION'; END IF;
  IF coalesce(array_length(target_apartment_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'APARTMENT_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(target_organization_id::text || ':' || canonical_email, 0));
  IF EXISTS (SELECT 1 FROM public.property_owner_invitations WHERE organization_id = target_organization_id AND email = canonical_email AND accepted_at IS NULL AND revoked_at IS NULL) THEN RAISE EXCEPTION 'INVITATION_ALREADY_EXISTS'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(target_apartment_ids) requested_id LEFT JOIN public.apartments a ON a.id = requested_id AND a.organization_id = target_organization_id WHERE a.id IS NULL) THEN RAISE EXCEPTION 'APARTMENT_NOT_FOUND'; END IF;

  INSERT INTO public.property_owner_invitations (organization_id, email, phone, first_name, last_name, apartment_ids, token_hash, invited_by, expires_at, status, delivery_status)
  VALUES (target_organization_id, canonical_email, nullif(trim(target_phone), ''), trim(target_first_name), nullif(trim(target_last_name), ''), (SELECT array_agg(DISTINCT requested_id) FROM unnest(target_apartment_ids) requested_id), encode(extensions.digest(generated_token, 'sha256'), 'hex'), auth.uid(), target_expires_at, 'invited', 'pending')
  RETURNING * INTO invitation_row;

  FOREACH requested_apartment_id IN ARRAY target_apartment_ids LOOP
    INSERT INTO public.apartment_owner_access (apartment_id, organization_id, owner_name, owner_email, owner_phone, status)
    VALUES (requested_apartment_id, target_organization_id, trim(concat_ws(' ', target_first_name, target_last_name)), canonical_email, nullif(trim(target_phone), ''), 'invited')
    ON CONFLICT (apartment_id, lower(trim(owner_email))) WHERE status IN ('invited', 'active')
    DO UPDATE SET owner_name = excluded.owner_name, owner_phone = excluded.owner_phone, updated_at = now();
  END LOOP;
  RETURN QUERY SELECT invitation_row.id, generated_token, invitation_row.expires_at, canonical_email;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_property_owner_invitations(target_organization_id uuid)
RETURNS TABLE (invitation_id uuid, email text, phone text, first_name text, last_name text, apartment_ids uuid[], delivery_status text, expires_at timestamptz, accepted_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT i.id, i.email, i.phone, i.first_name, i.last_name, i.apartment_ids, i.delivery_status, i.expires_at, i.accepted_at, i.created_at
  FROM public.property_owner_invitations i
  WHERE i.organization_id = target_organization_id AND i.revoked_at IS NULL AND public.is_org_manager(target_organization_id)
  ORDER BY i.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_property_owner_invitation_for_manager(target_invitation_id uuid)
RETURNS TABLE (invitation_id uuid, organization_id uuid, email text, first_name text, expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT i.id, i.organization_id, i.email, i.first_name, i.expires_at, i.accepted_at, i.revoked_at
  FROM public.property_owner_invitations i
  WHERE i.id = target_invitation_id AND public.is_org_manager(i.organization_id);
$$;

CREATE OR REPLACE FUNCTION public.get_property_owner_invitation(invite_token text)
RETURNS TABLE (invitation_id uuid, organization_id uuid, organization_name text, email text, phone text, first_name text, last_name text, apartment_ids uuid[], expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT i.id, i.organization_id, o.name, i.email, i.phone, i.first_name, i.last_name, i.apartment_ids, i.expires_at, i.accepted_at, i.revoked_at
  FROM public.property_owner_invitations i JOIN public.organizations o ON o.id = i.organization_id
  WHERE i.token_hash = encode(extensions.digest(coalesce(invite_token, ''), 'sha256'), 'hex') LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.accept_property_owner_invitation(invite_token text)
RETURNS TABLE (invitation_id uuid, organization_id uuid, access_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  current_uid uuid := auth.uid();
  current_email text;
  invitation_row public.property_owner_invitations%rowtype;
  updated_count integer;
BEGIN
  IF current_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT lower(trim(email)) INTO current_email FROM auth.users WHERE id = current_uid;
  SELECT * INTO invitation_row FROM public.property_owner_invitations WHERE token_hash = encode(extensions.digest(coalesce(invite_token, ''), 'sha256'), 'hex') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_NOT_FOUND'; END IF;
  IF invitation_row.revoked_at IS NOT NULL OR invitation_row.status = 'revoked' THEN RAISE EXCEPTION 'INVITATION_REVOKED'; END IF;
  IF invitation_row.used_at IS NOT NULL OR invitation_row.accepted_at IS NOT NULL OR invitation_row.status = 'accepted' THEN RAISE EXCEPTION 'INVITATION_ALREADY_ACCEPTED'; END IF;
  IF invitation_row.expires_at <= now() THEN RAISE EXCEPTION 'INVITATION_EXPIRED'; END IF;
  IF current_email IS NULL OR current_email <> invitation_row.email THEN RAISE EXCEPTION 'INVITATION_EMAIL_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM public.apartment_owner_access WHERE organization_id = invitation_row.organization_id AND apartment_id = ANY(invitation_row.apartment_ids) AND owner_email = invitation_row.email AND status = 'paused') THEN RAISE EXCEPTION 'OWNER_ACCESS_PAUSED'; END IF;
  UPDATE public.apartment_owner_access SET user_id = current_uid, status = 'active', updated_at = now()
  WHERE organization_id = invitation_row.organization_id AND owner_email = invitation_row.email AND apartment_id = ANY(invitation_row.apartment_ids) AND status = 'invited';
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count = 0 THEN RAISE EXCEPTION 'OWNER_ACCESS_NOT_FOUND'; END IF;
  UPDATE public.property_owner_invitations SET accepted_at = now(), used_at = now(), accepted_by_user_id = current_uid, status = 'accepted', delivery_status = 'accepted', updated_at = now() WHERE id = invitation_row.id;
  RETURN QUERY SELECT invitation_row.id, invitation_row.organization_id, updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.reinvite_property_owner(target_invitation_id uuid, target_expires_at timestamptz)
RETURNS TABLE (invitation_id uuid, raw_token text, expires_at timestamptz, normalized_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  invitation_row public.property_owner_invitations%rowtype;
  generated_token text := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  SELECT * INTO invitation_row FROM public.property_owner_invitations WHERE id = target_invitation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_NOT_FOUND'; END IF;
  IF NOT public.is_org_manager(invitation_row.organization_id) THEN RAISE EXCEPTION 'INVITATION_NOT_ALLOWED'; END IF;
  IF target_expires_at <= now() THEN RAISE EXCEPTION 'INVALID_EXPIRATION'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(invitation_row.organization_id::text || ':' || invitation_row.email, 0));
  IF EXISTS (SELECT 1 FROM public.apartment_owner_access WHERE organization_id = invitation_row.organization_id AND apartment_id = ANY(invitation_row.apartment_ids) AND owner_email = invitation_row.email AND status = 'active') THEN RAISE EXCEPTION 'OWNER_ALREADY_ACTIVE'; END IF;
  IF EXISTS (SELECT 1 FROM public.apartment_owner_access WHERE organization_id = invitation_row.organization_id AND apartment_id = ANY(invitation_row.apartment_ids) AND owner_email = invitation_row.email AND status = 'revoked') THEN
    UPDATE public.apartment_owner_access SET status = 'invited', updated_at = now() WHERE organization_id = invitation_row.organization_id AND apartment_id = ANY(invitation_row.apartment_ids) AND owner_email = invitation_row.email AND status = 'revoked';
  END IF;
  UPDATE public.property_owner_invitations
  SET token_hash = encode(extensions.digest(generated_token, 'sha256'), 'hex'), expires_at = target_expires_at, accepted_at = NULL, used_at = NULL, accepted_by_user_id = NULL, revoked_at = NULL, status = 'invited', delivery_status = 'pending', delivery_error = NULL, resend_count = resend_count + 1, last_sent_at = now(), updated_at = now()
  WHERE id = invitation_row.id
  RETURNING * INTO invitation_row;
  RETURN QUERY SELECT invitation_row.id, generated_token, invitation_row.expires_at, invitation_row.email;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_property_owner_invitation_delivery(target_invitation_id uuid, target_status text, target_error text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF target_status NOT IN ('sent', 'failed') THEN RAISE EXCEPTION 'INVALID_DELIVERY_STATUS'; END IF;
  UPDATE public.property_owner_invitations
  SET delivery_status = target_status, delivery_error = target_error, updated_at = now()
  WHERE id = target_invitation_id AND public.is_org_manager(organization_id);
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_property_owner_access(target_organization_id uuid, target_apartment_id uuid, target_user_id uuid, target_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NOT public.is_org_manager(target_organization_id) THEN RAISE EXCEPTION 'OWNER_ACCESS_NOT_ALLOWED'; END IF;
  IF target_status NOT IN ('active', 'paused', 'revoked') THEN RAISE EXCEPTION 'INVALID_OWNER_STATUS'; END IF;
  UPDATE public.apartment_owner_access SET status = target_status, updated_at = now() WHERE organization_id = target_organization_id AND apartment_id = target_apartment_id AND user_id = target_user_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.create_property_owner_invitation(uuid,text,text,text,text,uuid[],timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_property_owner_invitation(uuid,text,text,text,text,uuid[],timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.list_property_owner_invitations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_property_owner_invitations(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_property_owner_invitation_for_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_property_owner_invitation_for_manager(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_property_owner_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_property_owner_invitation(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_property_owner_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_property_owner_invitation(text) TO authenticated;
REVOKE ALL ON FUNCTION public.reinvite_property_owner(uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reinvite_property_owner(uuid,timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.set_property_owner_invitation_delivery(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_property_owner_invitation_delivery(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_property_owner_access(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_property_owner_access(uuid,uuid,uuid,text) TO authenticated;
