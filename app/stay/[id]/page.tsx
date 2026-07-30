import { redirect } from "next/navigation";

export default async function StayPropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ openBooking?: string; checkIn?: string; checkOut?: string; guests?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const queryParts: string[] = [];

  if (query.openBooking) queryParts.push(`openBooking=${encodeURIComponent(query.openBooking)}`);
  if (query.checkIn) queryParts.push(`checkIn=${encodeURIComponent(query.checkIn)}`);
  if (query.checkOut) queryParts.push(`checkOut=${encodeURIComponent(query.checkOut)}`);
  if (query.guests) queryParts.push(`guests=${encodeURIComponent(query.guests)}`);

  const suffix = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
  redirect(`/guest/properties/${id}${suffix}`);
}
