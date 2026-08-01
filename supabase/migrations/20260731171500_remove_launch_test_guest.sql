do $$
declare
  test_user_id uuid;
begin
  select id
  into test_user_id
  from auth.users
  where lower(email) = 'launch.test.20260731.1657@example.com'
  limit 1;

  if test_user_id is null then
    return;
  end if;

  delete from public.bookings where primary_guest_id = test_user_id;
  delete from public.guests where id = test_user_id;
  delete from public.profiles where id = test_user_id;
  delete from auth.users where id = test_user_id;
end;
$$;