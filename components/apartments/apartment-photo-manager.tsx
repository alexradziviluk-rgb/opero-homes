"use client";

/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useRef, useState } from "react";
import ImageStorageProvider from "@/lib/storage";
import type { ApartmentPhoto } from "@/types/apartment";

type Props = {
  apartmentId: string;
  photos: ApartmentPhoto[];
  onChange: (photos: ApartmentPhoto[]) => Promise<void> | void;
  disabled?: boolean;
};

export default function ApartmentPhotoManager({ apartmentId, photos: initialPhotos, onChange, disabled }: Props) {
  const [photoState, setPhotoState] = useState<{ source: ApartmentPhoto[]; value: ApartmentPhoto[] }>(() => ({
    source: initialPhotos,
    value: initialPhotos,
  }));
  const photos = photoState.source === initialPhotos ? photoState.value : initialPhotos;
  const setPhotos = (nextPhotos: ApartmentPhoto[]) => setPhotoState({ source: initialPhotos, value: nextPhotos });
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const draggingIdx = useRef<number | null>(null);

  // Load preview URLs for current photos. Do NOT call onChange here.
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];

    async function load() {
      const entries = await Promise.all(
        photos.map(async (p) => {
          try {
            const url = await ImageStorageProvider.getPreviewUrl(p);
            if (url) created.push(url);
            return [p.id, url ?? ""] as const;
          } catch {
            return [p.id, ""] as const;
          }
        })
      );

      if (!cancelled) setPreviewUrls(Object.fromEntries(entries));
    }

    void load();

    return () => {
      cancelled = true;
      created.forEach((u) => {
        try {
          ImageStorageProvider.revokePreviewUrl(u);
        } catch {
          try {
            URL.revokeObjectURL(u);
          } catch {}
        }
      });
    };
  }, [photos]);

  function enqueueError(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 4000);
  }

  function getPhotoErrorMessage(error: unknown, fallback: string): string {
    const message = error instanceof Error ? error.message : "";
    if (/row-level security|not authorized|permission denied|forbidden/i.test(message)) {
      return "У вас нет доступа к фотографиям этого объекта.";
    }
    return message || fallback;
  }

  async function handleFiles(selectedFiles: File[]) {
    if (disabled || !selectedFiles || selectedFiles.length === 0) return;

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    const maxFiles = 30;
    const maxSize = 20 * 1024 * 1024; // 20MB

    const availableSlots = Math.max(0, maxFiles - photos.length);
    if (availableSlots === 0) {
      enqueueError("Можно загрузить не более 30 фотографий");
      return;
    }

    const filesToProcess = selectedFiles.slice(0, availableSlots);
    if (selectedFiles.length > availableSlots) {
      enqueueError(`Можно добавить ещё только ${availableSlots} фотографий`);
    }

    const existing = new Set(photos.map((p) => `${p.fileName}:${p.size}`));

    const validFiles: File[] = [];
    const validationErrors: string[] = [];

    for (const file of filesToProcess) {
      const sig = `${file.name}:${file.size}`;
      if (!allowed.includes(file.type)) {
        validationErrors.push(`${file.name}: поддерживаются JPG, PNG и WebP`);
        continue;
      }
      if (file.size > maxSize) {
        validationErrors.push(`${file.name}: размер фотографии не должен превышать 20 МБ`);
        continue;
      }
      if (existing.has(sig)) {
        validationErrors.push(`${file.name}: фотография уже добавлена`);
        continue;
      }
      existing.add(sig);
      validFiles.push(file);
    }

    if (validationErrors.length > 0) {
      enqueueError(validationErrors.join("\n"));
    }

    if (validFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress({ completed: 0, total: validFiles.length });

    const uploaded: ApartmentPhoto[] = [];

    for (const file of validFiles) {
      try {
        const p = await ImageStorageProvider.upload({ apartmentId, file });
        const nextOrder = photos.length + uploaded.length;
        uploaded.push({ ...p, sortOrder: nextOrder } as ApartmentPhoto);
      } catch (e) {
        console.error("Upload failed", file.name, e);
        validationErrors.push(`${file.name}: не удалось загрузить (${getPhotoErrorMessage(e, "неизвестная ошибка")})`);
      } finally {
        setUploadProgress((prev) => ({ ...prev, completed: prev.completed + 1 }));
      }
    }

    const combined = [...photos, ...uploaded];
    const hasCover = combined.some((p) => p.isCover);
    const normalized = combined.map((p, i) => ({ ...p, sortOrder: i, isCover: hasCover ? p.isCover : i === 0 }));

    try {
      await onChange(normalized);
      setPhotos(normalized);
    } catch (e) {
      console.error(e);
      enqueueError(`Не удалось сохранить фотографии (${getPhotoErrorMessage(e, "неизвестная ошибка")})`);
    }

    setIsUploading(false);
    if (validationErrors.length > 0) enqueueError(validationErrors.join("\n"));
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    void handleFiles(files);
    e.currentTarget.value = ""; // allow reselecting same files
  }

  function handleDropFiles(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    void handleFiles(files);
  }

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
  }

  async function handleRemove(photo: ApartmentPhoto) {
    const next = photos.filter((p) => p.id !== photo.id);
    try {
      await onChange(next);
      setPhotos(next);
    } catch (e) {
      console.error(e);
      enqueueError(`Не удалось сохранить фотографии (${getPhotoErrorMessage(e, "неизвестная ошибка")})`);
      return;
    }
    try {
      await ImageStorageProvider.remove(photo);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleMakeCover(idx: number) {
    const next = photos.map((p) => ({ ...p, isCover: false }));
    next[idx].isCover = true;
    const [item] = next.splice(idx, 1);
    next.unshift(item);
    const normalized = next.map((p, i) => ({ ...p, sortOrder: i }));
    try {
      await onChange(normalized);
      setPhotos(normalized);
    } catch (e) {
      console.error(e);
      enqueueError(`Не удалось сохранить фотографии (${getPhotoErrorMessage(e, "неизвестная ошибка")})`);
    }
  }

  function onDragStart(e: React.DragEvent, idx: number) {
    draggingIdx.current = idx;
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  async function onDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.stopPropagation();
    const from = draggingIdx.current;
    if (from === null || from === undefined) return;
    const arr = [...photos];
    const [item] = arr.splice(from, 1);
    arr.splice(idx, 0, item);
    const normalized = arr.map((p, i) => ({ ...p, sortOrder: i }));
    try {
      await onChange(normalized);
      setPhotos(normalized);
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : "неизвестная ошибка";
      enqueueError(`Не удалось сохранить фотографии (${message})`);
    }
    draggingIdx.current = null;
  }

  async function handleDropToEnd(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const from = draggingIdx.current;
    if (from === null) return;

    const next = [...photos];
    const [item] = next.splice(from, 1);
    next.push(item);
    const normalized = next.map((photo, index) => ({ ...photo, sortOrder: index }));
    try {
      await onChange(normalized);
      setPhotos(normalized);
    } catch (error) {
      console.error(error);
      enqueueError(`Не удалось сохранить фотографии (${getPhotoErrorMessage(error, "неизвестная ошибка")})`);
    }
    draggingIdx.current = null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-300">Фотографии объекта ({photos.length})</div>
        <div className="flex items-center gap-2">
          <label className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-200 ${isUploading || disabled ? "opacity-50 pointer-events-none" : "bg-white/5 cursor-pointer"}`}>
            Выбрать фотографии
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileInputChange}
              disabled={isUploading || disabled}
            />
          </label>
        </div>
      </div>

      {error ? <div className="text-sm text-rose-400">{error}</div> : null}

      <div
        className={`rounded-2xl border border-white/10 p-4 mb-3 ${isDragging ? "bg-white/5" : "bg-transparent"} ${disabled ? "opacity-60" : ""}`}
        onDrop={handleDropFiles}
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
      >
        <div className="text-sm text-slate-300">Перетащите сюда фотографии</div>
        <div className="text-sm text-slate-400">или выберите несколько файлов</div>
        <div className="mt-2 text-xs text-slate-500">JPG, PNG или WebP · до 20 МБ · максимум 30 фотографий</div>
      </div>

      {isUploading ? (
        <div className="text-sm text-slate-300">Загружаем фотографии: {uploadProgress.completed} из {uploadProgress.total}</div>
      ) : null}

      <div
        className="grid grid-cols-3 gap-3"
        onDragOver={onDragOver}
        onDrop={(e) => void handleDropToEnd(e)}
      >
        {photos.map((p, idx) => (
          <div
            key={p.id}
            draggable
            onDragStart={(e) => onDragStart(e, idx)}
            onDrop={(e) => void onDrop(e, idx)}
            className="relative rounded-lg border border-white/10 bg-slate-900/60 p-2"
          >
            <div className="h-36 w-full overflow-hidden rounded-md bg-white/5 flex items-center justify-center">
              {previewUrls[p.id] ? (
                <img src={previewUrls[p.id]} alt={p.fileName} className="h-full w-full object-cover" />
              ) : (
                <div className="text-sm text-slate-400">Загрузка...</div>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-300 truncate">{p.fileName}</div>
              <div className="flex gap-1">
                {p.isCover ? (
                  <div className="rounded-full bg-cyan-500/20 px-2 py-1 text-xs text-cyan-200">Главная</div>
                ) : (
                  <button type="button" onClick={() => void handleMakeCover(idx)} className="rounded-full bg-white/5 px-2 py-1 text-xs text-slate-200">Сделать главной</button>
                )}
                <button type="button" onClick={() => void handleRemove(p)} className="rounded-full bg-rose-500/10 px-2 py-1 text-xs text-rose-300">Удалить</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
