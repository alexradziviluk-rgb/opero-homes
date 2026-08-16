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
  getPublicPropertyKnowledge,
  searchPublishedProperties,
} from "./tools/read";
import { sanitizeAiToolResultForClient } from "./sanitize";
import type { AIChatResponse, AIContext, AIConversationTurn, AIToolResult, PublicSearchFilters } from "./types";
import { patchHousingSearchContext } from "./housing-context";
import { buildHandoff } from "@/lib/support/service";

function languageOf(message: string, preferred?: "ru" | "en" | "tr"): "ru" | "en" | "tr" {
  if (preferred) return preferred;
  if (/[ğüşçıöİı]/i.test(message) || /\b(merhaba|ev|misafir|rezervasyon|müsait)/i.test(message)) return "tr";
  if (/\b(hello|find|property|booking|available|task|today)\b/i.test(message)) return "en";
  return "ru";
}

function hasAny(message: string, values: string[]): boolean {
  return values.some((value) => message.includes(value));
}

function suggestions(context: AIContext, language: "ru" | "en" | "tr" = "ru"): string[] {
  if (context.role === "anonymous" || context.role === "client") {
    if (language === "en") return ["Find accommodation", "Show my requests", "Check available dates"];
    if (language === "tr") return ["Konut bul", "Taleplerimi göster", "Müsait tarihleri kontrol et"];
    return ["Найти жильё", "Показать мои заявки", "Проверить свободные даты"];
  }
  if (context.role === "property_owner") return language === "en" ? ["Show my properties", "Which dates are occupied?"] : language === "tr" ? ["Konutlarımı göster", "Hangi tarihler dolu?"] : ["Показать мои квартиры", "Какие даты заняты?"];
  if (["employee", "cleaner", "maintenance"].includes(context.role)) return language === "en" ? ["My tasks today", "What needs doing in this property?"] : language === "tr" ? ["Bugünkü görevlerim", "Bu konutta ne yapılmalı?"] : ["Мои задачи на сегодня", "Что нужно сделать в этой квартире?"];
  return language === "en" ? ["What needs attention today?", "Show new requests", "Are there overdue tasks?"] : language === "tr" ? ["Bugün neye dikkat edilmeli?", "Yeni talepleri göster", "Geciken görev var mı?"] : ["Что требует внимания сегодня?", "Показать новые заявки", "Есть ли просроченные задачи?"];
}

function formatRoleMessage(context: AIContext, message: string): string {
  const language = languageOf(message);
  const name = context.displayName ? `, ${context.displayName.split(" ")[0]}` : "";
  if (language === "en") return context.displayName ? `Welcome${name}. I use Opero Homes data available to your role.` : "I use Opero Homes data available to your role.";
  if (language === "tr") return context.displayName ? `Hoş geldiniz${name}. Opero Homes verileriyle yardımcı olabilirim.` : "Opero Homes verileriyle yardımcı olabilirim.";
  return context.displayName ? `Добро пожаловать${name}. Я работаю с доступными вашей роли данными Opero Homes.` : "Я работаю только с доступными вашей роли данными Opero Homes.";
}

function propertyAnswer(language: "ru" | "en" | "tr", properties: unknown[]): string {
  if (properties.length === 0) {
    if (language === "en") return "I couldn't find a matching published property. A manager can check additional options and availability.";
    if (language === "tr") return "Uygun yayınlanmış bir konut bulamadım. Bir yönetici ek seçenekleri ve müsaitliği kontrol edebilir.";
    return "Подходящих опубликованных квартир не нашёл. Менеджер сможет проверить дополнительные варианты и точную доступность.";
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
  if (results[0]?.tool === "getPublicPropertyKnowledge") {
    const property = (results[0].data as { property?: Record<string, unknown> } | undefined)?.property;
    if (!property) return language === "en" ? "This property information is not available." : language === "tr" ? "Bu konutun bilgileri mevcut değil." : "Информация об этом объекте недоступна.";
    const label = (key: string, fallback: string) => property[key] === "not_specified" ? fallback : String(property[key] ?? fallback);
    if (language === "en") return `${String(property.title)}. Pets: ${label("pets", "not specified")}. Smoking: ${label("smoking", "not specified")}. Check-in: ${label("checkIn", "not specified")}. Check-out: ${label("checkOut", "not specified")}. Amenities: ${Array.isArray(property.amenities) && property.amenities.length ? property.amenities.join(", ") : "not specified"}.`;
    if (language === "tr") return `${String(property.title)}. Evcil hayvan: ${label("pets", "belirtilmemiş")}. Sigara: ${label("smoking", "belirtilmemiş")}. Giriş: ${label("checkIn", "belirtilmemiş")}. Çıkış: ${label("checkOut", "belirtilmemiş")}. Olanaklar: ${Array.isArray(property.amenities) && property.amenities.length ? property.amenities.join(", ") : "belirtilmemiş"}.`;
    return `${String(property.title)}. Животные: ${label("pets", "не указано")}. Курение: ${label("smoking", "не указано")}. Заезд: ${label("checkIn", "не указано")}. Выезд: ${label("checkOut", "не указано")}. Удобства: ${Array.isArray(property.amenities) && property.amenities.length ? property.amenities.join(", ") : "не указано"}.`;
  }
  if (count !== null) return propertyAnswer(language, (results[0]?.data as { properties?: unknown[] } | undefined)?.properties ?? []);
  if (language === "en") return "I checked the Opero Homes data available to your account. Tell me what you want to inspect next, and I’ll work through it with you.";
  if (language === "tr") return "Hesabınız için mevcut Opero Homes verilerini kontrol ettim. Sırada neyi incelememi istediğinizi yazın, birlikte ilerleyelim.";
  return "Проверил доступные вашей роли данные Opero Homes. Напишите, что именно нужно уточнить дальше, и разберём это по шагам.";
}

export async function answerWithTools(context: AIContext, rawMessage: string, history: AIConversationTurn[] = [], preferredLanguage?: "ru" | "en" | "tr", previousHousingContext?: Partial<import("./types").HousingSearchContext>): Promise<AIChatResponse> {
  const message = rawMessage.replace(/\s+/g, " ").trim();
  const housingContext = patchHousingSearchContext(previousHousingContext, message, preferredLanguage);
  const contextText = [...history.filter((turn) => turn.role === "user").map((turn) => turn.text), message].join(" ");
  const lower = contextText.toLocaleLowerCase("ru-RU");
  const results: AIToolResult[] = [];
  const filters: PublicSearchFilters = housingContext;
  const apartmentId = message.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i)?.[0] ?? "";
  const taskId = message.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i)?.[0] ?? "";
  const wantsBookings = hasAny(lower, ["мои заявки", "мои бронирования", "my booking", "my request", "мои поездки"]);
  const wantsTasks = hasAny(lower, ["мои задачи", "задачи сегодня", "просроченные задачи", "my tasks", "overdue tasks"]);
  const wantsSummary = hasAny(lower, ["что требует внимания", "сводка", "summary", "today", "внимани сегодня"]);
  const wantsPending = hasAny(lower, ["новые заявки", "pending", "pending requests"]);
  const wantsSearch = hasAny(lower, ["найти", "жилье", "жильё", "квартир", "property", "апартамент", "ev", "cheaper", "дешевле", "морю", "sea"]);
  const wantsEmployees = hasAny(lower, ["сотрудник", "сотрудников", "employees"]);
  const wantsApartments = hasAny(lower, ["объекты организации", "все квартиры", "apartments"]);
  const wantsTaskDetails = hasAny(lower, ["детали задачи", "что сделать", "task details"]);
  const wantsCalendar = hasAny(lower, ["календарь", "занятые даты", "occupied dates"]);
  const wantsPropertyKnowledge = hasAny(lower, ["животн", "питом", "курить", "парков", "выезд", "заезд", "wifi", "wi-fi", "вайфай", "удобств", "amenit", "pet", "parking"]);
  const wantsManager = /менеджер|человек|оператор|сотрудник|manager|human|agent|çalışan|insan/i.test(message);
  const routeApartmentId = context.route.match(/^\/properties\/([0-9a-f-]{36})$/i)?.[1] ?? "";

  if (wantsManager) {
    const handoff = buildHandoff(context, message);
    const language = housingContext.language;
    const messageText = language === "en" ? "I can connect you with a manager. Would you like to send your request and contact details?" : language === "tr" ? "Sizi bir yöneticiye bağlayabilirim. Talebinizi ve iletişim bilgilerinizi göndermemi ister misiniz?" : "Подключу менеджера. Передать ваш запрос и контактные данные?";
    return { ok: true, message: messageText, role: context.role, tools: [], results: [], suggestions: suggestions(context, housingContext.language), housingContext, handoff };
  } else if (wantsPropertyKnowledge && routeApartmentId && canUseTool(context.role, "getPublicPropertyKnowledge")) {
    results.push(await getPublicPropertyKnowledge(context, routeApartmentId));
  } else if (wantsBookings && canUseTool(context.role, "getMyBookingRequests")) {
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
  } else if (filters.checkIn && filters.checkOut && apartmentId && canUseTool(context.role, "getPublicAvailability")) {
    results.push(await getPublicAvailability(context, apartmentId, filters.checkIn, filters.checkOut));
    results.push(await calculatePublicQuote(context, apartmentId, filters.checkIn, filters.checkOut, filters.guests ?? 1));
  } else if (wantsSearch || !message) {
    if (!filters.checkIn || !filters.checkOut) {
      const language = housingContext.language;
      return { ok: true, message: language === "en" ? "Of course. What dates are you planning?" : language === "tr" ? "Elbette. Hangi tarihler için plan yapıyorsunuz?" : "Конечно. На какие даты планируете поездку?", role: context.role, tools: [], results: [], suggestions: suggestions(context, housingContext.language), housingContext };
    }
    if (!filters.guests) {
      const language = housingContext.language;
      return { ok: true, message: language === "en" ? "How many guests will there be?" : language === "tr" ? "Kaç misafir olacak?" : "Сколько будет гостей?", role: context.role, tools: [], results: [], suggestions: suggestions(context, housingContext.language), housingContext };
    }
    results.push(await searchPublishedProperties(context, filters));
  } else if (canUseTool(context.role, "getMyProfile") && hasAny(lower, ["профиль", "контакт", "profile", "phone", "телефон"])) {
    results.push(await getMyProfile(context));
  }

  if (results.length === 0) {
    const handoff = buildHandoff(context, message);
    const language = housingContext.language;
    const messageText = handoff.offered
      ? language === "en" ? "I don’t have enough verified information to answer this reliably. Would you like me to connect you with a manager?"
        : language === "tr" ? "Bu soruyu güvenilir şekilde yanıtlamak için doğrulanmış yeterli bilgim yok. Sizi bir yöneticiye bağlamamı ister misiniz?"
        : "У меня нет достаточно подтверждённых данных, чтобы ответить надёжно. Подключить менеджера?"
      : formatRoleMessage(context, message) + (context.role === "anonymous" ? " Укажите город, даты и количество гостей, чтобы начать поиск." : " Уточните, что именно нужно найти или проверить.");
    return { ok: true, message: messageText, role: context.role, tools: [], results: [], suggestions: suggestions(context, housingContext.language), housingContext, ...(handoff.offered ? { handoff } : {}) };
  }

  const publicResults = results.map((result) => sanitizeAiToolResultForClient(context.role, result));
  const language = housingContext.language;
  const first = results[0]?.data as Record<string, unknown> | undefined;
  const count = Array.isArray(first?.properties) ? first.properties.length : Array.isArray(first) ? first.length : null;
  const messageText = dataAnswer(language, count, results);

  const hasToolError = results.some((result) => Boolean((result.data as Record<string, unknown> | null)?.error));
  const noResult = count === 0 || publicResults.length === 0;
  const handoff = buildHandoff(context, message, hasToolError);
  const finalMessage = noResult && !hasToolError
    ? language === "en" ? "I couldn't find an available home for these dates. I can change the dates, show nearby options, change the number of guests, or connect you with a manager." : language === "tr" ? "Bu tarihler için müsait bir konut bulamadım. Tarihleri, misafir sayısını değiştirebilir, yakındaki seçenekleri gösterebilir veya bir yöneticiye bağlanabilirim." : "На выбранные даты свободных вариантов не нашёл. Можно изменить даты, показать ближайшие варианты, изменить количество гостей или подключить менеджера."
    : messageText;
  return { ok: true, message: finalMessage, role: context.role, tools: publicResults.map((result) => result.tool), results: publicResults, suggestions: suggestions(context, housingContext.language), housingContext, ...(handoff.offered ? { handoff } : {}) };
}