export type AIAssistantRole =
  | "anonymous"
  | "client"
  | "property_owner"
  | "employee"
  | "cleaner"
  | "maintenance"
  | "manager"
  | "admin";

export type AIContext = {
  role: AIAssistantRole;
  userId: string | null;
  organizationId: string | null;
  displayName: string | null;
  email: string | null;
  route: string;
  allowedTools: readonly string[];
};

export type AIConversationTurn = {
  role: "user" | "assistant";
  text: string;
};

export type PublicSearchFilters = {
  checkIn: string | null;
  checkOut: string | null;
  guests: number | null;
  maxPrice: number | null;
  location: string | null;
};

export type AIToolResult = {
  tool: string;
  data: unknown;
  source?: string;
};

export type AIChatResponse = {
  ok: true;
  message: string;
  role: AIAssistantRole;
  tools: string[];
  results: AIToolResult[];
  suggestions: string[];
  intent?: string;
  action?: string;
  operationalAction?: {
    ok: boolean;
    taskReference?: string;
    ticketReference?: string;
    duplicate?: boolean;
    fallbackUsed?: boolean;
    reason?: string;
  };
  handoff?: import("@/lib/support/types").SupportHandoff;
};