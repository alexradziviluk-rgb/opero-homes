import { permanentRedirect } from "next/navigation";

export default function AccountMessagesPage() {
  permanentRedirect("/guest/messages");
}