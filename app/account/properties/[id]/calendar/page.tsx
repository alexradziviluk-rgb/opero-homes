import { permanentRedirect } from "next/navigation";

export default async function AccountPropertyCalendarPage({ params }: { params: Promise<{ id: string }> }) {
  permanentRedirect(`/owner/properties/${(await params).id}/calendar`);
}