-- Focused local schema/security smoke test.
-- Run after `supabase db reset --local` with:
-- supabase db query --local < supabase/tests/property_owner_portal.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'apartment_owner_access') THEN RAISE EXCEPTION 'apartment_owner_access is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'property_owner_invitations') THEN RAISE EXCEPTION 'property_owner_invitations is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'availability_blocks') THEN RAISE EXCEPTION 'availability_blocks is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'accept_property_owner_invitation') THEN RAISE EXCEPTION 'owner acceptance function is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_property_owner_block') THEN RAISE EXCEPTION 'owner block function is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_reject_booking_availability_block') THEN RAISE EXCEPTION 'booking availability trigger is missing'; END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'apartments' AND policyname = 'apartments_select_member') THEN RAISE EXCEPTION 'property-scoped apartment policy is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'availability_blocks' AND policyname = 'availability_blocks_owner_select') THEN RAISE EXCEPTION 'owner block select policy is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'property_owner_invitations' AND policyname = 'property_owner_invitations_manager_manage') THEN RAISE EXCEPTION 'invitation manager policy is missing'; END IF;
END $$;

SELECT 'property_owner_portal_schema_smoke_passed' AS result;
