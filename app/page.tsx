import PublicCatalog from "@/components/guest/PublicCatalog";
import { loadApartmentsFromSupabase } from "@/lib/apartments/supabase-apartments";
import type { PublicApartment } from "@/types/apartment";

export const revalidate = 600;

export default async function HomePage() {
  let apartments: PublicApartment[] = [];

  try {
    apartments = await loadApartmentsFromSupabase({ publicOnly: true });
  } catch {
    apartments = [];
  }

  return <PublicCatalog initialApartments={apartments} />;
}
