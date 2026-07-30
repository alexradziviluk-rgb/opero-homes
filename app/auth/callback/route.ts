import { NextResponse } from "next/server";
import { createSupabaseServerClient, getServerCurrentUserContext } from "@/lib/supabase/server";
import { getAdminNextPath, getGuestNextPath, sanitizeNextPath } from "@/lib/auth/next-route";
import { getRoleCodeFromContext, isStaffRoleCode } from "@/lib/supabase/role-code";

type CallbackErrorCode =
  | "callback_code_missing"
  | "callback_exchange_failed"
  | "session_missing"
  | "profile_provision_failed"
  | "unsafe_next"
  | "access_denied";

function toLoginUrl(baseUrl: URL, errorCode: CallbackErrorCode, next: string | null): URL {
  const target = new URL("/guest/login", baseUrl);
  target.searchParams.set("error", errorCode);

  if (next) {
    target.searchParams.set("next", next);
  }

  return target;
}

function isAdminInternalPath(value: string): boolean {
  return (
    value === "/admin" ||
    value.startsWith("/admin/") ||
    value.startsWith("/apartments") ||
    value.startsWith("/bookings") ||
    value.startsWith("/calendar") ||
    value.startsWith("/clients") ||
    value.startsWith("/users") ||
    value.startsWith("/customers") ||
    value.startsWith("/settings") ||
    value.startsWith("/notifications")
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawNext = url.searchParams.get("next");
  const safeNext = sanitizeNextPath(rawNext);

  if (rawNext && !safeNext) {
    return NextResponse.redirect(toLoginUrl(url, "unsafe_next", null));
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(toLoginUrl(url, "callback_code_missing", safeNext));
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(toLoginUrl(url, "callback_exchange_failed", safeNext));
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(toLoginUrl(url, "callback_exchange_failed", safeNext));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(toLoginUrl(url, "session_missing", safeNext));
  }

  const contextResult = await getServerCurrentUserContext();
  const context = contextResult.currentUserContext;

  if (!context) {
    if (contextResult.errorCode === "profile_missing") {
      return NextResponse.redirect(toLoginUrl(url, "profile_provision_failed", safeNext));
    }

    return NextResponse.redirect(toLoginUrl(url, "access_denied", safeNext));
  }

  const hasMembership = Boolean(context.organizationMember);
  const isStaff = hasMembership && isStaffRoleCode(getRoleCodeFromContext(context));

  if (isStaff) {
    const next = getAdminNextPath(safeNext);
    const target = isAdminInternalPath(next) ? next : "/admin";
    return NextResponse.redirect(new URL(target, url));
  }

  const guestNext = getGuestNextPath(safeNext);
  return NextResponse.redirect(new URL(guestNext, url));
}
