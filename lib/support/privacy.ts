const secretPatterns = [/\bsk-[A-Za-z0-9_-]+\b/gi, /Bearer\s+[A-Za-z0-9._-]+/gi, /\b(?:password|token|cookie|secret|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi];
const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

export function sanitizeSupportText(value: string, maxLength = 700): string {
  let result = value.replace(/\s+/g, " ").trim();
  for (const pattern of secretPatterns) result = result.replace(pattern, "[скрыто]");
  return result.replace(uuidPattern, "[внутренний идентификатор]").slice(0, maxLength);
}

export function sanitizeSupportSummary(value: string): string {
  return sanitizeSupportText(value, 500);
}
