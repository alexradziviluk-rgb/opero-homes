const DEFAULT_GUEST_ROUTE = "/guest";
const DEFAULT_ADMIN_ROUTE = "/admin";

function hasProtocolLikePrefix(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

export function sanitizeNextPath(next: string | null | undefined): string | null {
  if (!next) {
    return null;
  }

  const trimmed = next.trim();
  if (!trimmed) {
    return null;
  }

  if (!trimmed.startsWith("/")) {
    return null;
  }

  if (trimmed.startsWith("//")) {
    return null;
  }

  if (hasProtocolLikePrefix(trimmed)) {
    return null;
  }

  return trimmed;
}

export function getGuestNextPath(next: string | null | undefined): string {
  const safe = sanitizeNextPath(next);
  if (!safe) {
    return DEFAULT_GUEST_ROUTE;
  }

  if (safe.startsWith("/admin") || safe.startsWith("/apartments") || safe.startsWith("/bookings") || safe.startsWith("/calendar") || safe.startsWith("/clients") || safe.startsWith("/users") || safe.startsWith("/customers")) {
    return DEFAULT_GUEST_ROUTE;
  }

  return safe;
}

export function getAdminNextPath(next: string | null | undefined): string {
  const safe = sanitizeNextPath(next);
  if (!safe) {
    return DEFAULT_ADMIN_ROUTE;
  }

  return safe;
}
