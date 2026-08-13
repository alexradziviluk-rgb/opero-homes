import type { Booking } from "@/types/booking";
import { normalizeBookingStatus } from "@/lib/bookings/status-presentation";
import { addCanonicalDays, getCanonicalDayKind, isCanonicalDateRangeOverlap } from "@/lib/bookings/canonical-availability";

export type PublicAvailabilityStatus = "available" | "pending" | "occupied" | "unavailable";
export type AvailabilityBooking = Pick<Booking, "id" | "apartmentId" | "checkIn" | "checkOut"> & { status: Booking["status"] | "blocked" };

function toIsoDate(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function hasBookingOverlap(
  requestedCheckIn: string,
  requestedCheckOut: string,
  existingCheckIn: string,
  existingCheckOut: string,
): boolean {
  return isCanonicalDateRangeOverlap(requestedCheckIn, requestedCheckOut, existingCheckIn, existingCheckOut);
}

export function getApartmentDateAvailability(
  apartmentId: string,
  date: Date,
  bookings: AvailabilityBooking[],
): PublicAvailabilityStatus {
  const dayStart = toIsoDate(date);
  const dayEnd = addCanonicalDays(dayStart, 1);
  const periods = bookings.map((booking) => ({ id: booking.id, apartmentId: booking.apartmentId, startDate: booking.checkIn, endDate: booking.checkOut, kind: booking.status === "blocked" ? "staff_block" as const : "customer_booking" as const }));
  const kind = getCanonicalDayKind(apartmentId, dayStart, periods);
  if (kind === "staff_block") return "unavailable";
  if (kind === "customer_booking" && bookings.some((booking) => booking.apartmentId === apartmentId && booking.status !== "blocked" && normalizeBookingStatus(booking.status) === "pending" && hasBookingOverlap(dayStart, dayEnd, booking.checkIn, booking.checkOut))) return "pending";
  return kind === "customer_booking" ? "occupied" : "available";
}

export function getRangeAvailability(
  apartmentId: string,
  checkIn: string,
  checkOut: string,
  bookings: AvailabilityBooking[],
): PublicAvailabilityStatus[] {
  if (!checkIn || !checkOut || checkIn >= checkOut) {
    return [];
  }

  const statuses: PublicAvailabilityStatus[] = [];
  for (let cursor = checkIn; cursor < checkOut; cursor = addCanonicalDays(cursor, 1)) {
    const [year, month, day] = cursor.split("-").map(Number);
    statuses.push(getApartmentDateAvailability(apartmentId, new Date(Date.UTC(year, month - 1, day)), bookings));
  }

  return statuses;
}

export function getRequestedBookingOutcome(
  dateStatuses: PublicAvailabilityStatus[],
): "confirmed" | "pending" | "blocked" {
  if (dateStatuses.some((status) => status === "occupied")) {
    return "blocked";
  }

  if (dateStatuses.some((status) => status === "pending")) {
    return "pending";
  }

  return "confirmed";
}
