import { NextResponse } from "next/server";
import { createSupabaseServerClient, getServerCurrentUserContext } from "@/lib/supabase/server";
import { PRIMARY_ORGANIZATION_SLUG } from "@/lib/supabase/current-user";
import { logServerAuthError } from "@/lib/supabase/server-auth-log";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    logServerAuthError({
      stage: "session",
      message: "Supabase server client is not configured.",
      code: "supabase_not_configured",
    });

    return NextResponse.json(
      {
        ok: false,
        errorCode: "supabase_not_configured",
        errorStage: "session",
        errorMessage: "Supabase server client is not configured.",
        supabaseErrorCode: "supabase_not_configured",
      },
      { status: 500 },
    );
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
  const {
    data: { user },
    error: authError,
  } = accessToken ? await supabase.auth.getUser(accessToken) : await supabase.auth.getUser();

  if (authError) {
    logServerAuthError({
      stage: "session",
      message: authError.message,
      code: authError.code,
    });

    return NextResponse.json(
      {
        ok: false,
        errorCode: "cookie_session_error",
        errorStage: "session",
        errorMessage: authError.message,
        supabaseErrorCode: authError.code,
      },
      { status: 401 },
    );
  }

  if (!user) {
    logServerAuthError({
      stage: "session",
      message: "Authenticated user is missing in server session.",
      code: "user_missing",
    });

    return NextResponse.json(
      {
        ok: false,
        errorCode: "cookie_session_error",
        errorStage: "user",
        errorMessage: "Authenticated user is missing in server session.",
        supabaseErrorCode: "user_missing",
      },
      { status: 401 },
    );
  }

  const loaded = await getServerCurrentUserContext();

  if (!loaded.currentUserContext) {
    logServerAuthError({
      stage: "unexpected",
      message: "Current user context is not available in session-context route.",
      code: loaded.errorCode,
    });

    return NextResponse.json(
      {
        ok: false,
        errorCode: loaded.errorCode ?? "unexpected",
        errorStage: "unexpected",
        errorMessage: "Current user context is not available.",
        supabaseErrorCode: loaded.errorCode,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    uid: loaded.currentUserContext.authUserId,
    organizationSlug: loaded.currentUserContext.organization?.slug ?? PRIMARY_ORGANIZATION_SLUG,
  });
}
