import { canUseTool } from "./permissions";
import {
  calculatePublicQuote,
  getApartments,
  getBookings,
  getEmployees,
  getMyBookingRequests,
  getMyPropertyCalendar,
  getMyProperties,
  getTaskDetails,
  getMyProfile,
  getMyTasks,
  getOperationalTasks,
  getOrganizationSummary,
  getPendingRequests,
  getPublicAvailability,
  searchPublishedProperties,
} from "./tools/read";
import { sanitizeAiToolResultForClient } from "./sanitize";
import type { AIChatResponse, AIContext, AIToolResult } from "./types";
import { buildHandoff } from "@/lib/support/service";

function languageOf(message: string): "ru" | "en" | "tr" {
  if (/[ğüşçıöİı]/i.test(message) || /\b(merhaba|ev|misafir|rezervasyon|müsait)/i.test(message)) return "tr";
  if (/\b(hello|find|property|booking|available|task|today)\b/i.test(message)) return "en";
  return "ru";
}

function datesFrom(message: string): { checkIn: string; checkOut: string } | null {
  const iso = [...message.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
  if (iso.length >= 2) return { checkIn: iso[0], checkOut: iso[1] };
  const local = [...message.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/g)].map((match) => `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`);
  return local.length >= 2 ? { checkIn: local[0], checkOut: local[1] } : null;
}

function guestsFrom(message: string): number {
  const match = message.match(/\b(\d+)\s*(?:гост|чел|guest|person|kişi)/iu);
  return match ? Math.max(1, Number(match[1])) : 1;
}

function hasAny(message: string, values: string[]): boolean {
  return values.some((value) => message.includes(value));
}

function suggestions(context: AIContext): string[] {
  if (context.role === "anonymous" || context.role === "client") return ["Найти жильё", "Показать мои заявки", "Проверить свободные даты"];
  if (context.role === "property_owner") return ["Показать мои квартиры", "Какие даты заняты?"];
  if (["employee", "cleaner", "maintenance"].includes(context.role)) return ["Мои задачи на сегодня", "Что нужно сделать в этой квартире?"];
  return ["Что требует внимания сегодня?", "Показать новые заявки", "Есть ли просроченные задачи?"];
}

function formatRoleMessage(context: AIContext, message: string): string {
  const language = languageOf(message);
  const name = context.displayName ? `, ${context.displayName.split(" ")[0]}` : "";
  if (language === "en") return context.displayName ? `Welcome${name}. I use Opero Homes data available to your role.` : "I use Opero Homes data available to your role.";
  if (language === "tr") return context.displayName ? `Hoş geldiniz${name}. Opero Homes verileriyle yardımcı olabilirim.` : "Opero Homes verileriyle yardımcı olabilirim.";
  return context.displayName ? `Добро пожаловать${name}. Я работаю с доступными вашей роли данными Opero Homes.` : "Я работаю только с доступными вашей роли данными Opero Homes.";
}

function propertyAnswer(language: "ru" | "en" | "tr", properties: unknown[], message: string): string {
  if (properties.length === 0) {
    if (language === "en") return `I couldn't find a matching property for “${message}”. A manager can check additional options and availability.`;
    if (language === "tr") return `“${message}” için uygun bir konut bulamadım. Bir yönetici ek seçenekleri ve müsaitliği kontrol edebilir.`;
    return `По запросу «${message}» подходящих опубликованных квартир не нашёл. Менеджер сможет проверить дополнительные варианты и точную доступность.`;
  }
  const rows = properties.slice(0, 3).map((item) => item as Record<string, unknown>).map((property) => {
    const title = String(property.title ?? "Квартира");
    const location = [property.district, property.city].filter(Boolean).join(", ");
    const guests = Number(property.maxGuests ?? 0);
    const price = property.dailyPrice == null ? "" : ` · ${property.dailyPrice} ${String(property.currency ?? "EUR")}/ночь`;
    return `${title}${location ? ` (${location})` : ""}${guests ? ` · до ${guests} гостей` : ""}${price}`;
  });
  if (language === "en") return `I found ${properties.length} published option${properties.length === 1 ? "" : "s"}. ${rows.join("; ")}. Tell me your dates and number of guests and I’ll check the next step.`;
  if (language === "tr") return `${properties.length} yayınlanmış seçenek buldum: ${rows.join("; ")}. Tarihleri ve misafir sayısını yazarsanız sonraki adımı kontrol edebilirim.`;
  return `Нашёл ${properties.length} опубликованн${properties.length === 1 ? "ую квартиру" : "ых квартиры"}: ${rows.join("; ")}. Напишите даты и количество гостей, и я проверю следующий шаг.`;
}

function dataAnswer(language: "ru" | "en" | "tr", count: number | null, results: AIToolResult[]): string {
  if (count !== null) return propertyAnswer(language, (results[0]?.data as { properties?: unknown[] } | undefined)?.properties ?? [], "ваш запрос");
  if (language === "en") return "I checked the Opero Homes data available to your account. Tell me what you want to inspect next, and I’ll work through it with you.";
  if (language === "tr") return "Hesabınız için mevcut Opero Homes verilerini kontrol ettim. Sırada neyi incelememi istediğinizi yazın, birlikte ilerleyelim.";
  return "Проверил доступные вашей роли данные Opero Homes. Напишите, что именно нужно уточнить дальше, и разберём это по шагам.";
}

export async function answerWithTools(context: AIContext, rawMessage: string): Promise<AIChatResponse> {
  const message = rawMessage.replace(/\s+/g, " ").trim();
  const lower = message.toLocaleLowerCase("ru-RU");
  const results: AIToolResult[] = [];
  const dates = datesFrom(message);
  const apartmentId = message.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i)?.[0] ?? "";
  const taskId = message.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i)?.[0] ?? "";
  const wantsBookings = hasAny(lower, ["мои заявки", "мои бронирования", "my booking", "my request", "мои поездки"]);
  const wantsTasks = hasAny(lower, ["мои задачи", "задачи сегодня", "просроченные задачи", "my tasks", "overdue tasks"]);
  const wantsSummary = hasAny(lower, ["что требует внимания", "сводка", "summary", "today", "внимани сегодня"]);
  const wantsPending = hasAny(lower, ["новые заявки", "pending", "pending requests"]);
  const wantsSearch = hasAny(lower, ["найти", "жилье", "жильё", "квартир", "property", "апартамент", "ev"]);
  const wantsEmployees = hasAny(lower, ["сотрудник", "сотрудников", "employees"]);
  const wantsApartments = hasAny(lower, ["объекты организации", "все квартиры", "apartments"]);
  const wantsTaskDetails = hasAny(lower, ["детали задачи", "что сделать", "task details"]);
  const wantsCalendar = hasAny(lower, ["календарь", "занятые даты", "occupied dates"]);

  if (wantsBookings && canUseTool(context.role, "getMyBookingRequests")) {
    results.push(await getMyBookingRequests(context));
  } else if (wantsBookings && canUseTool(context.role, "getBookings")) {
    results.push(await getBookings(context));
  } else if (wantsTasks && ["employee", "cleaner", "maintenance"].includes(context.role)) {
    results.push(await getMyTasks(context));
  } else if (wantsTasks && canUseTool(context.role, "getOperationalTasks")) {
    results.push(await getOperationalTasks(context));
  } else if (canUseTool(context.role, "getMyProperties") && hasAny(lower, ["мои квартиры", "моя недвижимость", "my properties"])) {
    results.push(await getMyProperties(context));
  } else if (wantsSummary && canUseTool(context.role, "getOrganizationSummary")) {
    results.push(await getOrganizationSummary(context));
    results.push(await getOperationalTasks(context));
  } else if (wantsPending && canUseTool(context.role, "getPendingRequests")) {
    results.push(await getPendingRequests(context));
  } else if (wantsEmployees && canUseTool(context.role, "getEmployees")) {
    results.push(await getEmployees(context));
  } else if (wantsApartments && canUseTool(context.role, "getApartments")) {
    results.push(await getApartments(context));
  } else if (wantsTaskDetails && taskId && canUseTool(context.role, "getTaskDetails")) {
    results.push(await getTaskDetails(context, taskId));
  } else if (wantsCalendar && apartmentId && canUseTool(context.role, "getMyPropertyCalendar")) {
    results.push(await getMyPropertyCalendar(context, apartmentId));
  } else if (dates && apartmentId && canUseTool(context.role, "getPublicAvailability")) {
    results.push(await getPublicAvailability(context, apartmentId, dates.checkIn, dates.checkOut));
    results.push(await calculatePublicQuote(context, apartmentId, dates.checkIn, dates.checkOut, guestsFrom(message)));
  } else if (wantsSearch || !message) {
    results.push(await searchPublishedProperties(context, message));
  } else if (canUseTool(context.role, "getMyProfile") && hasAny(lower, ["профиль", "контакт", "profile", "phone", "телефон"])) {
    results.push(await getMyProfile(context));
  }

  if (results.length === 0) {
    const handoff = buildHandoff(context, message, false, true);
    const language = languageOf(message);
    const messageText = handoff.offered
      ? language === "en" ? "I don’t have enough verified information to answer this reliably. Would you like me to connect you with a manager?"
        : language === "tr" ? "Bu soruyu güvenilir şekilde yanıtlamak için doğrulanmış yeterli bilgim yok. Sizi bir yöneticiye bağlamamı ister misiniz?"
        : "У меня нет достаточно подтверждённых данных, чтобы ответить надёжно. Подключить менеджера?"
      : formatRoleMessage(context, message) + (context.role === "anonymous" ? " Укажите город, даты и количество гостей, чтобы начать поиск." : " Уточните, что именно нужно найти или проверить.");
    return { ok: true, message: messageText, role: context.role, tools: [], results: [], suggestions: suggestions(context), ...(handoff.offered ? { handoff } : {}) };
  }

  const publicResults = results.map((result) => sanitizeAiToolResultForClient(context.role, result));
  const language = languageOf(message);
  const first = results[0]?.data as Record<string, unknown> | undefined;
  const count = Array.isArray(first?.properties) ? first.properties.length : Array.isArray(first) ? first.length : null;
  const messageText = dataAnswer(language, count, results);

  const hasToolError = results.some((result) => Boolean((result.data as Record<string, unknown> | null)?.error));
  const noResult = count === 0 || publicResults.length === 0;
  const handoff = buildHandoff(context, message, hasToolError, noResult);
  return { ok: true, message: handoff.offered && (hasToolError || noResult) ? `${messageText} ${language === "en" ? "Would you like me to connect you with a manager?" : language === "tr" ? "Sizi bir yöneticiye bağlamamı ister misiniz?" : "Подключить менеджера, чтобы проверить дополнительные варианты?"}` : messageText, role: context.role, tools: publicResults.map((result) => result.tool), results: publicResults, suggestions: suggestions(context), ...(handoff.offered ? { handoff } : {}) };
}