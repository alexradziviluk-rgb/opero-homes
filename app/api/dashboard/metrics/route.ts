import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import type { DashboardMetrics, DashboardMetricsResponse } from "@/types/dashboard";

type ApartmentRow = {
  id: string;
  title: string | null;
  operational_status?: string | null;
};

type BookingRow = {
  id: string;
  apartment_id: string | null;
  guest_name: string | null;
  check_in: string;
  check_out: string;
  status: string | null;
  payment_status: string | null;
  total_amount: number | null;
};

type TaskRow = {
  id: string;
  title: string;
  task_type: string;
  status: string;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
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
    .select("id,title,operational_status")
    .eq("organization_id", organizationId);

  let apartments: ApartmentRow[] = [];
  let hasOperationalStatus = false;

  if (apartmentsWithStatusError?.code === "42703") {
    const { data: apartmentsData, error: apartmentsError } = await supabase
      .from("apartments")
      .select("id,title")
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
    hasOperationalStatus = true;
  }

  const apartmentTitleById = new Map(apartments.map((apartment) => [apartment.id, apartment.title ?? "Объект"]));

  metrics.propertiesTotal = apartments.length;
  if (hasOperationalStatus) {
    metrics.propertiesActive = apartments.filter((apartment) => normalize(apartment.operational_status) === "active").length;
  }

  const { data: bookingsData, error: bookingsError } = await supabase
    .from("bookings")
    .select("id,apartment_id,guest_name,check_in,check_out,status,payment_status,total_amount")
    .eq("organization_id", organizationId);

  if (bookingsError) {
    const response: DashboardMetricsResponse = { ok: false, error: bookingsError.message };
    return NextResponse.json(response, { status: 422 });
  }

  const bookings = (bookingsData ?? []) as unknown as BookingRow[];

  metrics.bookingsTotal = bookings.length;

  const todayIso = new Date().toISOString().slice(0, 10);

  const nonCancelledBookings = bookings.filter((booking) => !isCancelledStatus(booking.status));
  metrics.bookingsActiveFuture = nonCancelledBookings.filter((booking) => booking.check_out >= todayIso).length;
  metrics.pendingConfirmationsCount = bookings.filter((booking) => normalize(booking.status) === "pending").length;

  metrics.todayArrivals = nonCancelledBookings
    .filter((booking) => booking.check_in === todayIso)
    .slice(0, 5)
    .map((booking) => ({
      bookingId: booking.id,
      guestName: booking.guest_name ?? "Гость",
      apartmentTitle: booking.apartment_id ? apartmentTitleById.get(booking.apartment_id) ?? "Объект" : "Объект",
      dateLabel: formatDateLabel(booking.check_in),
    }));

  metrics.todayDepartures = nonCancelledBookings
    .filter((booking) => booking.check_out === todayIso)
    .slice(0, 5)
    .map((booking) => ({
      bookingId: booking.id,
      guestName: booking.guest_name ?? "Гость",
      apartmentTitle: booking.apartment_id ? apartmentTitleById.get(booking.apartment_id) ?? "Объект" : "Объект",
      dateLabel: formatDateLabel(booking.check_out),
    }));

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEndExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const daysInMonth = Math.ceil((monthEndExclusive.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000));

  if (metrics.propertiesTotal > 0 && nonCancelledBookings.length > 0) {
    const bookedNights = nonCancelledBookings.reduce((sum, booking) => {
      return sum + countOverlapNights(booking.check_in, booking.check_out, monthStart, monthEndExclusive);
    }, 0);

    const totalCapacityNights = metrics.propertiesTotal * daysInMonth;
    if (bookedNights > 0 && totalCapacityNights > 0) {
      metrics.occupancyPercent = Math.round((bookedNights / totalCapacityNights) * 1000) / 10;
    }
  }

  const { count: paymentsCount, error: paymentsProbeError } = await supabase
    .from("payments")
    .select("organization_id", { head: true, count: "exact" })
    .eq("organization_id", organizationId);

  if (!paymentsProbeError) {
    if ((paymentsCount ?? 0) === 0) {
      metrics.revenueDataStatus = "no_payments";
      metrics.checkoutPaymentsStatus = "no_payments";
    }
  }

  const upcomingBookings = nonCancelledBookings
    .filter((booking) => booking.check_out >= todayIso)
    .sort((left, right) => left.check_out.localeCompare(right.check_out))
    .slice(0, 5);

  if (metrics.checkoutPaymentsStatus === "ok") {
    metrics.checkoutPayments = upcomingBookings.map((booking) => ({
      bookingId: booking.id,
      apartmentTitle: booking.apartment_id ? apartmentTitleById.get(booking.apartment_id) ?? "Объект" : "Объект",
      guestName: booking.guest_name ?? "Гость",
      checkoutDate: formatDateLabel(booking.check_out),
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

  const response: DashboardMetricsResponse = { ok: true, data: metrics };
  return NextResponse.json(response, { status: 200 });
}
