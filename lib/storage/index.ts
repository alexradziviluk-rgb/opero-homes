import localImageStorage from "./local-image-storage";
import supabaseImageStorage from "./supabase-image-storage";

const repositoryProvider = process.env.NEXT_PUBLIC_REPOSITORY_PROVIDER;
const hasSupabaseConfig = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
);
const useSupabaseProvider = repositoryProvider !== "local" && hasSupabaseConfig;

export const ImageStorageProvider = useSupabaseProvider ? supabaseImageStorage : localImageStorage;
export const Providers = {
  local: localImageStorage,
  supabase: supabaseImageStorage,
};

export default ImageStorageProvider;
