import { NextResponse, type NextRequest } from "next/server";
import { getAdminNextPath, getGuestNextPath } from "@/lib/auth/next-route";
import { loadCurrentUserContext } from "@/lib/supabase/current-user";
import {
  createSupabaseMiddlewareClient,
  isClientProtectedPath,
  isProtectedPath,
  isPublicPath,
} from "@/lib/supabase/middleware";
import { logServerAuthError } from "@/lib/supabase/server-auth-log";
import { hasStaffMembership } from "@/lib/supabase/role-code";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const currentPathWithSearch = `${pathname}${request.nextUrl.search}`;
  const isStaffAuthRoute = pathname === "/staff/login";
  const isGuestAuthRoute = pathname === "/guest/login" || pathname === "/guest/register";
  const isAuthRoute = isStaffAuthRoute || isGuestAuthRoute;

  if (pathname === "/owner/invite") {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (!isAuthRoute && isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const middlewareClient = createSupabaseMiddlewareClient(request);
  const { supabase } = middlewareClient;

  function redirectTo(targetPath: string, nextPath?: string) {
    const targetUrl = new URL(targetPath, request.url);

    if (nextPath) {
      targetUrl.searchParams.set("next", nextPath);
    }

    if (targetUrl.pathname === pathname && targetUrl.search === request.nextUrl.search) {
      return middlewareClient.response;
    }

    return NextResponse.redirect(targetUrl);
  }

  function redirectToStaffLogin(nextPath?: string) {
    return redirectTo("/staff/login", nextPath);
  }

  if (!supabase) {
    logServerAuthError({
      stage: "session",
      message: "Supabase middleware client is not configured.",
      code: "supabase_not_configured",
    });

    if (isAuthRoute) {
      return middlewareClient.response;
    }

    if (isProtectedPath(pathname)) {
      return redirectToStaffLogin(currentPathWithSearch);
    }

    if (isClientProtectedPath(pathname)) {
      return redirectTo("/guest/login", currentPathWithSearch);
    }

    return middlewareClient.response;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error && !isAuthRoute) {
    logServerAuthError({
      stage: "session",
      message: error.message,
      code: error.code,
    });
  }

  if (!user && isAuthRoute) {
    return middlewareClient.response;
  }

  if (!user && isProtectedPath(pathname)) {
    logServerAuthError({
      stage: "session",
      message: "No authenticated user found for protected route.",
      code: "cookie_session_error",
    });

    return redirectToStaffLogin(currentPathWithSearch);
  }

  if (!user && isClientProtectedPath(pathname)) {
    logServerAuthError({
      stage: "session",
      message: "No authenticated user found for protected guest route.",
      code: "cookie_session_error",
    });

    return redirectTo("/guest/login", currentPathWithSearch);
  }

  let isGuestUser = false;
  let hasMembership = false;
  let hasAllowedStaffRole = false;
  let isPropertyOwner = false;

  if (user && (isProtectedPath(pathname) || isClientProtectedPath(pathname) || isAuthRoute)) {
    const isOwnerPortalPath = pathname === "/owner" || pathname.startsWith("/owner/") || pathname === "/account/properties" || pathname.startsWith("/account/properties/");
    if (isOwnerPortalPath) {
      const { data: ownerAccess } = await supabase.rpc("is_active_property_owner_user");
      isPropertyOwner = Boolean(ownerAccess);
    }

    const loaded = await loadCurrentUserContext(supabase, user);

    if (!loaded.context) {
      logServerAuthError({
        stage: loaded.error?.stage ?? "session",
        message: loaded.error?.message ?? "Authenticated user context could not be loaded.",
        code: loaded.error?.supabaseCode ?? loaded.error?.code,
      });

      if (isAuthRoute) {
        return middlewareClient.response;
      }

      if (isProtectedPath(pathname)) {
        if (isPropertyOwner) return middlewareClient.response;
        return redirectToStaffLogin(currentPathWithSearch);
      }

      if (isClientProtectedPath(pathname)) {
        return redirectTo("/guest/login", currentPathWithSearch);
      }

      return middlewareClient.response;
    }

    hasMembership = Boolean(loaded.context.organizationMember);
    hasAllowedStaffRole = hasStaffMembership(loaded.context);
    isGuestUser = !hasAllowedStaffRole;
  }

  if (user && isProtectedPath(pathname) && !hasAllowedStaffRole) {
    if (isPropertyOwner) return middlewareClient.response;

    if (!hasMembership) {
      return redirectTo("/guest");
    }

    return redirectTo("/login");
  }

  if (user && isClientProtectedPath(pathname) && !isGuestUser) {
    return redirectTo("/admin");
  }

  if (user && isAuthRoute) {
    if (isGuestUser) {
      const next = getGuestNextPath(request.nextUrl.searchParams.get("next"));
      return redirectTo(next);
    }

    const next = getAdminNextPath(request.nextUrl.searchParams.get("next"));
    return redirectTo(next);
  }

  return middlewareClient.response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};