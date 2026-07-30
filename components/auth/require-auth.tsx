import { requireServerUserContext } from "@/lib/supabase/server";

export async function RequireAuth({ children }: { children: React.ReactNode }) {
  await requireServerUserContext();

  return <>{children}</>;
}
