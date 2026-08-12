revoke all on function public.search_property_owners(uuid, text) from anon, public;
grant execute on function public.search_property_owners(uuid, text) to authenticated;

revoke all on function public.assign_registered_client_as_property_owner(uuid, uuid, uuid) from anon, public;
grant execute on function public.assign_registered_client_as_property_owner(uuid, uuid, uuid) to authenticated;

revoke all on function public.assign_existing_property_owner(uuid, uuid, uuid) from anon, public;
grant execute on function public.assign_existing_property_owner(uuid, uuid, uuid) to authenticated;
