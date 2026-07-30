import { getBookingById, getBookings, saveBooking } from "@/lib/bookings/booking-repository";
import {
  createClient,
  getClients,
} from "@/lib/clients/client-repository";
import type { Client } from "@/types/client";
import { getApartmentById } from "@/app/apartments/apartment-utils";
import { createClientMessage } from "@/lib/messages/client-message-repository";
import { createOutgoingEmail } from "@/lib/emails/outgoing-email-repository";
import {
  formatApartmentPrice,
  getApartmentPriceInfo,
} from "@/lib/apartments/public-catalog";
import type { Booking } from "@/types/booking";
import {
  getRangeAvailability,
  getRequestedBookingOutcome,
} from "@/lib/bookings/availability";

export type PublicBookingInput = {
  apartmentId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  comment?: string;
  guestUserId?: string;
};

export type PublicBookingResult = {
  booking: Booking;
  outcome: "confirmed" | "pending";
  warnings: string[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "").trim();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function toDateLabel(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function resolveClient(email: string, phone: string, firstName: string, lastName: string): Client {
  const allClients = getClients();
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);

  const found = allClients.find((client) => {
    const emailMatch = normalizedEmail.length > 0 && client.email.trim().toLowerCase() === normalizedEmail;
    const phoneMatch = normalizedPhone.length > 0 && normalizePhone(client.phone) === normalizedPhone;
    return emailMatch || phoneMatch;
  });

  if (found) {
    return found;
  }

  return createClient({
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phone: phone.trim(),
    email: normalizedEmail,
    nationality: "",
    documentType: "passport",
    documentNumber: "",
    dateOfBirth: "",
    language: "ru",
    notes: "Создан из публичного бронирования",
  });
}

function buildGuestName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

export function createPublicBooking(input: PublicBookingInput): PublicBookingResult {
  const apartment = getApartmentById(input.apartmentId);
  if (!apartment) {
    throw new Error("Выбранный объект недоступен");
  }

  if (!input.checkIn || !input.checkOut) {
    throw new Error("Выберите даты заезда и выезда");
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  if (input.checkIn < todayIso || input.checkOut < todayIso) {
    throw new Error("Нельзя выбрать прошедшие даты");
  }

  if (new Date(`${input.checkOut}T00:00:00`) <= new Date(`${input.checkIn}T00:00:00`)) {
    throw new Error("Дата выезда должна быть позже даты заезда");
  }

  const currentBookings = getBookings();
  const rangeStatuses = getRangeAvailability(
    input.apartmentId,
    input.checkIn,
    input.checkOut,
    currentBookings,
  );
  const outcome = getRequestedBookingOutcome(rangeStatuses);

  if (outcome === "blocked") {
    throw new Error("К сожалению, выбранные даты только что были заняты. Выберите другой период.");
  }

  const client = resolveClient(input.email, input.phone, input.firstName, input.lastName);
  const priceInfo = getApartmentPriceInfo(apartment);
  const nights = nightsBetween(input.checkIn, input.checkOut);
  const weeklyPeriods = Math.max(1, Math.ceil(nights / 7));
  const monthlyPeriods = Math.max(1, Math.ceil(nights / 30));

  const rentalType: Booking["rentalType"] =
    priceInfo?.period === "month"
      ? "monthly"
      : priceInfo?.period === "week"
      ? "weekly"
      : "daily";

  const pricePerPeriod = priceInfo?.amount ?? 0;
  const periodsCount =
    rentalType === "monthly"
      ? monthlyPeriods
      : rentalType === "weekly"
      ? weeklyPeriods
      : nights;

  const accommodationAmount = pricePerPeriod * periodsCount;
  const cleaningFee = apartment.cleaningFee ?? 0;
  const deposit = apartment.deposit ?? 0;
  const totalAmount = Math.max(0, accommodationAmount + cleaningFee + deposit);

  const now = nowIso();
  const finalStatus: Booking["status"] = outcome === "confirmed" ? "confirmed" : "pending";
  const warnings: string[] = [];

  if (outcome === "pending") {
    warnings.push("На выбранные даты уже есть заявка, которая ожидает подтверждения.");
  }

  const booking: Booking = {
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `bk_${Math.random().toString(36).slice(2, 9)}`,
    apartmentId: apartment.id,
    clientId: client.id,
    guestUserId: input.guestUserId,
    guestName: buildGuestName(input.firstName, input.lastName),
    guestPhone: input.phone.trim(),
    guestEmail: normalizeEmail(input.email),
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: Math.max(1, Math.floor(input.guests || 1)),
    rentalType,
    pricePerPeriod,
    periodsCount,
    accommodationAmount,
    cleaningFee,
    deposit,
    discount: 0,
    totalAmount,
    paidAmount: 0,
    status: finalStatus,
    confirmedAt: finalStatus === "confirmed" ? now : undefined,
    confirmedByUserId: undefined,
    paymentStatus: "unpaid",
    source: "website",
    notes: `${input.comment?.trim() ?? ""}${input.comment?.trim() ? "\n" : ""}Тариф: ${formatApartmentPrice(apartment)}${
      outcome === "pending" ? "\nКонфликт с подтверждённым бронированием требует проверки менеджера." : ""
    }`.trim(),
    createdAt: now,
    updatedAt: now,
    confirmationSource: finalStatus === "confirmed" ? "public_instant_booking" : undefined,
  };

  saveBooking(booking);

  const savedBooking = getBookingById(booking.id);
  if (!savedBooking) {
    throw new Error("Не удалось сохранить бронирование");
  }

  if (finalStatus === "confirmed") {
    createClientMessage({
      clientId: client.id,
      bookingId: savedBooking.id,
      type: "booking_confirmed",
      title: "Бронирование подтверждено",
      body: `Ваше бронирование подтверждено.\n\nОбъект: ${apartment.title}\nЗаезд: ${toDateLabel(savedBooking.checkIn)}\nВыезд: ${toDateLabel(savedBooking.checkOut)}`,
      isRead: false,
      sourceType: "booking_confirmation",
      sourceId: savedBooking.id,
      sourceKey: `booking-confirmed-message:${savedBooking.id}`,
    });

    if (client.email.trim()) {
      createOutgoingEmail({
        clientId: client.id,
        bookingId: savedBooking.id,
        to: client.email.trim(),
        subject: "Ваше бронирование подтверждено",
        text: `Здравствуйте, ${client.firstName || savedBooking.guestName}!\n\nВаше бронирование подтверждено.\n\nОбъект: ${apartment.title}\nЗаезд: ${toDateLabel(savedBooking.checkIn)}\nВыезд: ${toDateLabel(savedBooking.checkOut)}\n\nСпасибо,\nOpero Homes`,
        status: "pending",
        attempts: 0,
        sourceType: "booking_confirmation",
        sourceId: savedBooking.id,
        sourceKey: `booking-confirmed-email:${savedBooking.id}`,
      });
    } else {
      warnings.push("Email клиента не указан");
    }
  }

  return {
    booking: savedBooking,
    outcome,
    warnings,
  };
}
