"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadApartmentsFromSupabase } from "@/lib/apartments/supabase-apartments";
import {
  formatApartmentPrice,
  getApartmentPublicLabel,
  getApartmentPriceInfo,
  isApartmentPublic,
} from "@/lib/apartments/public-catalog";
import type { Apartment } from "@/types/apartment";

type QuoteResult = {
  ok: boolean;
  data?: {
    apartmentTitle: string;
    nights: number;
    guests: number;
    currency: string;
    pricePeriod: "night" | "week" | "month";
    pricePerPeriod: number;
    accommodationAmount: number;
    cleaningFee: number;
    deposit: number;
    totalAmount: number;
    maxGuests: number;
    minimumStay: number | null;
  };
  errorCode?: string;
  errorMessage?: string;
  conflict?: { checkIn: string; checkOut: string };
};

type BookingCreateResult = {
  ok: boolean;
  data?: {
    quote: { currency: string };
    id: string;
    checkIn: string;
    checkOut: string;
  };
  errorCode?: string;
  errorMessage?: string;
  conflict?: { checkIn: string; checkOut: string };
};

function nightsBetween(a: string, b: string) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  const diff = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU");
}

export default function GuestBookingNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const apartmentIdFromUrl = searchParams.get("apartmentId") ?? "";
  const checkInFromUrl = searchParams.get("checkIn") ?? "";
  const checkOutFromUrl = searchParams.get("checkOut") ?? "";
  const guestsFromUrl = searchParams.get("guests") ?? "1";

  const [apartments, setApartments] = useState<Apartment[]>([]);

  const [apartmentId, setApartmentId] = useState(apartmentIdFromUrl);
  const [checkIn, setCheckIn] = useState(checkInFromUrl);
  const [checkOut, setCheckOut] = useState(checkOutFromUrl);
  const [guests, setGuests] = useState(guestsFromUrl);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [quote, setQuote] = useState<QuoteResult["data"] | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const loaded = await loadApartmentsFromSupabase({ publicOnly: true });
      if (!cancelled) {
        setApartments(loaded.filter(isApartmentPublic));
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedApartment = useMemo(
    () => apartments.find((item) => item.id === apartmentId) ?? null,
    [apartments, apartmentId],
  );

  const nights = quote?.nights ?? (checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0);
  const priceInfo = selectedApartment ? getApartmentPriceInfo(selectedApartment) : null;
  const pricePerPeriod = quote?.pricePerPeriod ?? priceInfo?.amount ?? 0;
  const cleaningFee = quote?.cleaningFee ?? selectedApartment?.cleaningFee ?? 0;
  const deposit = quote?.deposit ?? selectedApartment?.deposit ?? 0;
  const accommodationAmount = quote?.accommodationAmount ?? 0;
  const totalAmount = quote?.totalAmount ?? 0;
  const currency = quote?.currency ?? "EUR";

  useEffect(() => {
    if (!apartmentId || !checkIn || !checkOut) {
      return;
    }

    const controller = new AbortController();

    async function loadQuote() {
      setIsLoadingQuote(true);
      setQuoteError(null);

      try {
        const response = await fetch("/api/guest/bookings/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apartmentId, checkIn, checkOut, guests: Number(guests) || 1 }),
          signal: controller.signal,
        });

        const payload = (await response.json()) as QuoteResult;
        if (!response.ok || !payload.ok || !payload.data) {
          setQuote(null);
          setQuoteError(payload.errorCode === "booking_conflict" ? "Выбранные даты уже заняты." : payload.errorMessage ?? "Не удалось рассчитать стоимость.");
          return;
        }

        setQuote(payload.data);
      } catch {
        if (!controller.signal.aborted) {
          setQuote(null);
          setQuoteError("Не удалось рассчитать стоимость.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingQuote(false);
        }
      }
    }

    void loadQuote();

    return () => controller.abort();
  }, [apartmentId, checkIn, checkOut, guests]);

  async function handleSubmit() {
    setError("");
    setSuccess("");

    const todayIso = new Date().toISOString().slice(0, 10);
    if (!apartmentId) {
      setError("Выберите объект.");
      return;
    }

    if (!selectedApartment) {
      setError("Выбранный объект недоступен.");
      return;
    }

    if (!checkIn || !checkOut) {
      setError("Выберите даты заезда и выезда.");
      return;
    }

    if (checkIn < todayIso || checkOut < todayIso) {
      setError("Нельзя выбрать прошедшие даты.");
      return;
    }

    if (new Date(checkOut) <= new Date(checkIn)) {
      setError("Дата выезда должна быть позже даты заезда.");
      return;
    }

    if (!guestName.trim() || !guestPhone.trim() || !guestEmail.trim()) {
      setError("Укажите имя, телефон и email для подтверждения.");
      return;
    }


    setIsSubmitting(true);
    try {
      const response = await fetch("/api/guest/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apartmentId,
          checkIn,
          checkOut,
          guests: Number(guests) || 1,
        }),
      });

      const payload = (await response.json()) as BookingCreateResult;
      if (!response.ok || !payload.ok || !payload.data) {
        if (payload.errorCode === "booking_conflict" && payload.conflict) {
          setError(`Объект уже занят с ${formatDate(payload.conflict.checkIn)} по ${formatDate(payload.conflict.checkOut)}.`);
          return;
        }

        setError(payload.errorMessage ?? "Не удалось создать бронирование.");
        return;
      }

      setSuccess(`Бронирование создано. Итог: ${payload.data.quote.currency} ${Number(totalAmount || 0).toLocaleString("ru-RU")}`);
      router.push(`/guest/bookings?created=${encodeURIComponent(payload.data.id)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
        <h1 className="text-2xl font-semibold text-white">Бронирование</h1>
        <p className="mt-2 text-sm text-slate-300">Выберите объект и даты. Стоимость и доступность пересчитываются на сервере.</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <div className="text-sm text-slate-300">Выберите объект</div>
            <select
              value={apartmentId}
              onChange={(event) => setApartmentId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="">Выберите объект</option>
              {apartments.map((apartment) => (
                <option key={apartment.id} value={apartment.id}>{getApartmentPublicLabel(apartment)}</option>
              ))}
            </select>
          </label>

          <label>
            <div className="text-sm text-slate-300">Дата заезда</div>
            <input type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
          </label>

          <label>
            <div className="text-sm text-slate-300">Дата выезда</div>
            <input type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
          </label>

          <label>
            <div className="text-sm text-slate-300">Количество гостей</div>
            <input type="number" min={1} value={guests} onChange={(event) => setGuests(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
          </label>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
            <p>Ночей: {nights}</p>
            <p>Тариф: {selectedApartment ? formatApartmentPrice(selectedApartment) : "Цена по запросу"}</p>
            <p>Проживание: {accommodationAmount.toLocaleString("ru-RU")} {currency}</p>
            <p>Уборка: {cleaningFee.toLocaleString("ru-RU")} {currency}</p>
            <p>Залог: {deposit.toLocaleString("ru-RU")} {currency}</p>
            <p className="mt-1 font-semibold text-white">Итого: {totalAmount.toLocaleString("ru-RU")} {currency}</p>
            {isLoadingQuote ? <p className="mt-1 text-xs text-slate-400">Пересчитываем стоимость...</p> : null}
            {quoteError ? <p className="mt-1 text-xs text-rose-300">{quoteError}</p> : null}
          </div>

          <label>
            <div className="text-sm text-slate-300">Ваше имя</div>
            <input value={guestName} onChange={(event) => setGuestName(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
          </label>

          <label>
            <div className="text-sm text-slate-300">Телефон</div>
            <input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
          </label>

          <label className="sm:col-span-2">
            <div className="text-sm text-slate-300">Email</div>
            <input value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
          </label>

          <label className="sm:col-span-2">
            <div className="text-sm text-slate-300">Комментарий</div>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 h-24 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
          </label>
        </div>

        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
        {success ? <p className="mt-3 text-sm text-emerald-300">{success}</p> : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || isLoadingQuote}
            className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Отправляем..." : "Забронировать"}
          </button>
          <Link href="/guest/properties" className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/10">
            Назад в каталог
          </Link>
        </div>
      </div>
    </section>
  );
}
