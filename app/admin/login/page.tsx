import { redirect } from "next/navigation";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const query = await searchParams;

  if (query.next) {
    redirect(`/login?next=${encodeURIComponent(query.next)}`);
  }

  redirect("/login");
}
