import { requireServerPropertyOwnerPage } from "@/lib/supabase/server-auth";
import OwnerCalendarClient from "./owner-calendar-client";

export default async function OwnerCalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireServerPropertyOwnerPage(id);
  return <OwnerCalendarClient />;
}
