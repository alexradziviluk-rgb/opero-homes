"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import PhoneInput from "@/components/PhoneInput";
import ApartmentPhotoManager from "@/components/apartments/apartment-photo-manager";
import { resolveGoogleMapsAddress } from "@/lib/maps/google-maps";
import type { ApartmentPhoto } from "@/types/apartment";
import { buildApartment, getErrorMessage, validateForm } from "@/app/apartments/apartment-utils";
import { useCallback } from "react";
import { saveApartmentToSupabase } from "@/lib/apartments/supabase-apartments";

type ApartmentForm = {
  title: string;
  unitNumber: string;
  type: string;
  googleLink: string;
  country: string;
  city: string;
  district: string;
  address: string;
  latitude: string;
  longitude: string;
  shortDesc: string;
  rooms: string;
  bedrooms: string;
  beds: string;
  bathrooms: string;
  floor: string;
  area: string;
  maxGuests: string;
  deposit: string;
  cleaningFee: string;
  rentalTypes: {
    daily: boolean;
    weekly: boolean;
    monthly: boolean;
  };
  dailyPrice: string;
  weeklyPrice: string;
  monthlyPrice: string;
  minimumNights: string;
  minimumWeeks: string;
  minimumMonths: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  responsibleUserId: string;
  backupManagerUserId: string;
  publishStatus: "Черновик" | "Опубликован" | "На обслуживании";
  publicationStatus: "draft" | "published" | "hidden" | "archived";
  amenities: string[];
  pets: "allowed" | "negotiable" | "not_allowed";
  smoking: "allowed" | "not_allowed";
  checkIn: string;
  checkOut: string;
  houseRulesNotes: string;
};

const initialForm: ApartmentForm = {
  title: "",
  unitNumber: "",
  type: "",
  googleLink: "",
  country: "Турция",
  city: "",
  district: "",
  address: "",
  latitude: "",
  longitude: "",
  shortDesc: "",
  rooms: "",
  bedrooms: "",
  beds: "",
  bathrooms: "",
  floor: "",
  area: "",
  maxGuests: "",
  deposit: "",
  cleaningFee: "",
  rentalTypes: {
    daily: false,
    weekly: false,
    monthly: false,
  },
  dailyPrice: "",
  weeklyPrice: "",
  monthlyPrice: "",
  minimumNights: "",
  minimumWeeks: "",
  minimumMonths: "",
  ownerName: "",
  ownerPhone: "",
  ownerEmail: "",
  responsibleUserId: "",
  backupManagerUserId: "",
  publishStatus: "Черновик",
  publicationStatus: "draft",
  amenities: [],
  pets: "negotiable",
  smoking: "not_allowed",
  checkIn: "15:00",
  checkOut: "11:00",
  houseRulesNotes: "",
};

type AssigneeItem = {
  userId: string;
  roleCode: string;
  firstName: string;
  lastName: string;
  email: string;
};

const objectTypes = ["Квартира", "Вилла", "Апарт-отель", "Пентхаус", "Таунхаус"];
const cities = ["Аланья", "Анталья", "Стамбул", "Другой"];
// Use shared buildApartment, validateForm, and storage helpers from apartment-utils

export default function NewApartmentPage() {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState("");
  const [mapsStatus, setMapsStatus] = useState("");
  const [mapsError, setMapsError] = useState("");
  const [mapsLoading, setMapsLoading] = useState(false);
  const [apartmentId] = useState(() => (typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now())));
  const [photos, setPhotos] = useState<ApartmentPhoto[]>([]);
  const [responsibleOptions, setResponsibleOptions] = useState<AssigneeItem[]>([]);
  const [backupOptions, setBackupOptions] = useState<AssigneeItem[]>([]);
  const router = useRouter();

  function getValidationSummary(validationErrors: Record<string, string>) {
    const labels: Record<string, string> = {
      title: "Название объекта",
      type: "Тип объекта",
      city: "Город",
      district: "Район",
      address: "Полный адрес",
      rooms: "Комнаты",
      bedrooms: "Спальни",
      bathrooms: "Ванные комнаты",
      maxGuests: "Максимум гостей",
      latitude: "Широта",
      longitude: "Долгота",
      rentalTypes: "Тип аренды",
      dailyPrice: "Цена за сутки",
      minimumNights: "Минимум ночей",
      weeklyPrice: "Цена за неделю",
      minimumWeeks: "Минимум недель",
      monthlyPrice: "Цена за месяц",
      minimumMonths: "Минимум месяцев",
    };

    return Object.keys(validationErrors).map((key) => labels[key] ?? key).join(", ");
  }

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

  const handlePhotosChange = useCallback((nextPhotos: ApartmentPhoto[]) => {
    setPhotos(nextPhotos);
  }, []);

  const prepareApartmentForPhotos = useCallback(async () => {
    const validationErrors = validateForm(form);
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      return;
    }

    const draft = buildApartment({ ...form, publicationStatus: "draft" }, apartmentId);
    draft.photos = photos;
    draft.coverPhotoUrl = photos.find((p) => p.isCover)?.storagePath ?? null;
    await saveApartmentToSupabase(draft);
  }, [apartmentId, form, photos]);

  function update<K extends keyof ApartmentForm>(key: K, value: ApartmentForm[K]) {
    setForm((s) => ({ ...s, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function updateRentalType(type: keyof ApartmentForm["rentalTypes"], value: boolean) {
    setForm((s) => ({
      ...s,
      rentalTypes: {
        ...s.rentalTypes,
        [type]: value,
      },
    }));
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  }

  async function saveDraft() {
    const validationErrors = validateForm(form);
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      showToast(`Не заполнены поля: ${getValidationSummary(validationErrors)}`);
      return;
    }

    const id = apartmentId;
    const draft = buildApartment({ ...form, publicationStatus: "draft" }, id);
    draft.photos = photos;
    draft.coverPhotoUrl = photos.find((p) => p.isCover)?.storagePath ?? null;
    try {
      await saveApartmentToSupabase(draft);
      showToast("Черновик сохранён");
    } catch (error: unknown) {
      console.error("Failed to save apartment draft:", error);
      showToast(`Не удалось сохранить черновик: ${getErrorMessage(error)}`);
    }
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
      if (!form.title.trim() && result.title) update("title", result.title);
      if (result.country) update("country", result.country);
      update("city", result.city);
      update("district", result.district);
      update("address", result.address);
      update("latitude", result.latitude);
      update("longitude", result.longitude);
      setMapsStatus("Адрес успешно определён");
    } catch (error) {
      setMapsError(error instanceof Error && error.message === "invalid" ? "Вставьте ссылку Google Maps" : "Не удалось определить адрес по этой ссылке");
      setMapsStatus("");
    } finally {
      setMapsLoading(false);
    }
  }

  async function create() {
    const validationErrors = validateForm(form);
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      showToast(`Не заполнены поля: ${getValidationSummary(validationErrors)}`);
      return;
    }

    const id = apartmentId;
    const apartment = buildApartment(form, id);
    apartment.photos = photos;
    apartment.coverPhotoUrl = photos.find((p) => p.isCover)?.storagePath ?? null;
    try {
      await saveApartmentToSupabase(apartment);
      showToast("Объект успешно создан");
      setTimeout(() => {
        router.push("/apartments");
      }, 1200);
    } catch (error: unknown) {
      console.error("Failed to create apartment:", error);
      showToast(`Не удалось создать объект: ${getErrorMessage(error)}`);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />

        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />

          <main className="p-4 sm:p-6 lg:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href="/apartments" className="cursor-pointer inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 hover:bg-white/10">
                  ← Назад к объектам
                </Link>
                <h1 className="text-2xl font-semibold tracking-tight text-white">Новый объект</h1>
              </div>
            </div>

            <form className="flex flex-col gap-6">
              <section className="order-1 rounded-2xl border border-white/10 bg-slate-900/80 p-6">
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
                    <div className="text-sm text-slate-300">Страна</div>
                    <input value={form.country} onChange={(e) => update("country", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                  </label>
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

              <section className="order-2 rounded-2xl border border-white/10 bg-slate-900/80 p-6">
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

              <section className="order-3 rounded-2xl border border-white/10 bg-slate-900/80 p-6">
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
                            aria-label="Цена за ночь, €"
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
                            aria-label="Минимальное количество ночей"
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

              <section className="order-7 rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <h2 className="text-lg font-semibold text-white">Фотографии</h2>
                  <p className="mt-1 text-sm text-slate-400">Фотографии можно загрузить в любой момент. Если обязательные поля ещё не заполнены, они сохранятся после заполнения и сохранения объекта.</p>
                <div className="mt-4">
                  <ApartmentPhotoManager apartmentId={apartmentId} photos={photos} onChange={handlePhotosChange} onBeforeUpload={prepareApartmentForPhotos} />
                </div>
              </section>

              <section className="order-8 rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <h2 className="text-lg font-semibold text-white">Удобства</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {["Wi-Fi", "Бассейн", "Парковка", "Кондиционер", "Кухня", "Стиральная машина", "Балкон", "Лифт"].map((amenity) => (
                    <label key={amenity} className="inline-flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-200">
                      <input type="checkbox" aria-label={amenity} checked={form.amenities.includes(amenity)} onChange={(e) => update("amenities", e.target.checked ? [...form.amenities, amenity] : form.amenities.filter((item) => item !== amenity))} className="h-4 w-4" />
                      {amenity}
                    </label>
                  ))}
                </div>
              </section>

              <section className="order-9 rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <h2 className="text-lg font-semibold text-white">Правила проживания</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label><div className="text-sm text-slate-300">Животные</div><select aria-label="Животные" value={form.pets} onChange={(e) => update("pets", e.target.value as ApartmentForm["pets"])} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white"><option value="negotiable">По согласованию</option><option value="allowed">Разрешены</option><option value="not_allowed">Запрещены</option></select></label>
                  <label><div className="text-sm text-slate-300">Курение</div><select aria-label="Курение" value={form.smoking} onChange={(e) => update("smoking", e.target.value as ApartmentForm["smoking"])} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white"><option value="not_allowed">Запрещено</option><option value="allowed">Разрешено</option></select></label>
                  <label><div className="text-sm text-slate-300">Check-in</div><input aria-label="Check-in" type="time" value={form.checkIn} onChange={(e) => update("checkIn", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white" /></label>
                  <label><div className="text-sm text-slate-300">Check-out</div><input aria-label="Check-out" type="time" value={form.checkOut} onChange={(e) => update("checkOut", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white" /></label>
                  <label className="sm:col-span-2"><div className="text-sm text-slate-300">Прочие правила</div><textarea aria-label="Прочие правила" value={form.houseRulesNotes} onChange={(e) => update("houseRulesNotes", e.target.value)} className="mt-1 h-20 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white" /></label>
                </div>
              </section>

              <section className="order-4 rounded-2xl border border-white/10 bg-slate-900/80 p-6">
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

              <section className="order-5 rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <h2 className="text-lg font-semibold text-white">Владелец <span className="text-sm font-normal text-slate-400">(необязательно)</span></h2>
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

              <section className="order-6 rounded-2xl border border-white/10 bg-slate-900/80 p-6">
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

              <div className="order-10 flex items-center justify-end gap-3">
                <button type="button" onClick={saveDraft} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">Сохранить черновик</button>
                <button type="button" onClick={() => void create()} className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20">Создать объект</button>
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
