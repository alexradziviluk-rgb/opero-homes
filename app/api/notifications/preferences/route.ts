import { NextResponse } from "next/server";
import { BOOKING_NOTIFICATION_EVENT_TYPES, isBookingNotificationEventType } from "@/lib/notifications/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";

type PreferenceUpdateRequest = {
  eventType: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
};

function isPreferenceUpdateRequest(value: unknown): value is PreferenceUpdateRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PreferenceUpdateRequest>;

  return (
    typeof candidate.eventType === "string" &&
    typeof candidate.inAppEnabled === "boolean" &&
    typeof candidate.emailEnabled === "boolean" &&
    typeof candidate.whatsappEnabled === "boolean"
  );
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });
  }

  const auth = await requireStaffApiAuth();
  if (!auth.ok) {
    return auth.response;
  }

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("organization_id,user_id,event_type,in_app_enabled,email_enabled,whatsapp_enabled,created_at,updated_at")
    .eq("organization_id", auth.context.organization.id)
    .eq("user_id", auth.context.authUserId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  }

  const map = new Map(
    (data ?? []).map((item) => [
      String(item.event_type),
      {
        eventType: String(item.event_type),
        inAppEnabled: Boolean(item.in_app_enabled),
        emailEnabled: Boolean(item.email_enabled),
        whatsappEnabled: Boolean(item.whatsapp_enabled),
      },
    ]),
  );

  const normalized = BOOKING_NOTIFICATION_EVENT_TYPES.map((eventType) =>
    map.get(eventType) ?? {
      eventType,
      inAppEnabled: true,
      emailEnabled: true,
      whatsappEnabled: false,
    },
  );

  return NextResponse.json({ ok: true, data: normalized });
}

export async function PUT(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });
  }

  const auth = await requireStaffApiAuth();
  if (!auth.ok) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as unknown;
  if (!isPreferenceUpdateRequest(payload)) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  if (!isBookingNotificationEventType(payload.eventType)) {
    return NextResponse.json({ ok: false, error: "Unsupported event type" }, { status: 400 });
  }

  const { error } = await supabase
    .from("notification_preferences")
    .upsert({
      organization_id: auth.context.organization.id,
      user_id: auth.context.authUserId,
      event_type: payload.eventType,
      in_app_enabled: payload.inAppEnabled,
      email_enabled: payload.emailEnabled,
      whatsapp_enabled: payload.whatsappEnabled,
    });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}
