"use client";

import type { AuthError, User as SupabaseAuthUser } from "@supabase/supabase-js";
import { createSupabaseClient } from "@/lib/supabase/client";
import { mapProfileToCurrentUser } from "@/lib/auth/profile-mapper";
import { getAdminNextPath, getGuestNextPath } from "@/lib/auth/next-route";
import { loadCurrentUserContext } from "@/lib/supabase/current-user";
import type { CurrentUserContext } from "@/types/auth-context";
import type { User } from "@/types/user";

export type AuthErrorCode =
  | "supabase_not_configured"
  | "sign_in_failed"
  | "session_missing_after_sign_in"
  | "user_missing_after_sign_in"
  | "profile_missing"
  | "membership_missing"
  | "organization_missing"
  | "uid_mismatch"
  | "rls_error"
  | "supabase_query_error"
  | "profile_inactive"
  | "cookie_session_error"
  | "invalid_email"
  | "rate_limit"
  | "otp_send_failed"
  | "invalid_otp"
  | "expired_otp"
  | "session_missing"
  | "access_denied"
  | "redirect_error"
  | "unexpected";

export type AuthErrorStage =
  | "sign_in"
  | "session"
  | "user"
  | "uid_check"
  | "profiles"
  | "organization_members"
  | "organizations"
  | "redirect"
  | "unexpected";

export type OtpRequestResult = {
  ok: boolean;
  errorCode?: AuthErrorCode;
  errorMessage?: string;
  supabaseErrorCode?: string;
};

export type OtpVerifyResult = {
  ok: boolean;
  redirectTo?: string;
  errorCode?: AuthErrorCode;
  errorMessage?: string;
  supabaseErrorCode?: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isEmailValid(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function classifyOtpSendError(error: AuthError): OtpRequestResult {
  const message = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();

  if (code.includes("over_email_send_rate_limit") || message.includes("rate limit")) {
    return {
      ok: false,
      errorCode: "rate_limit",
      errorMessage: error.message,
      supabaseErrorCode: error.code,
    };
  }

  if (code.includes("email_address_invalid") || message.includes("invalid email")) {
    return {
      ok: false,
      errorCode: "invalid_email",
      errorMessage: error.message,
      supabaseErrorCode: error.code,
    };
  }

  return {
    ok: false,
    errorCode: "otp_send_failed",
    errorMessage: error.message,
    supabaseErrorCode: error.code,
  };
}

function classifyOtpVerifyError(error: AuthError): OtpVerifyResult {
  const message = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();

  if (message.includes("expired") || message.includes("token has expired")) {
    return {
      ok: false,
      errorCode: "expired_otp",
      errorMessage: error.message,
      supabaseErrorCode: error.code,
    };
  }

  if (code.includes("otp_expired") || code.includes("token_expired")) {
    return {
      ok: false,
      errorCode: "expired_otp",
      errorMessage: error.message,
      supabaseErrorCode: error.code,
    };
  }

  if (message.includes("invalid") || code.includes("invalid")) {
    return {
      ok: false,
      errorCode: "invalid_otp",
      errorMessage: error.message,
      supabaseErrorCode: error.code,
    };
  }

  return {
    ok: false,
    errorCode: "otp_send_failed",
    errorMessage: error.message,
    supabaseErrorCode: error.code,
  };
}

export async function resolvePostAuthRedirect(nextPath: string | null | undefined): Promise<string> {
  const resolved = await getCurrentUser();

  if (!resolved.currentUser) {
    return getGuestNextPath(nextPath);
  }

  if (resolved.currentUser.role === "Гость") {
    return getGuestNextPath(nextPath);
  }

  const safeAdmin = getAdminNextPath(nextPath);
  const isAdminPath =
    safeAdmin === "/admin" ||
    safeAdmin.startsWith("/admin/") ||
    safeAdmin.startsWith("/apartments") ||
    safeAdmin.startsWith("/bookings") ||
    safeAdmin.startsWith("/calendar") ||
    safeAdmin.startsWith("/clients") ||
    safeAdmin.startsWith("/users") ||
    safeAdmin.startsWith("/customers") ||
    safeAdmin.startsWith("/settings") ||
    safeAdmin.startsWith("/notifications");

  return isAdminPath ? safeAdmin : "/admin";
}

export async function requestGuestOtpSignIn(params: {
  email: string;
  nextPath: string;
  origin: string;
}): Promise<OtpRequestResult> {
  const supabase = createSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      errorCode: "supabase_not_configured",
      errorMessage: "Supabase env variables are not configured.",
    };
  }

  const email = normalizeEmail(params.email);
  if (!isEmailValid(email)) {
    return {
      ok: false,
      errorCode: "invalid_email",
      errorMessage: "Invalid email format.",
    };
  }

  const callbackUrl = new URL("/auth/callback", params.origin);
  callbackUrl.searchParams.set("next", params.nextPath);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callbackUrl.toString(),
      shouldCreateUser: false,
    },
  });

  if (error) {
    return classifyOtpSendError(error);
  }

  return { ok: true };
}

export async function verifyGuestEmailOtp(params: {
  email: string;
  token: string;
  nextPath: string;
}): Promise<OtpVerifyResult> {
  const supabase = createSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      errorCode: "supabase_not_configured",
      errorMessage: "Supabase env variables are not configured.",
    };
  }

  const email = normalizeEmail(params.email);
  const token = params.token.trim();

  if (!isEmailValid(email)) {
    return {
      ok: false,
      errorCode: "invalid_email",
      errorMessage: "Invalid email format.",
    };
  }

  if (!token) {
    return {
      ok: false,
      errorCode: "invalid_otp",
      errorMessage: "OTP token is required.",
    };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    return classifyOtpVerifyError(error);
  }

  if (!data.session || !data.user) {
    return {
      ok: false,
      errorCode: "session_missing",
      errorMessage: "Session is missing after OTP verification.",
    };
  }

  const redirectTo = await resolvePostAuthRedirect(params.nextPath);
  return {
    ok: true,
    redirectTo,
  };
}

export type AuthResult = {
  currentUser: User | null;
  currentUserContext: CurrentUserContext | null;
  errorCode?: AuthErrorCode;
  errorStage?: AuthErrorStage;
  errorMessage?: string;
  supabaseErrorCode?: string;
};

type SessionContextApiError = {
  errorCode: AuthErrorCode;
  errorStage: AuthErrorStage;
  errorMessage?: string;
  supabaseErrorCode?: string;
};

type SessionContextApiResponse =
  | {
      ok: true;
      uid: string;
      organizationSlug: string;
    }
  | ({ ok: false } & SessionContextApiError);

function mapSignInError(error: AuthError): AuthResult {
  return {
    currentUser: null,
    currentUserContext: null,
    errorCode: "sign_in_failed",
    errorStage: "sign_in",
    errorMessage: error.message,
    supabaseErrorCode: error.code,
  };
}

async function validateServerSessionContext(): Promise<SessionContextApiError | null> {
  const response = await fetch("/api/auth/session-context", {
    method: "GET",
    cache: "no-store",
  });

  let payload: SessionContextApiResponse | null = null;

  try {
    payload = (await response.json()) as SessionContextApiResponse;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || !payload.ok) {
    if (payload && !payload.ok) {
      return {
        errorCode: payload.errorCode,
        errorStage: payload.errorStage,
        errorMessage: payload.errorMessage,
        supabaseErrorCode: payload.supabaseErrorCode,
      };
    }

    return {
      errorCode: "cookie_session_error",
      errorStage: "session",
      errorMessage: "Server could not read authenticated session from cookies.",
    };
  }

  return null;
}

function isActiveUser(user: User | null): boolean {
  return Boolean(user && user.status === "Активен");
}

async function resolveCurrentUserFromAuthUser(authUser: SupabaseAuthUser | null): Promise<AuthResult> {
  if (!authUser) {
    return {
      currentUser: null,
      currentUserContext: null,
      errorCode: "user_missing_after_sign_in",
      errorStage: "user",
      errorMessage: "Auth user is missing in Supabase response.",
    };
  }

  const supabase = createSupabaseClient();
  if (!supabase) {
    return {
      currentUser: null,
      currentUserContext: null,
      errorCode: "supabase_not_configured",
      errorStage: "unexpected",
      errorMessage: "Supabase env variables are not configured.",
    };
  }

  let loaded = await loadCurrentUserContext(supabase, authUser);

  if (!loaded.context && loaded.error?.code === "profile_missing") {
    await validateServerSessionContext().catch(() => null);
    loaded = await loadCurrentUserContext(supabase, authUser);
  }
  if (!loaded.context) {
    if (loaded.error) {
      return {
        currentUser: null,
        currentUserContext: null,
        errorCode: loaded.error.code,
        errorStage: loaded.error.stage,
        errorMessage: loaded.error.message,
        supabaseErrorCode: loaded.error.supabaseCode,
      };
    }

    return {
      currentUser: null,
      currentUserContext: null,
      errorCode: "unexpected",
      errorStage: "unexpected",
      errorMessage: "Current user context was not resolved.",
    };
  }

  const organizationId = loaded.context.organization?.id ?? "";
  const roleCode = loaded.context.organizationMember?.role_code ?? "guest";
  const additionalRoleCodes = loaded.context.organizationMember?.additional_role_codes ?? [];
  const currentUser = mapProfileToCurrentUser(loaded.context.profile, organizationId, roleCode, additionalRoleCodes);

  if (!currentUser) {
    return {
      currentUser: null,
      currentUserContext: loaded.context,
      errorCode: "profile_missing",
      errorStage: "profiles",
      errorMessage: "Profile row cannot be mapped to application user.",
    };
  }

  if (!isActiveUser(currentUser)) {
    return {
      currentUser: null,
      currentUserContext: loaded.context,
      errorCode: "profile_inactive",
      errorStage: "profiles",
      errorMessage: "Profile status is not active.",
    };
  }

  return { currentUser, currentUserContext: loaded.context };
}

export async function getCurrentUser(): Promise<AuthResult> {
  const supabase = createSupabaseClient();
  if (!supabase) {
    return {
      currentUser: null,
      currentUserContext: null,
      errorCode: "supabase_not_configured",
      errorStage: "unexpected",
      errorMessage: "Supabase env variables are not configured.",
    };
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return resolveCurrentUserFromAuthUser(user);
  } catch {
    return {
      currentUser: null,
      currentUserContext: null,
      errorCode: "unexpected",
      errorStage: "unexpected",
      errorMessage: "Unhandled error while resolving current user.",
    };
  }
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const supabase = createSupabaseClient();
  if (!supabase) {
    return {
      currentUser: null,
      currentUserContext: null,
      errorCode: "supabase_not_configured",
      errorStage: "unexpected",
      errorMessage: "Supabase env variables are not configured.",
    };
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      return mapSignInError(error);
    }

    if (!data.user) {
      return {
        currentUser: null,
        currentUserContext: null,
        errorCode: "user_missing_after_sign_in",
        errorStage: "user",
        errorMessage: "Supabase signIn returned no user object.",
      };
    }

    if (!data.session) {
      return {
        currentUser: null,
        currentUserContext: null,
        errorCode: "session_missing_after_sign_in",
        errorStage: "session",
        errorMessage: "Supabase signIn returned no session object.",
      };
    }

    const sessionValidationError = await validateServerSessionContext();
    if (sessionValidationError) {
      return {
        currentUser: null,
        currentUserContext: null,
        errorCode: sessionValidationError.errorCode,
        errorStage: sessionValidationError.errorStage,
        errorMessage: sessionValidationError.errorMessage,
        supabaseErrorCode: sessionValidationError.supabaseErrorCode,
      };
    }

    const resolved = await resolveCurrentUserFromAuthUser(data.user);
    return resolved;
  } catch {
    return {
      currentUser: null,
      currentUserContext: null,
      errorCode: "unexpected",
      errorStage: "unexpected",
      errorMessage: "Unhandled error while signing in.",
    };
  }
}

export async function logout(): Promise<void> {
  const supabase = createSupabaseClient();
  if (!supabase) {
    return;
  }

  await supabase.auth.signOut();
}
