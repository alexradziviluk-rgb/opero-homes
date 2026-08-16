import type { Apartment } from "@/types/apartment";

export type RentalSearchMode = "short" | "monthly";

export type RentalSearchPrice = {
  amount: number;
  currency: "EUR";
  period: "night" | "month";
};

export function nightsBetweenDates(checkIn: string, checkOut: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return null;
  const start = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  const nights = Math.round((end.getTime() - start.getTime()) / 86400000);
  return Number.isFinite(nights) && nights > 0 ? nights : null;
}

export function getRentalSearchMode(checkIn: string | null | undefined, checkOut: string | null | undefined): RentalSearchMode | null {
  if (!checkIn || !checkOut) return null;
  const nights = nightsBetweenDates(checkIn, checkOut);
  return nights !== null && nights >= 30 ? "monthly" : "short";
}

export function getRentalSearchPrice(apartment: Pick<Apartment, "rentalTypes" | "dailyPrice" | "monthlyPrice">, mode: RentalSearchMode): RentalSearchPrice | null {
  const isMonthly = mode === "monthly";
  const enabled = isMonthly ? apartment.rentalTypes.monthly : apartment.rentalTypes.daily;
  const amount = isMonthly ? apartment.monthlyPrice : apartment.dailyPrice;
  if (!enabled || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency: "EUR", period: isMonthly ? "month" : "night" };
}

export function isApartmentSuitableForRentalSearch(apartment: Pick<Apartment, "rentalTypes" | "dailyPrice" | "monthlyPrice">, mode: RentalSearchMode): boolean {
  return getRentalSearchPrice(apartment, mode) !== null;
}