import { createHash, randomBytes } from "node:crypto";

export function createTelegramLinkToken(): { token: string; tokenHash: string; expiresAt: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
}

export function hashTelegramLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}