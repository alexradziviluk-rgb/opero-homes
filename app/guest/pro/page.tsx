import { permanentRedirect } from "next/navigation";

export default function LegacyGuestProPage() {
  permanentRedirect("/");
}
