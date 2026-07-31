import { requireServerRoleCodesPage } from "@/lib/supabase/server-auth";

export default async function MaintenanceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireServerRoleCodesPage(["owner", "manager", "maintenance"]);
  return children;
}
