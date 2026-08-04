grant select on public.availability_blocks to authenticated;

drop policy if exists availability_blocks_staff_select on public.availability_blocks;
create policy availability_blocks_staff_select on public.availability_blocks
  for select to authenticated
  using (
    exists (
      select 1
      from public.organization_members member
      where member.organization_id = availability_blocks.organization_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and lower(trim(coalesce(member.role_code, ''))) in ('owner', 'manager', 'employee')
    )
  );