alter table public.notification_events
  drop constraint if exists notification_events_event_type_check;

alter table public.notification_events
  add constraint notification_events_event_type_check check (
    event_type in (
      'booking_created',
      'booking_confirmed',
      'booking_payment_succeeded',
      'booking_payment_failed',
      'booking_changed',
      'booking_cancelled',
      'booking_checkin_upcoming',
      'booking_checkout_upcoming',
      'booking_unassigned',
      'new_guest_message',
      'owner_invitation_accepted',
      'apartment_published',
      'apartment_unpublished',
      'calendar_conflict',
      'maintenance_created',
      'maintenance_completed',
      'booking_ready_for_checkin',
      'support_ticket_created',
      'support_manager_replied',
      'support_conversation_closed'
    )
  );

grant insert, select on public.support_telegram_updates to service_role;