# Live Conversation T2 Rollback Plan

This plan applies to the controlled rollout of the live manager conversation engine. It is intentionally compensating and does not remove conversation data automatically.

## Feature flags

Production defaults are disabled:

- `LIVE_CONVERSATION_T2_ENABLED=false`
- `TELEGRAM_MESSAGE_REPLIES_ENABLED=false`
- `SUPPORT_REALTIME_ENABLED=false`
- `ANONYMOUS_CONTINUATION_ENABLED=false`

Turn off the relevant application flag before changing its schema phase. These flags are server-side only and must not use `NEXT_PUBLIC_` variables.

## Phase A rollback

1. Keep the nullable conversation, delivery, idempotency, and anonymous-access columns in place.
2. Do not delete backfilled state, messages, audit rows, delivery records, or existing T1 Telegram references.
3. Disable all T2 flags before any later schema compensation.
4. Treat any invalid index or failed partial backfill through a separately reviewed compensating migration.

Phase A is additive and should not require rollback for application availability. T1 continues to use the legacy ticket/message path while T2 flags are false.

## Phase B rollback

1. Turn off T2 application flags first.
2. Revoke `EXECUTE` on new lifecycle, message, token, and routing RPCs after confirming no active route calls them.
3. Keep columns, tables, messages, audit rows, bindings, and delivery history.
4. Do not drop RLS policies or replace existing migration history; use a separate compensating migration if a policy must be restored.

## Phase C rollback

1. Turn off `SUPPORT_REALTIME_ENABLED` first.
2. Remove only the safe realtime event bridge from `supabase_realtime` in a separate compensating migration.
3. Do not publish raw `support_messages` while internal notes share the table.
4. Verify active channels and client history fallback before reopening T2.

## Phase D rollback

1. Turn off `TELEGRAM_MESSAGE_REPLIES_ENABLED` and `LIVE_CONVERSATION_T2_ENABLED`.
2. Revoke routing/link RPC grants after application rollback.
3. Do not delete Telegram bindings, link-token history, message refs, or delivery attempts automatically.
4. Preserve the T1 callback contract and existing ticket Telegram fields.

## Application rollback

1. Stop the rollout and keep the production webhook callback-compatible with `callback_query`.
2. Roll back to the previous production application commit.
3. Disable T2 UI entry points and new live conversation routes using the previous application configuration.
4. Keep T1 Telegram handoff and callback handling available.
5. Confirm that the callback-only webhook path still accepts existing callback updates and does not send real test messages.

Application rollback is reversible by restoring the T2 application commit after the schema is confirmed compatible.

## Schema rollback

1. Do not drop `support_messages`, `support_tickets`, conversation columns, bindings, delivery records, or anonymous access metadata.
2. Revoke `EXECUTE` on the new SECURITY DEFINER RPCs from `service_role` only after application rollback is complete and no old route calls them:
   - `support_check_anonymous_rate_limit`
   - `support_revoke_anonymous_access`
   - `support_revoke_closed_anonymous_access`
   - `support_create_conversation_with_initial_message`
3. Disable T2 routes and UI before changing any schema behavior.
4. Keep nullable conversation, anonymous access, revoke, and delivery columns in place.
5. Use a separate compensating migration for any policy or grant rollback. Do not edit migration history or use migration repair.
6. Revert Realtime publication changes separately, only after checking active channels and confirming T1 does not depend on them.
7. Do not delete Telegram bindings automatically. Preserve them for audit and controlled relinking.
8. Take a backup and complete a data audit before any future destructive cleanup.

Schema rollback is only partially reversible. Existing conversation messages, audit rows, access revocation timestamps, delivery attempts, and Telegram binding history are retained by policy. Dropping data or indexes requires a separate reviewed migration and backup.

## Smoke test after rollback

- Anonymous/T1 handoff creates at most one ticket for the same idempotency key.
- Callback accept/resolve behavior remains unchanged.
- No production webhook reconfiguration is performed during the rollback smoke test.
- Existing support ticket history remains readable to its authorized requester/staff.
- Internal notes remain hidden from requesters.
- No raw anonymous token, Telegram token, chat ID, or database error appears in client responses or logs.
- Verify the deploy status, error logs, RLS advisors, and support delivery status before reopening rollout.

## Webhook rollback

The production webhook remains callback-only until Phase D is approved. Phase E is a separate operational action and is not part of any migration. If it is ever enabled, rollback is:

```json
{"allowed_updates":["callback_query"]}
```

No webhook update is performed by schema or application rollout migrations.

## Current rollout status

Production read-only preflight is complete. The follow-up migrations are local only; no production SQL, migration apply, `db push`, repair, webhook change, or Telegram message was performed. Production rollout remains blocked until each phased migration receives its own read-only compatibility approval.
