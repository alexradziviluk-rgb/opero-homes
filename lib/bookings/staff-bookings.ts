import type { Booking } from "@/types/booking";

export type StaffBooking = Booking & {
  apartmentTitle: string;
  bookingNumber: string;
  checkInTime: string;
  checkOutTime: string;
};

type StaffBookingRecord = {
  id: string;
  apartmentId: string | null;
  apartmentTitle: string;
  bookingNumber?: string | null;
  clientId?: string | null;
  guestName: string;
  guestPhone?: string | null;
  guestEmail?: string | null;
  checkIn: string;
  checkOut: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  guests: number;
  rentalType?: Booking["rentalType"] | null;
  pricePerPeriod?: number | null;
  accommodationAmount?: number | null;
  cleaningFee?: number | null;
  deposit?: number | null;
  discount?: number | null;
  totalAmount: number | null;
  paidAmount?: number | null;
  status: string | null;
  paymentStatus: string | null;
  source: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type StaffBookingsResponse =
  | { ok: true; data: StaffBookingRecord[] }
  | { ok: false; error?: string };

export async function fetchStaffBookings(): Promise<StaffBooking[]> {
  const response = await fetch("/api/bookings", { cache: "no-store" });
  const payload = (await response.json()) as StaffBookingsResponse;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "Не удалось загрузить бронирования" : payload.error ?? "Не удалось загрузить бронирования");
  }

  return payload.data.map((booking) => ({
    id: booking.id,
    apartmentId: booking.apartmentId ?? "",
    apartmentTitle: booking.apartmentTitle || "Объект",
    bookingNumber: booking.bookingNumber || "Бронирование",
    clientId: booking.clientId ?? "",
    guestName: booking.guestName || "Гость",
    guestPhone: booking.guestPhone ?? "",
    guestEmail: booking.guestEmail ?? "",
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    checkInTime: booking.checkInTime ?? "15:00",
    checkOutTime: booking.checkOutTime ?? "11:00",
    guests: booking.guests,
    rentalType: booking.rentalType ?? "daily",
    pricePerPeriod: booking.pricePerPeriod ?? 0,
    periodsCount: 0,
    accommodationAmount: booking.accommodationAmount ?? 0,
    cleaningFee: booking.cleaningFee ?? 0,
    deposit: booking.deposit ?? 0,
    discount: booking.discount ?? 0,
    totalAmount: booking.totalAmount ?? 0,
    paidAmount: booking.paidAmount ?? 0,
    status: (booking.status ?? "pending") as Booking["status"],
    paymentStatus: (booking.paymentStatus ?? "unpaid") as Booking["paymentStatus"],
    source: (booking.source ?? "direct") as Booking["source"],
    notes: booking.notes ?? "",
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  }));
}