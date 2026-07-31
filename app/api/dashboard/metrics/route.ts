import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import type { DashboardMetrics, DashboardMetricsResponse } from "@/types/dashboard";

type ApartmentRow = {
  id: string;
  title: string | null;
  status?: string | null;
  publication_status?: string | null;
};

type BookingRow = {
  id: string;
  apartment_id: string | null;
  guest_name?: string | null;
  customer_name?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  status: string | null;
  payment_status: string | null;
  total_amount: number | null;
  amount_paid?: number | null;
  currency?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  task_type: string;
  status: string;
};

type OperationalTaskRow = {
  task_type: string;
  status: string;
  due_at: string;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function bookingCheckIn(booking: BookingRow): string {
  return booking.check_in ?? booking.check_in_date ?? "";
}

function bookingCheckOut(booking: BookingRow): string {
  return booking.check_out ?? booking.check_out_date ?? "";
}

function addRevenue(target: Map<string, number>, currency: string, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const normalizedCurrency = currency.trim().toUpperCase() || "EUR";
  target.set(normalizedCurrency, (target.get(normalizedCurrency) ?? 0) + amount);
}

function revenueArray(values: Map<string, number>) {
  return Array.from(values, ([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }));
}

function isCancelledStatus(value: string | null | undefined): boolean {
  const normalized = normalize(value);
  return normalized === "cancelled" || normalized === "canceled" || normalized === "отменен" || normalized === "отменено";
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateLabel(value: string): string {
  return parseDateOnly(value).toLocaleDateString("ru-RU");
}

function countOverlapNights(checkIn: string, checkOut: string, rangeStart: Date, rangeEndExclusive: Date): number {
  const start = parseDateOnly(checkIn);
  const end = parseDateOnly(checkOut);

  const overlapStart = start > rangeStart ? start : rangeStart;
  const overlapEnd = end < rangeEndExclusive ? end : rangeEndExclusive;

  if (overlapEnd <= overlapStart) {
    return 0;
  }

  const diffMs = overlapEnd.getTime() - overlapStart.getTime();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

function buildDefaultMetrics(): DashboardMetrics {
  return {
    propertiesTotal: 0,
    propertiesActive: null,
    propertiesOccupied: 0,
    propertiesAvailable: 0,
    overdueCleaningCount: 0,
    overdueMaintenanceCount: 0,
    tasksDueTodayCount: 0,
    unreadNotificationsCount: 0,
    bookingsTotal: 0,
    bookingsActiveFuture: 0,
    occupancyPercent: null,
    revenueByCurrency: [],
    weeklyRevenueByCurrency: [],
    revenueDataStatus: "insufficient_schema",
    checkoutPayments: [],
    checkoutPaymentsStatus: "insufficient_schema",
    todayArrivals: [],
    todayDepartures: [],
    pendingConfirmationsCount: 0,
    urgentTasks: [],
  };
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    const response: DashboardMetricsResponse = { ok: false, error: "Supabase is not configured" };
    return NextResponse.json(response, { status: 500 });
  }

  const auth = await requireStaffApiAuth();
  if (!auth.ok) {
    return auth.response;
  }

  const organizationId = auth.context.organization.id;

  const metrics = buildDefaultMetrics();

  const { data: apartmentsWithStatusData, error: apartmentsWithStatusError } = await supabase
    .from("apartments")
    .select("id,title:name,status,publication_status")
    .eq("organization_id", organizationId);

  let apartments: ApartmentRow[] = [];
  let hasStatusFields = false;

  if (apartmentsWithStatusError?.code === "42703") {
    const { data: apartmentsData, error: apartmentsError } = await supabase
      .from("apartments")
      .select("id,title:name")
      .eq("organization_id", organizationId);

    if (apartmentsError) {
      const response: DashboardMetricsResponse = { ok: false, error: apartmentsError.message };
      return NextResponse.json(response, { status: 422 });
    }

    apartments = (apartmentsData ?? []) as unknown as ApartmentRow[];
  } else if (apartmentsWithStatusError) {
    const response: DashboardMetricsResponse = { ok: false, error: apartmentsWithStatusError.message };
    return NextResponse.json(response, { status: 422 });
  } else {
    apartments = (apartmentsWithStatusData ?? []) as unknown as ApartmentRow[];
    hasStatusFields = true;
  }

  const apartmentTitleById = new Map(apartments.map((apartment) => [apartment.id, apartment.title ?? "Объект"]));

  metrics.propertiesTotal = apartments.length;
  if (hasStatusFields) {
    metrics.propertiesActive = apartments.filter((apartment) => {
      if (normalize(apartment.publication_status) === "published") {
        return true;
      }

      const status = normalize(apartment.status);
      return status === "свободно" || status === "занято" || status === "active";
    }).length;
  }

  const { data: bookingsData, error: bookingsError } = await supabase
    .from("bookings")
    .select("*")
    .eq("organization_id", organizationId);

  if (bookingsError) {
    const response: DashboardMetricsResponse = { ok: false, error: bookingsError.message };
    return NextResponse.json(response, { status: 422 });
  }

  const bookings = (bookingsData ?? []) as unknown as BookingRow[];

  metrics.bookingsTotal = bookings.length;

  const todayIso = new Date().toISOString().slice(0, 10);

  const nonCancelledBookings = bookings.filter((booking) => !isCancelledStatus(booking.status));
  metrics.bookingsActiveFuture = nonCancelledBookings.filter((booking) => bookingCheckOut(booking) >= todayIso).length;
  metrics.pendingConfirmationsCount = bookings.filter((booking) => normalize(booking.status) === "pending").length;

  const occupiedApartmentIds = new Set(
    nonCancelledBookings
      .filter((booking) => bookingCheckIn(booking) <= todayIso && bookingCheckOut(booking) > todayIso)
      .map((booking) => booking.apartment_id)
      .filter((apartmentId): apartmentId is string => Boolean(apartmentId)),
  );
  metrics.propertiesOccupied = occupiedApartmentIds.size;
  metrics.propertiesAvailable = Math.max(0, metrics.propertiesTotal - metrics.propertiesOccupied);

  metrics.todayArrivals = nonCancelledBookings
    .filter((booking) => bookingCheckIn(booking) === todayIso)
    .slice(0, 5)
    .map((booking) => ({
      bookingId: booking.id,
      guestName: booking.guest_name ?? booking.customer_name ?? "Гость",
      apartmentTitle: booking.apartment_id ? apartmentTitleById.get(booking.apartment_id) ?? "Объект" : "Объект",
      dateLabel: formatDateLabel(bookingCheckIn(booking)),
    }));

  metrics.todayDepartures = nonCancelledBookings
    .filter((booking) => bookingCheckOut(booking) === todayIso)
    .slice(0, 5)
    .map((booking) => ({
      bookingId: booking.id,
      guestName: booking.guest_name ?? booking.customer_name ?? "Гость",
      apartmentTitle: booking.apartment_id ? apartmentTitleById.get(booking.apartment_id) ?? "Объект" : "Объект",
      dateLabel: formatDateLabel(bookingCheckOut(booking)),
    }));

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEndExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const daysInMonth = Math.ceil((monthEndExclusive.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000));

  if (metrics.propertiesTotal > 0 && nonCancelledBookings.length > 0) {
    const bookedNights = nonCancelledBookings.reduce((sum, booking) => {
      return sum + countOverlapNights(bookingCheckIn(booking), bookingCheckOut(booking), monthStart, monthEndExclusive);
    }, 0);

    const totalCapacityNights = metrics.propertiesTotal * daysInMonth;
    if (bookedNights > 0 && totalCapacityNights > 0) {
      metrics.occupancyPercent = Math.round((bookedNights / totalCapacityNights) * 1000) / 10;
    }
  }

  const { data: paymentsData, error: paymentsProbeError } = await supabase
    .from("payments")
    .select("*")
    .eq("organization_id", organizationId);

  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const monthlyRevenue = new Map<string, number>();
  const weeklyRevenue = new Map<string, number>();

  if (!paymentsProbeError && (paymentsData ?? []).length > 0) {
    for (const rawPayment of paymentsData ?? []) {
      const payment = rawPayment as Record<string, unknown>;
      const status = normalize(typeof payment.status === "string" ? payment.status : "");
      if (["failed", "cancelled", "canceled", "refunded"].includes(status)) continue;
      const amount = Number(payment.amount ?? payment.paid_amount ?? 0);
      const currency = typeof payment.currency === "string" ? payment.currency : "EUR";
      const occurredAt = String(payment.paid_at ?? payment.created_at ?? payment.updated_at ?? "");
      const occurredDate = new Date(occurredAt);
      if (occurredDate >= monthStart && occurredDate < monthEndExclusive) addRevenue(monthlyRevenue, currency, amount);
      if (occurredDate >= weekStart && occurredDate <= now) addRevenue(weeklyRevenue, currency, amount);
    }
  } else {
    for (const booking of nonCancelledBookings) {
      const occurredAt = booking.updated_at ?? booking.created_at ?? `${bookingCheckIn(booking)}T00:00:00.000Z`;
      const occurredDate = new Date(occurredAt);
      const amount = Number(booking.amount_paid ?? 0);
      const currency = booking.currency ?? "EUR";
      if (occurredDate >= monthStart && occurredDate < monthEndExclusive) addRevenue(monthlyRevenue, currency, amount);
      if (occurredDate >= weekStart && occurredDate <= now) addRevenue(weeklyRevenue, currency, amount);
    }
  }

  metrics.revenueByCurrency = revenueArray(monthlyRevenue);
  metrics.weeklyRevenueByCurrency = revenueArray(weeklyRevenue);
  metrics.revenueDataStatus = metrics.revenueByCurrency.length > 0 ? "ok" : "no_payments";
  metrics.checkoutPaymentsStatus = "ok";

  const upcomingBookings = nonCancelledBookings
    .filter((booking) => bookingCheckOut(booking) >= todayIso)
    .sort((left, right) => bookingCheckOut(left).localeCompare(bookingCheckOut(right)))
    .slice(0, 5);

  if (metrics.checkoutPaymentsStatus === "ok") {
    metrics.checkoutPayments = upcomingBookings.map((booking) => ({
      bookingId: booking.id,
      apartmentTitle: booking.apartment_id ? apartmentTitleById.get(booking.apartment_id) ?? "Объект" : "Объект",
      guestName: booking.guest_name ?? booking.customer_name ?? "Гость",
      checkoutDate: formatDateLabel(bookingCheckOut(booking)),
    }));
  }

  const { data: tasksData, error: tasksError } = await supabase
    .from("tasks")
    .select("id,title,task_type,status")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (!tasksError) {
    const tasks = (tasksData ?? []) as unknown as TaskRow[];
    metrics.urgentTasks = tasks
      .filter((task) => normalize(task.status) === "pending")
      .slice(0, 3)
      .map((task) => ({
        taskId: task.id,
        title: task.title,
        taskType: task.task_type,
        status: task.status,
      }));
  }

  const { data: operationalTasksData, error: operationalTasksError } = await supabase
    .from("operational_tasks")
    .select("task_type,status,due_at")
    .eq("organization_id", organizationId);

  if (!operationalTasksError) {
    const operationalTasks = (operationalTasksData ?? []) as unknown as OperationalTaskRow[];
    const incompleteStatuses = new Set(["pending", "assigned", "in_progress"]);
    metrics.overdueCleaningCount = operationalTasks.filter((task) => task.task_type === "cleaning" && task.due_at.slice(0, 10) < todayIso && incompleteStatuses.has(normalize(task.status))).length;
    metrics.overdueMaintenanceCount = operationalTasks.filter((task) => task.task_type === "technical" && task.due_at.slice(0, 10) < todayIso && incompleteStatuses.has(normalize(task.status))).length;
    metrics.tasksDueTodayCount = operationalTasks.filter((task) => task.due_at.slice(0, 10) === todayIso && incompleteStatuses.has(normalize(task.status))).length;
  }

  const { count: unreadNotificationsCount, error: unreadNotificationsError } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("recipient_user_id", auth.context.authUserId)
    .is("read_at", null);

  if (!unreadNotificationsError) {
    metrics.unreadNotificationsCount = unreadNotificationsCount ?? 0;
  }

  const response: DashboardMetricsResponse = { ok: true, data: metrics };
  return NextResponse.json(response, { status: 200 });
}
