import { requireServerRoleCodesPage } from "@/lib/supabase/server-auth";

export default async function CleaningLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireServerRoleCodesPage(["owner", "manager", "cleaner"]);
  return children;
}
