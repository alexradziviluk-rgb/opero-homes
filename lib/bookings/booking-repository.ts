import { Booking, BOOKINGS_STORAGE_KEY } from "@/types/booking";

type LegacyBookingInput = Partial<Booking> & {
  from?: string;
  to?: string;
  name?: string;
  phone?: string;
  email?: string;
};

function safeParse(json: string | null) {
  try {
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "bk_" + Math.random().toString(36).slice(2, 9);
}

function normalizeBookingStatus(status: unknown): Booking["status"] {
  const value = String(status ?? "").trim().toLowerCase();

  if (value === "pending" || value === "ожидает подтверждения") return "pending";
  if (value === "confirmed" || value === "подтверждено" || value === "забронирован") return "confirmed";
  if (value === "checked_in" || value === "заезд") return "checked_in";
  if (value === "checked_out" || value === "выезд") return "checked_out";
  if (value === "cancelled" || value === "отменено") return "cancelled";

  return "pending";
}

function normalize(raw: unknown): Booking {
  const b: LegacyBookingInput = (raw as LegacyBookingInput) || {};
  const checkIn = b.checkIn ?? b.from ?? null;
  const checkOut = b.checkOut ?? b.to ?? null;
  const now = nowIso();

  const booking: Booking = {
    id: b.id ?? generateId(),
    apartmentId: b.apartmentId ?? "",
    clientId: b.clientId ?? "",
    guestUserId: b.guestUserId,
    guestName: b.guestName ?? b.name ?? "",
    guestPhone: b.guestPhone ?? b.phone ?? "",
    guestEmail: b.guestEmail ?? b.email ?? "",
    checkIn: checkIn ?? now,
    checkOut: checkOut ?? now,
    guests: typeof b.guests === "number" ? b.guests : Number(b.guests) || 1,
    rentalType: b.rentalType ?? "daily",
    pricePerPeriod: Number(b.pricePerPeriod) || 0,
    periodsCount: Number(b.periodsCount) || 0,
    accommodationAmount: Number(b.accommodationAmount) || 0,
    cleaningFee: Number(b.cleaningFee) || 0,
    deposit: Number(b.deposit) || 0,
    discount: Number(b.discount) || 0,
    totalAmount: Number(b.totalAmount) || 0,
    paidAmount: Number(b.paidAmount) || 0,
    status: normalizeBookingStatus(b.status),
    confirmedAt: b.confirmedAt,
    confirmedByUserId: b.confirmedByUserId,
    confirmationSource: b.confirmationSource,
    paymentStatus: b.paymentStatus ?? "unpaid",
    source: b.source ?? "manual",
    notes: b.notes ?? "",
    createdByUserId: b.createdByUserId,
    updatedByUserId: b.updatedByUserId,
    createdAt: b.createdAt ?? now,
    updatedAt: b.updatedAt ?? now,
  };

  return booking;
}

function readStorage(): Booking[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(BOOKINGS_STORAGE_KEY);
  const arr = safeParse(raw);
  return Array.isArray(arr) ? arr.map(normalize) : [];
}

function writeStorage(list: Booking[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BOOKINGS_STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("opero-bookings-changed"));
  window.dispatchEvent(new Event("opero-dashboard-changed"));
}

export function getBookings(): Booking[] {
  return readStorage();
}

export function getBookingById(id: string): Booking | null {
  return readStorage().find((b) => b.id === id) ?? null;
}

export function getBookingsByApartmentId(apartmentId: string): Booking[] {
  return readStorage().filter((b) => b.apartmentId === apartmentId);
}

export function saveBooking(booking: Booking): void {
  const list = readStorage();
  const now = nowIso();
  const toSave = normalize({ ...booking, id: booking.id ?? generateId(), createdAt: booking.createdAt ?? now, updatedAt: now });
  list.push(toSave);
  writeStorage(list);
}

export function updateBooking(booking: Booking): void {
  const list = readStorage();
  const idx = list.findIndex((b) => b.id === booking.id);
  if (idx === -1) return;
  const now = nowIso();
  list[idx] = normalize({ ...list[idx], ...booking, updatedAt: now });
  writeStorage(list);
}

export function deleteBooking(id: string): void {
  const list = readStorage();
  const next = list.filter((b) => b.id !== id);
  writeStorage(next);
}
