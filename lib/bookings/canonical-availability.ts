export type CanonicalAvailabilityKind = "customer_booking" | "owner_block" | "staff_block";

export type CanonicalAvailabilityPeriod = {
  id: string;
  apartmentId: string;
  startDate: string;
  endDate: string;
  kind: CanonicalAvailabilityKind;
  status?: string;
  label?: string;
};

export type CalendarDayKind = "available" | CanonicalAvailabilityKind;

export type CalendarCapabilities = {
  canBook?: boolean;
  canCreateOwnerBlock?: boolean;
  canCreateStaffBlock?: boolean;
  canSeeOperationalDetails?: boolean;
};

export function isCanonicalDateRangeOverlap(
  startDate: string,
  endDate: string,
  periodStart: string,
  periodEnd: string,
): boolean {
  return startDate < periodEnd && endDate > periodStart;
}

export function getCanonicalDayKind(
  apartmentId: string,
  date: string,
  periods: CanonicalAvailabilityPeriod[],
): CalendarDayKind {
  const nextDate = addCanonicalDays(date, 1);
  const matching = periods.filter(
    (period) => period.apartmentId === apartmentId && isCanonicalDateRangeOverlap(date, nextDate, period.startDate, period.endDate),
  );

  if (matching.some((period) => period.kind === "customer_booking")) return "customer_booking";
  if (matching.some((period) => period.kind === "owner_block")) return "owner_block";
  if (matching.some((period) => period.kind === "staff_block")) return "staff_block";
  return "available";
}

export function addCanonicalDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function getCanonicalRangeKinds(
  apartmentId: string,
  startDate: string,
  endDate: string,
  periods: CanonicalAvailabilityPeriod[],
): CalendarDayKind[] {
  const result: CalendarDayKind[] = [];
  for (let date = startDate; date < endDate; date = addCanonicalDays(date, 1)) {
    result.push(getCanonicalDayKind(apartmentId, date, periods));
  }
  return result;
}

export function normalizeBookingPeriod(booking: {
  id: string;
  apartmentId: string;
  checkIn: string;
  checkOut: string;
  status?: string;
}): CanonicalAvailabilityPeriod {
  return {
    id: booking.id,
    apartmentId: booking.apartmentId,
    startDate: booking.checkIn,
    endDate: booking.checkOut,
    kind: "customer_booking",
    status: booking.status,
  };
}

export function normalizeBlockPeriod(block: {
  id: string;
  apartment_id?: string;
  apartmentId?: string;
  start_date?: string;
  startDate?: string;
  end_date?: string;
  endDate?: string;
  block_source?: string | null;
  blockSource?: string | null;
  status?: string;
}): CanonicalAvailabilityPeriod {
  const apartmentId = block.apartmentId ?? block.apartment_id ?? "";
  const startDate = block.startDate ?? block.start_date ?? "";
  const endDate = block.endDate ?? block.end_date ?? "";
  const blockSource = block.blockSource ?? block.block_source;
  return {
    id: block.id,
    apartmentId,
    startDate,
    endDate,
    kind: blockSource === "owner" ? "owner_block" : "staff_block",
    status: block.status,
  };
}
