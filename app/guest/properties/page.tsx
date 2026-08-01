import { permanentRedirect } from "next/navigation";

export default function LegacyGuestPropertiesPage() {
  permanentRedirect("/");
}
