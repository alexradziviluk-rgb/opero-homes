import { getServerAuthState } from "@/lib/supabase/server-auth";
import { getRoleCodeFromContext, normalizeRoleCode } from "@/lib/supabase/role-code";
import { AI_TOOL_PERMISSIONS } from "./permissions";
import type { AIContext, AIAssistantRole } from "./types";

function resolveRole(isAuthenticated: boolean, roleCode: string, isPropertyOwner: boolean): AIAssistantRole {
  if (!isAuthenticated) return "anonymous";
  if (isPropertyOwner && !roleCode) return "property_owner";
  if (roleCode === "owner") return "admin";
  if (roleCode === "manager") return "manager";
  if (roleCode === "cleaner") return "cleaner";
  if (roleCode === "maintenance") return "maintenance";
  if (roleCode === "employee") return "employee";
  return "client";
}

export async function getAIContext(route = "/"): Promise<AIContext> {
  const auth = await getServerAuthState();
  const context = auth.context;
  const roleCode = context ? normalizeRoleCode(getRoleCodeFromContext(context)) : "";
  const role = resolveRole(auth.isAuthenticated, roleCode, auth.isPropertyOwner);
  const firstName = context?.profile.first_name?.trim() ?? "";
  const lastName = context?.profile.last_name?.trim() ?? "";

  return {
    role,
    userId: context?.authUserId ?? null,
    organizationId: context?.organization?.id ?? null,
    displayName: [firstName, lastName].filter(Boolean).join(" ") || context?.authEmail?.split("@")[0] || null,
    email: context?.authEmail ?? null,
    route: route.startsWith("/") ? route.slice(0, 120) : "/",
    allowedTools: AI_TOOL_PERMISSIONS[role],
  };
}