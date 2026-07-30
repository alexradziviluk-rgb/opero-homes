import { USER_STORAGE_KEY } from "@/types/user";

export const LEGACY_AUTH_KEYS = [
  "opero-current-user",
  "opero-auth-session",
  "opero-explicitly-logged-out",
] as const;

const LEGACY_DEMO_USER_IDS = new Set([
  "demo-owner",
  "demo-admin",
  "demo-manager",
  "demo-employee",
  "demo-cleaner",
  "demo-technician",
  "demo-guest",
  // Legacy alias used in previous demo setup.
  "demo-maintenance",
]);

export function cleanupLegacyDemoAuth(): void {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of LEGACY_AUTH_KEYS) {
    window.localStorage.removeItem(key);
  }

  const rawUsers = window.localStorage.getItem(USER_STORAGE_KEY);
  if (!rawUsers) {
    return;
  }

  try {
    const parsed = JSON.parse(rawUsers) as unknown;
    if (!Array.isArray(parsed)) {
      return;
    }

    const filtered = parsed.filter((entry) => {
      if (!entry || typeof entry !== "object") {
        return true;
      }

      const id = "id" in entry ? String(entry.id ?? "") : "";
      return !LEGACY_DEMO_USER_IDS.has(id);
    });

    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // Ignore malformed legacy payloads.
  }
}
