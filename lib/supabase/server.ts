import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadCurrentUserContext } from "@/lib/supabase/current-user";
import type { CurrentUserContext } from "@/types/auth-context";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return null;
  }

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // The `setAll` method can throw when called from a Server Component.
        }
      },
    },
  });
}

export function createSupabaseServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getServerUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export type ServerCurrentUserResult = {
  currentUserContext: CurrentUserContext | null;
  errorCode?: "supabase_not_configured" | "profile_missing" | "membership_missing" | "organization_missing" | "unexpected";
};

export async function getServerCurrentUserContext(): Promise<ServerCurrentUserResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { currentUserContext: null, errorCode: "supabase_not_configured" };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { currentUserContext: null, errorCode: "unexpected" };
  }

  let loaded = await loadCurrentUserContext(supabase, user);

  if (!loaded.context && loaded.error?.code === "profile_missing") {
    try {
      await supabase.rpc("ensure_profile_for_current_user");
    } catch {
      // Repair is best-effort: keep original failure path when RPC is unavailable.
    }
    loaded = await loadCurrentUserContext(supabase, user);
  }

  if (!loaded.context) {
    if (loaded.error?.code === "profile_missing") {
      return { currentUserContext: null, errorCode: "profile_missing" };
    }

    if (loaded.error?.code === "membership_missing") {
      return { currentUserContext: null, errorCode: "membership_missing" };
    }

    if (loaded.error?.code === "organization_missing") {
      return { currentUserContext: null, errorCode: "organization_missing" };
    }

    return {
      currentUserContext: null,
      errorCode: "unexpected",
    };
  }

  return { currentUserContext: loaded.context };
}

export async function requireServerUserContext(): Promise<CurrentUserContext> {
  const context = await getServerCurrentUserContext();

  if (!context.currentUserContext) {
    redirect("/login");
  }

  return context.currentUserContext;
}
