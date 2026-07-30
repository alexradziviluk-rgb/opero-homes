import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export function createSupabaseMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return { supabase: null, response };
  }

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  return { supabase, response };
}

export function isProtectedPath(pathname: string) {
  return ["/admin", "/apartments", "/bookings", "/calendar", "/customers", "/clients", "/users", "/notifications", "/settings"].some((route) =>
    pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function isClientProtectedPath(pathname: string) {
  return ["/guest", "/guest/book/new", "/guest/bookings", "/guest/messages"].some((route) =>
    pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function isPublicPath(pathname: string) {
  const explicitPublic = [
    "/",
    "/login",
    "/admin/login",
    "/guest/login",
    "/guest/register",
    "/invite",
    "/auth/callback",
    "/forgot-password",
    "/reset-password",
    "/stay",
    "/guest/properties",
  ];

  if (explicitPublic.includes(pathname)) {
    return true;
  }

  if (pathname.startsWith("/stay/")) {
    return true;
  }

  if (pathname.startsWith("/guest/properties/")) {
    return true;
  }

  return false;
}
