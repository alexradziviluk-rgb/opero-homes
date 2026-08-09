import type { SupportPriority } from "@/lib/support/types";

export const AI_INTENTS = [
  "GENERAL_QUESTION",
  "BOOKING_QUESTION",
  "BOOKING_CHANGE",
  "CANCELLATION",
  "PAYMENT",
  "REFUND",
  "CHECK_IN",
  "CHECK_OUT",
  "ACCESS_PROBLEM",
  "CLEANING",
  "MAINTENANCE",
  "URGENT_MAINTENANCE",
  "NO_POWER",
  "NO_WATER",
  "LOCKED_OUT",
  "NOISE_COMPLAINT",
  "HOUSE_RULES",
  "PROPERTY_INFORMATION",
  "HUMAN_MANAGER",
  "UNKNOWN",
] as const;

export type AiIntent = (typeof AI_INTENTS)[number];
export type AiAction = "ANSWER" | "BOOKING_DATA" | "CREATE_MAINTENANCE_TASK" | "CREATE_CLEANING_TASK" | "URGENT_HANDOFF" | "MANAGER_HANDOFF" | "CLARIFY";

export type AiIntentClassification = {
  intent: AiIntent;
  action: AiAction;
  priority: SupportPriority;
  subject: string;
  operational: boolean;
};

function has(message: string, patterns: RegExp): boolean {
  return patterns.test(message);
}

export function classifyAiIntent(rawMessage: string): AiIntentClassification {
  const message = rawMessage.toLocaleLowerCase("ru-RU");
  if (has(message, /пожар|дым|запах газа|газ\b|затоп|серьёзн.*утеч|serious leak|fire|smoke|gas leak|flood|yangın|gaz kokusu|su bas/iu)) return { intent: "URGENT_MAINTENANCE", action: "URGENT_HANDOFF", priority: "urgent", subject: "Срочная проблема на объекте", operational: true };
  if (has(message, /заперт|заперта|не могу попасть|не попасть|locked out|cannot enter|can't enter|kapıda kald|giremiyorum/iu)) return { intent: "LOCKED_OUT", action: "URGENT_HANDOFF", priority: "urgent", subject: "Гость не может попасть в объект", operational: true };
  if (has(message, /не работает замок|ключ не|не открывается|access problem|access issue|cannot access|giriş sorunu/iu)) return { intent: "ACCESS_PROBLEM", action: "URGENT_HANDOFF", priority: "urgent", subject: "Проблема с доступом в объект", operational: true };
  if (has(message, /нет электр|нет света|обесточ|no power|no electricity|electricity is out|elektrik yok/iu)) return { intent: "NO_POWER", action: "URGENT_HANDOFF", priority: "urgent", subject: "Нет электричества на объекте", operational: true };
  if (has(message, /нет воды|вода пропал|no water|water is out|su yok/iu)) return { intent: "NO_WATER", action: "URGENT_HANDOFF", priority: "urgent", subject: "Нет воды на объекте", operational: true };
  if (has(message, /менеджер|человек|оператор|сотрудник|manager|human|agent|insan/iu)) return { intent: "HUMAN_MANAGER", action: "MANAGER_HANDOFF", priority: "normal", subject: "Запрос менеджера", operational: false };
  if (has(message, /отмен|cancel|cancellation|отменить брон/iu)) return { intent: "CANCELLATION", action: "MANAGER_HANDOFF", priority: "high", subject: "Запрос на отмену бронирования", operational: false };
  if (has(message, /возврат|refund|вернуть деньги|iade/iu)) return { intent: "REFUND", action: "MANAGER_HANDOFF", priority: "high", subject: "Запрос на возврат", operational: false };
  if (has(message, /оплат|платёж|payment|card|карта/iu)) return { intent: "PAYMENT", action: "MANAGER_HANDOFF", priority: "high", subject: "Финансовый вопрос", operational: false };
  if (has(message, /брон|брониров|booking|reservation|rezervasyon/iu) && has(message, /измен|перенес|дата|change|modify/iu)) return { intent: "BOOKING_CHANGE", action: "MANAGER_HANDOFF", priority: "high", subject: "Изменение бронирования", operational: false };
  if (has(message, /брон|брониров|booking|reservation|rezervasyon/iu)) return { intent: "BOOKING_QUESTION", action: "BOOKING_DATA", priority: "normal", subject: "Вопрос по бронированию", operational: false };
  if (has(message, /заезд|заселен|check.?in|giriş/iu)) return { intent: "CHECK_IN", action: "BOOKING_DATA", priority: "normal", subject: "Вопрос по заезду", operational: false };
  if (has(message, /выезд|выселен|check.?out|çıkış/iu)) return { intent: "CHECK_OUT", action: "BOOKING_DATA", priority: "normal", subject: "Вопрос по выезду", operational: false };
  if (has(message, /шум|громк|noise|party|вечерин/iu)) return { intent: "NOISE_COMPLAINT", action: "MANAGER_HANDOFF", priority: "high", subject: "Жалоба на шум", operational: false };
  if (has(message, /полотен|бель|уборк|clean|towel|linen|temiz/iu)) return { intent: "CLEANING", action: "CREATE_CLEANING_TASK", priority: "normal", subject: "Запрос на уборку или принадлежности", operational: true };
  if (has(message, /кондиционер|слом|не работает|ремонт|maintenance|broken|repair|bozuk/iu)) return { intent: "MAINTENANCE", action: "CREATE_MAINTENANCE_TASK", priority: "high", subject: "Проблема обслуживания объекта", operational: true };
  if (has(message, /правил|курить|курен|животн|pet|smok|house rule/iu)) return { intent: "HOUSE_RULES", action: "ANSWER", priority: "normal", subject: "Правила объекта", operational: false };
  if (has(message, /адрес|парков|wifi|wi-fi|вайфай|удобств|amenit|address/iu)) return { intent: "PROPERTY_INFORMATION", action: "ANSWER", priority: "normal", subject: "Информация об объекте", operational: false };
  if (has(message, /общ|вопрос|help|помог|привет|hello/iu)) return { intent: "GENERAL_QUESTION", action: "ANSWER", priority: "normal", subject: "Общий вопрос", operational: false };
  return { intent: "UNKNOWN", action: "CLARIFY", priority: "normal", subject: "Неуточнённый запрос", operational: false };
}
