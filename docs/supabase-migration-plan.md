# Plan for Supabase migration

## Scope

This document outlines the staged migration path for moving the current local-first Opero Homes application to a multi-tenant Supabase architecture without removing the existing IndexedDB/local storage workflow prematurely.

## Migration sequence

1. Prepare the Supabase schema and RLS policies.
2. Introduce repository abstractions so the UI can work against either local storage or Supabase.
3. Connect authentication and organization membership flows.
4. Migrate data in batches:
   - Apartments and apartment metadata
   - Apartment photos (keep local Blob storage as-is until the storage migration is safely tested)
   - Bookings
   - Clients
   - Users and organization memberships
5. Validate access control and organization isolation before switching the default provider.

## Data migration notes

- Apartments: export the existing JSON/IndexedDB data first, then import it into Supabase with organization assignment.
- Photos: retain existing Blob files in IndexedDB and upload them to Supabase Storage only after the storage path mapping is verified.
- Bookings and clients: map local records to the new organization-scoped tables and preserve original IDs where possible.
- Users: invite users via the server-side flow and connect their profile records to the proper organization membership.

## Rollout recommendation

- Keep the local provider active until Supabase auth and RLS are verified.
- Introduce Supabase as a secondary provider first and switch the repository selector only after end-to-end tests pass.
