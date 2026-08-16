import type { HousingSearchContext } from "./types";

const MONTHS = [
  "январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık",
];

function monthNumber(value: string): number | null {
  const index = MONTHS.findIndex((month) => value.toLocaleLowerCase("ru-RU").startsWith(month));
  return index < 0 ? null : (index % 12) + 1;
}

function yearFor(message: string, fallback: string | null): number {
  const year = message.match(/\b(20\d{2})\b/)?.[1];
  return Number(year ?? fallback?.slice(0, 4) ?? new Date().getFullYear());
}

function dateRangeFrom(message: string, fallback: HousingSearchContext): Partial<HousingSearchContext> {
  const iso = [...message.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
  if (iso.length >= 2) return { checkIn: iso[0], checkOut: iso[1] };
  const local = [...message.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/g)].map((match) => `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`);
  if (local.length >= 2) return { checkIn: local[0], checkOut: local[1] };
  const range = message.match(/(\d{1,2})\s*(?:по|до|с|from|to|[-–])\s*(\d{1,2})?\s*(январ|феврал|март|апрел|ма[йея]|июн|июл|август|сентябр|октябр|ноябр|декабр|january|february|march|april|may|june|july|august|september|october|november|december|ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/iu);
  if (!range) return {};
  const month = monthNumber(range[3]);
  if (!month) return {};
  const year = yearFor(message, fallback.checkIn);
  const checkOutDay = range[2] ?? range[1];
  return { checkIn: `${year}-${String(month).padStart(2, "0")}-${range[1].padStart(2, "0")}`, checkOut: `${year}-${String(month).padStart(2, "0")}-${checkOutDay.padStart(2, "0")}` };
}

function singleDateFrom(message: string, fallback: HousingSearchContext): string | null {
  const normalized = message.replace(/^а\s+/iu, "");
  const match = normalized.match(/(?:с|на|from|on)\s+(\d{1,2})\s+(январ|феврал|март|апрел|ма[йея]|июн|июл|август|сентябр|октябр|ноябр|декабр|january|february|march|april|may|june|july|august|september|october|november|december|ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)(?!\s+(?:по|до))/iu);
  if (!match) return null;
  const month = monthNumber(match[2]);
  return month ? `${yearFor(message, fallback.checkIn)}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}` : null;
}

function guestsFrom(message: string): number | null {
  const match = message.match(/\b(\d+)\s*(?:гост|чел|взросл|adult|guest|person|kişi)/iu);
  if (match) return Math.max(1, Number(match[1]));
  const words: Record<string, number> = { двое: 2, трое: 3, четверо: 4, пятеро: 5, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, iki: 2, üç: 3, dört: 4, beş: 5 };
  const normalized = message.toLocaleLowerCase("ru-RU");
  const word = Object.keys(words).find((value) => normalized.includes(value));
  return word ? words[word] : null;
}

function languageFrom(message: string): "ru" | "en" | "tr" | null {
  if (/[ğüşçıöİı]/i.test(message) || /\b(merhaba|ev|misafir|rezervasyon|müsait|konut)/i.test(message)) return "tr";
  if (/\b(hello|find|property|booking|available|task|today|accommodation|adults|cheaper|near|sea)/i.test(message)) return "en";
  if (/[а-яё]/i.test(message)) return "ru";
  return null;
}

export function patchHousingSearchContext(previous: Partial<HousingSearchContext> | undefined, message: string, preferredLanguage?: "ru" | "en" | "tr"): HousingSearchContext {
  const base: HousingSearchContext = {
    checkIn: previous?.checkIn ?? null,
    checkOut: previous?.checkOut ?? null,
    guests: previous?.guests ?? null,
    maxPrice: previous?.maxPrice ?? null,
    location: previous?.location ?? null,
    preferences: previous?.preferences ?? [],
    language: previous?.language ?? "ru",
  };
  const range = dateRangeFrom(message, base);
  const singleDate = singleDateFrom(message, base);
  const budget = message.match(/(?:до|under|below|max|up to)\s*(?:€|eur|евро)?\s*(\d{2,6})/iu);
  const locationMessage = message.replace(/ближе\s+к\s+морю/iu, "");
  const location = locationMessage.match(/(?:в районе|в|у|near|in)\s+([\p{L}][\p{L}\s-]{2,30}?)(?=\s+(?:с|на|до|для|за|и|по)\b|$)/iu)?.[1]?.trim() ?? null;
  const preferences = [...(base.preferences ?? [])];
  if (/(?:дешевле|cheaper|daha ucuz)/iu.test(message) && !preferences.includes("cheaper")) preferences.push("cheaper");
  if (/(?:ближе к морю|near the sea|near sea|denize yakın)/iu.test(message) && !preferences.includes("near_sea")) preferences.push("near_sea");
  const detectedLanguage = languageFrom(message);
  const nextCheckIn = singleDate ?? range.checkIn ?? base.checkIn;
  const nextCheckOut = range.checkOut ?? (singleDate && base.checkOut && singleDate >= base.checkOut ? null : base.checkOut);
  return {
    ...base,
    ...range,
    checkIn: nextCheckIn,
    checkOut: nextCheckOut,
    guests: guestsFrom(message) ?? base.guests,
    maxPrice: budget ? Number(budget[1]) : base.maxPrice,
    location: location ?? base.location,
    preferences,
    language: preferredLanguage ?? detectedLanguage ?? base.language,
  };
}