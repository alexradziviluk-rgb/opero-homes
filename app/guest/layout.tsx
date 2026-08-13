"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import GuestNav from "@/components/guest/GuestNav";
import { useCurrentUser } from "@/components/auth/current-user-provider";

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, hasPropertyAccess, isAuthLoading } = useCurrentUser();

  const isPublicGuestRoute = pathname === "/guest/login" || pathname === "/guest/register";

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (isPublicGuestRoute) {
      return;
    }

    if (!currentUser) {
      const nextPath = `${window.location.pathname}${window.location.search}`;
      router.replace(`/guest/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }

    if (currentUser.role !== "Гость" && !hasPropertyAccess && !pathname.startsWith("/guest/")) {
      router.replace("/admin");
    }
  }, [currentUser, hasPropertyAccess, isAuthLoading, isPublicGuestRoute, pathname, router]);

  if (isAuthLoading && !isPublicGuestRoute) {
    return <div className="p-6 text-slate-300">Загрузка...</div>;
  }

  if (!isPublicGuestRoute && !currentUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <GuestNav />
      <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
