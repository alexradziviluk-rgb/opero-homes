import "server-only";

import { NextResponse } from "next/server";
import { getServerAuthState } from "@/lib/supabase/server-auth";
import type { CurrentUserContext } from "@/types/auth-context";

type StaffCurrentUserContext = CurrentUserContext & {
  organization: NonNullable<CurrentUserContext["organization"]>;
  organizationMember: NonNullable<CurrentUserContext["organizationMember"]>;
};

export type StaffApiAuthResult =
  | { ok: true; context: StaffCurrentUserContext }
  | { ok: false; response: NextResponse };

export async function requireStaffApiAuth(): Promise<StaffApiAuthResult> {
  const authState = await getServerAuthState();

  if (!authState.isAuthenticated) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 }),
    };
  }

  if (!authState.isStaff || !authState.context?.organization) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Insufficient permissions" }, { status: 403 }),
    };
  }

  return { ok: true, context: authState.context as StaffCurrentUserContext };
}
