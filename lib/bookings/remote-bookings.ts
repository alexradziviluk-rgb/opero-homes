import type { Booking } from "@/types/booking";

async function readError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? `Booking request failed (${response.status})`;
}

async function createRemoteBooking(booking: Booking): Promise<void> {
  const response = await fetch("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(booking),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function persistBookingStatus(booking: Booking, status: Booking["status"]): Promise<void> {
  const response = await fetch(`/api/bookings/${booking.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

  if (response.ok) return;
  if (response.status === 404) {
    await createRemoteBooking({ ...booking, status });
    return;
  }
  throw new Error(await readError(response));
}

export async function deleteRemoteBooking(bookingId: string): Promise<void> {
  const response = await fetch(`/api/bookings/${bookingId}`, { method: "DELETE" });
  if (response.ok || response.status === 404) return;
  throw new Error(await readError(response));
}