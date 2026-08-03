drop policy if exists notifications_delete_own on public.notifications;

create policy notifications_delete_own on public.notifications
for delete using (
  public.notification_is_org_member(organization_id)
  and recipient_user_id = auth.uid()
);