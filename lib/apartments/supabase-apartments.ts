import { createSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/supabase/auth";
import {
  getAllApartments,
  getLocalApartments,
  normalizeApartment,
  normalizeLocalApartments,
  saveLocalApartments,
  slugify,
  toNullableInteger,
  toNullableNumber,
} from "@/app/apartments/apartment-utils";
import type { Apartment, ApartmentPhoto } from "@/types/apartment";

const apartmentSelect = [
  "id",
  "organization_id",
  "slug",
  "title:name",
  "type",
  "google_link",
  "city",
  "district",
  "address",
  "latitude",
  "longitude",
  "short_desc",
  "rooms",
  "bedrooms",
  "bathrooms",
  "floor",
  "area",
  "max_guests",
  "price",
  "deposit",
  "cleaning_fee",
  "rental_types",
  "daily_price",
  "weekly_price",
  "monthly_price",
  "minimum_nights",
  "minimum_weeks",
  "minimum_months",
  "owner_name",
  "owner_phone",
  "owner_email",
  "responsible_user_id",
  "backup_manager_user_id",
  "status",
  "availability",
  "publish_status",
  "publication_status",
  "bookings",
  "cover_photo_url",
  "created_at",
  "updated_at",
].join(",");

const apartmentPhotoSelect = [
  "id",
  "organization_id",
  "apartment_id",
  "storage_path",
  "file_name",
  "mime_type",
  "size",
  "width",
  "height",
  "sort_order",
  "is_cover",
  "created_at",
  "updated_at",
].join(",");

function safeString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function mapApartmentPhoto(row: Record<string, unknown>): ApartmentPhoto {
  const storagePath = safeString(row.storage_path);
  return {
    id: safeString(row.id),
    apartmentId: safeString(row.apartment_id),
    url: storagePath,
    storagePath,
    fileName: safeString(row.file_name),
    mimeType: safeString(row.mime_type),
    size: Number(row.size ?? 0),
    width: typeof row.width === "number" ? row.width : undefined,
    height: typeof row.height === "number" ? row.height : undefined,
    sortOrder: Number(row.sort_order ?? 0),
    isCover: Boolean(row.is_cover),
    createdAt: safeString(row.created_at),
  };
}

function mapApartmentRow(row: Record<string, unknown>, photos: ApartmentPhoto[]): Apartment {
  const publicationStatus = safeString(row.publication_status) || "draft";
  const publishStatus = safeString(row.publish_status) || (publicationStatus === "published" ? "Опубликован" : "Черновик");
  const normalized = normalizeApartment({
    id: safeString(row.id),
    slug: safeString(row.slug) || undefined,
    title: safeString(row.title),
    type: safeString(row.type),
    googleLink: safeString(row.google_link),
    city: safeString(row.city),
    district: safeString(row.district),
    address: safeString(row.address),
    latitude: safeString(row.latitude),
    longitude: safeString(row.longitude),
    shortDesc: safeString(row.short_desc),
    rooms: toNumber(row.rooms) ?? 0,
    bedrooms: toNumber(row.bedrooms) ?? 0,
    bathrooms: toNumber(row.bathrooms) ?? 0,
    floor: row.floor === null || row.floor === undefined ? null : toNumber(row.floor),
    area: row.area === null || row.area === undefined ? null : toNumber(row.area),
    maxGuests: toNumber(row.max_guests) ?? 0,
    price: safeString(row.price),
    deposit: row.deposit === null || row.deposit === undefined ? null : toNumber(row.deposit),
    cleaningFee: row.cleaning_fee === null || row.cleaning_fee === undefined ? null : toNumber(row.cleaning_fee),
    rentalTypes: typeof row.rental_types === "object" && row.rental_types !== null
      ? {
          daily: Boolean((row.rental_types as Record<string, unknown>).daily),
          weekly: Boolean((row.rental_types as Record<string, unknown>).weekly),
          monthly: Boolean((row.rental_types as Record<string, unknown>).monthly),
        }
      : undefined,
    dailyPrice: row.daily_price === null || row.daily_price === undefined ? null : toNumber(row.daily_price),
    weeklyPrice: row.weekly_price === null || row.weekly_price === undefined ? null : toNumber(row.weekly_price),
    monthlyPrice: row.monthly_price === null || row.monthly_price === undefined ? null : toNumber(row.monthly_price),
    minimumNights: row.minimum_nights === null || row.minimum_nights === undefined ? null : toNumber(row.minimum_nights),
    minimumWeeks: row.minimum_weeks === null || row.minimum_weeks === undefined ? null : toNumber(row.minimum_weeks),
    minimumMonths: row.minimum_months === null || row.minimum_months === undefined ? null : toNumber(row.minimum_months),
    ownerName: safeString(row.owner_name),
    ownerPhone: safeString(row.owner_phone),
    ownerEmail: safeString(row.owner_email),
    responsibleUserId: row.responsible_user_id ? safeString(row.responsible_user_id) : null,
    backupManagerUserId: row.backup_manager_user_id ? safeString(row.backup_manager_user_id) : null,
    status: safeString(row.status) as Apartment["status"],
    availability: safeString(row.availability) as Apartment["availability"],
    publishStatus: publishStatus === "Опубликован" ? "Опубликован" : publishStatus === "На обслуживании" ? "На обслуживании" : "Черновик",
    publicationStatus: publicationStatus as Apartment["publicationStatus"],
    createdAt: safeString(row.created_at),
    updatedAt: safeString(row.updated_at),
    bookings: Number(row.bookings ?? 0),
    photos,
    coverPhotoUrl: safeString(row.cover_photo_url) || null,
  });

  return normalized;
}

async function loadPhotoRows(apartmentIds: string[], supabase = createSupabaseClient()) {
  if (!supabase || apartmentIds.length === 0) {
    return [] as Array<Record<string, unknown>>;
  }

  const { data, error } = await supabase
    .from("apartment_photos")
    .select(apartmentPhotoSelect)
    .in("apartment_id", apartmentIds)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data as unknown as Array<Record<string, unknown>>) ?? [];
}

export async function loadApartmentsFromSupabase(options?: { publicOnly?: boolean }): Promise<Apartment[]> {
  const supabase = createSupabaseClient();
  if (!supabase) {
    return options?.publicOnly ? normalizeLocalApartments(getAllApartments().filter((item) => item.publicationStatus === "published")) : getAllApartments();
  }

  let query = supabase.from("apartments").select(apartmentSelect).order("created_at", { ascending: false });

  if (options?.publicOnly) {
    query = query.eq("publication_status", "published");
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const apartmentRows = (data as unknown as Array<Record<string, unknown>>) ?? [];
  const apartmentIds = apartmentRows.map((row) => safeString(row.id)).filter(Boolean);
  const photoRows = await loadPhotoRows(apartmentIds, supabase);
  const photoMap = new Map<string, ApartmentPhoto[]>();

  photoRows.forEach((row) => {
    const apartmentId = safeString(row.apartment_id);
    const list = photoMap.get(apartmentId) ?? [];
    list.push(mapApartmentPhoto(row));
    photoMap.set(apartmentId, list);
  });

  return apartmentRows.map((row) => mapApartmentRow(row, photoMap.get(safeString(row.id)) ?? []));
}

export async function loadApartmentFromSupabase(id: string, options?: { publicOnly?: boolean }): Promise<Apartment | null> {
  const apartments = await loadApartmentsFromSupabase(options);
  return apartments.find((item) => item.id === id) ?? null;
}

async function buildUniqueApartmentSlug(params: {
  apartmentId: string;
  apartmentTitle: string;
  existingSlug?: string;
}) {
  const { apartmentId, apartmentTitle, existingSlug } = params;
  const normalizedTitle = apartmentTitle.trim();

  if (!normalizedTitle) {
    throw new Error("Название объекта обязательно для генерации slug.");
  }

  if (existingSlug && existingSlug.trim()) {
    return existingSlug.trim();
  }

  const baseSlug = slugify(normalizedTitle);
  if (!baseSlug) {
    throw new Error("Не удалось сгенерировать slug для объекта.");
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    return baseSlug;
  }

  let candidate = baseSlug;
  let suffix = 2;

  while (true) {
    const { data, error } = await supabase
      .from("apartments")
      .select("id")
      .eq("slug", candidate)
      .neq("id", apartmentId)
      .limit(1);

    if (error) {
      console.error("Failed to check apartment slug uniqueness:", error);
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      return candidate;
    }

    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

export async function saveApartmentToSupabase(apartment: Apartment): Promise<Apartment> {
  const supabase = createSupabaseClient();
  if (!supabase) {
    const local = getLocalApartments().filter((item) => item.id !== apartment.id);
    const normalized = normalizeApartment(apartment);
    saveLocalApartments([...local, normalized]);
    return normalized;
  }

  const auth = await getCurrentUser();
  const organizationId = auth.currentUserContext?.organization?.id;
  if (!organizationId) {
    throw new Error("Organization context is missing");
  }

  const normalizedTitle = apartment.title.trim();
  if (!normalizedTitle) {
    throw new Error("Название объекта обязательно.");
  }

  const slug = await buildUniqueApartmentSlug({
    apartmentId: apartment.id,
    apartmentTitle: normalizedTitle,
    existingSlug: apartment.slug ?? undefined,
  });

  const payload = {
    id: apartment.id,
    organization_id: organizationId,
    slug,
    name: apartment.title,
    type: apartment.type,
    google_link: apartment.googleLink,
    city: apartment.city,
    district: apartment.district,
    address: apartment.address,
    latitude: toNullableNumber(apartment.latitude),
    longitude: toNullableNumber(apartment.longitude),
    short_desc: apartment.shortDesc,
    rooms: toNullableInteger(apartment.rooms),
    bedrooms: toNullableInteger(apartment.bedrooms),
    bathrooms: toNullableInteger(apartment.bathrooms),
    floor: toNullableInteger(apartment.floor),
    area: toNullableNumber(apartment.area),
    max_guests: toNullableInteger(apartment.maxGuests),
    price: toNullableNumber(apartment.price ?? null),
    deposit: toNullableNumber(apartment.deposit),
    cleaning_fee: toNullableNumber(apartment.cleaningFee),
    rental_types: apartment.rentalTypes,
    daily_price: toNullableNumber(apartment.dailyPrice),
    weekly_price: toNullableNumber(apartment.weeklyPrice),
    monthly_price: toNullableNumber(apartment.monthlyPrice),
    minimum_nights: toNullableInteger(apartment.minimumNights),
    minimum_weeks: toNullableInteger(apartment.minimumWeeks),
    minimum_months: toNullableInteger(apartment.minimumMonths),
    owner_name: apartment.ownerName,
    owner_phone: apartment.ownerPhone,
    owner_email: apartment.ownerEmail,
    responsible_user_id: apartment.responsibleUserId,
    backup_manager_user_id: apartment.backupManagerUserId,
    status: apartment.status,
    availability: apartment.availability,
    publish_status: apartment.publishStatus,
    publication_status: apartment.publicationStatus ?? (apartment.publishStatus === "Опубликован" ? "published" : "draft"),
    bookings: apartment.bookings ?? 0,
    cover_photo_url: apartment.coverPhotoUrl,
    updated_at: new Date().toISOString(),
    created_at: apartment.createdAt ?? new Date().toISOString(),
  };

  const { error: apartmentError } = await supabase.from("apartments").upsert(payload, { onConflict: "id" });
  if (apartmentError) {
    console.error("Failed to upsert apartment:", apartmentError);
    throw new Error(apartmentError.message);
  }

  const { error: deletePhotosError } = await supabase.from("apartment_photos").delete().eq("apartment_id", apartment.id);
  if (deletePhotosError) {
    console.error("Failed to delete apartment photos before sync:", deletePhotosError);
    throw new Error(deletePhotosError.message);
  }

  const nextPhotos = (apartment.photos ?? []).map((photo, index) => ({
    id: photo.id,
    organization_id: organizationId,
    apartment_id: apartment.id,
    storage_path: photo.storagePath,
    file_name: photo.fileName,
    mime_type: photo.mimeType,
    size: photo.size,
    width: photo.width ?? null,
    height: photo.height ?? null,
    sort_order: photo.sortOrder ?? index,
    is_cover: Boolean(photo.isCover),
    created_at: photo.createdAt,
    updated_at: new Date().toISOString(),
  }));

  if (nextPhotos.length > 0) {
    const { error: photoError } = await supabase.from("apartment_photos").insert(nextPhotos);
    if (photoError) {
      console.error("Failed to insert apartment photos:", photoError);
      throw new Error(photoError.message);
    }
  }

  const reloaded = await loadApartmentFromSupabase(apartment.id);
  if (!reloaded) {
    throw new Error("Failed to reload apartment after save");
  }

  return reloaded;
}

export async function deleteApartmentFromSupabase(id: string): Promise<void> {
  const supabase = createSupabaseClient();
  if (!supabase) {
    const next = getLocalApartments().filter((item) => item.id !== id);
    saveLocalApartments(next);
    return;
  }

  const { error } = await supabase.from("apartments").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}
