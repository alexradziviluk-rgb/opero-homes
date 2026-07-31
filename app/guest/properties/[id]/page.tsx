"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ApartmentImage from "@/components/apartments/ApartmentImage";
import PublicAvailabilityCalendar from "@/components/booking/PublicAvailabilityCalendar";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { loadApartmentsFromSupabase } from "@/lib/apartments/supabase-apartments";
import { getBookings } from "@/lib/bookings/booking-repository";
import { getClientById } from "@/lib/clients/client-repository";
import { getRangeAvailability, getRequestedBookingOutcome, type PublicAvailabilityStatus } from "@/lib/bookings/availability";
import {
  formatApartmentPrice,
  getApartmentPhotoUrl,
  getApartmentPhotoStoragePath,
  getApartmentPriceInfo,
  getApartmentCoordinates,
  getApartmentPublicLocation,
  isApartmentAvailableForDates,
  isApartmentPublic,
} from "@/lib/apartments/public-catalog";
import { isBlockingBooking } from "@/lib/bookings/booking-conflicts";
import type { Booking } from "@/types/booking";
import type { ApartmentPhoto } from "@/types/apartment";
import type { Apartment } from "@/types/apartment";

const PropertyLocationMap = dynamic(() => import("@/components/guest/PropertyLocationMap"), {
  ssr: false,
});

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString("ru-RU");
}

function nightsBetween(a: string, b: string) {
  const d1 = new Date(`${a}T00:00:00`);
  const d2 = new Date(`${b}T00:00:00`);
  const diff = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function getMinimumStayText(apartment: {
  minimumNights: number | null;
  minimumWeeks: number | null;
  minimumMonths: number | null;
}): string {
  if (apartment.minimumNights && apartment.minimumNights > 0) {
    return `${apartment.minimumNights} ночей`;
  }

  if (apartment.minimumWeeks && apartment.minimumWeeks > 0) {
    return `${apartment.minimumWeeks} недель`;
  }

  if (apartment.minimumMonths && apartment.minimumMonths > 0) {
    return `${apartment.minimumMonths} месяцев`;
  }

  return "Без минимального срока";
}

export default function GuestPropertyDetailsPage() {
  const router = useRouter();
  const { currentUser } = useCurrentUser();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const apartmentId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const bookingPanelRef = useRef<HTMLElement | null>(null);

  const [checkIn, setCheckIn] = useState(() => searchParams.get("checkIn") ?? "");
  const [checkOut, setCheckOut] = useState(() => searchParams.get("checkOut") ?? "");
  const [guests, setGuests] = useState(() => searchParams.get("guests") ?? "1");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [comment, setComment] = useState("");
  const [calendarError, setCalendarError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<PublicAvailabilityStatus[]>([]);
  const [isBookingPanelOpen, setIsBookingPanelOpen] = useState(() => searchParams.get("openBooking") === "1");
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadApartments() {
      const loaded = await loadApartmentsFromSupabase({ publicOnly: true });
      if (!cancelled) {
        setApartments(loaded);
      }
    }

    void loadApartments();

    function reloadBookings() {
      setBookings(getBookings());
    }

    reloadBookings();

    window.addEventListener("opero-bookings-changed", reloadBookings);
    window.addEventListener("storage", reloadBookings);

    return () => {
      cancelled = true;
      window.removeEventListener("opero-bookings-changed", reloadBookings);
      window.removeEventListener("storage", reloadBookings);
    };
  }, []);

  const apartment = useMemo(() => apartments.find((item) => item.id === apartmentId), [apartments, apartmentId]);

  useEffect(() => {
    if (!currentUser) return;

    const profileLoadId = window.setTimeout(() => {
      const client = currentUser.clientId ? getClientById(currentUser.clientId) : null;
      if (!firstName) setFirstName(client?.firstName || currentUser.firstName || "");
      if (!lastName) setLastName(client?.lastName || currentUser.lastName || "");
      if (!phone) setPhone(client?.phone || currentUser.phone || "");
      if (!email) setEmail(client?.email || currentUser.email || "");
    }, 0);

    return () => {
      window.clearTimeout(profileLoadId);
    };
  }, [currentUser, email, firstName, lastName, phone]);

  useEffect(() => {
    if (searchParams.get("openBooking") === "1") {
      const scrollId = window.setTimeout(() => {
        bookingPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
      return () => {
        window.clearTimeout(scrollId);
      };
    }

    return undefined;
  }, [searchParams]);

  if (!apartment || !isApartmentPublic(apartment)) {
    return (
      <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-6">
        <h1 className="text-2xl font-semibold text-white">Объект недоступен</h1>
        <p className="mt-2 text-sm text-slate-400">Объект не найден или скрыт из публичного каталога.</p>
        <Link href="/guest/properties" className="mt-4 inline-flex rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">
          Вернуться в каталог
        </Link>
      </section>
    );
  }

  const gallery: ApartmentPhoto[] = apartment.photos && apartment.photos.length > 0
    ? apartment.photos
    : apartment.coverPhotoUrl
    ? [
        {
          id: "cover-photo",
          apartmentId: apartment.id,
          url: apartment.coverPhotoUrl,
          storagePath: apartment.coverPhotoUrl,
          fileName: "cover",
          mimeType: "image/jpeg",
          size: 0,
          sortOrder: 0,
          isCover: true,
          createdAt: "",
        },
      ]
    : [];

  const renderableGallery = gallery.filter(
    (photo) => Boolean(getApartmentPhotoUrl(photo) || getApartmentPhotoStoragePath(photo)),
  );

  const safeIndex = Math.min(activePhotoIndex, Math.max(0, renderableGallery.length - 1));
  const activePhoto = renderableGallery[safeIndex];
  const priceInfo = getApartmentPriceInfo(apartment);
  const occupiedRanges = bookings.filter((booking) => booking.apartmentId === apartment.id && isBlockingBooking(booking));
  const selectedRangeStatuses = checkIn && checkOut
    ? selectedStatuses.length > 0
      ? selectedStatuses
      : getRangeAvailability(apartment.id, checkIn, checkOut, bookings)
    : [];
  const selectedOutcome = selectedRangeStatuses.length > 0 ? getRequestedBookingOutcome(selectedRangeStatuses) : null;
  const availableForDates = checkIn && checkOut
    ? selectedOutcome !== "blocked"
    : true;
  const coordinates = getApartmentCoordinates(apartment);

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const weeklyPeriods = Math.max(1, Math.ceil(nights / 7));
  const monthlyPeriods = Math.max(1, Math.ceil(nights / 30));
  const estimatedTotal = priceInfo
    ? priceInfo.period === "night"
      ? Math.max(0, priceInfo.amount * nights + (apartment.cleaningFee ?? 0) + (apartment.deposit ?? 0))
      : priceInfo.period === "week"
      ? Math.max(0, priceInfo.amount * weeklyPeriods + (apartment.cleaningFee ?? 0) + (apartment.deposit ?? 0))
      : Math.max(0, priceInfo.amount * monthlyPeriods + (apartment.cleaningFee ?? 0) + (apartment.deposit ?? 0))
    : 0;
  const requiresManagerConfirmation = priceInfo?.period === "month";

  function openBookingPanel() {
    if (!currentUser) {
      const propertyId = apartment?.id ?? apartmentId;
      if (!propertyId) {
        setSubmitError("Выбранный объект недоступен.");
        return;
      }

      const nextParams = new URLSearchParams({ openBooking: "1" });
      if (checkIn) nextParams.set("checkIn", checkIn);
      if (checkOut) nextParams.set("checkOut", checkOut);
      if (guests) nextParams.set("guests", guests);
      const nextPath = `/guest/properties/${propertyId}?${nextParams.toString()}`;
      router.push(`/guest/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }

    setIsBookingPanelOpen(true);
    bookingPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleCalendarChange(next: { checkIn: string; checkOut: string; statuses: PublicAvailabilityStatus[] }) {
    setCalendarError("");
    setSubmitError("");
    setSubmitSuccess("");
    setCheckIn(next.checkIn);
    setCheckOut(next.checkOut);
    setSelectedStatuses(next.statuses);
  }

  async function handleSubmitBooking() {
    setSubmitError("");
    setSubmitSuccess("");

    if (!currentUser) {
      const propertyId = apartment?.id ?? apartmentId;
      if (!propertyId) {
        setSubmitError("Выбранный объект недоступен.");
        return;
      }

      const nextParams = new URLSearchParams({ openBooking: "1" });
      if (checkIn) nextParams.set("checkIn", checkIn);
      if (checkOut) nextParams.set("checkOut", checkOut);
      if (guests) nextParams.set("guests", guests);
      const nextPath = `/guest/properties/${propertyId}?${nextParams.toString()}`;
      router.push(`/guest/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }

    if (!apartment) {
      setSubmitError("Выбранный объект недоступен.");
      return;
    }

    if (!checkIn || !checkOut) {
      setSubmitError("Выберите даты заезда и выезда.");
      return;
    }

    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !email.trim()) {
      setSubmitError("Укажите имя, фамилию, телефон и email.");
      return;
    }

    const nextParams = new URLSearchParams({ openBooking: "1" });
    if (checkIn) nextParams.set("checkIn", checkIn);
    if (checkOut) nextParams.set("checkOut", checkOut);
    if (guests) nextParams.set("guests", guests);

    setIsSubmitting(true);
    try {
      router.push(`/guest/book/new?apartmentId=${encodeURIComponent(apartment.id)}&${nextParams.toString()}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <article className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80">
          <div className="h-80 w-full bg-slate-800">
            {activePhoto ? (
              <ApartmentImage photo={activePhoto} alt={apartment.title} className="h-full w-full object-cover" placeholderClassName="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-300">Фото скоро появится</div>
            )}
          </div>

          {renderableGallery.length > 1 ? (
            <div className="grid grid-cols-4 gap-2 p-3 md:grid-cols-6">
              {renderableGallery.map((photo, index) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setActivePhotoIndex(index)}
                  className={`overflow-hidden rounded-lg border ${safeIndex === index ? "border-cyan-300/60" : "border-white/10"}`}
                >
                  <ApartmentImage photo={photo} alt={`${apartment.title} ${index + 1}`} className="h-16 w-full object-cover" placeholderClassName="h-16 w-full" />
                </button>
              ))}
            </div>
          ) : null}
        </article>

        <aside className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
          <h1 className="text-2xl font-semibold text-white">{apartment.title}</h1>
          <p className="mt-1 text-sm text-slate-300">{getApartmentPublicLocation(apartment)}</p>
          <p className="mt-1 text-sm text-slate-400">{apartment.address || "Адрес уточняется после подтверждения"}</p>

          <p className="mt-4 text-lg text-cyan-300">{formatApartmentPrice(apartment)}</p>

          <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-300">
            <p>Вместимость: {apartment.maxGuests}</p>
            <p>Спальни: {apartment.bedrooms}</p>
            <p>Кровати: {apartment.rooms}</p>
            <p>Санузлы: {apartment.bathrooms}</p>
            <p>Площадь: {apartment.area ? `${apartment.area} м²` : "-"}</p>
          </div>

          <div className="mt-5 space-y-2">
            <label className="block">
              <div className="text-xs text-slate-400">Количество гостей</div>
              <input type="number" min={1} max={Math.max(1, apartment.maxGuests)} value={guests} onChange={(event) => setGuests(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
            </label>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
              <p>Ночей: {nights}</p>
              {requiresManagerConfirmation ? (
                <p>Итог будет подтверждён менеджером</p>
              ) : (
                <p>Итоговая стоимость: {estimatedTotal.toLocaleString("ru-RU")} €</p>
              )}
            </div>

            {checkIn && checkOut && !availableForDates ? (
              <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">На выбранные даты объект занят</p>
            ) : null}

            <button
              type="button"
              onClick={openBookingPanel}
              className="mt-2 inline-flex w-full justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20"
            >
              Забронировать
            </button>
          </div>
        </aside>
      </div>

      <article className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
        <h2 className="text-lg font-semibold text-white">Описание</h2>
        <p className="mt-2 text-sm text-slate-300">{apartment.shortDesc || "Уютное размещение с удобным доступом к инфраструктуре и пляжу."}</p>
      </article>

      <article className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
        <h2 className="text-lg font-semibold text-white">Удобства</h2>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Wi-Fi</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Кондиционер</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Кухня</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Стиральная машина</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Балкон</span>
          {apartment.bedrooms > 1 ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Семейный формат</span> : null}
          {apartment.area && apartment.area > 70 ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Просторная площадь</span> : null}
        </div>
      </article>

      <article className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
        <h2 className="text-lg font-semibold text-white">Правила проживания</h2>
        <div className="mt-2 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
          <p>Время заезда: 15:00</p>
          <p>Время выезда: 11:00</p>
          <p>Курение: запрещено</p>
          <p>Животные: по согласованию</p>
          <p>Мероприятия: запрещены</p>
          <p>Минимальный срок: {getMinimumStayText(apartment)}</p>
        </div>
      </article>

      <article className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
        <h2 className="text-lg font-semibold text-white">Расположение</h2>
        {coordinates ? (
          <div className="mt-3">
            <PropertyLocationMap latitude={coordinates.latitude} longitude={coordinates.longitude} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">Координаты пока не указаны для этого объекта.</p>
        )}
      </article>

      <article ref={bookingPanelRef} className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
        <h2 className="text-lg font-semibold text-white">Календарь доступности и бронирование</h2>

        {!isBookingPanelOpen ? (
          <button
            type="button"
            onClick={openBookingPanel}
            className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20"
          >
            Открыть календарь
          </button>
        ) : (
          <div className="mt-4 space-y-4">
            <PublicAvailabilityCalendar
              apartmentId={apartment.id}
              bookings={bookings}
              checkIn={checkIn}
              checkOut={checkOut}
              onChange={handleCalendarChange}
              onInvalidRange={(message) => setCalendarError(message)}
            />

            {calendarError ? (
              <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{calendarError}</p>
            ) : null}

            {checkIn && checkOut ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-200">
                <p className="font-semibold text-white">{apartment.title}</p>
                <p className="mt-1">Заезд: {formatDate(checkIn)}</p>
                <p>Выезд: {formatDate(checkOut)}</p>
                <p>Ночей: {nights}</p>
                <p>Гостей: {Math.max(1, Number(guests) || 1)}</p>
                <p>Тариф: {formatApartmentPrice(apartment)}</p>

                {selectedOutcome === "pending" ? (
                  <p className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-amber-200">
                    На выбранные даты уже есть заявка, которая ожидает подтверждения.
                    <br />
                    <br />
                    Вы можете отправить свою заявку. Менеджер подтвердит одну из заявок после проверки доступности.
                  </p>
                ) : null}

                {selectedOutcome === "confirmed" ? (
                  <p className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-emerald-200">
                    Даты свободны. Бронирование будет подтверждено сразу.
                  </p>
                ) : null}

                {requiresManagerConfirmation ? (
                  <p className="mt-3 text-amber-300">Итоговая стоимость будет подтверждена менеджером.</p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <div className="text-sm text-slate-300">Имя</div>
                <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
              </label>
              <label>
                <div className="text-sm text-slate-300">Фамилия</div>
                <input value={lastName} onChange={(event) => setLastName(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
              </label>
              <label>
                <div className="text-sm text-slate-300">Телефон</div>
                <input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
              </label>
              <label>
                <div className="text-sm text-slate-300">Email</div>
                <input value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
              </label>
              <label>
                <div className="text-sm text-slate-300">Количество гостей</div>
                <input type="number" min={1} max={Math.max(1, apartment.maxGuests)} value={guests} onChange={(event) => setGuests(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
              </label>
              <label className="sm:col-span-2">
                <div className="text-sm text-slate-300">Комментарий</div>
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} className="mt-1 h-24 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" />
              </label>
            </div>

            {submitError ? <p className="text-sm text-rose-300">{submitError}</p> : null}
            {submitSuccess ? <p className="text-sm text-emerald-300">{submitSuccess}</p> : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                    onClick={() => void handleSubmitBooking()}
                disabled={isSubmitting || !checkIn || !checkOut || selectedOutcome === "blocked"}
                className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Отправляем..." : selectedOutcome === "pending" ? "Отправить заявку" : "Забронировать"}
              </button>
              <button
                type="button"
                onClick={() => setIsBookingPanelOpen(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
              >
                Скрыть календарь
              </button>
            </div>

            {occupiedRanges.length > 0 ? (
              <div className="pt-2 text-xs text-slate-400">
                <p className="mb-1">Уже занятые периоды:</p>
                {occupiedRanges.map((range) => (
                  <p key={range.id}>{formatDate(range.checkIn)} - {formatDate(range.checkOut)}</p>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </article>
    </section>
  );
}
