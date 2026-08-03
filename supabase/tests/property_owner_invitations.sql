-- Focused local schema/security assertions for owner invitation contracts.
-- Run after `supabase db reset --local`.

SELECT
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_canonicalize_apartment_owner_email') AS owner_email_trigger,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_canonicalize_property_owner_invitation_email') AS invitation_email_trigger,
  EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'apartment_owner_access_apartment_email_uidx') AS owner_email_unique_index,
  EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'property_owner_invitations_active_email_idx') AS invitation_email_unique_index,
  to_regprocedure('public.create_property_owner_invitation(uuid,text,text,text,text,uuid[],timestamptz)') IS NOT NULL AS create_signature,
  to_regprocedure('public.reinvite_property_owner(uuid,timestamptz)') IS NOT NULL AS reinvite_signature,
  has_function_privilege('authenticated', to_regprocedure('public.create_property_owner_invitation(uuid,text,text,text,text,uuid[],timestamptz)'), 'EXECUTE') AS authenticated_create_grant,
  NOT has_function_privilege('anon', to_regprocedure('public.create_property_owner_invitation(uuid,text,text,text,text,uuid[],timestamptz)'), 'EXECUTE') AS anon_create_denied,
  NOT has_function_privilege('public', to_regprocedure('public.reinvite_property_owner(uuid,timestamptz)'), 'EXECUTE') AS public_reinvite_denied,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'property_owner_invitations' AND column_name = 'used_at') AS used_at_column,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'property_owner_invitations' AND column_name = 'resend_count') AS resend_count_column;
