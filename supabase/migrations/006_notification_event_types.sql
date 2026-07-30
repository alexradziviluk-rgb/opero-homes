alter table public.notification_events
  drop constraint if exists notification_events_event_type_check;

alter table public.notification_events
  add constraint notification_events_event_type_check check (
    event_type in (
      'booking_created',
      'booking_confirmed',
      'booking_cancelled',
      'booking_payment_succeeded',
      'booking_payment_failed',
      'new_guest_message',
      'owner_invitation_accepted',
      'apartment_published',
      'apartment_unpublished',
      'calendar_conflict',
      'maintenance_created',
      'maintenance_completed',
      'booking_changed',
      'booking_checkin_upcoming',
      'booking_checkout_upcoming',
      'booking_unassigned'
    )
  );

alter table public.notification_preferences
  drop constraint if exists notification_preferences_event_type_check;

alter table public.notification_preferences
  add constraint notification_preferences_event_type_check check (
    event_type in (
      'booking_created',
      'booking_confirmed',
      'booking_cancelled',
      'booking_payment_succeeded',
      'booking_payment_failed',
      'new_guest_message',
      'owner_invitation_accepted',
      'apartment_published',
      'apartment_unpublished',
      'calendar_conflict',
      'maintenance_created',
      'maintenance_completed',
      'booking_changed',
      'booking_checkin_upcoming',
      'booking_checkout_upcoming',
      'booking_unassigned'
    )
  );