import { requireServerRoleCodesPage } from "@/lib/supabase/server-auth";

export default async function EmployeesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireServerRoleCodesPage(["owner", "manager"]);
  return children;
}
