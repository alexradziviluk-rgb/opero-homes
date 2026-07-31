import { requireServerRoleCodesPage } from "@/lib/supabase/server-auth";

export default async function CheckInOutLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireServerRoleCodesPage(["owner", "manager"]);
  return children;
}
