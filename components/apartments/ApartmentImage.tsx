"use client";

import { useEffect, useMemo, useState } from "react";
import { getBlob } from "@/lib/storage/indexed-db";
import {
  getApartmentPhotoStoragePath,
  getApartmentPhotoUrl,
} from "@/lib/apartments/public-catalog";
import type { ApartmentPhoto } from "@/types/apartment";

type PhotoLike = ApartmentPhoto | string | { url?: string; src?: string; storagePath?: string } | undefined;

type Props = {
  photo: PhotoLike;
  alt: string;
  className?: string;
  placeholderClassName?: string;
  placeholderText?: string;
};

export default function ApartmentImage({
  photo,
  alt,
  className = "",
  placeholderClassName = "",
  placeholderText = "Фото недоступно",
}: Props) {
  const directUrl = useMemo(() => getApartmentPhotoUrl(photo), [photo]);
  const storagePath = useMemo(() => getApartmentPhotoStoragePath(photo), [photo]);

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    let createdUrl: string | null = null;

    setImageFailed(false);
    setBlobUrl(null);

    async function loadStorageImage() {
      if (!storagePath) {
        return;
      }

      try {
        const blob = await getBlob(storagePath);
        if (!blob) {
          return;
        }

        createdUrl = URL.createObjectURL(blob);
        if (!isCancelled) {
          setBlobUrl(createdUrl);
        }
      } catch {
        // Keep placeholder for storage entries that cannot be restored.
      }
    }

    // If direct URL exists we still try storage fallback only when URL fails in runtime.
    if (!directUrl) {
      void loadStorageImage();
    }

    return () => {
      isCancelled = true;
      if (createdUrl) {
        try {
          URL.revokeObjectURL(createdUrl);
        } catch {
          // ignore
        }
      }
    };
  }, [directUrl, storagePath]);

  const src = !imageFailed ? directUrl ?? blobUrl : blobUrl;

  if (!src) {
    return (
      <div className={`${className} ${placeholderClassName} flex items-center justify-center bg-slate-800 text-sm text-slate-300`}>
        {placeholderText}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        // Blob URLs from previous sessions cannot be restored; show neutral placeholder.
        setImageFailed(true);
      }}
    />
  );
}
