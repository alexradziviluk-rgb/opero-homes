import { permanentRedirect } from "next/navigation";

export default function OwnerLoginAlias() {
  permanentRedirect("/guest/login");
}