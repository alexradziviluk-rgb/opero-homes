import { localApartmentRepository } from "./local/apartment-repository";
import { supabaseApartmentRepository } from "./supabase/apartment-repository";

export type RepositoryProvider = "local" | "supabase";

const provider = (process.env.NEXT_PUBLIC_REPOSITORY_PROVIDER as RepositoryProvider | undefined) ?? "local";

export const apartmentRepository = provider === "supabase" ? supabaseApartmentRepository : localApartmentRepository;
