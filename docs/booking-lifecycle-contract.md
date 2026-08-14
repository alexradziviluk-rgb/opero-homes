# Booking Lifecycle Contract

## Booking States

The canonical booking status sequence is:

`pending -> confirmed -> checked_in -> checked_out`

Cancellation is a separate terminal branch from `pending`, `confirmed`, or `checked_in` to `cancelled`. Repeating the current terminal status is idempotent; reopening a cancelled or checked-out booking is rejected server-side.

`rejected` is a request status. A rejected request is persisted as booking status `cancelled` with request status `rejected`.

## Date Fields

Application booking objects use `checkIn` and `checkOut`. The canonical database fields are `check_in_date` and `check_out_date`. The legacy database fields `check_in` and `check_out` are maintained by the compatibility trigger for older readers and writes; new application lifecycle code must use the canonical date fields.

## Check-in and Check-out

Manager/owner staff complete the operation checklist through `/api/operations/checklists`. Setting `check_in_completed` requires status `confirmed` and changes it to `checked_in`. Setting `check_out_completed` requires status `checked_in` and changes it to `checked_out`. Replaying an already completed checklist update is safe and does not create another booking transition.

## Cleaning

Cleaning is manual by contract. The Manager booking-confirmation flow creates the standard operational task set, including the cleaning task, and assigns the task to an active cleaner when available. Check-out does not implicitly create another cleaning task. A cleaner completes the assigned task through the operational task API; Manager/owner staff can see the resulting completion.

## Authorization

Guest and property-owner identities cannot mutate staff booking status. Cleaner and maintenance identities can work only within their assigned operational task surface and cannot read or mutate booking lifecycle state. Booking and task resources remain organization-scoped.

## Notification Failure

Booking mutation success is independent from provider delivery. The booking API returns the business mutation together with `notification.status`: `sent`, `queued`, or `failed`. Notification deliveries remain in the existing queue/idempotency system for retry; provider errors are not returned raw to customers.