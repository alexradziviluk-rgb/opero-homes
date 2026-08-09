import { expect, test } from "@playwright/test";
import { createSupportFixture } from "./fixtures/support-conversation-fixtures";
import { parseTelegramCallbackData } from "../lib/telegram/callback";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test("completes AI handoff, Telegram accept/reply, and close through real routes", async ({ page }) => {
  const fixture = await createSupportFixture();
  try {
    await page.goto("/staff/login", { waitUntil: "domcontentloaded" });
    const form = page.locator("form").first();
    await expect(form).toHaveAttribute("data-auth-ready", "true", { timeout: 15_000 });
    await form.locator('input[type="email"]').fill(fixture.manager1.email);
    await form.locator('input[type="password"]').fill(fixture.manager1.password);
    await form.getByRole("button", { name: "Войти" }).click();
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });

    const aiResponse = await page.request.post("/api/ai/chat", { data: { message: "Соедините меня с менеджером", route: "/account/support" } });
    const aiPayload = await aiResponse.json() as { ok?: boolean; handoff?: { offered?: boolean; actionId?: string; expiresAt?: string }; message?: string };
    expect(aiResponse.status(), JSON.stringify(aiPayload)).toBe(200);
    expect(aiPayload.handoff?.offered).toBe(true);
    expect(aiPayload.message).not.toMatch(/соединю вас|подключил менеджера/i);

    const handoffResponse = await page.request.post("/api/support/tickets", {
      data: { message: "Соедините меня с менеджером", route: "/account/support", confirmed: true, idempotencyKey: aiPayload.handoff?.actionId, actionId: aiPayload.handoff?.actionId, expiresAt: aiPayload.handoff?.expiresAt },
    });
    const handoffPayload = await handoffResponse.json() as { ok?: boolean; publicNumber?: string; deliveryStatus?: string; conversationState?: string };
    expect(handoffResponse.status(), JSON.stringify(handoffPayload)).toBe(200);
    expect(handoffPayload.ok).toBe(true);
    expect(handoffPayload.conversationState).toBe("waiting_manager");

    const ticketResult = await fixture.admin.from("support_tickets").select("id,telegram_action_token,organization_id,public_number,delivery_status,status,conversation_state,assigned_to").eq("public_number", handoffPayload.publicNumber).single();
    expect(ticketResult.error).toBeNull();
    expect(ticketResult.data?.telegram_action_token).toMatch(/^[a-f0-9]{36}$/i);
    expect(ticketResult.data?.organization_id).toBe(fixture.organizationA);
    expect(ticketResult.data).toMatchObject({ status: "open", conversation_state: "waiting_manager", assigned_to: null });
    expect(parseTelegramCallbackData(`support:accept:${ticketResult.data?.telegram_action_token}`)).not.toBeNull();
    expect(ticketResult.data?.delivery_status).toMatch(/failed|all_failed|no_recipients/);

    const telegramUserId = "91002";
    const telegramChatId = `chat-${fixture.organizationA}`;
    const updateBase = Date.now() * 10;
    const binding = await fixture.admin.from("support_telegram_bindings").insert({ organization_id: fixture.organizationA, user_id: fixture.manager2.id, telegram_user_id: telegramUserId, telegram_chat_id: telegramChatId });
    expect(binding.error).toBeNull();
    const bindingCheck = await fixture.admin.from("support_telegram_bindings").select("organization_id,user_id,telegram_user_id,telegram_chat_id,revoked_at").eq("organization_id", fixture.organizationA).eq("telegram_user_id", telegramUserId).single();
    expect(bindingCheck.data).toMatchObject({ organization_id: fixture.organizationA, user_id: fixture.manager2.id, telegram_user_id: telegramUserId, telegram_chat_id: telegramChatId, revoked_at: null });
    const reference = await fixture.admin.from("support_telegram_message_refs").insert({ ticket_id: ticketResult.data?.id, organization_id: fixture.organizationA, telegram_chat_id: telegramChatId, telegram_message_id: "notification-1" });
    expect(reference.error).toBeNull();

    const acceptResponse = await page.request.post("/api/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": "e2e-telegram-secret", "content-type": "application/json" },
      data: JSON.stringify({ update_id: updateBase + 1, callback_query: { id: "callback-1", data: `support:accept:${ticketResult.data?.telegram_action_token}`, from: { id: 91002 }, message: { message_id: 100, chat: { id: telegramChatId } } } }),
    });
    const acceptPayload = await acceptResponse.json() as { ok?: boolean; result?: string };
    expect(acceptPayload).toMatchObject({ ok: true, result: "applied" });
    const accepted = await fixture.admin.from("support_tickets").select("assigned_to,conversation_state").eq("id", ticketResult.data?.id).single();
    expect(accepted.data).toMatchObject({ assigned_to: fixture.manager2.id, conversation_state: "manager_active" });
    const acceptedReference = await fixture.admin.from("support_telegram_message_refs").select("telegram_message_id").eq("ticket_id", ticketResult.data?.id).eq("telegram_chat_id", telegramChatId).single();
    expect(acceptedReference.error).toBeNull();
    expect(acceptedReference.data?.telegram_message_id).toBeTruthy();

    const routed = await fixture.admin.rpc("support_route_telegram_message", { target_organization_id: fixture.organizationA, target_user_id: fixture.manager2.id, target_chat_id: telegramChatId, target_reply_message_id: acceptedReference.data?.telegram_message_id });
    expect(routed.error).toBeNull();
    expect(routed.data).toHaveLength(1);

    const replyResponse = await page.request.post("/api/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": "e2e-telegram-secret", "content-type": "application/json" },
      data: JSON.stringify({ update_id: updateBase + 2, message: { message_id: 101, text: "Тестовый ответ менеджера", from: { id: 91002 }, chat: { id: telegramChatId }, reply_to_message: { message_id: Number(acceptedReference.data?.telegram_message_id) } } }),
    });
    expect(await replyResponse.json()).toMatchObject({ ok: true, result: "applied" });
    const managerMessage = await fixture.admin.from("support_messages").select("message,sender_user_id,source").eq("ticket_id", ticketResult.data?.id).eq("source", "telegram").single();
    expect(managerMessage.data).toMatchObject({ message: "Тестовый ответ менеджера", sender_user_id: fixture.manager2.id, source: "telegram" });
    const duplicateReply = await page.request.post("/api/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": "e2e-telegram-secret", "content-type": "application/json" },
      data: JSON.stringify({ update_id: updateBase + 2, message: { message_id: 101, text: "Тестовый ответ менеджера", from: { id: 91002 }, chat: { id: telegramChatId }, reply_to_message: { message_id: Number(acceptedReference.data?.telegram_message_id) } } }),
    });
    expect(await duplicateReply.json()).toMatchObject({ ok: true, result: "noop", replay: true });

    const resolveResponse = await page.request.post("/api/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": "e2e-telegram-secret", "content-type": "application/json" },
      data: JSON.stringify({ update_id: updateBase + 3, callback_query: { id: "callback-2", data: `support:resolve:${ticketResult.data?.telegram_action_token}`, from: { id: 91002 }, message: { message_id: 100, chat: { id: telegramChatId } } } }),
    });
    expect(await resolveResponse.json()).toMatchObject({ ok: true, result: "applied" });

    const closeResponse = await page.request.patch("/api/admin/support", { data: { publicNumber: handoffPayload.publicNumber, status: "closed" } });
    expect(closeResponse.status(), await closeResponse.text()).toBe(200);
    const closed = await fixture.admin.from("support_tickets").select("conversation_state,closed_at").eq("id", ticketResult.data?.id).single();
    expect(closed.data?.conversation_state).toBe("closed");
    expect(closed.data?.closed_at).toBeTruthy();
    const closedReply = await page.request.post("/api/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": "e2e-telegram-secret", "content-type": "application/json" },
      data: JSON.stringify({ update_id: updateBase + 4, message: { message_id: 102, text: "Поздний ответ", from: { id: 91002 }, chat: { id: telegramChatId }, reply_to_message: { message_id: Number(acceptedReference.data?.telegram_message_id) } } }),
    });
    expect(await closedReply.json()).toMatchObject({ ok: true, result: "noop" });
    const audit = await fixture.admin.from("support_audit_log").select("action").eq("ticket_id", ticketResult.data?.id).in("action", ["created", "conversation_accepted", "message_added", "conversation_resolved", "conversation_closed"]);
    expect(audit.data?.map((row) => row.action)).toEqual(expect.arrayContaining(["conversation_accepted", "message_added"]));
    const notificationEvents = await fixture.admin.from("notification_events").select("event_type,idempotency_key").eq("organization_id", fixture.organizationA).like("idempotency_key", `support:${ticketResult.data?.id}:%`);
    expect(notificationEvents.data?.map((row) => row.event_type)).toEqual(expect.arrayContaining(["support_manager_replied", "support_conversation_closed"]));
  } finally {
    await fixture.cleanup();
  }
});

test("transitions a legacy conversation through the live state machine", async ({ page }) => {
  const fixture = await createSupportFixture();
  try {
    await page.goto("/staff/login", { waitUntil: "domcontentloaded" });
    const form = page.locator("form").first();
    await expect(form).toHaveAttribute("data-auth-ready", "true", { timeout: 15_000 });
    await form.locator('input[type="email"]').fill(fixture.manager1.email);
    await form.locator('input[type="password"]').fill(fixture.manager1.password);
    await form.getByRole("button", { name: "Войти" }).click();
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });

    const legacy = await fixture.admin.from("support_tickets").select("id,telegram_action_token,telegram_chat_id").eq("id", fixture.legacyTicket).single();
    const chatId = legacy.data?.telegram_chat_id as string;
    const actionToken = legacy.data?.telegram_action_token as string;
    const updateBase = Date.now() * 10;
    const acceptResponse = await page.request.post("/api/telegram/webhook", { headers: { "x-telegram-bot-api-secret-token": "e2e-telegram-secret", "content-type": "application/json" }, data: JSON.stringify({ update_id: updateBase + 1, callback_query: { id: "legacy-accept", data: `support:accept:${actionToken}`, from: { id: 92001 }, message: { message_id: 200, chat: { id: chatId } } } }) });
    expect(await acceptResponse.json()).toMatchObject({ ok: true, result: "applied" });
    const accepted = await fixture.admin.from("support_tickets").select("status,conversation_state,assigned_to,manager_joined_at").eq("id", fixture.legacyTicket).single();
    expect(accepted.data).toMatchObject({ status: "in_progress", conversation_state: "manager_active", assigned_to: fixture.manager1.id });
    expect(accepted.data?.manager_joined_at).toBeTruthy();

    const replyResponse = await page.request.post("/api/telegram/webhook", { headers: { "x-telegram-bot-api-secret-token": "e2e-telegram-secret", "content-type": "application/json" }, data: JSON.stringify({ update_id: updateBase + 2, message: { message_id: 201, text: "Legacy manager reply", from: { id: 92001 }, chat: { id: chatId }, reply_to_message: { message_id: "legacy-anchor" } } }) });
    expect(await replyResponse.json()).toMatchObject({ ok: true, result: "applied" });
    const managerMessage = await fixture.admin.from("support_messages").select("message,sender_user_id,source").eq("ticket_id", fixture.legacyTicket).eq("source", "telegram").single();
    expect(managerMessage.data).toMatchObject({ message: "Legacy manager reply", sender_user_id: fixture.manager1.id, source: "telegram" });

    const duplicateAccept = await page.request.post("/api/telegram/webhook", { headers: { "x-telegram-bot-api-secret-token": "e2e-telegram-secret", "content-type": "application/json" }, data: JSON.stringify({ update_id: updateBase + 3, callback_query: { id: "legacy-accept-duplicate", data: `support:accept:${actionToken}`, from: { id: 92001 }, message: { message_id: 200, chat: { id: chatId } } } }) });
    expect(await duplicateAccept.json()).toMatchObject({ ok: true, result: "noop" });
    const duplicateReply = await page.request.post("/api/telegram/webhook", { headers: { "x-telegram-bot-api-secret-token": "e2e-telegram-secret", "content-type": "application/json" }, data: JSON.stringify({ update_id: updateBase + 2, message: { message_id: 201, text: "Legacy manager reply", from: { id: 92001 }, chat: { id: chatId }, reply_to_message: { message_id: "legacy-anchor" } } }) });
    expect(await duplicateReply.json()).toMatchObject({ ok: true, result: "noop", replay: true });

    const resolveResponse = await page.request.post("/api/telegram/webhook", { headers: { "x-telegram-bot-api-secret-token": "e2e-telegram-secret", "content-type": "application/json" }, data: JSON.stringify({ update_id: updateBase + 4, callback_query: { id: "legacy-resolve", data: `support:resolve:${actionToken}`, from: { id: 92001 }, message: { message_id: 200, chat: { id: chatId } } } }) });
    expect(await resolveResponse.json()).toMatchObject({ ok: true, result: "applied" });
    const closeResponse = await page.request.patch("/api/admin/support", { data: { publicNumber: (await fixture.admin.from("support_tickets").select("public_number").eq("id", fixture.legacyTicket).single()).data?.public_number, status: "closed" } });
    expect(closeResponse.status()).toBe(200);
    const closed = await fixture.admin.from("support_tickets").select("conversation_state,closed_at").eq("id", fixture.legacyTicket).single();
    expect(closed.data?.conversation_state).toBe("closed");
    expect(closed.data?.closed_at).toBeTruthy();
    const audit = await fixture.admin.from("support_audit_log").select("action,safe_metadata").eq("ticket_id", fixture.legacyTicket);
    expect(audit.data?.map((row) => row.action)).toEqual(expect.arrayContaining(["conversation_accepted", "message_added", "conversation_resolved", "conversation_closed"]));
  } finally {
    await fixture.cleanup();
  }
});