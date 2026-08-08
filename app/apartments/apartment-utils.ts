import type { Apartment, RentalTypes } from "@/types/apartment";

export type ApartmentForm = {
  title: string;
  unitNumber: string;
  type: string;
  googleLink: string;
  country: string;
  city: string;
  district: string;
  address: string;
  latitude: string;
  longitude: string;
  shortDesc: string;
  rooms: string;
  bedrooms: string;
  beds: string;
  bathrooms: string;
  floor: string;
  area: string;
  maxGuests: string;
  deposit: string;
  cleaningFee: string;
  rentalTypes: RentalTypes;
  dailyPrice: string;
  weeklyPrice: string;
  monthlyPrice: string;
  minimumNights: string;
  minimumWeeks: string;
  minimumMonths: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  responsibleUserId: string;
  backupManagerUserId: string;
  publishStatus: "Черновик" | "Опубликован" | "На обслуживании";
  publicationStatus: "draft" | "published" | "hidden" | "archived";
  amenities: string[];
  pets: "allowed" | "negotiable" | "not_allowed";
  smoking: "allowed" | "not_allowed";
  checkIn: string;
  checkOut: string;
  houseRulesNotes: string;
};

export type { ApartmentPhoto, RentalTypes } from "@/types/apartment";

export const STORAGE_KEY = "apartments";

export const initialApartmentForm: ApartmentForm = {
  title: "",
  unitNumber: "",
  type: "",
  googleLink: "",
  country: "Турция",
  city: "",
  district: "",
  address: "",
  latitude: "",
  longitude: "",
  shortDesc: "",
  rooms: "",
  bedrooms: "",
  beds: "",
  bathrooms: "",
  floor: "",
  area: "",
  maxGuests: "",
  deposit: "",
  cleaningFee: "",
  rentalTypes: {
    daily: false,
    weekly: false,
    monthly: false,
  },
  dailyPrice: "",
  weeklyPrice: "",
  monthlyPrice: "",
  minimumNights: "",
  minimumWeeks: "",
  minimumMonths: "",
  ownerName: "",
  ownerPhone: "",
  ownerEmail: "",
  responsibleUserId: "",
  backupManagerUserId: "",
  publishStatus: "Черновик",
  publicationStatus: "draft",
  amenities: [],
  pets: "negotiable",
  smoking: "not_allowed",
  checkIn: "15:00",
  checkOut: "11:00",
  houseRulesNotes: "",
};

const sampleApartments: Apartment[] = [
  {
    id: "demo-1",
    title: "Skyline Loft",
    type: "Квартира",
    googleLink: "",
    city: "Аланья",
    district: "Махмутлар",
    address: "Mahmutlar Mah. Atatürk Caddesi 125",
    latitude: "36.4921",
    longitude: "32.0994",
    shortDesc: "Светлый лофт с видом на море",
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    floor: 3,
    area: 65,
    maxGuests: 4,
    deposit: 200,
    cleaningFee: 50,
    rentalTypes: { daily: true, weekly: false, monthly: false },
    dailyPrice: 120,
    weeklyPrice: null,
    monthlyPrice: null,
    minimumNights: 1,
    minimumWeeks: null,
    minimumMonths: null,
    ownerName: "Иван Иванов",
    ownerPhone: "+7 900 123 4567",
    ownerEmail: "ivan@example.com",
    status: "Свободно",
    availability: "Свободен",
    publishStatus: "Опубликован",
    bookings: 3,
  },
  {
    id: "demo-2",
    title: "Harbor Residence",
    type: "Квартира",
    googleLink: "",
    city: "Махмутлар",
    district: "Туристический район",
    address: "Atatürk Caddesi 200",
    latitude: "36.4995",
    longitude: "32.0791",
    shortDesc: "Уютная резиденция у гавани",
    rooms: 3,
    bedrooms: 2,
    bathrooms: 2,
    floor: 5,
    area: 92,
    maxGuests: 6,
    deposit: 300,
    cleaningFee: 60,
    rentalTypes: { daily: false, weekly: true, monthly: false },
    dailyPrice: null,
    weeklyPrice: 550,
    monthlyPrice: null,
    minimumNights: null,
    minimumWeeks: 1,
    minimumMonths: null,
    ownerName: "Елена Смирнова",
    ownerPhone: "+7 900 234 5678",
    ownerEmail: "elena@example.com",
    status: "Занято",
    availability: "Занят",
    publishStatus: "Опубликован",
    bookings: 12,
  },
  {
    id: "demo-3",
    title: "Garden Villa",
    type: "Вилла",
    googleLink: "",
    city: "Оба",
    district: "Центр",
    address: "Atatürk Caddesi 300",
    latitude: "36.5882",
    longitude: "31.9938",
    shortDesc: "Просторная вилла с садом",
    rooms: 4,
    bedrooms: 3,
    bathrooms: 3,
    floor: 1,
    area: 140,
    maxGuests: 8,
    deposit: 500,
    cleaningFee: 120,
    rentalTypes: { daily: false, weekly: false, monthly: true },
    dailyPrice: null,
    weeklyPrice: null,
    monthlyPrice: 1600,
    minimumNights: null,
    minimumWeeks: null,
    minimumMonths: 1,
    ownerName: "Олег Соколов",
    ownerPhone: "+7 900 345 6789",
    ownerEmail: "oleg@example.com",
    status: "Свободно",
    availability: "Свободен",
    publishStatus: "Черновик",
    bookings: 0,
  },
  {
    id: "demo-4",
    title: "Central Studio",
    type: "Апарт-отель",
    googleLink: "",
    city: "Кестель",
    district: "Центр города",
    address: "Yalı Caddesi 45",
    latitude: "36.5909",
    longitude: "31.9265",
    shortDesc: "Стильный студия в центре города",
    rooms: 1,
    bedrooms: 1,
    bathrooms: 1,
    floor: 2,
    area: 38,
    maxGuests: 2,
    deposit: 150,
    cleaningFee: 40,
    rentalTypes: { daily: true, weekly: true, monthly: false },
    dailyPrice: 75,
    weeklyPrice: 450,
    monthlyPrice: null,
    minimumNights: 1,
    minimumWeeks: 1,
    minimumMonths: null,
    ownerName: "Мария Кузнецова",
    ownerPhone: "+7 900 456 7890",
    ownerEmail: "maria@example.com",
    status: "Черновик",
    availability: "На обслуживании",
    publishStatus: "Черновик",
    bookings: 0,
  },
  {
    id: "demo-5",
    title: "River View Apt.",
    type: "Квартира",
    googleLink: "",
    city: "Авсаллар",
    district: "Речной район",
    address: "Atatürk Caddesi 66",
    latitude: "36.4314",
    longitude: "31.6528",
    shortDesc: "Квартира с видом на реку",
    rooms: 2,
    bedrooms: 2,
    bathrooms: 2,
    floor: 4,
    area: 78,
    maxGuests: 5,
    deposit: 250,
    cleaningFee: 70,
    rentalTypes: { daily: true, weekly: false, monthly: true },
    dailyPrice: 110,
    weeklyPrice: null,
    monthlyPrice: 3200,
    minimumNights: 1,
    minimumWeeks: null,
    minimumMonths: 1,
    ownerName: "Сергей Петров",
    ownerPhone: "+7 900 567 8901",
    ownerEmail: "sergey@example.com",
    status: "Занято",
    availability: "Занят",
    publishStatus: "Опубликован",
    bookings: 5,
  },
];

export function getAllApartments() {
  const local = getLocalApartments();
  if (local.length > 0) {
    return local;
  }

  if (process.env.NODE_ENV !== "production") {
    return normalizeLocalApartments(sampleApartments);
  }

  return [];
}

export function normalizeApartment(raw: Partial<Apartment>): Apartment {
  const publishStatus = raw.publishStatus ?? "Черновик";
  const publicationStatus = raw.publicationStatus ?? "draft";
  const derivedSlug = raw.slug ?? (slugify(raw.title ?? "") || undefined);

  const now = new Date().toISOString();

  return {
    id: raw.id ?? (typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random())),
    slug: derivedSlug,
    title: raw.title ?? "",
    type: raw.type ?? "",
    googleLink: raw.googleLink ?? "",
    country: raw.country ?? "Турция",
    city: raw.city ?? "",
    district: raw.district ?? "",
    address: raw.address ?? "",
    latitude: raw.latitude ?? "",
    longitude: raw.longitude ?? "",
    shortDesc: raw.shortDesc ?? "",
    rooms: raw.rooms ?? 0,
    bedrooms: raw.bedrooms ?? 0,
    beds: raw.beds ?? 0,
    bathrooms: raw.bathrooms ?? 0,
    floor: raw.floor ?? null,
    area: raw.area ?? null,
    maxGuests: raw.maxGuests ?? 0,
    price: raw.price ?? "",
    deposit: raw.deposit ?? null,
    cleaningFee: raw.cleaningFee ?? null,
    rentalTypes: raw.rentalTypes ?? { daily: false, weekly: false, monthly: false },
    dailyPrice: raw.dailyPrice ?? null,
    weeklyPrice: raw.weeklyPrice ?? null,
    monthlyPrice: raw.monthlyPrice ?? null,
    minimumNights: raw.minimumNights ?? null,
    minimumWeeks: raw.minimumWeeks ?? null,
    minimumMonths: raw.minimumMonths ?? null,
    ownerName: raw.ownerName ?? "",
    ownerPhone: raw.ownerPhone ?? "",
    ownerEmail: raw.ownerEmail ?? "",
    responsibleUserId: raw.responsibleUserId ?? null,
    backupManagerUserId: raw.backupManagerUserId ?? null,
    status: raw.status ?? "Черновик",
    availability: raw.availability ?? "На обслуживании",
    publishStatus,
    publicationStatus,
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? raw.createdAt ?? now,
    bookings: typeof raw.bookings === "number" ? raw.bookings : 0,
    photos: raw.photos ?? [],
    coverPhotoUrl: raw.coverPhotoUrl ?? null,
    amenities: raw.amenities ?? [],
    houseRules: raw.houseRules ?? undefined,
  };
}

export function normalizeLocalApartments(apartments: Apartment[]) {
  const seen = new Set<string>();
  return apartments.map((item) => {
    const normalized = normalizeApartment(item);
    let id = normalized.id;
    if (seen.has(id)) {
      id = typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random());
    }
    seen.add(id);
    return { ...normalized, id };
  });
}

export function getLocalApartments(): Apartment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Apartment[];
    return Array.isArray(parsed) ? normalizeLocalApartments(parsed) : [];
  } catch {
    return [];
  }
}

export function getApartmentById(id: string): Apartment | null {
  if (typeof window === "undefined") return null;
  return getLocalApartments().find((item) => item.id === id) ?? null;
}

export function saveLocalApartments(apartments: Apartment[]) {
  if (typeof window === "undefined") return;
  const normalized = normalizeLocalApartments(apartments);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function toNullableInteger(value: string | number | null | undefined): number | null {
  const parsed = toNullableNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildApartment(form: ApartmentForm, id: string, existingApartment?: Partial<Apartment>): Apartment {
  const publishStatus = form.publishStatus || "Черновик";
  const publicationStatus = form.publicationStatus || "draft";
  const latitude = toNullableNumber(form.latitude);
  const longitude = toNullableNumber(form.longitude);
  const selectedPrice = form.rentalTypes.daily
    ? form.dailyPrice
    : form.rentalTypes.weekly
    ? form.weeklyPrice
    : form.rentalTypes.monthly
    ? form.monthlyPrice
    : "";
  const now = new Date().toISOString();

  return {
    id,
    slug: existingApartment?.slug ?? undefined,
    title: form.title.trim(),
    unitNumber: form.unitNumber.trim(),
    type: form.type,
    googleLink: form.googleLink,
    country: form.country,
    city: form.city,
    district: form.district,
    address: form.address,
    latitude: latitude ?? undefined,
    longitude: longitude ?? undefined,
    shortDesc: form.shortDesc,
    rooms: toNullableInteger(form.rooms) ?? 0,
    bedrooms: toNullableInteger(form.bedrooms) ?? 0,
    beds: toNullableInteger(form.beds) ?? 0,
    bathrooms: toNullableInteger(form.bathrooms) ?? 0,
    floor: toNullableInteger(form.floor),
    area: toNullableNumber(form.area),
    maxGuests: toNullableInteger(form.maxGuests) ?? 0,
    price: selectedPrice,
    deposit: toNullableNumber(form.deposit),
    cleaningFee: toNullableNumber(form.cleaningFee),
    rentalTypes: {
      daily: form.rentalTypes.daily,
      weekly: form.rentalTypes.weekly,
      monthly: form.rentalTypes.monthly,
    },
    dailyPrice: form.rentalTypes.daily ? toNullableNumber(form.dailyPrice) : null,
    weeklyPrice: form.rentalTypes.weekly ? toNullableNumber(form.weeklyPrice) : null,
    monthlyPrice: form.rentalTypes.monthly ? toNullableNumber(form.monthlyPrice) : null,
    minimumNights: form.rentalTypes.daily ? toNullableInteger(form.minimumNights) : null,
    minimumWeeks: form.rentalTypes.weekly ? toNullableInteger(form.minimumWeeks) : null,
    minimumMonths: form.rentalTypes.monthly ? toNullableInteger(form.minimumMonths) : null,
    ownerName: form.ownerName,
    ownerPhone: form.ownerPhone,
    ownerEmail: form.ownerEmail,
    responsibleUserId: form.responsibleUserId.trim() ? form.responsibleUserId : null,
    backupManagerUserId: form.backupManagerUserId.trim() ? form.backupManagerUserId : null,
    status: publishStatus === "Опубликован" ? "Свободно" : "Черновик",
    availability: publishStatus === "Опубликован" ? "Свободен" : "На обслуживании",
    publishStatus,
    publicationStatus,
    createdAt: existingApartment?.createdAt ?? now,
    updatedAt: now,
    bookings: existingApartment?.bookings ?? 0,
    photos: existingApartment?.photos ?? [],
    coverPhotoUrl: existingApartment?.coverPhotoUrl ?? null,
    amenities: form.amenities,
    houseRules: {
      pets: form.pets,
      smoking: form.smoking,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      notes: form.houseRulesNotes,
    },
  };
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Неизвестная ошибка";
}

export function validateForm(form: ApartmentForm) {
  const errors: Record<string, string> = {};

  function validateCoordinate(value: string, min: number, max: number): boolean {
    if (!value.trim()) return true;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max;
  }

  if (!form.title.trim()) errors.title = "Обязательное поле";
  if (!form.type.trim()) errors.type = "Обязательное поле";
  if (!form.city.trim()) errors.city = "Обязательное поле";
  if (!form.district.trim()) errors.district = "Обязательное поле";
  if (!form.address.trim()) errors.address = "Обязательное поле";
  if (!form.rooms.trim() || Number(form.rooms) < 1) errors.rooms = "Обязательное поле";
  if (!form.bedrooms.trim() || Number(form.bedrooms) < 1) errors.bedrooms = "Обязательное поле";
  if (!form.beds.trim() || Number(form.beds) < 1) errors.beds = "Обязательное поле";
  if (!form.bathrooms.trim() || Number(form.bathrooms) < 1) errors.bathrooms = "Обязательное поле";
  if (!form.maxGuests.trim() || Number(form.maxGuests) < 1) errors.maxGuests = "Обязательное поле";
  if (!validateCoordinate(form.latitude, -90, 90)) errors.latitude = "Широта должна быть числом от -90 до 90";
  if (!validateCoordinate(form.longitude, -180, 180)) errors.longitude = "Долгота должна быть числом от -180 до 180";
  if (!form.rentalTypes.daily && !form.rentalTypes.weekly && !form.rentalTypes.monthly) {
    errors.rentalTypes = "Выберите хотя бы один тип аренды";
  }
  if (form.rentalTypes.daily) {
    if (!form.dailyPrice.trim() || Number(form.dailyPrice) <= 0) errors.dailyPrice = "Обязательное поле";
    if (!form.minimumNights.trim() || Number(form.minimumNights) < 1) errors.minimumNights = "Обязательное поле";
  }
  if (form.rentalTypes.weekly) {
    if (!form.weeklyPrice.trim() || Number(form.weeklyPrice) <= 0) errors.weeklyPrice = "Обязательное поле";
    if (!form.minimumWeeks.trim() || Number(form.minimumWeeks) < 1) errors.minimumWeeks = "Обязательное поле";
  }
  if (form.rentalTypes.monthly) {
    if (!form.monthlyPrice.trim() || Number(form.monthlyPrice) <= 0) errors.monthlyPrice = "Обязательное поле";
    if (!form.minimumMonths.trim() || Number(form.minimumMonths) < 1) errors.minimumMonths = "Обязательное поле";
  }
  return errors;
}

export function getRentalCostText(apartment: Apartment): string {
  const costs: string[] = [];
  if (apartment.rentalTypes.daily && apartment.dailyPrice) {
    costs.push(`${apartment.dailyPrice} €/ночь`);
  }
  if (apartment.rentalTypes.weekly && apartment.weeklyPrice) {
    costs.push(`${apartment.weeklyPrice} €/неделя`);
  }
  if (apartment.rentalTypes.monthly && apartment.monthlyPrice) {
    costs.push(`${apartment.monthlyPrice} €/месяц`);
  }
  if (!costs.length && apartment.price) {
    costs.push(apartment.price);
  }
  return costs.join("\n");
}

export function apartmentToForm(apartment: Apartment): ApartmentForm {
  return {
    title: apartment.title,
    unitNumber: apartment.unitNumber ?? "",
    type: apartment.type,
    googleLink: apartment.googleLink || "",
    country: apartment.country || "Турция",
    city: apartment.city,
    district: apartment.district,
    address: apartment.address,
    latitude: apartment.latitude != null ? String(apartment.latitude) : "",
    longitude: apartment.longitude != null ? String(apartment.longitude) : "",
    shortDesc: apartment.shortDesc || "",
    rooms: String(apartment.rooms ?? ""),
    bedrooms: String(apartment.bedrooms ?? ""),
    beds: String(apartment.beds ?? ""),
    bathrooms: String(apartment.bathrooms ?? ""),
    floor: apartment.floor !== null && apartment.floor !== undefined ? String(apartment.floor) : "",
    area: apartment.area !== null && apartment.area !== undefined ? String(apartment.area) : "",
    maxGuests: String(apartment.maxGuests ?? ""),
    deposit: apartment.deposit !== null && apartment.deposit !== undefined ? String(apartment.deposit) : "",
    cleaningFee: apartment.cleaningFee !== null && apartment.cleaningFee !== undefined ? String(apartment.cleaningFee) : "",
    rentalTypes: apartment.rentalTypes,
    dailyPrice: apartment.dailyPrice !== null && apartment.dailyPrice !== undefined ? String(apartment.dailyPrice) : "",
    weeklyPrice: apartment.weeklyPrice !== null && apartment.weeklyPrice !== undefined ? String(apartment.weeklyPrice) : "",
    monthlyPrice: apartment.monthlyPrice !== null && apartment.monthlyPrice !== undefined ? String(apartment.monthlyPrice) : "",
    minimumNights: apartment.minimumNights !== null && apartment.minimumNights !== undefined ? String(apartment.minimumNights) : "",
    minimumWeeks: apartment.minimumWeeks !== null && apartment.minimumWeeks !== undefined ? String(apartment.minimumWeeks) : "",
    minimumMonths: apartment.minimumMonths !== null && apartment.minimumMonths !== undefined ? String(apartment.minimumMonths) : "",
    ownerName: apartment.ownerName,
    ownerPhone: apartment.ownerPhone,
    ownerEmail: apartment.ownerEmail,
    responsibleUserId: apartment.responsibleUserId ?? "",
    backupManagerUserId: apartment.backupManagerUserId ?? "",
    publishStatus: apartment.publishStatus,
    publicationStatus: apartment.publicationStatus ?? "draft",
    amenities: apartment.amenities ?? [],
    pets: apartment.houseRules?.pets ?? "negotiable",
    smoking: apartment.houseRules?.smoking ?? "not_allowed",
    checkIn: apartment.houseRules?.checkIn ?? "15:00",
    checkOut: apartment.houseRules?.checkOut ?? "11:00",
    houseRulesNotes: apartment.houseRules?.notes ?? "",
  };
}
