"use client";

import { CurrentUserProvider } from "@/components/auth/current-user-provider";
import OperoAI from "@/components/ai/OperoAI";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CurrentUserProvider>
      {children}
      <OperoAI />
    </CurrentUserProvider>
  );
}
