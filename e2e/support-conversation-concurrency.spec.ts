import { expect, test } from "@playwright/test";
import { createSupportFixture } from "./fixtures/support-conversation-fixtures";

test.describe("support conversation DB concurrency", () => {
  let fixture: Awaited<ReturnType<typeof createSupportFixture>>;
  test.beforeAll(async () => { fixture = await createSupportFixture(); });
  test.afterAll(async () => { if (fixture) await fixture.cleanup(); });

  test("concurrent accepts apply exactly once", async () => {
    const results = await Promise.all([1, 2].map(() => fixture.admin.rpc("support_accept_conversation", { target_ticket_id: fixture.waitingTicket, manager_user_id: fixture.manager1.id })));
    expect(results.filter((result) => result.error).length).toBe(0);
    expect(results.filter((result) => Array.isArray(result.data) && result.data.length === 1)).toHaveLength(1);
    const ticket = await fixture.admin.from("support_tickets").select("assigned_to,conversation_state").eq("id", fixture.waitingTicket).single();
    expect(ticket.data).toMatchObject({ assigned_to: fixture.manager1.id, conversation_state: "manager_active" });
  });

  test("concurrent resolve and close preserve ordered transitions", async () => {
    const resolves = await Promise.all([1, 2].map(() => fixture.admin.rpc("support_transition_conversation", { target_ticket_id: fixture.activeTicket, expected_state: "manager_active", next_state: "resolved", actor_user_id: fixture.manager1.id })));
    expect(resolves.filter((result) => Array.isArray(result.data) && result.data.length === 1)).toHaveLength(1);
    const closes = await Promise.all([1, 2].map(() => fixture.admin.rpc("support_transition_conversation", { target_ticket_id: fixture.activeTicket, expected_state: "resolved", next_state: "closed", actor_user_id: fixture.manager1.id })));
    expect(closes.filter((result) => Array.isArray(result.data) && result.data.length === 1)).toHaveLength(1);
    const ticket = await fixture.admin.from("support_tickets").select("conversation_state").eq("id", fixture.activeTicket).single();
    expect(ticket.data?.conversation_state).toBe("closed");
  });

  test("concurrent identical client messages are idempotent", async () => {
    const clientMessageId = `concurrent-${Date.now()}`;
    const inserts = await Promise.all([1, 2].map(() => fixture.admin.from("support_messages").insert({ ticket_id: fixture.waitingTicket, client_message_id: clientMessageId, sender_type: "client", sender_user_id: fixture.clientA.id, message: "same", message_type: "text", content_type: "text", source: "web", is_internal: false })));
    expect(inserts.filter((result) => !result.error)).toHaveLength(1);
    expect(inserts.filter((result) => result.error?.code === "23505")).toHaveLength(1);
  });
});
