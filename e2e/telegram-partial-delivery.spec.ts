import { expect, test } from "@playwright/test";
import { createSupportFixture } from "./fixtures/support-conversation-fixtures";

test.describe("Telegram partial delivery contract", () => {
  let fixture: Awaited<ReturnType<typeof createSupportFixture>>;
  test.beforeAll(async () => { fixture = await createSupportFixture(); });
  test.afterAll(async () => { if (fixture) await fixture.cleanup(); });
  test("recipient records are independent and sent rows are not duplicated", async () => {
    const ticket = fixture.activeTicket;
    await fixture.admin.from("support_telegram_deliveries").upsert([{ ticket_id: ticket, organization_id: fixture.organizationA, binding_reference: "binding-a", recipient_label: "linked-recipient-a", status: "sent", attempt_count: 1, sent_at: new Date().toISOString(), telegram_message_id: "101" }, { ticket_id: ticket, organization_id: fixture.organizationA, binding_reference: "binding-b", recipient_label: "linked-recipient-b", status: "failed", attempt_count: 1, last_error_code: "telegram_send_failed" }], { onConflict: "ticket_id,binding_reference" });
    const retry = await fixture.admin.from("support_telegram_deliveries").update({ status: "retrying", attempt_count: 2 }).eq("ticket_id", ticket).eq("binding_reference", "binding-b").eq("status", "failed");
    const rows = await fixture.admin.from("support_telegram_deliveries").select("binding_reference,status,telegram_message_id").eq("ticket_id", ticket).order("binding_reference");
    expect(retry.error).toBeNull(); expect(rows.data).toHaveLength(2); expect(rows.data?.[0]?.status).toBe("sent"); expect(rows.data?.[0]?.telegram_message_id).toBe("101"); expect(rows.data?.[1]?.status).toBe("retrying");
  });
});
