import type { Booking } from "@/types/booking";
import { normalizeBookingStatus } from "@/lib/bookings/status-presentation";

export type PublicAvailabilityStatus = "available" | "pending" | "occupied";

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

export function hasBookingOverlap(
  requestedCheckIn: string,
  requestedCheckOut: string,
  existingCheckIn: string,
  existingCheckOut: string,
): boolean {
  const requestedStart = fromIsoDate(requestedCheckIn);
  const requestedEnd = fromIsoDate(requestedCheckOut);
  const existingStart = fromIsoDate(existingCheckIn);
  const existingEnd = fromIsoDate(existingCheckOut);

  return requestedStart < existingEnd && requestedEnd > existingStart;
}

function getBookingImpact(booking: Booking): PublicAvailabilityStatus {
  const status = normalizeBookingStatus(booking.status);

  if (status === "confirmed" || status === "checked_in") {
    return "occupied";
  }

  if (status === "pending") {
    return "pending";
  }

  return "available";
}

export function getApartmentDateAvailability(
  apartmentId: string,
  date: Date,
  bookings: Booking[],
): PublicAvailabilityStatus {
  const dayStart = toIsoDate(date);
  const dayEnd = toIsoDate(addDays(date, 1));

  const sameApartment = bookings.filter((booking) => booking.apartmentId === apartmentId);

  const hasOccupied = sameApartment.some((booking) => {
    const impact = getBookingImpact(booking);
    if (impact !== "occupied") return false;
    return hasBookingOverlap(dayStart, dayEnd, booking.checkIn, booking.checkOut);
  });

  if (hasOccupied) {
    return "occupied";
  }

  const hasPending = sameApartment.some((booking) => {
    const impact = getBookingImpact(booking);
    if (impact !== "pending") return false;
    return hasBookingOverlap(dayStart, dayEnd, booking.checkIn, booking.checkOut);
  });

  if (hasPending) {
    return "pending";
  }

  return "available";
}

export function getRangeAvailability(
  apartmentId: string,
  checkIn: string,
  checkOut: string,
  bookings: Booking[],
): PublicAvailabilityStatus[] {
  const start = fromIsoDate(checkIn);
  const end = fromIsoDate(checkOut);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    return [];
  }

  const statuses: PublicAvailabilityStatus[] = [];
  for (let cursor = new Date(start); cursor < end; cursor = addDays(cursor, 1)) {
    statuses.push(getApartmentDateAvailability(apartmentId, cursor, bookings));
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
