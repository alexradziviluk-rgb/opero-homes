export type BookingStatus =
  | "pending"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "rejected"
  | "cancelled";

export type PaymentStatus =
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "refunded";

export type Booking = {
  id: string;
  apartmentId: string;
  clientId: string;
  guestUserId?: string;

  guestName: string;
  guestPhone: string;
  guestEmail: string;

  checkIn: string;
  checkOut: string;
  checkInTime?: string;
  checkOutTime?: string;
  guests: number;

  rentalType: "daily" | "weekly" | "monthly";

  pricePerPeriod: number;
  periodsCount: number;
  accommodationAmount: number;
  cleaningFee: number;
  deposit: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  complimentary?: boolean;

  status: BookingStatus;
  requestStatus?: "pending" | "confirmed" | "rejected" | "cancelled";
  confirmedAt?: string;
  confirmedByUserId?: string;
  confirmationSource?: "public_instant_booking" | "manual_confirmation";
  paymentStatus: PaymentStatus;

  source:
    | "direct"
    | "phone"
    | "whatsapp"
    | "website"
    | "public_website"
    | "airbnb"
    | "booking"
    | "manual"
    | "in_person"
    | "other";

  notes: string;
  createdByUserId?: string;
  updatedByUserId?: string;

  createdAt: string;
  updatedAt: string;
};

export const BOOKINGS_STORAGE_KEY = "opero-homes-bookings";
