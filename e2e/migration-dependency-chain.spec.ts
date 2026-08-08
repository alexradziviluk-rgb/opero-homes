import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const root = "supabase/migrations/";
const files = [
  "20260806130000_live_conversation_engine.sql",
  "20260806140000_live_manager_chat.sql",
  "20260806150000_live_chat_schema_foundation.sql",
  "20260806160000_live_chat_rpc_and_security.sql",
  "20260806170000_live_chat_realtime.sql",
  "20260806180000_telegram_staff_binding_and_routing.sql",
];

test("Phase T2 dependency chain is ordered and has canonical owners", () => {
  const sql = files.map((file) => readFileSync(`${root}${file}`, "utf8"));
  expect(sql).toHaveLength(6);
  expect(sql[0]).toContain("update public.support_tickets");
  expect(sql[1]).toContain("support_create_conversation_with_initial_message");
  expect(sql[2]).toContain("delivery_state");
  expect(sql[3]).toContain("support_transition_conversation");
  expect(sql[4]).toContain("support_cleanup_realtime_events");
  expect(sql[5]).toContain("support_route_telegram_message");
  expect(sql[0]).not.toContain("create or replace function public.support_transition_conversation");
  expect(sql[2]).not.toContain("create table if not exists public.support_telegram_deliveries");
});
