import { permanentRedirect } from "next/navigation";

export default function AccountFavoritesPage() {
  permanentRedirect("/guest");
}