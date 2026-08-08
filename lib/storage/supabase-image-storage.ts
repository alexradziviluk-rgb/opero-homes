import type { ApartmentPhoto } from "@/types/apartment";
import { createSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/supabase/auth";

const BUCKET = "apartment-photos";

export const supabaseImageStorage = {
  async upload({ apartmentId, file }: { apartmentId: string; file: File }): Promise<ApartmentPhoto> {
    const supabase = createSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase provider is not configured yet");
    }

    const auth = await getCurrentUser();
    const organizationId = auth.currentUserContext?.organization?.id;
    if (!organizationId) {
      throw new Error("Organization context is missing");
    }

    const id = typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now());
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `organizations/${organizationId}/apartments/${apartmentId}/${id}-${safeFileName}`;

    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      throw new Error(error.message);
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    return {
      id,
      apartmentId,
      url: data.publicUrl,
      storagePath,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      width: undefined,
      height: undefined,
      sortOrder: 0,
      isCover: false,
      createdAt: new Date().toISOString(),
    };
  },
  async remove(photo: ApartmentPhoto): Promise<void> {
    const supabase = createSupabaseClient();
    if (!supabase) {
      throw new Error("Supabase provider is not configured yet");
    }

    const { error } = await supabase.storage.from(BUCKET).remove([photo.storagePath]);
    if (error) {
      throw new Error(error.message);
    }
  },
  async getPreviewUrl(photo: ApartmentPhoto): Promise<string | null> {
    const supabase = createSupabaseClient();
    if (!supabase) {
      return photo.url || photo.storagePath || null;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(photo.storagePath);
    return data.publicUrl ?? photo.url ?? null;
  },
  revokePreviewUrl() {
    // noop
  },
};

export default supabaseImageStorage;
