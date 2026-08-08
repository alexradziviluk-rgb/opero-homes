"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { Booking } from "@/types/booking";
import type { Apartment } from "@/types/apartment";
import { fetchStaffBookings } from "@/lib/bookings/staff-bookings";
import { loadApartmentsFromSupabase } from "@/lib/apartments/supabase-apartments";
import { findBookingConflict, isBlockingBooking } from "@/lib/bookings/booking-conflicts";
import { createClient, getClients } from "@/lib/clients/client-repository";
import { userRepository } from "@/lib/repositories/users";
import { initialClientDraft, type Client, type ClientDraft } from "@/types/client";
import { emitBookingNotificationEvent } from "@/lib/notifications/client-events";
import PhoneInput from "@/components/PhoneInput";

function nightsBetween(a: string, b: string) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  const diff = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU");
}

function applyApartmentDefaults(form: Partial<Booking>, apartment: Apartment | undefined): Partial<Booking> {
  if (!apartment) return form;

  const allowedTypes = (["daily", "weekly", "monthly"] as const).filter((type) => apartment.rentalTypes[type]);
  const rentalType = form.rentalType && allowedTypes.includes(form.rentalType) ? form.rentalType : allowedTypes[0];
  const priceByType = {
    daily: apartment.dailyPrice,
    weekly: apartment.weeklyPrice,
    monthly: apartment.monthlyPrice,
  };

  return {
    ...form,
    rentalType,
    pricePerPeriod: rentalType ? priceByType[rentalType] ?? 0 : 0,
    cleaningFee: apartment.cleaningFee ?? form.cleaningFee,
    deposit: apartment.deposit ?? form.deposit,
    guests: Math.min(form.guests ?? 1, apartment.maxGuests ?? 999),
  };
}

function NewBookingPageContent() {
  const router = useRouter();
  const { currentUser } = useCurrentUser();
  const searchParams = useSearchParams();
  const apartmentIdFromUrl = searchParams.get("apartmentId") ?? "";
  const checkInFromUrl = searchParams.get("checkIn") ?? "";
  const checkOutFromUrl = searchParams.get("checkOut") ?? "";

  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [clients, setClients] = useState<Client[]>(() => getClients());
  const [quickClient, setQuickClient] = useState<ClientDraft>(initialClientDraft);
  const [showQuickClientForm, setShowQuickClientForm] = useState(false);

  const [form, setForm] = useState<Partial<Booking>>(() => applyApartmentDefaults({
    apartmentId: apartmentIdFromUrl,
    clientId: "",
    guestName: "",
    guestPhone: "",
    guestEmail: "",
    checkIn: checkInFromUrl,
    checkOut: checkOutFromUrl,
    checkInTime: "15:00",
    checkOutTime: "11:00",
    guests: 1,
    rentalType: "daily",
    pricePerPeriod: 0,
    cleaningFee: 0,
    deposit: 0,
    discount: 0,
    paidAmount: 0,
    status: "pending",
    source: "direct",
    notes: "",
  }, undefined));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isComplimentary, setIsComplimentary] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadApartmentsFromSupabase(), fetchStaffBookings()]).then(([nextApartments, nextBookings]) => {
      if (cancelled) return;
      setApartments(nextApartments);
      setBookings(nextBookings);
      setForm((current) => applyApartmentDefaults(current, nextApartments.find((apartment) => apartment.id === current.apartmentId)));
    });
    return () => { cancelled = true; };
  }, []);

  const selectedApartment = apartments.find((apartment) => apartment.id === form.apartmentId);
  const selectedApartmentUnavailable = selectedApartment?.status === "Занято" || selectedApartment?.availability === "Занят";
  const allowedRentalTypes = selectedApartment
    ? (["daily", "weekly", "monthly"] as const).filter((type) => selectedApartment.rentalTypes[type])
    : [];

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === form.clientId) ?? null,
    [clients, form.clientId],
  );

  const occupiedRanges = useMemo(
    () =>
      bookings
        .filter((booking) => booking.apartmentId === form.apartmentId && isBlockingBooking(booking))
        .map((booking) => ({
          id: booking.id,
          from: booking.checkIn,
          to: booking.checkOut,
        })),
    [bookings, form.apartmentId],
  );

  const dateConflict = useMemo(() => {
    if (!form.apartmentId || !form.checkIn || !form.checkOut) {
      return undefined;
    }

    return findBookingConflict({
      bookings,
      apartmentId: form.apartmentId,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
    });
  }, [bookings, form.apartmentId, form.checkIn, form.checkOut]);

  const conflictMessage =
    errors.dates ??
    (dateConflict
      ? `Объект уже забронирован с ${formatDate(dateConflict.checkIn)} по ${formatDate(dateConflict.checkOut)}`
      : "");

  function update<K extends keyof Booking>(key: K, value: Booking[K]) {
    setForm((previous) => {
      const next = { ...previous, [key]: value };
      if (key !== "apartmentId" && key !== "rentalType") return next;
      return applyApartmentDefaults(next, apartments.find((apartment) => apartment.id === next.apartmentId));
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  }

  function updateQuickClient<K extends keyof ClientDraft>(key: K, value: ClientDraft[K]) {
    setQuickClient((previous) => ({ ...previous, [key]: value }));
  }

  function handleSelectClient(clientId: string) {
    if (!clientId) {
      setForm((previous) => ({ ...previous, clientId: "" }));
      return;
    }

    const client = clients.find((item) => item.id === clientId);
    if (!client) return;

    setForm((previous) => ({
      ...previous,
      clientId: client.id,
      guestName: `${client.firstName} ${client.lastName}`.trim(),
      guestPhone: client.phone,
      guestEmail: client.email,
    }));
  }

  function handleCreateQuickClient() {
    if (!quickClient.firstName.trim() || !quickClient.lastName.trim() || !quickClient.phone.trim() || !quickClient.email.trim()) {
      setErrors((previous) => ({
        ...previous,
        client: "Для быстрого создания заполните имя, фамилию, телефон и email.",
      }));
      return;
    }

    const created = createClient(quickClient);
    const loadedClients = getClients();
    setClients(loadedClients);
    setShowQuickClientForm(false);
    setQuickClient(initialClientDraft);
    setErrors((previous) => ({ ...previous, client: "" }));
    handleSelectClient(created.id);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    const todayIso = new Date().toISOString().slice(0, 10);

    if (!form.apartmentId) e.apartmentId = "Выберите объект";
    if (selectedApartmentUnavailable) e.apartmentId = "На данный момент бронирование этого объекта невозможно: объект занят";
    if (!form.guestName?.trim()) e.guestName = "Имя гостя обязательно";
    if (!form.checkIn) e.checkIn = "Дата заезда обязательна";
    if (!form.checkOut) e.checkOut = "Дата выезда обязательна";
    if (form.checkIn && form.checkIn < todayIso) e.checkIn = "Нельзя выбрать прошедшую дату";
    if (form.checkOut && form.checkOut < todayIso) e.checkOut = "Нельзя выбрать прошедшую дату";
    if (form.checkIn && form.checkOut && new Date(form.checkOut) <= new Date(form.checkIn)) e.dates = "Дата выезда должна быть позже даты заезда";
    if (!form.guests || Number(form.guests) < 1) e.guests = "Кол-во гостей должно быть не меньше 1";
    if (form.rentalType && !allowedRentalTypes.includes(form.rentalType)) e.rentalType = "Этот тип аренды недоступен для объекта";
    if ((Number(form.pricePerPeriod) || 0) <= 0 && !isComplimentary) e.pricePerPeriod = "Укажите цену или подтвердите бесплатное размещение";

    // conflict check against current snapshot of bookings
    if (form.apartmentId && form.checkIn && form.checkOut) {
      const conflict = findBookingConflict({
        bookings,
        apartmentId: form.apartmentId,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
      });
      if (conflict) {
        e.dates = `Объект уже забронирован с ${formatDate(conflict.checkIn)} по ${formatDate(conflict.checkOut)}`;
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function computeAmounts(): { periodsCount: number; accommodationAmount: number; totalAmount: number; paymentStatus: Booking["paymentStatus"] } {
    const checkIn = form.checkIn || "";
    const checkOut = form.checkOut || "";
    const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
    let periods = 0;
    if (form.rentalType === "daily") periods = nights;
    else if (form.rentalType === "weekly") periods = Math.ceil(nights / 7);
    else periods = Math.ceil(nights / 30);

    const price = Number(form.pricePerPeriod) || 0;
    const accommodation = price * periods;
    const cleaning = Number(form.cleaningFee) || 0;
    const deposit = Number(form.deposit) || 0;
    const discount = Number(form.discount) || 0;
    let total = accommodation + cleaning + deposit - discount;
    if (total < 0) total = 0;
    const paid = Number(form.paidAmount) || 0;
    let paymentStatus: Booking["paymentStatus"] = "unpaid";
    if (paid <= 0) paymentStatus = "unpaid";
    else if (paid < total) paymentStatus = "partially_paid";
    else paymentStatus = "paid";

    return { periodsCount: periods, accommodationAmount: accommodation, totalAmount: total, paymentStatus };
  }

  async function handleSave() {
    if (!validate()) return;

    if (form.apartmentId && form.checkIn && form.checkOut) {
      const conflict = findBookingConflict({
        bookings,
        apartmentId: form.apartmentId,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
      });

      if (conflict) {
        setErrors((previous) => ({
          ...previous,
          dates: `Объект уже забронирован с ${formatDate(conflict.checkIn)} по ${formatDate(conflict.checkOut)}`,
        }));
        return;
      }
    }

    const amounts = computeAmounts();
    const now = new Date().toISOString();
    const status: Booking["status"] = form.status ?? "pending";
    const source: Booking["source"] = form.source ?? "direct";
    const rentalType: Booking["rentalType"] = form.rentalType ?? "daily";
    const booking: Booking = {
      id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `bk_${Math.random().toString(36).slice(2, 9)}`,
      apartmentId: form.apartmentId || "",
      clientId: form.clientId || "",
      guestName: form.guestName || "",
      guestPhone: form.guestPhone || "",
      guestEmail: form.guestEmail || "",
      checkIn: form.checkIn || now,
      checkOut: form.checkOut || now,
      checkInTime: form.checkInTime || "15:00",
      checkOutTime: form.checkOutTime || "11:00",
      guests: Number(form.guests) || 1,
      rentalType,
      pricePerPeriod: Number(form.pricePerPeriod) || 0,
      periodsCount: amounts.periodsCount,
      accommodationAmount: amounts.accommodationAmount,
      cleaningFee: Number(form.cleaningFee) || 0,
      deposit: Number(form.deposit) || 0,
      discount: Number(form.discount) || 0,
      totalAmount: amounts.totalAmount,
      paidAmount: Number(form.paidAmount) || 0,
      complimentary: isComplimentary,
      status,
      paymentStatus: amounts.paymentStatus,
      source,
      notes: form.notes || "",
      createdByUserId: currentUser?.id,
      updatedByUserId: currentUser?.id,
      createdAt: now,
      updatedAt: now,
    };

    if (booking.clientId && booking.guestEmail) {
      const guestUser = userRepository.createGuestUserFromBooking({
        clientId: booking.clientId,
        guestEmail: booking.guestEmail,
        guestName: booking.guestName,
        bookingId: booking.id,
      });
      booking.guestUserId = guestUser.id;
    }

    setIsSaving(true);
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(booking),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      code?: string;
      conflict?: { checkIn: string; checkOut: string };
    } | null;

    if (!response.ok || !payload?.ok) {
      setIsSaving(false);
      if (payload?.code === "apartment_unavailable") {
        setErrors((previous) => ({ ...previous, apartmentId: payload.error ?? "На данный момент бронирование этого объекта невозможно" }));
      } else if (payload?.code === "booking_conflict" && payload.conflict) {
        setErrors((previous) => ({
          ...previous,
          dates: `Объект уже забронирован с ${formatDate(payload.conflict!.checkIn)} по ${formatDate(payload.conflict!.checkOut)}`,
        }));
      } else {
        setErrors((previous) => ({
          ...previous,
          save: payload?.error ?? "Не удалось сохранить бронирование",
        }));
      }
      return;
    }

    await emitBookingNotificationEvent("booking_created", booking, {
      actionUrl: `/bookings/${booking.id}`,
    });

    if (booking.status === "confirmed") {
      await emitBookingNotificationEvent("booking_confirmed", booking, {
        actionUrl: `/bookings/${booking.id}`,
      });
    }

    router.push("/bookings");
  }

  const amounts = computeAmounts();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />
        <div className="flex-1">
          <Header showSearch={false} showNewListing={false} />
          <main className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-semibold">Новое бронирование</h1>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <div className="space-y-4">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="mb-2 text-sm font-semibold text-white">Клиент</div>
                    <select
                      value={form.clientId ?? ""}
                      onChange={(event) => handleSelectClient(event.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                    >
                      <option value="">Без привязки</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>{client.firstName} {client.lastName} - {client.phone}</option>
                      ))}
                    </select>

                    {selectedClient ? (
                      <p className="mt-2 text-xs text-slate-400">
                        Выбран клиент: {selectedClient.firstName} {selectedClient.lastName}
                      </p>
                    ) : null}

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowQuickClientForm((value) => !value)}
                        className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200"
                      >
                        {showQuickClientForm ? "Скрыть" : "Быстро создать клиента"}
                      </button>
                    </div>

                    {showQuickClientForm ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input placeholder="Имя" value={quickClient.firstName} onChange={(event) => updateQuickClient("firstName", event.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
                        <input placeholder="Фамилия" value={quickClient.lastName} onChange={(event) => updateQuickClient("lastName", event.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
                        <PhoneInput value={quickClient.phone} onChange={(nextValue) => updateQuickClient("phone", nextValue)} className="sm:col-span-2 [&>select]:rounded-lg [&>input]:rounded-lg" placeholder="Телефон" />
                        <input placeholder="Email" value={quickClient.email} onChange={(event) => updateQuickClient("email", event.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
                        <button type="button" onClick={handleCreateQuickClient} className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 sm:col-span-2">
                          Создать и выбрать
                        </button>
                      </div>
                    ) : null}

                    {errors.client ? <p className="mt-2 text-xs text-rose-400">{errors.client}</p> : null}
                  </div>

                  <label>
                    <div className="text-sm text-slate-300">Объект</div>
                    <select value={form.apartmentId} onChange={(e) => update("apartmentId", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none">
                      <option value="">Выберите объект</option>
                      {apartments.map((a) => (
                        <option key={a.id} value={a.id}>{a.title} — {a.city}</option>
                      ))}
                    </select>
                    {selectedApartmentUnavailable ? <p className="mt-1 text-sm text-amber-300">На данный момент бронирование этого объекта невозможно: объект занят</p> : null}
                    {errors.apartmentId ? <p className="text-rose-400 text-sm">{errors.apartmentId}</p> : null}
                  </label>

                  <label>
                    <div className="text-sm text-slate-300">Имя гостя</div>
                    <input value={form.guestName} onChange={(e) => update("guestName", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                    {errors.guestName ? <p className="text-rose-400 text-sm">{errors.guestName}</p> : null}
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label>
                      <div className="text-sm text-slate-300">Телефон</div>
                      <PhoneInput value={form.guestPhone ?? ""} onChange={(nextValue) => update("guestPhone", nextValue)} />
                    </label>
                    <label>
                      <div className="text-sm text-slate-300">Email</div>
                      <input value={form.guestEmail} onChange={(e) => update("guestEmail", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label>
                      <div className="text-sm text-slate-300">Заезд</div>
                      <input type="date" value={form.checkIn} onChange={(e) => update("checkIn", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                      {errors.checkIn ? <p className="text-rose-400 text-sm">{errors.checkIn}</p> : null}
                    </label>
                    <label>
                      <div className="text-sm text-slate-300">Выезд</div>
                      <input type="date" value={form.checkOut} onChange={(e) => update("checkOut", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                      {errors.checkOut ? <p className="text-rose-400 text-sm">{errors.checkOut}</p> : null}
                    </label>
                  </div>

                  {conflictMessage ? <p className="text-rose-400 text-sm">{conflictMessage}</p> : null}

                  {occupiedRanges.length > 0 ? (
                    <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3">
                      <p className="text-sm font-semibold text-rose-300">Занятые даты:</p>
                      <div className="mt-2 space-y-1 text-sm text-rose-200">
                        {occupiedRanges.map((range) => (
                          <p key={range.id}>{formatDate(range.from)}-{formatDate(range.to)}</p>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-rose-200/80">Дата выезда не считается занятым днём.</p>
                    </div>
                  ) : null}

                  <label>
                    <div className="text-sm text-slate-300">Гостей</div>
                    <input type="number" min={1} inputMode="decimal" value={form.guests ?? ""} onChange={(e) => update("guests", Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                    {errors.guests ? <p className="text-rose-400 text-sm">{errors.guests}</p> : null}
                  </label>

                  <label>
                    <div className="text-sm text-slate-300">Тип аренды</div>
                    <select value={form.rentalType} onChange={(e) => update("rentalType", e.target.value as Booking["rentalType"])} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none">
                      {allowedRentalTypes.length === 0 ? <option value="">Сначала выберите объект</option> : null}
                      {allowedRentalTypes.includes("daily") ? <option value="daily">Посуточно</option> : null}
                      {allowedRentalTypes.includes("weekly") ? <option value="weekly">Понедельная</option> : null}
                      {allowedRentalTypes.includes("monthly") ? <option value="monthly">Помесячная</option> : null}
                    </select>
                    {errors.rentalType ? <p className="text-rose-400 text-sm">{errors.rentalType}</p> : null}
                  </label>

                  <label>
                    <div className="text-sm text-slate-300">Цена за период</div>
                    <input type="number" min={0} inputMode="decimal" value={form.pricePerPeriod ?? ""} onChange={(e) => update("pricePerPeriod", Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                    {errors.pricePerPeriod ? <p className="text-rose-400 text-sm">{errors.pricePerPeriod}</p> : null}
                  </label>

                  {(Number(form.pricePerPeriod) || 0) === 0 ? (
                    <label className="flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                      <input type="checkbox" checked={isComplimentary} onChange={(event) => setIsComplimentary(event.target.checked)} />
                      Подтверждаю бесплатное размещение
                    </label>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-3">
                    <label>
                      <div className="text-sm text-slate-300">Уборка</div>
                      <input type="number" min={0} inputMode="decimal" value={form.cleaningFee ?? ""} onChange={(e) => update("cleaningFee", Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                    </label>
                    <label>
                      <div className="text-sm text-slate-300">Залог</div>
                      <input type="number" min={0} inputMode="decimal" value={form.deposit ?? ""} onChange={(e) => update("deposit", Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                    </label>
                    <label>
                      <div className="text-sm text-slate-300">Скидка</div>
                      <input type="number" min={0} inputMode="decimal" value={form.discount ?? ""} onChange={(e) => update("discount", Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                    </label>
                  </div>

                  <label>
                    <div className="text-sm text-slate-300">Оплачено</div>
                    <input type="number" min={0} inputMode="decimal" value={form.paidAmount ?? ""} onChange={(e) => update("paidAmount", Number(e.target.value))} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                  </label>

                  <label>
                    <div className="text-sm text-slate-300">Источник</div>
                    <select value={form.source} onChange={(e) => update("source", e.target.value as Booking["source"])} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none">
                      <option value="direct">Прямой</option>
                      <option value="phone">Телефон</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="website">Сайт</option>
                      <option value="booking">Booking.com</option>
                      <option value="airbnb">Airbnb</option>
                      <option value="in_person">Лично</option>
                      <option value="manual">Ручной ввод</option>
                      <option value="other">Другое</option>
                    </select>
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label>
                      <div className="text-sm text-slate-300">Время заезда</div>
                      <input type="time" value={form.checkInTime ?? "15:00"} onChange={(event) => update("checkInTime", event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                    </label>
                    <label>
                      <div className="text-sm text-slate-300">Время выезда</div>
                      <input type="time" value={form.checkOutTime ?? "11:00"} onChange={(event) => update("checkOutTime", event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                    </label>
                  </div>

                  <label>
                    <div className="text-sm text-slate-300">Примечания</div>
                    <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/3 px-3 py-2 text-sm text-white outline-none" />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
                <h3 className="text-lg font-semibold">Расчёт</h3>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span>Проживание</span><span>{amounts.accommodationAmount} €</span></div>
                  <div className="flex justify-between"><span>Уборка</span><span>{Number(form.cleaningFee || 0)} €</span></div>
                  <div className="flex justify-between"><span>Залог</span><span>{Number(form.deposit || 0)} €</span></div>
                  <div className="flex justify-between"><span>Скидка</span><span>-{Number(form.discount || 0)} €</span></div>
                  <div className="flex justify-between font-semibold"><span>Итого</span><span>{amounts.totalAmount} €</span></div>
                  <div className="flex justify-between"><span>Оплачено</span><span>{Number(form.paidAmount || 0)} €</span></div>
                  <div className="flex justify-between text-sm text-slate-400"><span>Остаток</span><span>{Math.max(0, amounts.totalAmount - Number(form.paidAmount || 0))} €</span></div>
                </div>

                {errors.save ? <p className="mt-4 text-sm text-rose-400">{errors.save}</p> : null}
                <div className="mt-6 flex gap-2">
                    <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="rounded-2xl bg-cyan-500/20 px-4 py-2 font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "Сохранение..." : "Сохранить"}</button>
                  <button type="button" onClick={() => router.push('/bookings')} className="rounded-2xl bg-white/5 px-4 py-2">Отмена</button>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function NewBookingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-slate-100 p-6">Загрузка...</div>}>
      <NewBookingPageContent />
    </Suspense>
  );
}
