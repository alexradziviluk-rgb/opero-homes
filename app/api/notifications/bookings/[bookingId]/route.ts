import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ bookingId: string }> },
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });
  }

  const auth = await requireStaffApiAuth();
  if (!auth.ok) {
    return auth.response;
  }

  const { bookingId } = await context.params;

  const { data: events, error: eventsError } = await supabase
    .from("notification_events")
    .select("id,event_type,booking_id,apartment_id,payload,idempotency_key,created_at")
    .eq("organization_id", auth.context.organization.id)
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });

  if (eventsError) {
    return NextResponse.json({ ok: false, error: eventsError.message }, { status: 422 });
  }

  const eventIds = (events ?? []).map((event) => event.id as string);

  if (eventIds.length === 0) {
    return NextResponse.json({ ok: true, data: { events: [], deliveries: [], notifications: [] } });
  }

  const [{ data: deliveries, error: deliveriesError }, { data: notifications, error: notificationsError }] = await Promise.all([
    supabase
      .from("notification_deliveries")
      .select("id,event_id,recipient_user_id,recipient_guest_id,channel,destination,template_key,status,attempt_count,next_attempt_at,sent_at,delivered_at,failed_at,last_error,created_at,updated_at")
      .eq("organization_id", auth.context.organization.id)
      .in("event_id", eventIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("notifications")
      .select("id,event_id,recipient_user_id,title,read_at,created_at")
      .eq("organization_id", auth.context.organization.id)
      .in("event_id", eventIds)
      .order("created_at", { ascending: false }),
  ]);

  if (deliveriesError) {
    return NextResponse.json({ ok: false, error: deliveriesError.message }, { status: 422 });
  }

  if (notificationsError) {
    return NextResponse.json({ ok: false, error: notificationsError.message }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      events: events ?? [],
      deliveries: deliveries ?? [],
      notifications: notifications ?? [],
    },
  });
}
