import type { Apartment } from "@/types/apartment";
import type { ApartmentPhoto } from "@/types/apartment";
import type { Booking } from "@/types/booking";
import { bookingsOverlap, isBlockingBooking } from "@/lib/bookings/booking-conflicts";

type SupportedCurrency = "EUR" | "USD" | "TRY" | "RUB";
type PricingPeriod = "night" | "week" | "month";

export type ApartmentPriceInfo = {
  amount: number;
  currency: SupportedCurrency;
  period: PricingPeriod;
};

function normalizePhotoInput(photo: ApartmentPhoto | string | { url?: string; src?: string } | undefined): string {
  if (!photo) {
    return "";
  }

  if (typeof photo === "string") {
    return photo.trim();
  }

  const url = "url" in photo ? String(photo.url ?? "").trim() : "";
  if (url) {
    return url;
  }

  const src = "src" in photo ? String(photo.src ?? "").trim() : "";
  return src;
}

function isWebResolvableUrl(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("data:image/")) return true;
  if (value.startsWith("blob:")) return true;
  if (value.startsWith("http://") || value.startsWith("https://")) return true;
  if (value.startsWith("/")) return true;

  // IndexedDB storage path is not directly resolvable by <img src>
  if (value.startsWith("apartments/")) return false;

  // Allow relative public assets like images/foo.jpg
  if (/^[a-zA-Z0-9_./-]+$/.test(value)) {
    return true;
  }

  return false;
}

export function getApartmentPhotoUrl(photo: ApartmentPhoto | string | { url?: string; src?: string } | undefined): string | null {
  const value = normalizePhotoInput(photo);
  if (!value) {
    return null;
  }

  if (!isWebResolvableUrl(value)) {
    return null;
  }

  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:image/") || value.startsWith("blob:") || value.startsWith("/")) {
    return value;
  }

  return `/${value.replace(/^\/+/, "")}`;
}

export function getApartmentPhotoStoragePath(photo: ApartmentPhoto | string | { storagePath?: string } | undefined): string | null {
  if (!photo || typeof photo === "string") {
    return null;
  }

  const storagePath = "storagePath" in photo ? String(photo.storagePath ?? "").trim() : "";
  return storagePath || null;
}

export function isRenderableApartmentPhoto(photo: ApartmentPhoto | string | { url?: string; src?: string; storagePath?: string } | undefined): boolean {
  return Boolean(getApartmentPhotoUrl(photo) || getApartmentPhotoStoragePath(photo));
}

export function countRenderableApartmentPhotos(apartment: Apartment): number {
  const photos = apartment.photos ?? [];
  const count = photos.filter((photo) => isRenderableApartmentPhoto(photo)).length;

  if (count > 0) {
    return count;
  }

  return isRenderableApartmentPhoto(apartment.coverPhotoUrl ?? undefined) ? 1 : 0;
}

export function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function hasLegacyArchivedStatus(apartment: Apartment): boolean {
  const statusValue = normalizeSearchValue(String(apartment.status ?? ""));
  const availabilityValue = normalizeSearchValue(String(apartment.availability ?? ""));
  const publicationStatusValue = apartment.publicationStatus ? normalizeSearchValue(apartment.publicationStatus) : "";

  return (
    statusValue.includes("архив") ||
    statusValue.includes("удал") ||
    availabilityValue.includes("архив") ||
    availabilityValue.includes("удал") ||
    publicationStatusValue === "archived"
  );
}

export function isApartmentPublic(apartment: Apartment): boolean {
  if (hasLegacyArchivedStatus(apartment)) {
    return false;
  }

  if (apartment.publicationStatus === "hidden") {
    return false;
  }

  if (apartment.publicationStatus === "archived") {
    return false;
  }

  if (apartment.publicationStatus === "draft") {
    return false;
  }

  if (apartment.publicationStatus === "published") {
    return true;
  }

  return apartment.publicationStatus === "published";
}

export function matchesApartmentLocation(apartment: Apartment, query: string): boolean {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return true;
  }

  const searchFields = [
    apartment.city,
    apartment.district,
    apartment.address,
    apartment.title,
  ];

  return searchFields.some((field) => normalizeSearchValue(field || "").includes(normalizedQuery));
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function getAddressDistrictFallback(apartment: Apartment): string {
  if (apartment.district.trim()) {
    return apartment.district.trim();
  }

  const address = apartment.address.trim();
  if (!address) {
    return "";
  }

  const parts = address
    .split(",")
    .map((item) => compactText(item))
    .filter(Boolean);

  return parts[0] ?? "";
}

export function getApartmentPublicLocation(apartment: Apartment): string {
  const district = getAddressDistrictFallback(apartment);
  const city = apartment.city.trim();
  const shortAddress = apartment.address.trim();

  if (district && city) {
    return `${district}, ${city}`;
  }

  if (city) {
    return city;
  }

  if (shortAddress) {
    return shortAddress;
  }

  return apartment.title.trim() || "Объект";
}

export function getApartmentPublicPricePerNight(apartment: Apartment): number | null {
  const info = getApartmentPriceInfo(apartment);
  if (!info || info.period !== "night") return null;
  return info.amount;
}

function detectCurrencyByText(value: string): SupportedCurrency {
  const normalized = value.toUpperCase();
  if (normalized.includes("TRY") || value.includes("₺")) return "TRY";
  if (normalized.includes("USD") || value.includes("$")) return "USD";
  if (normalized.includes("RUB") || value.includes("₽")) return "RUB";
  return "EUR";
}

function detectPeriodByText(value: string): PricingPeriod {
  const normalized = normalizeSearchValue(value);
  if (normalized.includes("нед")) return "week";
  if (normalized.includes("мес")) return "month";
  return "night";
}

function parsePriceString(value: string): number | null {
  const numeric = value.replace(/\s+/g, "").replace(/,/g, ".").match(/[0-9]+(?:\.[0-9]+)?/);
  if (!numeric) return null;
  const parsed = Number(numeric[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getApartmentPriceInfo(apartment: Apartment): ApartmentPriceInfo | null {
  if (typeof apartment.dailyPrice === "number" && apartment.dailyPrice > 0) {
    return { amount: apartment.dailyPrice, currency: "EUR", period: "night" };
  }

  if (typeof apartment.weeklyPrice === "number" && apartment.weeklyPrice > 0) {
    return { amount: apartment.weeklyPrice, currency: "EUR", period: "week" };
  }

  if (typeof apartment.monthlyPrice === "number" && apartment.monthlyPrice > 0) {
    return { amount: apartment.monthlyPrice, currency: "EUR", period: "month" };
  }

  if (apartment.price?.trim()) {
    const amount = parsePriceString(apartment.price);
    if (!amount) return null;

    return {
      amount,
      currency: detectCurrencyByText(apartment.price),
      period: detectPeriodByText(apartment.price),
    };
  }

  return null;
}

function getPeriodLabel(period: PricingPeriod): string {
  if (period === "week") return "неделю";
  if (period === "month") return "месяц";
  return "ночь";
}

export function formatApartmentPrice(apartment: Apartment): string {
  const info = getApartmentPriceInfo(apartment);
  if (!info) return "Цена по запросу";

  const formatted = new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: info.currency,
    maximumFractionDigits: 0,
  }).format(info.amount);

  return `${formatted} / ${getPeriodLabel(info.period)}`;
}

export function getUniqueValues<T extends object>(items: T[], selector: (item: T) => string): string[] {
  const values = new Set<string>();

  items.forEach((item) => {
    const value = selector(item).trim();
    if (value) {
      values.add(value);
    }
  });

  return [...values].sort((a, b) => a.localeCompare(b, "ru-RU"));
}

export function isApartmentAvailableForDates(params: {
  apartment: Apartment;
  bookings: Booking[];
  checkIn: string;
  checkOut: string;
}): boolean {
  const { apartment, bookings, checkIn, checkOut } = params;

  if (!checkIn || !checkOut) {
    return true;
  }

  return !bookings.some((booking) => {
    if (booking.apartmentId !== apartment.id) {
      return false;
    }

    if (!isBlockingBooking(booking)) {
      return false;
    }

    return bookingsOverlap(checkIn, checkOut, booking.checkIn, booking.checkOut);
  });
}

export function getApartmentPublicLabel(apartment: Apartment): string {
  return `${apartment.title} - ${getApartmentPublicLocation(apartment)}`;
}

export function getApartmentPublicNumber(apartment: Apartment): string {
  const match = apartment.title.match(/\b(\d{2,})\b/);
  return match ? `№${match[1]}` : "";
}

export function getApartmentCoordinates(apartment: Apartment): { latitude: number; longitude: number } | null {
  const latitudeRaw = typeof apartment.latitude === "number" ? apartment.latitude : Number(String(apartment.latitude ?? "").trim());
  const longitudeRaw = typeof apartment.longitude === "number" ? apartment.longitude : Number(String(apartment.longitude ?? "").trim());

  if (!Number.isFinite(latitudeRaw) || !Number.isFinite(longitudeRaw)) {
    return null;
  }

  if (latitudeRaw < -90 || latitudeRaw > 90) {
    return null;
  }

  if (longitudeRaw < -180 || longitudeRaw > 180) {
    return null;
  }

  return {
    latitude: latitudeRaw,
    longitude: longitudeRaw,
  };
}
