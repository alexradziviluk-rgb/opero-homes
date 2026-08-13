"use client";

import BookingCalendar, { type BookingCalendarChange } from "@/components/booking/BookingCalendar";
import { normalizeBookingPeriod } from "@/lib/bookings/canonical-availability";
import type { AvailabilityBooking, PublicAvailabilityStatus } from "@/lib/bookings/availability";

type CalendarChange = {
  checkIn: string;
  checkOut: string;
  statuses: PublicAvailabilityStatus[];
};

type Props = {
  apartmentId: string;
  bookings: AvailabilityBooking[];
  checkIn: string;
  checkOut: string;
  onChange: (next: CalendarChange) => void;
  onInvalidRange: (message: string) => void;
};

export default function PublicAvailabilityCalendar({ apartmentId, bookings, checkIn, checkOut, onChange, onInvalidRange }: Props) {
  const periods = bookings.map(normalizeBookingPeriod);

  function handleChange(change: BookingCalendarChange) {
    if (!change.endDate) {
      onChange({ checkIn: change.startDate, checkOut: "", statuses: [] });
      return;
    }

    onChange({
      checkIn: change.startDate,
      checkOut: change.endDate,
      statuses: change.kinds.map((kind) => kind === "available" ? "available" : "occupied"),
    });
  }

  return (
    <BookingCalendar
      apartmentId={apartmentId}
      periods={periods}
      startDate={checkIn}
      endDate={checkOut}
      capabilities={{ canBook: true, canSeeOperationalDetails: false }}
      onChange={handleChange}
      onConflict={onInvalidRange}
    />
  );
}
