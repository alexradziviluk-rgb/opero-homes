import { expect, test } from "@playwright/test";
import { createSupportFixture } from "./fixtures/support-conversation-fixtures";

test.describe("anonymous rate limit contract", () => {
  let fixture: Awaited<ReturnType<typeof createSupportFixture>>;
  test.beforeAll(async () => { fixture = await createSupportFixture(); });
  test.afterAll(async () => { if (fixture) await fixture.cleanup(); });
  test("burst is blocked while valid traffic and isolated scopes remain allowed", async () => {
    const scope = `run-${Date.now()}-${crypto.randomUUID()}`;
    const first = await fixture.admin.rpc("support_check_anonymous_rate_limit", { scope_keys: [`ip:test-a-${scope}`, `conversation:test-a-${scope}`], target_endpoint: "message", limit_count: 2, window_seconds: 60 });
    const second = await fixture.admin.rpc("support_check_anonymous_rate_limit", { scope_keys: [`ip:test-a-${scope}`, `conversation:test-a-${scope}`], target_endpoint: "message", limit_count: 2, window_seconds: 60 });
    const blocked = await fixture.admin.rpc("support_check_anonymous_rate_limit", { scope_keys: [`ip:test-a-${scope}`, `conversation:test-a-${scope}`], target_endpoint: "message", limit_count: 2, window_seconds: 60 });
    const otherIp = await fixture.admin.rpc("support_check_anonymous_rate_limit", { scope_keys: [`ip:test-b-${scope}`, `conversation:test-b-${scope}`], target_endpoint: "message", limit_count: 2, window_seconds: 60 });
    expect(first.error).toBeNull(); expect(second.data?.[0]?.allowed).toBe(true); expect(blocked.data?.[0]?.allowed).toBe(false); expect(otherIp.data?.[0]?.allowed).toBe(true);
  });
  test("token brute-force scopes are independently throttled", async () => {
    const scope = `token:brute-${Date.now()}-${crypto.randomUUID()}`;
    const attempts = [];
    for (let index = 0; index < 6; index += 1) attempts.push(await fixture.admin.rpc("support_check_anonymous_rate_limit", { scope_keys: [scope], target_endpoint: "access", limit_count: 2, window_seconds: 60 }));
    expect(attempts.some((result) => result.data?.[0]?.allowed === false)).toBe(true);
  });
});
