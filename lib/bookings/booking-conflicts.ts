import type { Booking } from "@/types/booking";

function toStartOfDay(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export function bookingsOverlap(
  firstCheckIn: string,
  firstCheckOut: string,
  secondCheckIn: string,
  secondCheckOut: string,
): boolean {
  const firstStart = toStartOfDay(firstCheckIn);
  const firstEnd = toStartOfDay(firstCheckOut);
  const secondStart = toStartOfDay(secondCheckIn);
  const secondEnd = toStartOfDay(secondCheckOut);

  return firstStart < secondEnd && firstEnd > secondStart;
}

export function isBlockingBooking(booking: Booking): boolean {
  return booking.status !== "cancelled";
}

export function findBookingConflict(params: {
  bookings: Booking[];
  apartmentId: string;
  checkIn: string;
  checkOut: string;
  excludeBookingId?: string;
}): Booking | undefined {
  const { bookings, apartmentId, checkIn, checkOut, excludeBookingId } = params;

  return bookings.find((booking) => {
    if (booking.id === excludeBookingId) return false;
    if (booking.apartmentId !== apartmentId) return false;
    if (!isBlockingBooking(booking)) return false;

    return bookingsOverlap(checkIn, checkOut, booking.checkIn, booking.checkOut);
  });
}
