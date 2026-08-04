import { requireServerPropertyOwnerPage } from "@/lib/supabase/server-auth";
import AccountPropertiesClient from "./properties-client";

export default async function AccountPropertiesPage() {
	await requireServerPropertyOwnerPage();
	return <AccountPropertiesClient />;
}