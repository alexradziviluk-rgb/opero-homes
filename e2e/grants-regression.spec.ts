import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("T2 RPC grants stay service-role-only", () => {
  const sql = readFileSync("supabase/migrations/20260806160000_live_chat_rpc_and_security.sql", "utf8");
  const routingSql = readFileSync("supabase/migrations/20260806180000_telegram_staff_binding_and_routing.sql", "utf8");
  const hardeningSql = readFileSync("supabase/migrations/20260808190000_telegram_binding_rls_hardening.sql", "utf8");
  expect(sql).toContain("revoke execute on function public.support_create_message");
  expect(sql).toContain("grant execute on function public.support_create_message");
  expect(sql).toContain("grant execute on function public.support_accept_conversation");
  expect(routingSql).toContain("grant execute on function public.support_route_telegram_message");
  expect(sql).toContain("to service_role");
  expect(hardeningSql).toContain("enable row level security");
  expect(hardeningSql).toContain("revoke all on table public.support_telegram_link_tokens from public, anon, authenticated");
  expect(hardeningSql).toContain("revoke all on table public.support_telegram_bindings from public, anon, authenticated");
  expect(hardeningSql).not.toContain("create policy");
  expect(hardeningSql).toContain("grant execute on function public.support_route_telegram_message");
});

test("authenticated read grants target the production guest model", () => {
  const sql = readFileSync("supabase/migrations/20260808191000_authenticated_read_grants.sql", "utf8");
  expect(sql).toContain("public.guests");
  expect(sql).not.toContain("public.clients");
});
