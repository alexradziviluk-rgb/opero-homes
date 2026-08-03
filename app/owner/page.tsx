import { redirect } from "next/navigation";

export default function OwnerHomePage() {
  redirect("/account/properties");
}
