import "server-only";

import { buildGuestBookingQuote, listGuestBookings } from "@/lib/bookings/guest-booking-service";
import { getServerCurrentUserContext, createSupabaseServerClient } from "@/lib/supabase/server";
import { canUseTool } from "../permissions";
import type { AIContext, AIToolResult } from "../types";

type PublicProperty = {
  id: string;
  title: string;
  city: string;
  district: string;
  shortDesc: string;
  maxGuests: number;
  dailyPrice: number | null;
  currency: string;
  publicationStatus: string;
};

function unauthorized(tool: string): AIToolResult {
  return { tool, data: { error: "Недостаточно прав для этого запроса." } };
}

function compactProperty(row: Record<string, unknown>): PublicProperty {
  const rawPrice = row.daily_price;
  return {
    id: String(row.id),
    title: String(row.title ?? "Объект"),
    city: String(row.city ?? ""),
    district: String(row.district ?? ""),
    shortDesc: String(row.short_desc ?? "").replace(/\s+/g, " ").slice(0, 180),
    maxGuests: Number(row.max_guests ?? 0),
    dailyPrice: typeof rawPrice === "number" ? rawPrice : Number.isFinite(Number(rawPrice)) ? Number(rawPrice) : null,
    currency: "EUR",
    publicationStatus: "published",
  };
}

async function publicProperties(message: string): Promise<PublicProperty[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const locationMatch = message.match(/(?:в|у|near|in|в районе)\s+([\p{L}\s-]{3,30})/iu);
  const guestsMatch = message.match(/(\d+)\s*(?:гост|чел|guest|person)/iu);
  const budgetMatch = message.match(/(?:до|under|below)\s*(\d{2,6})/iu);
  let query = supabase
    .from("apartments")
    .select("id,title:name,city,district,short_desc,max_guests,daily_price,publication_status")
    .eq("publication_status", "published")
    .limit(20);
  if (locationMatch?.[1]) {
    const location = locationMatch[1].trim().replace(/\s+(?:на|с|от|for)\s+.*$/iu, "");
    query = query.or(`city.ilike.%${location}%,district.ilike.%${location}%,name.ilike.%${location}%`);
  }
  if (guestsMatch?.[1]) query = query.gte("max_guests", Number(guestsMatch[1]));
  if (budgetMatch?.[1]) query = query.lte("daily_price", Number(budgetMatch[1]));
  const { data } = await query;
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(compactProperty).slice(0, 5);
}

export async function searchPublishedProperties(context: AIContext, message: string): Promise<AIToolResult> {
  if (!canUseTool(context.role, "searchPublishedProperties")) return unauthorized("searchPublishedProperties");
  return { tool: "searchPublishedProperties", data: { properties: await publicProperties(message) }, source: "Публичный каталог Opero Homes" };
}

export async function getPublicPropertyKnowledge(context: AIContext, apartmentId: string): Promise<AIToolResult> {
  if (!canUseTool(context.role, "getPublicPropertyKnowledge")) return unauthorized("getPublicPropertyKnowledge");
  const supabase = await createSupabaseServerClient();
  if (!supabase || !apartmentId) return { tool: "getPublicPropertyKnowledge", data: { status: "insufficient_data" } };
  const { data, error } = await supabase.from("apartments").select("id,name,city,district,amenities,house_rules,publication_status").eq("id", apartmentId).eq("publication_status", "published").maybeSingle();
  if (error || !data) return { tool: "getPublicPropertyKnowledge", data: { status: "not_found" }, source: "Публичные данные объекта" };
  const rules = data.house_rules && typeof data.house_rules === "object" ? data.house_rules as Record<string, unknown> : {};
  return {
    tool: "getPublicPropertyKnowledge",
    data: {
      property: {
        title: String(data.name ?? "Объект"),
        city: String(data.city ?? ""),
        district: String(data.district ?? ""),
        amenities: Array.isArray(data.amenities) ? data.amenities.filter((item): item is string => typeof item === "string") : [],
        pets: typeof rules.pets === "string" ? rules.pets : "not_specified",
        smoking: typeof rules.smoking === "string" ? rules.smoking : "not_specified",
        checkIn: typeof rules.checkIn === "string" ? rules.checkIn : "not_specified",
        checkOut: typeof rules.checkOut === "string" ? rules.checkOut : "not_specified",
        notes: typeof rules.notes === "string" ? rules.notes.slice(0, 300) : "not_specified",
      },
    },
    source: "Публичные данные объекта",
  };
}

export async function getPublicAvailability(context: AIContext, apartmentId: string, checkIn: string, checkOut: string): Promise<AIToolResult> {
  if (!canUseTool(context.role, "getPublicAvailability")) return unauthorized("getPublicAvailability");
  const supabase = await createSupabaseServerClient();
  if (!supabase || !apartmentId || !checkIn || !checkOut) return { tool: "getPublicAvailability", data: { status: "insufficient_data" } };
  const { data, error } = await supabase.rpc("get_public_apartment_booking_periods", { target_apartment_id: apartmentId });
  if (error) return { tool: "getPublicAvailability", data: { status: "unavailable", reason: "Не удалось проверить доступность." } };
  const overlaps = ((data ?? []) as Array<{ check_in: string; check_out: string; status: string }>).some((period) => period.check_in < checkOut && period.check_out > checkIn && ["pending", "confirmed", "checked_in", "blocked"].includes(period.status));
  return { tool: "getPublicAvailability", data: { apartmentId, checkIn, checkOut, available: !overlaps }, source: "Публичный календарь доступности" };
}

export async function calculatePublicQuote(context: AIContext, apartmentId: string, checkIn: string, checkOut: string, guests: number): Promise<AIToolResult> {
  if (!canUseTool(context.role, "calculatePublicQuote")) return unauthorized("calculatePublicQuote");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { tool: "calculatePublicQuote", data: { error: "Сервис временно недоступен." } };
  const result = await buildGuestBookingQuote(supabase, { apartmentId, checkIn, checkOut, guests, rentalType: "daily", guestName: "", guestEmail: "", guestPhone: "", guestComment: "" });
  return { tool: "calculatePublicQuote", data: result.ok ? result.data : { error: result.errorMessage } };
}

export async function getMyProfile(context: AIContext): Promise<AIToolResult> {
  if (!canUseTool(context.role, "getMyProfile") || !context.userId) return unauthorized("getMyProfile");
  const current = await getServerCurrentUserContext();
  const profile = current.currentUserContext?.profile;
  return { tool: "getMyProfile", data: profile ? { firstName: profile.first_name, lastName: profile.last_name, email: profile.email, phone: profile.phone } : { error: "Профиль не найден." }, source: "Профиль клиента" };
}

export async function getMyBookingRequests(context: AIContext): Promise<AIToolResult> {
  if (!canUseTool(context.role, "getMyBookingRequests") || !context.userId) return unauthorized("getMyBookingRequests");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { tool: "getMyBookingRequests", data: { error: "Сервис временно недоступен." } };
  const result = await listGuestBookings(supabase);
  return { tool: "getMyBookingRequests", data: result.ok ? result.data.map((booking) => ({ id: booking.id.slice(0, 8), apartmentTitle: booking.apartmentTitle, checkIn: booking.checkIn, checkOut: booking.checkOut, status: booking.status, totalAmount: booking.totalAmount })) : { error: result.errorMessage }, source: "Мои бронирования" };
}

async function staffRows(context: AIContext, table: string, select: string): Promise<{ data: Array<Record<string, unknown>>; error?: string }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase || !context.organizationId) return { data: [], error: "Организация не найдена." };
  const { data, error } = await supabase.from(table).select(select).eq("organization_id", context.organizationId).limit(50);
  return { data: (data ?? []) as unknown as Array<Record<string, unknown>>, error: error?.message };
}

export async function getOrganizationSummary(context: AIContext): Promise<AIToolResult> {
  if (!canUseTool(context.role, "getOrganizationSummary") || !context.organizationId) return unauthorized("getOrganizationSummary");
  const [apartments, bookings, tasks] = await Promise.all([
    staffRows(context, "apartments", "id,title:name,publication_status"),
    staffRows(context, "bookings", "id,status,check_in_date,check_out_date"),
    staffRows(context, "operational_tasks", "id,status,due_at"),
  ]);
  return { tool: "getOrganizationSummary", data: { apartments: apartments.data.length, bookings: bookings.data.length, pendingBookings: bookings.data.filter((row) => row.status === "pending").length, openTasks: tasks.data.filter((row) => !["completed", "verified", "cancelled"].includes(String(row.status))).length }, source: "Операционные данные организации" };
}

export async function getBookings(context: AIContext): Promise<AIToolResult> {
  if (!canUseTool(context.role, "getBookings") || !context.organizationId) return unauthorized("getBookings");
  const result = await staffRows(context, "bookings", "id,status,check_in_date,check_out_date,total_amount,apartment_id,created_at");
  return { tool: "getBookings", data: result.error ? { error: "Не удалось загрузить бронирования организации." } : result.data.slice(0, 10).map((row) => ({ status: row.status, checkIn: row.check_in_date, checkOut: row.check_out_date })), source: "Бронирования организации" };
}

export async function getPendingRequests(context: AIContext): Promise<AIToolResult> {
  if (!canUseTool(context.role, "getPendingRequests") || !context.organizationId) return unauthorized("getPendingRequests");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { tool: "getPendingRequests", data: { error: "Сервис временно недоступен." } };
  const { data, error } = await supabase.from("bookings").select("id,status,check_in_date,check_out_date,apartment_id,created_at").eq("organization_id", context.organizationId).eq("status", "pending").order("created_at", { ascending: false }).limit(10);
  return { tool: "getPendingRequests", data: error ? { error: "Не удалось загрузить новые заявки." } : (data ?? []).map((row) => ({ id: row.id.slice(0, 8), checkIn: row.check_in_date, checkOut: row.check_out_date, apartmentId: row.apartment_id })), source: "Новые заявки" };
}

export async function getMyTasks(context: AIContext): Promise<AIToolResult> {
  if (!canUseTool(context.role, "getMyTasks") || !context.userId) return unauthorized("getMyTasks");
  const supabase = await createSupabaseServerClient();
  if (!supabase || !context.organizationId) return { tool: "getMyTasks", data: { error: "Организация не найдена." } };
  const { data, error } = await supabase.from("operational_tasks").select("id,title,status,task_type,priority,apartment_id,due_at").eq("organization_id", context.organizationId).eq("assigned_user_id", context.userId).order("due_at", { ascending: true }).limit(20);
  return { tool: "getMyTasks", data: error ? { error: "Не удалось загрузить назначенные задачи." } : (data ?? []).map((row) => ({ id: row.id.slice(0, 8), title: row.title, status: row.status, taskType: row.task_type, priority: row.priority, apartmentId: row.apartment_id, dueAt: row.due_at })), source: "Назначенные задачи" };
}

export async function getOperationalTasks(context: AIContext): Promise<AIToolResult> {
  if (!canUseTool(context.role, "getOperationalTasks") || !context.organizationId) return unauthorized("getOperationalTasks");
  const result = await staffRows(context, "operational_tasks", "id,title,status,task_type,priority,apartment_id,due_at,assigned_user_id");
  return { tool: "getOperationalTasks", data: result.error ? { error: result.error } : result.data.slice(0, 20).map((row) => ({ id: String(row.id).slice(0, 8), title: row.title, status: row.status, priority: row.priority, dueAt: row.due_at })), source: "Операционные задачи организации" };
}

export async function getMyProperties(context: AIContext): Promise<AIToolResult> {
  if (!canUseTool(context.role, "getMyProperties") || !context.userId) return unauthorized("getMyProperties");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { tool: "getMyProperties", data: { error: "Сервис временно недоступен." } };
  const { data: owned, error: ownerError } = await supabase.rpc("get_property_owner_properties");
  if (ownerError) return { tool: "getMyProperties", data: { error: "Не удалось загрузить связанные квартиры." } };
  const propertyIds = ((owned ?? []) as Array<{ id?: string }>).map((property) => property.id).filter((id): id is string => Boolean(id)).slice(0, 20);
  if (propertyIds.length === 0) return { tool: "getMyProperties", data: { properties: [] }, source: "Связанные квартиры собственника" };
  const { data, error } = await supabase.from("apartments").select("id,title:name,city,district,publication_status,availability").in("id", propertyIds);
  return { tool: "getMyProperties", data: error ? { error: "Не удалось загрузить связанные квартиры." } : { properties: (data ?? []).map((row) => ({ title: row.title, city: row.city, district: row.district, publicationStatus: row.publication_status, availability: row.availability })) }, source: "Связанные квартиры собственника" };
}

export async function getMyPropertyCalendar(context: AIContext, apartmentId: string): Promise<AIToolResult> {
  if (!canUseTool(context.role, "getMyPropertyCalendar") || !context.userId || !apartmentId) return unauthorized("getMyPropertyCalendar");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { tool: "getMyPropertyCalendar", data: { error: "Сервис временно недоступен." } };
  const { data, error } = await supabase.rpc("get_property_owner_occupied_periods", { target_apartment_id: apartmentId });
  return { tool: "getMyPropertyCalendar", data: error ? { error: "Не удалось загрузить календарь квартиры." } : { periods: ((data ?? []) as Array<{ start_date: string; end_date: string; status: string }>).map((period) => ({ startDate: period.start_date, endDate: period.end_date, status: period.status })) }, source: "Календарь связанной квартиры" };
}

export async function getApartments(context: AIContext): Promise<AIToolResult> {
  if (!canUseTool(context.role, "getApartments") || !context.organizationId) return unauthorized("getApartments");
  const result = await staffRows(context, "apartments", "id,title:name,city,district,publication_status,availability,max_guests");
  return { tool: "getApartments", data: result.error ? { error: "Не удалось загрузить объекты организации." } : result.data.slice(0, 20).map((row) => ({ title: row.title, city: row.city, district: row.district, publicationStatus: row.publication_status, availability: row.availability, maxGuests: row.max_guests })), source: "Объекты организации" };
}

export async function getEmployees(context: AIContext): Promise<AIToolResult> {
  if (!canUseTool(context.role, "getEmployees") || !context.organizationId) return unauthorized("getEmployees");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { tool: "getEmployees", data: { error: "Сервис временно недоступен." } };
  const { data, error } = await supabase.from("organization_members").select("user_id,role_code,status").eq("organization_id", context.organizationId).eq("status", "active").limit(50);
  return { tool: "getEmployees", data: error ? { error: "Не удалось загрузить сотрудников." } : (data ?? []).map((row) => ({ role: row.role_code, status: row.status })), source: "Активные сотрудники организации" };
}

export async function getTaskDetails(context: AIContext, taskId: string): Promise<AIToolResult> {
  if (!canUseTool(context.role, "getTaskDetails") || !context.userId || !taskId) return unauthorized("getTaskDetails");
  const supabase = await createSupabaseServerClient();
  if (!supabase || !context.organizationId) return { tool: "getTaskDetails", data: { error: "Организация не найдена." } };
  const { data, error } = await supabase.from("operational_tasks").select("id,title,description,status,task_type,priority,apartment_id,due_at,assigned_user_id").eq("organization_id", context.organizationId).eq("id", taskId).eq("assigned_user_id", context.userId).maybeSingle();
  return { tool: "getTaskDetails", data: error || !data ? { error: "Задача не найдена среди назначенных вам задач." } : { title: data.title, description: String(data.description ?? "").replace(/\s+/g, " ").slice(0, 300), status: data.status, taskType: data.task_type, priority: data.priority, dueAt: data.due_at }, source: "Назначенная задача" };
}