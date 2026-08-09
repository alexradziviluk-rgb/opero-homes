import { NextResponse } from "next/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { createTelegramLinkToken } from "@/lib/telegram/link";
import { isStaffRoleCode } from "@/lib/supabase/role-code";

export async function POST() {
  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  if (!isStaffRoleCode(auth.context.organizationMember.role_code)) return NextResponse.json({ ok: false, error: "Staff access required" }, { status: 403 });
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 503 });
  const link = createTelegramLinkToken();
  const { error } = await supabase.from("support_telegram_link_tokens").insert({ organization_id: auth.context.organization.id, user_id: auth.context.authUserId, token_hash: link.tokenHash, expires_at: link.expiresAt });
  if (error) return NextResponse.json({ ok: false, error: "Не удалось создать ссылку Telegram." }, { status: 422 });
  return NextResponse.json({ ok: true, command: `/start ${link.token}`, expiresAt: link.expiresAt }, { headers: { "Cache-Control": "no-store" } });
}