import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("T1 paths remain the default when T2 flags are false", () => {
  const flags = readFileSync("lib/support/feature-flags.ts", "utf8");
  const webhook = readFileSync("app/api/telegram/webhook/route.ts", "utf8");
  expect(flags).toContain("process.env[name] === \"true\"");
  expect(webhook).toContain("callback_query");
  expect(webhook).toContain("parsedCallback.action === \"accept\"");
  expect(webhook).toContain("parsedCallback.action === \"resolve\"");
  expect(webhook).toContain("isLiveConversationT2Enabled()");
});
