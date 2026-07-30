import { NextResponse } from "next/server";
import { processNotificationQueue } from "@/lib/notifications/queue";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { getRoleCodeFromContext, isManagerRoleCode } from "@/lib/supabase/role-code";

export async function POST(request: Request) {
  void request;

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });
  }

  const auth = await requireStaffApiAuth();
  if (!auth.ok) {
    return auth.response;
  }

  const roleCode = getRoleCodeFromContext(auth.context);
  if (!isManagerRoleCode(roleCode)) {
    return NextResponse.json({ ok: false, error: "Insufficient permissions" }, { status: 403 });
  }

  try {
    const result = await processNotificationQueue({
      supabase,
      organizationId: auth.context.organization.id,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process queue";
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
