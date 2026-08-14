-- Keep invitation token hashing resolvable with the SECURITY DEFINER search path.
alter function public.get_employee_invitation(text) set search_path = public, auth, extensions;
alter function public.accept_employee_invitation(text) set search_path = public, auth, extensions;
