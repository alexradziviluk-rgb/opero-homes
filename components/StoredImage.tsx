"use client";

import React, { useEffect, useState } from "react";
import { getBlob } from "@/lib/storage/indexed-db";

type Props = {
  storagePath: string;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
};

export default function StoredImage({ storagePath, alt = "", className = "", fallback = null }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    if (!storagePath) return;

    (async () => {
      try {
        const blob = await getBlob(storagePath);
        if (!blob) return;
        const obj = URL.createObjectURL(blob);
        created = obj;
        if (!cancelled) setUrl(obj);
      } catch (e) {
        console.error("Failed to load blob for", storagePath, e);
      }
    })();

    return () => {
      cancelled = true;
      if (created) {
        try {
          URL.revokeObjectURL(created);
        } catch {}
      }
    };
  }, [storagePath]);

  if (url) {
    return <img src={url} alt={alt} className={className} />;
  }

  if (fallback) return <>{fallback}</>;

  return <div className={`${className} bg-slate-800`} />;
}
