import { NextRequest, NextResponse } from "next/server";
import { getServerAuthState } from "@/lib/supabase/server-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isGuestRole(role: string | null | undefined): boolean {
  const normalized = (role ?? "").trim().toLowerCase();
  return normalized === "guest" || normalized === "гость";
}

export async function POST(request: NextRequest) {
  const authState = await getServerAuthState();
  if (!authState.isAuthenticated) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  if (!authState.context || !isGuestRole(authState.context.profile.role)) return NextResponse.json({ ok: false, error: "Guest access required" }, { status: 403 });

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });

  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return NextResponse.json({ ok: false, error: "Укажите корректный email" }, { status: 400 });
  }

  const { error } = await supabase.auth.updateUser({ email });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });

  return NextResponse.json({ ok: true, emailConfirmationRequired: true });
}