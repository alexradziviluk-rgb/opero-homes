import type { AIAssistantRole } from "./types";

export const AI_TOOL_PERMISSIONS: Record<AIAssistantRole, readonly string[]> = {
  anonymous: ["searchPublishedProperties", "getPublicAvailability", "calculatePublicQuote", "getPublicPropertyKnowledge", "startBookingFlow"],
  client: ["searchPublishedProperties", "getPublicAvailability", "calculatePublicQuote", "getPublicPropertyKnowledge", "startBookingFlow", "getMyProfile", "getMyBookingRequests"],
  property_owner: ["getMyProperties", "getMyPropertyCalendar"],
  employee: ["getMyTasks", "getTaskDetails"],
  cleaner: ["getMyTasks", "getTaskDetails"],
  maintenance: ["getMyTasks", "getTaskDetails"],
  manager: ["getOrganizationSummary", "getBookings", "getPendingRequests", "getApartments", "getEmployees", "getOperationalTasks"],
  admin: ["getOrganizationSummary", "getBookings", "getPendingRequests", "getApartments", "getEmployees", "getOperationalTasks"],
};

export function canUseTool(role: AIAssistantRole, tool: string): boolean {
  return AI_TOOL_PERMISSIONS[role].includes(tool);
}