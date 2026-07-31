import { requireServerRoleCodesPage } from "@/lib/supabase/server-auth";

export default async function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireServerRoleCodesPage(["owner"]);
  return children;
}