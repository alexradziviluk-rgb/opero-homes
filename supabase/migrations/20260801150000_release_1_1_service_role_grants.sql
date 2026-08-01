-- Release 1.1 follow-up: preserve migration history while restoring service-role access for local/admin cleanup.
grant all on table public.organizations to service_role;
grant all on table public.organization_members to service_role;
grant all on table public.organization_settings to service_role;
grant all on table public.subscriptions to service_role;

grant select on table public.organizations, public.profiles, public.organization_members, public.apartments, public.organization_settings, public.subscriptions to authenticated;
grant update on table public.organization_settings, public.subscriptions to authenticated;