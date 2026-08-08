import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("Telegram identities allow one active user and one active chat", () => {
  const sql = readFileSync("supabase/migrations/20260806180000_telegram_staff_binding_and_routing.sql", "utf8");
  const rpc = readFileSync("supabase/migrations/20260806160000_live_chat_rpc_and_security.sql", "utf8");
  expect(sql).toContain("support_telegram_bindings_active_user_unique");
  expect(sql).toContain("support_telegram_bindings_active_chat_unique");
  expect(sql).toContain("where revoked_at is null");
  expect(rpc).toContain("revoked_at = null");
  expect(sql).toContain("binding.revoked_at is null");
});
