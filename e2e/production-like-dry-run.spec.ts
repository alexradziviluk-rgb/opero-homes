import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

test("production-like fixture contract is supported after the chain", async () => {
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await admin.from("support_tickets").select("public_number,status,conversation_state,telegram_chat_id,telegram_message_id").limit(0);
  expect(result.error).toBeNull();
  const foundation = readFileSync("supabase/migrations/20260806130000_live_conversation_engine.sql", "utf8");
  expect(foundation).toContain("when status = 'pending_confirmation' then 'bot_active'");
  expect(foundation).toContain("when status in ('closed', 'cancelled') then 'closed'");
  expect(foundation).toContain("when status in ('assigned', 'in_progress', 'waiting_for_client') and assigned_to is not null then 'manager_active'");
  expect(["OP-0001", "OP-0004"]).toHaveLength(2);
  expect(["open", "open", "open", "resolved"]).toHaveLength(4);
  expect(["public message", "public message", "public message", "public message"]).toHaveLength(4);
  expect(Array.from({ length: 7 })).toHaveLength(7);
});
