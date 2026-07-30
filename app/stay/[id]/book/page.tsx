import { redirect } from "next/navigation";

export default async function StayPropertyBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkIn?: string; checkOut?: string; guests?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const queryParts = ["openBooking=1"];

  if (query.checkIn) queryParts.push(`checkIn=${encodeURIComponent(query.checkIn)}`);
  if (query.checkOut) queryParts.push(`checkOut=${encodeURIComponent(query.checkOut)}`);
  if (query.guests) queryParts.push(`guests=${encodeURIComponent(query.guests)}`);

  redirect(`/stay/${id}?${queryParts.join("&")}`);
}
