import { expect, test } from "@playwright/test";
import { canClientSend, canManagerSend, transitionConversation } from "../lib/support/conversation";

test.describe("support state machine", () => {
  test("only the ordered T2 transitions apply", () => {
    expect(transitionConversation("bot_active", "waiting_manager").result).toBe("applied");
    expect(transitionConversation("waiting_manager", "manager_active").result).toBe("applied");
    expect(transitionConversation("manager_active", "resolved").result).toBe("applied");
    expect(transitionConversation("resolved", "closed").result).toBe("applied");
    expect(transitionConversation("closed", "bot_active").result).toBe("noop");
    expect(canClientSend("waiting_manager")).toBe(true);
    expect(canClientSend("closed")).toBe(false);
    expect(canManagerSend("manager_active")).toBe(true);
    expect(canManagerSend("waiting_manager")).toBe(false);
  });
});
