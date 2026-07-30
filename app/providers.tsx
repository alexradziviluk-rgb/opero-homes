"use client";

import { CurrentUserProvider } from "@/components/auth/current-user-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <CurrentUserProvider>{children}</CurrentUserProvider>;
}
