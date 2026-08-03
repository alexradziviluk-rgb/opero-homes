"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser as getCurrentUserAuth, logout as logoutAuth } from "@/lib/supabase/auth";
import { loadApartmentsFromSupabase } from "@/lib/apartments/supabase-apartments";
import { saveLocalApartments } from "@/app/apartments/apartment-utils";
import { userRepository } from "@/lib/repositories/users";
import type { CurrentUserContext } from "@/types/auth-context";
import type { User } from "@/types/user";

type CurrentUserContextValue = {
  currentUser: User | null;
  currentUserContext: CurrentUserContext | null;
  hasPropertyAccess: boolean;
  isAuthLoading: boolean;
  logout: () => Promise<void>;
};

export function getHomeRouteForUser(user: User): string {
  return user.role === "Гость" ? "/guest" : "/admin";
}

const CurrentUserContext = createContext<CurrentUserContextValue>({
  currentUser: null,
  currentUserContext: null,
  hasPropertyAccess: false,
  isAuthLoading: true,
  logout: async () => undefined,
});

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserContext, setCurrentUserContext] = useState<CurrentUserContext | null>(null);
  const [hasPropertyAccess, setHasPropertyAccess] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(() => Boolean(createSupabaseClient()));

  useEffect(() => {
    const supabase = createSupabaseClient();
    if (!supabase) {
      return;
    }

    let isMounted = true;
    const supabaseClient = supabase;

    async function bootstrapAuth() {
      const resolved = await getCurrentUserAuth();
      if (!isMounted) {
        return;
      }

      if (!resolved.currentUser) {
        if (resolved.errorCode === "profile_missing") {
          router.replace("/login?error=profile_missing");
        }
        setCurrentUser(null);
        setCurrentUserContext(null);
        setHasPropertyAccess(false);
        setIsAuthLoading(false);
        return;
      }

      userRepository.upsert(resolved.currentUser);
      setCurrentUser(resolved.currentUser);
      setCurrentUserContext(resolved.currentUserContext);
      void fetch("/api/owner/properties", { cache: "no-store" }).then((response) => setHasPropertyAccess(response.ok));
      setIsAuthLoading(false);
    }

    void bootstrapAuth();

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setCurrentUser(null);
        setCurrentUserContext(null);
        return;
      }

      void getCurrentUserAuth().then((resolved) => {
        if (!isMounted) {
          return;
        }

        if (!resolved.currentUser) {
          setCurrentUser(null);
          setCurrentUserContext(null);
          setHasPropertyAccess(false);
          if (resolved.errorCode === "profile_missing") {
            router.replace("/login?error=profile_missing");
            router.refresh();
          }
          return;
        }

        userRepository.upsert(resolved.currentUser);
        setCurrentUser(resolved.currentUser);
        setCurrentUserContext(resolved.currentUserContext);
        void fetch("/api/owner/properties", { cache: "no-store" }).then((response) => setHasPropertyAccess(response.ok));
      });
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const logout = useCallback(async () => {
    const redirectPath = currentUser?.role === "Гость" ? "/guest/login" : "/login";
    await logoutAuth();

    setCurrentUser(null);
    setCurrentUserContext(null);
    setHasPropertyAccess(false);
    router.replace(redirectPath);
    router.refresh();
  }, [currentUser?.role, router]);

  useEffect(() => {
    if (!currentUser || currentUser.role === "Гость") return;

    const heartbeat = () => {
      void fetch("/api/auth/heartbeat", { method: "POST" });
    };
    heartbeat();
    const intervalId = window.setInterval(heartbeat, 60_000);
    return () => window.clearInterval(intervalId);
  }, [currentUser]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    async function syncApartmentCache() {
      const supabase = createSupabaseClient();
      if (!supabase) {
        return;
      }

      try {
        const apartments = await loadApartmentsFromSupabase({ publicOnly: currentUser?.role === "Гость" || !currentUser });
        saveLocalApartments(apartments);
      } catch {
        saveLocalApartments([]);
      }
    }

    void syncApartmentCache();

    const routeMatches = (route: string): boolean => {
      if (route === "/") {
        return pathname === "/";
      }

      return pathname === route || pathname.startsWith(`${route}/`);
    };

    const authRoutes = ["/login", "/admin/login", "/guest/login", "/guest/register", "/register", "/forgot-password", "/reset-password"];
    const isAuthRoute = authRoutes.includes(pathname);
    const internalRoots = ["/admin", "/apartments", "/bookings", "/calendar", "/customers", "/clients", "/users", "/owner", "/account"];
    const isInternalRoute = internalRoots.some((route) => routeMatches(route));
    const guestProtectedRoots = ["/guest/bookings", "/guest/messages"];
    const isGuestProtectedRoute = pathname === "/guest" || guestProtectedRoots.some((route) => routeMatches(route));

    if (!currentUser && isInternalRoute && !isAuthRoute) {
      router.replace("/login");
      router.refresh();
      return;
    }

    if (!currentUser && isGuestProtectedRoute && !isAuthRoute) {
      const next = encodeURIComponent(pathname);
      router.replace(`/guest/login?next=${next}`);
      router.refresh();
      return;
    }

    if (!currentUser) {
      return;
    }

    if (isAuthRoute) {
      router.replace(getHomeRouteForUser(currentUser));
      router.refresh();
      return;
    }

    if (currentUser.role === "Гость" && isInternalRoute && !pathname.startsWith("/account") && !pathname.startsWith("/owner")) {
      router.replace("/guest");
      router.refresh();
      return;
    }

    if (currentUser.role !== "Гость" && isGuestProtectedRoute) {
      router.replace("/admin");
      router.refresh();
    }
  }, [currentUser, isAuthLoading, pathname, router]);

  const value = useMemo(
    () => ({ currentUser, currentUserContext, hasPropertyAccess, isAuthLoading, logout }),
    [currentUser, currentUserContext, hasPropertyAccess, isAuthLoading, logout],
  );

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser() {
  return useContext(CurrentUserContext);
}
