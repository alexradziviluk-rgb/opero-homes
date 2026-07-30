import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { getRoleCodeFromContext, isManagerRoleCode } from "@/lib/supabase/role-code";

type SettingsUpdateRequest = {
  defaultBookingManagerUserId: string | null;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  whatsappProvider: string | null;
  whatsappChannelConnected: boolean;
  checkinReminderHours: number;
  checkoutReminderHours: number;
  backupManagerWhatsAppEnabled: boolean;
};

const DEFAULT_SETTINGS = {
  defaultBookingManagerUserId: null,
  emailEnabled: true,
  whatsappEnabled: false,
  whatsappProvider: null,
  whatsappChannelConnected: false,
  checkinReminderHours: 24,
  checkoutReminderHours: 24,
  backupManagerWhatsAppEnabled: false,
};

function isSettingsUpdateRequest(value: unknown): value is SettingsUpdateRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SettingsUpdateRequest>;

  return (
    (typeof candidate.defaultBookingManagerUserId === "string" || candidate.defaultBookingManagerUserId === null) &&
    typeof candidate.emailEnabled === "boolean" &&
    typeof candidate.whatsappEnabled === "boolean" &&
    (typeof candidate.whatsappProvider === "string" || candidate.whatsappProvider === null) &&
    typeof candidate.whatsappChannelConnected === "boolean" &&
    typeof candidate.checkinReminderHours === "number" &&
    typeof candidate.checkoutReminderHours === "number" &&
    typeof candidate.backupManagerWhatsAppEnabled === "boolean"
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
    .from("organization_notification_settings")
    .select("organization_id,default_booking_manager_user_id,email_enabled,whatsapp_enabled,whatsapp_provider,whatsapp_channel_connected,fallback_rules,checkin_reminder_hours,checkout_reminder_hours")
    .eq("organization_id", auth.context.organization.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  }

  if (!data) {
    return NextResponse.json({ ok: true, data: DEFAULT_SETTINGS });
  }

  const fallbackRules = (data.fallback_rules as Record<string, unknown> | null) ?? {};

  return NextResponse.json({
    ok: true,
    data: {
      defaultBookingManagerUserId: data.default_booking_manager_user_id,
      emailEnabled: Boolean(data.email_enabled),
      whatsappEnabled: Boolean(data.whatsapp_enabled),
      whatsappProvider: data.whatsapp_provider,
      whatsappChannelConnected: Boolean(data.whatsapp_channel_connected),
      checkinReminderHours: Number(data.checkin_reminder_hours ?? 24),
      checkoutReminderHours: Number(data.checkout_reminder_hours ?? 24),
      backupManagerWhatsAppEnabled: fallbackRules["backup_manager_whatsapp_enabled"] === true,
    },
  });
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

  if (!isManagerRoleCode(getRoleCodeFromContext(auth.context))) {
    return NextResponse.json({ ok: false, error: "Insufficient permissions" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as unknown;
  if (!isSettingsUpdateRequest(payload)) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const fallbackRules: Record<string, unknown> = {
    backup_manager_whatsapp_enabled: payload.backupManagerWhatsAppEnabled,
  };

  const { error } = await supabase
    .from("organization_notification_settings")
    .upsert({
      organization_id: auth.context.organization.id,
      default_booking_manager_user_id: payload.defaultBookingManagerUserId,
      email_enabled: payload.emailEnabled,
      whatsapp_enabled: payload.whatsappEnabled,
      whatsapp_provider: payload.whatsappProvider,
      whatsapp_channel_connected: payload.whatsappChannelConnected,
      fallback_rules: fallbackRules,
      checkin_reminder_hours: Math.max(1, Math.floor(payload.checkinReminderHours)),
      checkout_reminder_hours: Math.max(1, Math.floor(payload.checkoutReminderHours)),
    });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}
