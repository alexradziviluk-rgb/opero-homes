"use client";

import React, { useEffect, useState } from "react";
import { getBlob } from "@/lib/storage/indexed-db";

type Props = {
  storagePath: string;
  sourceUrl?: string;
  alt?: string;
  className?: string;
  fallback?: React.ReactNode;
};

export default function StoredImage({ storagePath, sourceUrl, alt = "", className = "", fallback = null }: Props) {
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [sourceFailed, setSourceFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    if (sourceUrl) {
      return () => {
        cancelled = true;
      };
    }
    if (!storagePath) return;

    (async () => {
      try {
        const blob = await getBlob(storagePath);
        if (!blob) return;
        const obj = URL.createObjectURL(blob);
        created = obj;
        if (!cancelled) setLocalUrl(obj);
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
  }, [sourceUrl, storagePath]);

  const url = sourceUrl && !sourceFailed ? sourceUrl : localUrl;
  if (url) {
    // Dynamic blob URLs cannot use next/image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} className={className} onError={() => sourceUrl ? setSourceFailed(true) : setLocalUrl(null)} />;
  }

  if (fallback) return <>{fallback}</>;

  return <div className={`${className} bg-slate-800`} />;
}
