import localImageStorage from "./local-image-storage";
import supabaseImageStorage from "./supabase-image-storage";

const useSupabaseProvider = process.env.NEXT_PUBLIC_REPOSITORY_PROVIDER === "supabase";

export const ImageStorageProvider = useSupabaseProvider ? supabaseImageStorage : localImageStorage;
export const Providers = {
  local: localImageStorage,
  supabase: supabaseImageStorage,
};

export default ImageStorageProvider;
