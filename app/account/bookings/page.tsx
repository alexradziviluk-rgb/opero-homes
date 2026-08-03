import { permanentRedirect } from "next/navigation";

export default function AccountBookingsPage() {
  permanentRedirect("/guest/bookings");
}