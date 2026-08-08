import { expect, test } from "@playwright/test";
import { clientForTest, createSupportFixture } from "./fixtures/support-conversation-fixtures";

test.describe("support conversation DB RLS", () => {
  let fixture: Awaited<ReturnType<typeof createSupportFixture>>;
  test.beforeAll(async () => { fixture = await createSupportFixture(); });
  test.afterAll(async () => { if (fixture) await fixture.cleanup(); });

  test("client isolation and public-message filtering hold", async () => {
    const clientA = clientForTest();
    expect((await clientA.auth.signInWithPassword({ email: fixture.clientA.email, password: fixture.clientA.password })).error).toBeNull();
    const own = await clientA.from("support_tickets").select("id,public_number").eq("id", fixture.activeTicket);
    const other = await clientA.from("support_tickets").select("id").eq("id", fixture.otherOrgTicket);
    expect(own.error).toBeNull(); expect(own.data).toHaveLength(1); expect(other.data).toHaveLength(0);
    const messages = await clientA.from("support_messages").select("message,is_internal").eq("ticket_id", fixture.activeTicket);
    expect(messages.error).toBeNull(); expect(messages.data).toEqual([{ message: "Public message", is_internal: false }]);
  });

  test("organization managers see their organization and employees only assigned tickets", async () => {
    const manager = clientForTest();
    expect((await manager.auth.signInWithPassword({ email: fixture.manager1.email, password: fixture.manager1.password })).error).toBeNull();
    const managerTickets = await manager.from("support_tickets").select("id").in("id", [fixture.activeTicket, fixture.waitingTicket, fixture.otherOrgTicket]);
    expect(managerTickets.data?.map((row) => row.id).sort()).toEqual([fixture.activeTicket, fixture.waitingTicket].sort());
    const employee = clientForTest();
    expect((await employee.auth.signInWithPassword({ email: fixture.employee.email, password: fixture.employee.password })).error).toBeNull();
    const employeeTickets = await employee.from("support_tickets").select("id").in("id", [fixture.activeTicket, fixture.waitingTicket]);
    expect(employeeTickets.data).toHaveLength(0);
  });

  test("anonymous client cannot enumerate support tickets", async () => {
    const anonymous = clientForTest();
    const result = await anonymous.from("support_tickets").select("id");
    expect(result.error).toBeNull(); expect(result.data).toEqual([]);
  });

  test("property-style absence of support membership does not grant support access", async () => {
    const result = await fixture.admin.from("support_tickets").select("id").eq("id", fixture.otherOrgTicket);
    expect(result.error).toBeNull(); expect(result.data).toHaveLength(1);
  });
});
