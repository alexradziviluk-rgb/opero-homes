import { requireServerRoleCodesPage } from "@/lib/supabase/server-auth";

export default async function TasksLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireServerRoleCodesPage(["owner", "manager", "cleaner", "maintenance"]);
  return children;
}
