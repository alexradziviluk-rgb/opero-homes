import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { isNotificationEventType } from "@/lib/notifications/constants";
import type { InAppNotificationRow, NotificationCenterItem } from "@/types/notification";

type ReadFilter = "all" | "read" | "unread";

function parseReadFilter(value: string | null): ReadFilter {
  if (value === "read" || value === "unread") {
    return value;
  }

  return "all";
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });
  }

  const auth = await requireStaffApiAuth();
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const offsetRaw = Number(url.searchParams.get("offset") ?? "0");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 20;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;
  const readFilter = parseReadFilter(url.searchParams.get("read"));
  const eventTypeFilter = url.searchParams.get("eventType")?.trim() ?? "";

  if (eventTypeFilter && !isNotificationEventType(eventTypeFilter)) {
    return NextResponse.json({ ok: false, error: "Unsupported event type" }, { status: 400 });
  }

  const baseQuery = supabase
    .from("notifications")
    .select("id,organization_id,recipient_user_id,event_id,title,message,action_url,read_at,created_at")
    .eq("organization_id", auth.context.organization.id)
    .eq("recipient_user_id", auth.context.authUserId)
    .order("created_at", { ascending: false });

  if (readFilter === "read") {
    baseQuery.not("read_at", "is", null);
  } else if (readFilter === "unread") {
    baseQuery.is("read_at", null);
  }

  let matchingEventIds: string[] | null = null;

  if (eventTypeFilter) {
    const { data: matchingEvents, error: matchingEventsError } = await supabase
      .from("notification_events")
      .select("id")
      .eq("organization_id", auth.context.organization.id)
      .eq("event_type", eventTypeFilter);

    if (matchingEventsError) {
      return NextResponse.json({ ok: false, error: matchingEventsError.message }, { status: 422 });
    }

    matchingEventIds = (matchingEvents ?? []).map((event) => String(event.id));

    if (matchingEventIds.length === 0) {
      return NextResponse.json({
        ok: true,
        data: { items: [], unreadCount: 0, totalCount: 0, hasMore: false, nextOffset: null },
      });
    }

    baseQuery.in("event_id", matchingEventIds);
  }

  const { data, error } = await baseQuery.range(offset, offset + limit);

  if (error) {
    if (error.code === "42703") {
      return NextResponse.json({
        ok: true,
        data: { items: [], unreadCount: 0, totalCount: 0, hasMore: false, nextOffset: null },
      });
    }

    return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  }

  const notifications = (data ?? []) as InAppNotificationRow[];
  const hasMore = notifications.length > limit;
  const pageItems = hasMore ? notifications.slice(0, limit) : notifications;

  const eventIds = Array.from(new Set(pageItems.map((item) => item.event_id)));
  const { data: eventRows } = eventIds.length > 0
    ? await supabase
        .from("notification_events")
        .select("id,event_type")
        .eq("organization_id", auth.context.organization.id)
        .in("id", eventIds)
    : { data: [] as Array<{ id: string; event_type: string }> | null };

  const eventTypeById = new Map((eventRows ?? []).map((event) => [event.id, event.event_type]));

  const unreadCountQuery = supabase
    .from("notifications")
    .select("id", { head: true, count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("recipient_user_id", auth.context.authUserId)
    .is("read_at", null);

  if (eventTypeFilter && matchingEventIds) {
    unreadCountQuery.in("event_id", matchingEventIds);
  }

  const { count: unreadCount } = await unreadCountQuery;

  const totalCountQuery = supabase
    .from("notifications")
    .select("id", { head: true, count: "exact" })
    .eq("organization_id", auth.context.organization.id)
    .eq("recipient_user_id", auth.context.authUserId);

  if (readFilter === "read") {
    totalCountQuery.not("read_at", "is", null);
  } else if (readFilter === "unread") {
    totalCountQuery.is("read_at", null);
  }

  if (eventTypeFilter && matchingEventIds) {
    totalCountQuery.in("event_id", matchingEventIds);
  }

  const { count: totalCount } = await totalCountQuery;

  const items: Array<NotificationCenterItem> = pageItems.map((item) => ({
    ...item,
    event_type: (eventTypeById.get(item.event_id) ?? "booking_created") as NotificationCenterItem["event_type"],
  }));

  return NextResponse.json({
    ok: true,
    data: {
      items,
      unreadCount: unreadCount ?? 0,
      totalCount: totalCount ?? items.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    },
  });
}

export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });

  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim()))].slice(0, 100)
    : [];
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "Выберите уведомления" }, { status: 400 });

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("organization_id", auth.context.organization.id)
    .eq("recipient_user_id", auth.context.authUserId)
    .in("id", ids);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  return NextResponse.json({ ok: true });
}
