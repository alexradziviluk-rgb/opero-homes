import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = await createSupabaseServerClient();

    if (!supabase) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
    }

    const auth = await requireStaffApiAuth();
    if (!auth.ok) {
      return auth.response;
    }

    return NextResponse.json({
      ok: true,
      message: "Invitation payload accepted",
      payload: {
        ...body,
        invitedBy: auth.context.authUserId,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
