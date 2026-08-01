"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ApartmentImage from "@/components/apartments/ApartmentImage";
import { getBookings } from "@/lib/bookings/booking-repository";
import { loadApartmentsFromSupabase } from "@/lib/apartments/supabase-apartments";
import {
  countRenderableApartmentPhotos,
  formatApartmentPrice,
  getApartmentCoordinates,
  getApartmentPublicLocation,
  getApartmentPriceInfo,
  getAddressDistrictFallback,
  getUniqueValues,
  isApartmentAvailableForDates,
  isApartmentPublic,
  matchesApartmentLocation,
} from "@/lib/apartments/public-catalog";
import type { Apartment } from "@/types/apartment";

const PublicCatalogMap = dynamic(() => import("@/components/guest/PublicCatalogMap"), {
  ssr: false,
});

type SortMode = "recommended" | "price_asc" | "price_desc" | "capacity_desc";
type CatalogViewMode = "list" | "map";

function getAmenities(apartment: Apartment): string[] {
  const amenities: string[] = [];

  if (apartment.bedrooms > 0) amenities.push(`${apartment.bedrooms} спальни`);
  if (apartment.bathrooms > 0) amenities.push(`${apartment.bathrooms} санузла`);
  if (apartment.rentalTypes.daily) amenities.push("Посуточно");
  if (apartment.rentalTypes.weekly) amenities.push("Понедельно");
  if (apartment.rentalTypes.monthly) amenities.push("Помесячно");

  return amenities.slice(0, 5);
}

function PublicCatalogHeader() {
  return (
    <header className="mb-8 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 shadow-lg shadow-black/10">
      <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Публичная навигация">
        <Link href="/" className="text-lg font-bold tracking-tight text-white">opero<span className="text-cyan-300">.</span></Link>
        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          <a href="#find-another-property" className="rounded-xl px-3 py-2 text-slate-200 hover:bg-white/10">Поиск жилья</a>
          <Link href="/business" className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 font-semibold text-cyan-200 hover:bg-cyan-500/20">Стать партнёром</Link>
          <Link href="/login" className="rounded-xl border border-white/10 px-3 py-2 text-slate-200 hover:bg-white/10">Войти</Link>
        </div>
      </nav>
    </header>
  );
}

function PartnerCallout() {
  return (
    <section className="rounded-3xl border border-cyan-300/20 bg-[linear-gradient(120deg,rgba(8,47,73,0.95),rgba(15,23,42,0.96))] p-6 shadow-xl shadow-cyan-950/10 sm:p-8" aria-labelledby="partner-heading">
      <div className="max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">Для владельцев недвижимости</p>
        <h2 id="partner-heading" className="mt-3 text-3xl font-semibold text-white">Сдаёте недвижимость?</h2>
        <p className="mt-3 text-base leading-7 text-slate-300">Размещайте объекты, управляйте бронированиями и контролируйте статистику в Opero Homes</p>
        <Link href="/business" className="mt-6 inline-flex rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-200">Стать партнёром</Link>
      </div>
    </section>
  );
}

function ApartmentCard({
  apartment,
  bookings,
  checkIn = "",
  checkOut = "",
  guests = "",
  compact = false,
}: {
  apartment: Apartment;
  bookings: ReturnType<typeof getBookings>;
  checkIn?: string;
  checkOut?: string;
  guests?: string;
  compact?: boolean;
}) {
  const photoCount = countRenderableApartmentPhotos(apartment);
  const availableForDates = checkIn && checkOut
    ? isApartmentAvailableForDates({ apartment, bookings, checkIn, checkOut })
    : true;
  const bookingQuery = `${checkIn ? `&checkIn=${encodeURIComponent(checkIn)}` : ""}${checkOut ? `&checkOut=${encodeURIComponent(checkOut)}` : ""}${guests ? `&guests=${encodeURIComponent(guests)}` : ""}`;

  return (
    <article className="overflow-hidden rounded-lg border border-white/10 bg-slate-900/80">
      <Link href={`/properties/${apartment.id}`} className="block">
        <div className={`relative w-full bg-slate-800 ${compact ? "h-36" : "h-48"}`}>
          <ApartmentImage
            photo={apartment.photos?.[0] ?? apartment.coverPhotoUrl ?? undefined}
            alt={apartment.title}
            className="h-full w-full object-cover"
            placeholderClassName="h-full w-full"
            placeholderText="Фото недоступно"
          />
          {photoCount > 0 ? <div className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-1 text-xs text-slate-200">{`1 / ${photoCount}`}</div> : null}
        </div>
      </Link>

      <div className={compact ? "p-3" : "p-4"}>
        <h2 className={`${compact ? "text-base" : "text-lg"} font-semibold text-white`}>
          <Link href={`/properties/${apartment.id}`} className="hover:text-cyan-200">{apartment.title}</Link>
        </h2>
        <p className="mt-1 text-sm text-slate-400">{getApartmentPublicLocation(apartment)}</p>
        {!compact ? <p className="mt-1 text-sm text-slate-300">{apartment.address || "Адрес уточняется"}</p> : null}

        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-cyan-300">{formatApartmentPrice(apartment)}</p>
          <p className="text-xs text-slate-300">{availableForDates ? "Доступно" : "Занято"}</p>
        </div>

        <p className="mt-2 text-sm text-slate-300">До {apartment.maxGuests} гостей · {apartment.bedrooms} спальни · {apartment.rooms} кровати</p>

        <div className={`${compact ? "mt-2" : "mt-3"} flex flex-wrap gap-2 text-xs`}>
          {getAmenities(apartment).slice(0, compact ? 2 : 5).map((amenity) => <span key={amenity} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-300">{amenity}</span>)}
        </div>

        {!availableForDates && checkIn && checkOut ? <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">Занят на выбранные даты</p> : null}

        <div className={`${compact ? "mt-3" : "mt-4"} flex flex-wrap gap-2`}>
          <Link href={`/properties/${apartment.id}`} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">Открыть</Link>
          <Link href={`/properties/${apartment.id}?openBooking=1${bookingQuery}`} className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20">Забронировать</Link>
        </div>
      </div>
    </article>
  );
}

export default function PublicCatalog() {
  const [query, setQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [pricePeriod, setPricePeriod] = useState<"" | "night" | "week" | "month">("");
  const [bedrooms, setBedrooms] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [viewMode, setViewMode] = useState<CatalogViewMode>("map");
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [bookings, setBookings] = useState<ReturnType<typeof getBookings>>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const loadedApartments = await loadApartmentsFromSupabase({ publicOnly: true });
      const loadedBookings = getBookings();

      if (cancelled) return;
      setApartments(loadedApartments);
      setBookings(loadedBookings);
      setIsLoading(false);
    }

    void load();

    const refreshInterval = window.setInterval(() => {
      void load();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
    };
  }, []);

  const publicApartments = useMemo(() => apartments.filter(isApartmentPublic), [apartments]);
  const cities = useMemo(() => getUniqueValues(publicApartments, (apartment) => apartment.city), [publicApartments]);
  const districts = useMemo(
    () => getUniqueValues(selectedCity ? publicApartments.filter((apartment) => apartment.city === selectedCity) : publicApartments, (apartment) => getAddressDistrictFallback(apartment)),
    [publicApartments, selectedCity],
  );

  const visibleApartments = useMemo(() => {
    const guestsValue = guests === "" ? null : Number(guests);
    const bedroomsValue = bedrooms === "" ? null : Number(bedrooms);
    const minPriceValue = minPrice === "" ? null : Number(minPrice);
    const maxPriceValue = maxPrice === "" ? null : Number(maxPrice);
    const filtered = publicApartments.filter((apartment) => {
      if (!matchesApartmentLocation(apartment, query)) return false;
      if (selectedCity && apartment.city !== selectedCity) return false;
      if (selectedDistrict && getAddressDistrictFallback(apartment) !== selectedDistrict) return false;
      if (guestsValue !== null && Number.isFinite(guestsValue) && apartment.maxGuests < guestsValue) return false;
      if (bedroomsValue !== null && Number.isFinite(bedroomsValue) && apartment.bedrooms < bedroomsValue) return false;
      const priceInfo = getApartmentPriceInfo(apartment);
      if (pricePeriod && (!priceInfo || priceInfo.period !== pricePeriod)) return false;
      if (minPriceValue !== null && Number.isFinite(minPriceValue) && priceInfo && (!pricePeriod || priceInfo.period === pricePeriod) && priceInfo.amount < minPriceValue) return false;
      if (maxPriceValue !== null && Number.isFinite(maxPriceValue) && priceInfo && (!pricePeriod || priceInfo.period === pricePeriod) && priceInfo.amount > maxPriceValue) return false;
      if (onlyAvailable && checkIn && checkOut) return isApartmentAvailableForDates({ apartment, bookings, checkIn, checkOut });
      return true;
    });

    const sorted = [...filtered];
    const periodRank: Record<"night" | "week" | "month", number> = { night: 1, week: 2, month: 3 };
    if (sortMode === "price_asc" || sortMode === "price_desc") {
      sorted.sort((first, second) => {
        const firstPrice = getApartmentPriceInfo(first);
        const secondPrice = getApartmentPriceInfo(second);
        if (!firstPrice && !secondPrice) return 0;
        if (!firstPrice) return 1;
        if (!secondPrice) return -1;
        const periodDiff = sortMode === "price_asc" ? periodRank[firstPrice.period] - periodRank[secondPrice.period] : periodRank[secondPrice.period] - periodRank[firstPrice.period];
        if (periodDiff !== 0) return periodDiff;
        return sortMode === "price_asc" ? firstPrice.amount - secondPrice.amount : secondPrice.amount - firstPrice.amount;
      });
    }
    if (sortMode === "capacity_desc") sorted.sort((first, second) => second.maxGuests - first.maxGuests);
    if (sortMode === "recommended") sorted.sort((first, second) => (second.bookings + second.maxGuests + (second.dailyPrice ? 2 : 0)) - (first.bookings + first.maxGuests + (first.dailyPrice ? 2 : 0)));
    return sorted;
  }, [bedrooms, bookings, checkIn, checkOut, guests, maxPrice, minPrice, onlyAvailable, publicApartments, query, selectedCity, selectedDistrict, pricePeriod, sortMode]);

  const mapApartments = useMemo(() => visibleApartments.filter((apartment) => getApartmentCoordinates(apartment) !== null), [visibleApartments]);
  const hasAnyPublicCoordinates = useMemo(() => publicApartments.some((apartment) => getApartmentCoordinates(apartment) !== null), [publicApartments]);

  function resetFilters() {
    setQuery(""); setSelectedCity(""); setSelectedDistrict(""); setCheckIn(""); setCheckOut(""); setGuests(""); setMinPrice(""); setMaxPrice(""); setPricePeriod(""); setBedrooms(""); setOnlyAvailable(false); setSortMode("recommended");
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
        <PublicCatalogHeader />
        {viewMode === "map" && !isLoading && visibleApartments.length > 0 ? (
          <section aria-labelledby="map-heading" className="mb-12 space-y-4">
            <div>
              <p className="text-sm font-medium text-cyan-300">Карта объектов</p>
              <h2 id="map-heading" className="mt-1 text-2xl font-semibold text-white">Выберите жильё на карте</h2>
            </div>
            {mapApartments.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">
                <p>{hasAnyPublicCoordinates ? "Объекты доступны в списке, но пока не отображаются на карте." : "Для объектов пока не указаны координаты."}</p>
                <p className="mt-2 text-sm text-slate-400">Добавьте координаты в карточке объекта.</p>
              </div>
            ) : (
              <PublicCatalogMap apartments={visibleApartments} focusedApartmentId={null} checkIn={checkIn} checkOut={checkOut} guests={guests} />
            )}
          </section>
        ) : null}
        <section className="space-y-12">
          <section aria-labelledby="catalog-heading">
            <div className="mb-6"><p className="text-sm font-medium text-cyan-300">Курортная недвижимость</p><h1 id="catalog-heading" className="mt-1 text-3xl font-semibold text-white">Все доступные объекты</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Откройте любой объект, чтобы посмотреть фотографии, расположение, условия и свободные даты.</p></div>
            {isLoading ? <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">Загружаем объекты...</div> : publicApartments.length === 0 ? <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">Пока нет опубликованных объектов.</div> : visibleApartments.length === 0 ? <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6"><p className="text-slate-100">По вашему запросу ничего не найдено</p><p className="mt-2 text-sm text-slate-400">Попробуйте изменить город, район, даты или количество гостей.</p><button type="button" onClick={resetFilters} className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">Сбросить фильтры</button></div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visibleApartments.map((apartment) => <ApartmentCard key={apartment.id} apartment={apartment} bookings={bookings} compact />)}</div>}
          </section>

          <section id="find-another-property" aria-labelledby="search-heading">
            <div className="mb-6"><p className="text-sm font-medium text-cyan-300">Другой район или даты</p><h2 id="search-heading" className="mt-1 text-2xl font-semibold text-white">Не нашли подходящий вариант?</h2><p className="mt-2 max-w-2xl text-sm text-slate-300">Найдите другой объект по району, датам, вместимости и бюджету.</p></div>
            <div className="mb-6 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
              <div className="mt-4 grid gap-3 lg:grid-cols-4"><label className="lg:col-span-2"><div className="text-xs text-slate-400">Город, район или адрес</div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Аланья, Махмутлар, Ataturk, 305" className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" /></label><label><div className="text-xs text-slate-400">Сортировка</div><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"><option value="recommended">Рекомендуемые</option><option value="price_asc">Цена: сначала дешевле</option><option value="price_desc">Цена: сначала дороже</option><option value="capacity_desc">Больше вместимость</option></select></label><div className="flex items-end"><button type="button" onClick={resetFilters} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">Сбросить фильтры</button></div></div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4"><label><div className="text-xs text-slate-400">Город</div><select value={selectedCity} onChange={(event) => { setSelectedCity(event.target.value); setSelectedDistrict(""); }} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"><option value="">Все города</option>{cities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label><label><div className="text-xs text-slate-400">Район</div><select value={selectedDistrict} onChange={(event) => setSelectedDistrict(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"><option value="">Все районы</option>{districts.map((district) => <option key={district} value={district}>{district}</option>)}</select></label><label><div className="text-xs text-slate-400">Даты</div><div className="mt-1 grid grid-cols-2 gap-2"><input type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white outline-none" /><input type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white outline-none" /></div></label><label><div className="text-xs text-slate-400">Количество гостей</div><input type="number" min={1} value={guests} onChange={(event) => setGuests(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" /></label></div>
              <div className="mt-3 grid gap-3 md:grid-cols-3"><label><div className="text-xs text-slate-400">Минимальная цена</div><input type="number" min={0} value={minPrice} onChange={(event) => setMinPrice(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" /></label><label><div className="text-xs text-slate-400">Максимальная цена</div><input type="number" min={0} value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" /></label><label><div className="text-xs text-slate-400">Количество спален</div><input type="number" min={1} value={bedrooms} onChange={(event) => setBedrooms(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none" /></label><label><div className="text-xs text-slate-400">Период аренды для цены</div><select value={pricePeriod} onChange={(event) => setPricePeriod(event.target.value as "" | "night" | "week" | "month")} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"><option value="">Любой</option><option value="night">За ночь</option><option value="week">За неделю</option><option value="month">За месяц</option></select></label></div>
              <p className="mt-2 text-xs text-slate-500">Фильтр цены применяется по исходному тарифному периоду без автоматической конвертации.</p><label className="mt-4 inline-flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={onlyAvailable} onChange={(event) => setOnlyAvailable(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-300" />Показывать только свободные</label>
            </div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/80 p-4"><p className="text-sm text-slate-200">{isLoading ? "Загружаем объекты..." : `Найдено объектов: ${visibleApartments.length}`}</p><div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1"><button type="button" onClick={() => setViewMode((current) => current === "map" ? "list" : "map")} className={`rounded-lg px-3 py-1 text-sm ${viewMode === "map" ? "bg-cyan-500/20 text-cyan-200" : "text-slate-300"}`}>{viewMode === "map" ? "Скрыть карту" : "Показать на карте"}</button></div></div>
          </section>
          <PartnerCallout />
        </section>
      </main>
    </div>
  );
}
