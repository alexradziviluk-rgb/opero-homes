"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import PhoneInput from "@/components/PhoneInput";
import type { Apartment, ApartmentPhoto } from "@/types/apartment";
import {
  ApartmentForm,
  buildApartment,
  getErrorMessage,
  initialApartmentForm,
  validateForm,
  apartmentToForm,
} from "@/app/apartments/apartment-utils";
import ApartmentPhotoManager from "@/components/apartments/apartment-photo-manager";
import { resolveGoogleMapsAddress } from "@/lib/maps/google-maps";
import { loadApartmentFromSupabase, saveApartmentToSupabase } from "@/lib/apartments/supabase-apartments";

type AssigneeItem = {
  userId: string;
  roleCode: string;
  firstName: string;
  lastName: string;
  email: string;
};

const objectTypes = ["Квартира", "Вилла", "Апарт-отель", "Пентхаус", "Таунхаус"];
const cities = ["Аланья", "Анталья", "Стамбул", "Другой"];

export default function EditApartmentPage() {
  const params = useParams();
  const apartmentId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const [apartment, setApartment] = useState<Apartment | null>(null);
  const [form, setForm] = useState<ApartmentForm>(initialApartmentForm);
  const [photos, setPhotos] = useState<ApartmentPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState("");
  const [mapsStatus, setMapsStatus] = useState("");
  const [mapsError, setMapsError] = useState("");
  const [mapsLoading, setMapsLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [responsibleOptions, setResponsibleOptions] = useState<AssigneeItem[]>([]);
  const [backupOptions, setBackupOptions] = useState<AssigneeItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!apartmentId) {
        setNotFound(true);
        return;
      }

      const found = await loadApartmentFromSupabase(apartmentId);
      if (cancelled) return;
      if (!found) {
        setNotFound(true);
        return;
      }
      setApartment(found);
      setForm(apartmentToForm(found));
      setPhotos(found.photos ?? []);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [apartmentId]);

  useEffect(() => {
    async function loadAssignees() {
      const response = await fetch("/api/notifications/assignees", { cache: "no-store" }).catch(() => null);
      if (!response) return;

      const payload = (await response.json()) as {
        ok: boolean;
        data?: { responsible: AssigneeItem[]; backupManagers: AssigneeItem[] };
      };

      if (!payload.ok || !payload.data) {
        return;
      }

      setResponsibleOptions(payload.data.responsible ?? []);
      setBackupOptions(payload.data.backupManagers ?? []);
    }

    void loadAssignees();
  }, []);

  const handlePhotosChange = useCallback(async (nextPhotos: ApartmentPhoto[]) => {
    if (!apartment) return;

    setPhotos(nextPhotos);
    const savedApartment = await saveApartmentToSupabase({
      ...apartment,
      photos: nextPhotos,
      coverPhotoUrl: nextPhotos.find((photo) => photo.isCover)?.storagePath ?? null,
    });
    setApartment(savedApartment);
    setPhotos(savedApartment.photos ?? []);
    showToast("Фотографии сохранены");
  }, [apartment]);

  function update<K extends keyof ApartmentForm>(key: K, value: ApartmentForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function updateRentalType(type: keyof ApartmentForm["rentalTypes"], value: boolean) {
    setForm((prev) => ({
      ...prev,
      rentalTypes: {
        ...prev.rentalTypes,
        [type]: value,
      },
    }));
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  }

  async function handleResolveAddress() {
    setMapsError("");
    setMapsStatus("");

    if (!form.googleLink.trim()) {
      setMapsError("Вставьте корректную ссылку Google Maps");
      return;
    }

    setMapsLoading(true);
    setMapsStatus("Загрузка...");

    try {
      const result = await resolveGoogleMapsAddress(form.googleLink);
      update("city", result.city);
      update("district", result.district);
      update("address", result.address);
      update("latitude", result.latitude);
      update("longitude", result.longitude);
      setMapsStatus("Адрес успешно определён");
    } catch {
      setMapsError("Вставьте корректную ссылку Google Maps");
      setMapsStatus("");
    } finally {
      setMapsLoading(false);
    }
  }

  function saveDraft() {
    if (!apartment) return;
    const updatedApartment = buildApartment({ ...form, publicationStatus: "draft" }, apartment.id, apartment);
    updatedApartment.photos = photos;
    updatedApartment.coverPhotoUrl = photos.find((p) => p.isCover)?.storagePath ?? null;
    void saveApartmentToSupabase(updatedApartment)
      .then(() => showToast("Черновик сохранён"))
      .catch((error: unknown) => {
        console.error("Failed to save apartment draft:", error);
        showToast(`Не удалось сохранить черновик: ${getErrorMessage(error)}`);
      });
  }

  async function updateApartment() {
    if (!apartment) return;
    const validationErrors = validateForm(form);
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      showToast("Пожалуйста, заполните обязательные поля");
      return;
    }

    const updatedApartment = buildApartment(form, apartment.id, apartment);
    updatedApartment.photos = photos;
    updatedApartment.coverPhotoUrl = photos.find((p) => p.isCover)?.storagePath ?? null;
    try {
      await saveApartmentToSupabase(updatedApartment);
      showToast("Изменения сохранены");
      setTimeout(() => router.push(`/apartments/${apartment.id}`), 1000);
    } catch (error: unknown) {
      console.error("Failed to update apartment:", error);
      showToast(`Не удалось сохранить изменения: ${getErrorMessage(error)}`);
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
          <Sidebar />
          <div className="flex-1">
            <Header showSearch={false} showNewListing={false} />
            <main className="p-6">
              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 text-center">
                <h1 className="text-3xl font-semibold text-white">Объект не найден</h1>
                <p className="mt-4 text-slate-400">Неверный идентификатор объекта.</p>
                <Link href="/apartments" className="mt-6 inline-flex rounded-2xl border border-white/10 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20">
                  Вернуться к объектам
                </Link>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (!apartment) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />
          <main className="p-4 sm:p-6 lg:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Link href={`/apartments/${apartment.id}`} className="cursor-pointer inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 hover:bg-white/10">
                  ← К объекту
                </Link>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Редактирование объекта</h1>
              </div>
            </div>

            <form className="space-y-6">
              <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <h2 className="text-lg font-semibold text-white">Основная информация</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <div className="text-sm text-slate-300">Название объекта</div>
                    <input value={form.title} onChange={(e) => update("title", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                    {errors.title ? <p className="mt-1 text-sm text-rose-400">{errors.title}</p> : null}
                  </label>
                  <label className="block">
                    <div className="text-sm text-slate-300">Номер квартиры</div>
                    <input value={form.unitNumber} onChange={(e) => update("unitNumber", e.target.value)} placeholder="Например, 12A" className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500" />
                  </label>
                  <label className="block">
                    <div className="text-sm text-slate-300">Тип объекта</div>
                    <select value={form.type} onChange={(e) => update("type", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none">
                      <option value="">Выберите тип</option>
                      {objectTypes.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    {errors.type ? <p className="mt-1 text-sm text-rose-400">{errors.type}</p> : null}
                  </label>
                  <div className="sm:col-span-2">
                    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                      <label className="block">
                        <div className="text-sm text-slate-300">Ссылка Google Maps</div>
                        <input
                          value={form.googleLink}
                          onChange={(e) => update("googleLink", e.target.value)}
                          placeholder="https://maps.google.com/..."
                          className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                        />
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          onClick={handleResolveAddress}
                          disabled={mapsLoading}
                          className="rounded-2xl border border-white/10 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Получить адрес
                        </button>
                        <p className={`text-sm ${mapsError ? "text-rose-400" : mapsStatus ? "text-emerald-300" : "text-slate-300"}`}>
                          {mapsLoading ? "Загрузка..." : mapsError || mapsStatus || ""}
                        </p>
                      </div>
                    </div>
                  </div>
                  <label className="block">
                    <div className="text-sm text-slate-300">Город</div>
                    <select value={form.city} onChange={(e) => update("city", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none">
                      <option value="">Выберите город</option>
                      {cities.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    {errors.city ? <p className="mt-1 text-sm text-rose-400">{errors.city}</p> : null}
                  </label>
                  <label className="block">
                    <div className="text-sm text-slate-300">Район</div>
                    <input value={form.district} onChange={(e) => update("district", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                    {errors.district ? <p className="mt-1 text-sm text-rose-400">{errors.district}</p> : null}
                  </label>
                  <label className="sm:col-span-2 block">
                    <div className="text-sm text-slate-300">Полный адрес</div>
                    <input value={form.address} onChange={(e) => update("address", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                    {errors.address ? <p className="mt-1 text-sm text-rose-400">{errors.address}</p> : null}
                  </label>
                  <label className="block">
                    <div className="text-sm text-slate-300">Широта</div>
                    <input
                      value={form.latitude}
                      onChange={(e) => update("latitude", e.target.value)}
                      placeholder="36.5444"
                      inputMode="decimal"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                    />
                    {errors.latitude ? <p className="mt-1 text-sm text-rose-400">{errors.latitude}</p> : null}
                  </label>
                  <label className="block">
                    <div className="text-sm text-slate-300">Долгота</div>
                    <input
                      value={form.longitude}
                      onChange={(e) => update("longitude", e.target.value)}
                      placeholder="32.0058"
                      inputMode="decimal"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                    />
                    {errors.longitude ? <p className="mt-1 text-sm text-rose-400">{errors.longitude}</p> : null}
                  </label>
                  <p className="sm:col-span-2 text-xs text-slate-500">Координаты можно скопировать из Google Maps или OpenStreetMap.</p>
                  <label className="sm:col-span-2 block">
                    <div className="text-sm text-slate-300">Краткое описание</div>
                    <textarea value={form.shortDesc} onChange={(e) => update("shortDesc", e.target.value)} className="mt-1 h-24 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                  </label>
                </div>
              </section>
                <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                  <h2 className="text-lg font-semibold text-white">Фотографии объекта</h2>
                  <div className="mt-4">
                    <ApartmentPhotoManager apartmentId={apartment.id} photos={photos} onChange={handlePhotosChange} />
                  </div>
                </section>

              <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <h2 className="text-lg font-semibold text-white">Ответственные за уведомления</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label>
                    <div className="text-sm text-slate-300">Ответственный сотрудник</div>
                    <select
                      value={form.responsibleUserId}
                      onChange={(e) => update("responsibleUserId", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                    >
                      <option value="">Не выбран</option>
                      {responsibleOptions.map((option) => (
                        <option key={option.userId} value={option.userId}>
                          {option.firstName} {option.lastName} ({option.roleCode})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <div className="text-sm text-slate-300">Backup менеджер</div>
                    <select
                      value={form.backupManagerUserId}
                      onChange={(e) => update("backupManagerUserId", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                    >
                      <option value="">Не выбран</option>
                      {backupOptions.map((option) => (
                        <option key={option.userId} value={option.userId}>
                          {option.firstName} {option.lastName} ({option.roleCode})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <h2 className="text-lg font-semibold text-white">Характеристики</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <label>
                    <div className="text-sm text-slate-300">Количество комнат</div>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={form.rooms}
                      onChange={(e) => update("rooms", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                    />
                  </label>
                  <label>
                    <div className="text-sm text-slate-300">Количество спален</div>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={form.bedrooms}
                      onChange={(e) => update("bedrooms", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                    />
                  </label>
                  <label>
                    <div className="text-sm text-slate-300">Количество санузлов</div>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={form.bathrooms}
                      onChange={(e) => update("bathrooms", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                    />
                  </label>
                  <label>
                    <div className="text-sm text-slate-300">Этаж</div>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={form.floor}
                      onChange={(e) => update("floor", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                    />
                  </label>
                  <label>
                    <div className="text-sm text-slate-300">Площадь, м²</div>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      inputMode="numeric"
                      value={form.area}
                      onChange={(e) => update("area", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                    />
                  </label>
                  <label>
                    <div className="text-sm text-slate-300">Макс. гостей</div>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={form.maxGuests}
                      onChange={(e) => update("maxGuests", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                    />
                    {errors.maxGuests ? <p className="mt-1 text-sm text-rose-400">{errors.maxGuests}</p> : null}
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <h2 className="text-lg font-semibold text-white">Условия аренды</h2>
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={form.rentalTypes.daily}
                        onChange={(e) => updateRentalType("daily", e.target.checked)}
                        className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-400"
                      />
                      Посуточно
                    </label>
                    <label className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={form.rentalTypes.weekly}
                        onChange={(e) => updateRentalType("weekly", e.target.checked)}
                        className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-400"
                      />
                      Понедельная
                    </label>
                    <label className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={form.rentalTypes.monthly}
                        onChange={(e) => updateRentalType("monthly", e.target.checked)}
                        className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-400"
                      />
                      Помесячная
                    </label>
                  </div>
                  {errors.rentalTypes ? <p className="text-sm text-rose-400">{errors.rentalTypes}</p> : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {form.rentalTypes.daily ? (
                      <>
                        <label>
                          <div className="text-sm text-slate-300">Цена за ночь, €</div>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="numeric"
                            value={form.dailyPrice}
                            onChange={(e) => update("dailyPrice", e.target.value)}
                            className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                          />
                          {errors.dailyPrice ? <p className="mt-1 text-sm text-rose-400">{errors.dailyPrice}</p> : null}
                        </label>
                        <label>
                          <div className="text-sm text-slate-300">Минимальное количество ночей</div>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            value={form.minimumNights}
                            onChange={(e) => update("minimumNights", e.target.value)}
                            className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                          />
                          {errors.minimumNights ? <p className="mt-1 text-sm text-rose-400">{errors.minimumNights}</p> : null}
                        </label>
                      </>
                    ) : null}
                    {form.rentalTypes.weekly ? (
                      <>
                        <label>
                          <div className="text-sm text-slate-300">Цена за неделю, €</div>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="numeric"
                            value={form.weeklyPrice}
                            onChange={(e) => update("weeklyPrice", e.target.value)}
                            className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                          />
                          {errors.weeklyPrice ? <p className="mt-1 text-sm text-rose-400">{errors.weeklyPrice}</p> : null}
                        </label>
                        <label>
                          <div className="text-sm text-slate-300">Минимальное количество недель</div>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            value={form.minimumWeeks}
                            onChange={(e) => update("minimumWeeks", e.target.value)}
                            className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                          />
                          {errors.minimumWeeks ? <p className="mt-1 text-sm text-rose-400">{errors.minimumWeeks}</p> : null}
                        </label>
                      </>
                    ) : null}
                    {form.rentalTypes.monthly ? (
                      <>
                        <label>
                          <div className="text-sm text-slate-300">Цена за месяц, €</div>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="numeric"
                            value={form.monthlyPrice}
                            onChange={(e) => update("monthlyPrice", e.target.value)}
                            className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                          />
                          {errors.monthlyPrice ? <p className="mt-1 text-sm text-rose-400">{errors.monthlyPrice}</p> : null}
                        </label>
                        <label>
                          <div className="text-sm text-slate-300">Минимальное количество месяцев</div>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            value={form.minimumMonths}
                            onChange={(e) => update("minimumMonths", e.target.value)}
                            className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                          />
                          {errors.minimumMonths ? <p className="mt-1 text-sm text-rose-400">{errors.minimumMonths}</p> : null}
                        </label>
                      </>
                    ) : null}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label>
                      <div className="text-sm text-slate-300">Залог, €</div>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="numeric"
                        value={form.deposit}
                        onChange={(e) => update("deposit", e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                      />
                    </label>
                    <label>
                      <div className="text-sm text-slate-300">Стоимость уборки, €</div>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="numeric"
                        value={form.cleaningFee}
                        onChange={(e) => update("cleaningFee", e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                      />
                    </label>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <h2 className="text-lg font-semibold text-white">Владелец</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <label>
                    <div className="text-sm text-slate-300">Имя владельца</div>
                    <input value={form.ownerName} onChange={(e) => update("ownerName", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                  </label>
                  <label>
                    <div className="text-sm text-slate-300">Телефон</div>
                    <PhoneInput value={form.ownerPhone} onChange={(nextValue) => update("ownerPhone", nextValue)} />
                  </label>
                  <label>
                    <div className="text-sm text-slate-300">Email</div>
                    <input value={form.ownerEmail} onChange={(e) => update("ownerEmail", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <h2 className="text-lg font-semibold text-white">Статус</h2>
                <div className="mt-4 space-y-4">
                  <div>
                    <div className="text-xs text-slate-400">Публикация на сайте</div>
                    <select
                      value={form.publicationStatus}
                      onChange={(e) => update("publicationStatus", e.target.value as ApartmentForm["publicationStatus"])}
                      className="mt-1 rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none"
                    >
                      <option value="draft">Черновик</option>
                      <option value="published">Опубликован</option>
                      <option value="hidden">Скрыт</option>
                    </select>
                  </div>
                  <div className="text-xs text-slate-400">Внутренний статус объекта</div>
                  <select value={form.publishStatus} onChange={(e) => update("publishStatus", e.target.value as ApartmentForm["publishStatus"])} className="rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none">
                    <option value="Черновик">Черновик</option>
                    <option value="Опубликован">Опубликован</option>
                    <option value="На обслуживании">На обслуживании</option>
                  </select>
                </div>
              </section>

              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={saveDraft} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">Сохранить черновик</button>
                <button type="button" onClick={() => void updateApartment()} className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20">Сохранить изменения</button>
              </div>
            </form>

            {toast ? (
              <div className="fixed bottom-6 right-6 rounded-xl bg-slate-900/90 border border-white/10 px-4 py-2 text-sm text-white shadow-lg">
                {toast}
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
