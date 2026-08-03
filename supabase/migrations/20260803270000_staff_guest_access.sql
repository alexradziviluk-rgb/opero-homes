grant select, insert, update, delete on table public.guests to authenticated;

drop policy if exists guests_staff_select on public.guests;
create policy guests_staff_select on public.guests
for select using (
  exists (
    select 1
    from public.organization_members member
    where member.organization_id = guests.organization_id
      and member.user_id = auth.uid()
      and lower(trim(coalesce(member.role_code, ''))) in ('owner', 'manager')
      and coalesce(member.status, 'active') = 'active'
  )
);

drop policy if exists guests_staff_manage on public.guests;
create policy guests_staff_manage on public.guests
for all using (
  exists (
    select 1
    from public.organization_members member
    where member.organization_id = guests.organization_id
      and member.user_id = auth.uid()
      and lower(trim(coalesce(member.role_code, ''))) in ('owner', 'manager')
      and coalesce(member.status, 'active') = 'active'
  )
)
with check (
  exists (
    select 1
    from public.organization_members member
    where member.organization_id = guests.organization_id
      and member.user_id = auth.uid()
      and lower(trim(coalesce(member.role_code, ''))) in ('owner', 'manager')
      and coalesce(member.status, 'active') = 'active'
  )
);
