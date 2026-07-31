import { NextResponse } from "next/server";
import { createBookingNotifications } from "@/lib/notifications/service";
import { isBookingNotificationEventType } from "@/lib/notifications/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import type { CreateBookingNotificationInput } from "@/types/notification";

function isCreateBookingNotificationInput(value: unknown): value is CreateBookingNotificationInput {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CreateBookingNotificationInput>;
  return (
    typeof candidate.eventType === "string" &&
    typeof candidate.idempotencyKey === "string" &&
    typeof candidate.bookingId === "string" &&
    typeof candidate.apartmentId === "string" &&
    typeof candidate.payload === "object" &&
    candidate.payload !== null
  );
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });
  }

  const auth = await requireStaffApiAuth();
  if (!auth.ok) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as unknown;
  if (!isCreateBookingNotificationInput(payload)) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  if (!isBookingNotificationEventType(payload.eventType)) {
    return NextResponse.json({ ok: false, error: "Unsupported event type" }, { status: 400 });
  }

  if (!payload.idempotencyKey.trim()) {
    return NextResponse.json({ ok: false, error: "idempotencyKey is required" }, { status: 400 });
  }

  try {
    const result = await createBookingNotifications({
      supabase,
      organizationId: auth.context.organization.id,
      actorUserId: auth.context.authUserId,
      request: {
        ...payload,
        idempotencyKey: payload.idempotencyKey.trim(),
      },
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create notifications";
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
