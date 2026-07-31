import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });

  const { error } = await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });

  return NextResponse.json({ ok: true });
}
