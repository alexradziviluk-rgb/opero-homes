import { requireServerRoleCodesPage } from "@/lib/supabase/server-auth";

export default async function NewApartmentLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireServerRoleCodesPage(["owner", "manager"]);
  return children;
}