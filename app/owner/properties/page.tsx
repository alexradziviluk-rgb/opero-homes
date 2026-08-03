"use client";

import { permanentRedirect } from "next/navigation";

export default function OwnerPropertiesPage() {
  permanentRedirect("/account/properties");
}
