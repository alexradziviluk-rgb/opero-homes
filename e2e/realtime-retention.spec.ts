import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("Realtime events have bounded payloads and documented cleanup", () => {
  const sql = readFileSync("supabase/migrations/20260806170000_live_chat_realtime.sql", "utf8");
  expect(sql).toContain("support_realtime_events_public_message_size_check");
  expect(sql).toContain("idx_support_realtime_events_public_number_created");
  expect(sql).toContain("support_cleanup_realtime_events");
  expect(sql).toContain("retention interval must be between 1 and 365 days");
  expect(sql).toContain("replica identity default");
  expect(sql).not.toContain("is_internal");
});
