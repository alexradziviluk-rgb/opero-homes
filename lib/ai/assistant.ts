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
import type { AIChatResponse, AIContext, AIToolResult } from "./types";

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
    return { ok: true, message: formatRoleMessage(context, message) + (context.role === "anonymous" ? " Укажите город, даты и количество гостей, чтобы начать поиск." : " Выберите один из быстрых запросов или уточните, что нужно найти."), role: context.role, tools: [], results: [], suggestions: suggestions(context) };
  }

  const language = languageOf(message);
  const first = results[0]?.data as Record<string, unknown> | undefined;
  const count = Array.isArray(first?.properties) ? first.properties.length : Array.isArray(first) ? first.length : null;
  const messageText = language === "en"
    ? count !== null ? `I found ${count} published properties. Only public catalog data is shown.` : "Here is the latest data available to your role."
    : language === "tr"
    ? count !== null ? `${count} yayınlanmış konut buldum. Yalnızca herkese açık katalog verileri gösteriliyor.` : "Rolünüz için mevcut son veriler burada."
    : count !== null ? `Нашёл объектов: ${count}. Показаны только опубликованные объекты публичного каталога.` : "Вот актуальные данные, доступные вашей роли.";

  return { ok: true, message: messageText, role: context.role, tools: results.map((result) => result.tool), results, suggestions: suggestions(context) };
}