import type { ApartmentPhoto } from "@/types/apartment";
import { saveBlob, getBlob, deleteBlob } from "./indexed-db";

// Local provider stores blobs in IndexedDB and returns ApartmentPhoto metadata
export const localImageStorage = {
  async upload({ apartmentId, file }: { apartmentId: string; file: File }): Promise<ApartmentPhoto> {
    if (typeof window === "undefined") throw new Error("upload requires client environment");
    const id = typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now());
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `apartments/${apartmentId}/${id}-${safeFileName}`;
    // save blob
    await saveBlob(storagePath, file);
    // determine image dimensions
    let width: number | undefined;
    let height: number | undefined;
    try {
      const imageBitmap = await createImageBitmap(file);
      width = imageBitmap.width;
      height = imageBitmap.height;
      imageBitmap.close();
    } catch (e) {
      // ignore
    }
    const photo: ApartmentPhoto = {
      id,
      apartmentId,
      url: storagePath, // caller will convert storagePath to preview URL
      storagePath,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      width,
      height,
      sortOrder: 0,
      isCover: false,
      createdAt: new Date().toISOString(),
    };
    return photo;
  },

  async remove(photo: ApartmentPhoto): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      await deleteBlob(photo.storagePath);
    } catch (e) {
      // swallow errors to avoid blocking deletions
      console.error("Failed to delete blob", e);
    }
  },

  async getPreviewUrl(photo: ApartmentPhoto): Promise<string | null> {
    if (typeof window === "undefined") return null;
    const blob = await getBlob(photo.storagePath);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    return url;
  },

  revokePreviewUrl(url: string | null) {
    if (!url) return;
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      // ignore
    }
  },
};

export default localImageStorage;
