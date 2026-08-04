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
import LanguageSwitcher, { useLanguage, type Language } from "@/components/LanguageSwitcher";

const PublicCatalogMap = dynamic(() => import("@/components/guest/PublicCatalogMap"), {
  ssr: false,
});

type SortMode = "recommended" | "price_asc" | "price_desc" | "capacity_desc";
type CatalogViewMode = "list" | "map";
const catalogCopy = {
  ru: { search: "Поиск жилья", partner: "Стать партнёром", login: "Войти", openMap: "Открыть карту объектов", hide: "Скрыть карту", resort: "Курортная недвижимость", allProperties: "Все доступные объекты", catalogIntro: "Откройте любой объект, чтобы посмотреть фотографии, расположение, условия и свободные даты.", map: "Карта объектов", chooseOnMap: "Выберите жильё на карте", otherArea: "Другой район или даты", noMatch: "Не нашли подходящий вариант?", searchIntro: "Найдите другой объект по району, датам, вместимости и бюджету.", address: "Город, район или адрес", apply: "Применить поиск", sort: "Сортировка", recommended: "Рекомендуемые", cheapest: "Цена: сначала дешевле", expensive: "Цена: сначала дороже", capacity: "Больше вместимость", reset: "Сбросить фильтры", city: "Город", allCities: "Все города", district: "Район", allDistricts: "Все районы", dates: "Даты", checkIn: "Заезд", checkOut: "Выезд", addDate: "Добавить дату", guests: "Количество гостей", minPrice: "Минимальная цена", maxPrice: "Максимальная цена", bedrooms: "Количество спален", pricePeriod: "Период аренды для цены", any: "Любой", night: "За ночь", week: "За неделю", month: "За месяц", availableOnly: "Показывать только свободные", found: "Найдено объектов", loading: "Загружаем объекты...", loadError: "Не удалось загрузить объекты. Попробуйте ещё раз.", empty: "Пока нет опубликованных объектов.", noResults: "По вашему запросу ничего не найдено", noResultsHint: "Попробуйте изменить город, район, даты или количество гостей.", showMap: "Показать на карте", ownerTitle: "Сдаёте недвижимость?", ownerText: "Размещайте объекты, управляйте бронированиями и контролируйте статистику в Opero Homes" },
  en: { search: "Find a home", partner: "Become a partner", login: "Sign in", openMap: "Open property map", hide: "Hide map", resort: "Resort property", allProperties: "All available properties", catalogIntro: "Open any property to view photos, location, terms and available dates.", map: "Property map", chooseOnMap: "Choose a home on the map", otherArea: "Another area or dates", noMatch: "Didn't find the right option?", searchIntro: "Find another property by area, dates, capacity and budget.", address: "City, district or address", apply: "Apply search", sort: "Sort", recommended: "Recommended", cheapest: "Price: lowest first", expensive: "Price: highest first", capacity: "Most capacity", reset: "Reset filters", city: "City", allCities: "All cities", district: "District", allDistricts: "All districts", dates: "Dates", checkIn: "Check-in", checkOut: "Check-out", addDate: "Add date", guests: "Guests", minPrice: "Minimum price", maxPrice: "Maximum price", bedrooms: "Bedrooms", pricePeriod: "Price rental period", any: "Any", night: "Per night", week: "Per week", month: "Per month", availableOnly: "Show available only", found: "Properties found", loading: "Loading properties...", loadError: "Properties could not be loaded. Please try again.", empty: "No published properties yet.", noResults: "No properties match your search", noResultsHint: "Try changing the city, district, dates or guest count.", showMap: "Show on map", ownerTitle: "Do you own a property?", ownerText: "List properties, manage bookings and track performance with Opero Homes" },
  tr: { search: "Konut ara", partner: "Partner ol", login: "Giriş yap", openMap: "Haritayı aç", hide: "Haritayı gizle", resort: "Tatil konutları", allProperties: "Tüm uygun konutlar", catalogIntro: "Fotoğrafları, konumu, koşulları ve uygun tarihleri görmek için bir konut açın.", map: "Konut haritası", chooseOnMap: "Haritada konut seçin", otherArea: "Başka bölge veya tarihler", noMatch: "Uygun seçenek bulamadınız mı?", searchIntro: "Bölge, tarih, kapasite ve bütçeye göre başka bir konut bulun.", address: "Şehir, bölge veya adres", apply: "Aramayı uygula", sort: "Sıralama", recommended: "Önerilen", cheapest: "Fiyat: düşükten yükseğe", expensive: "Fiyat: yüksekten düşüğe", capacity: "En yüksek kapasite", reset: "Filtreleri sıfırla", city: "Şehir", allCities: "Tüm şehirler", district: "Bölge", allDistricts: "Tüm bölgeler", dates: "Tarihler", checkIn: "Giriş", checkOut: "Çıkış", addDate: "Tarih ekle", guests: "Misafir sayısı", minPrice: "Minimum fiyat", maxPrice: "Maksimum fiyat", bedrooms: "Yatak odası sayısı", pricePeriod: "Fiyat dönemi", any: "Tümü", night: "Gecelik", week: "Haftalık", month: "Aylık", availableOnly: "Sadece müsaitleri göster", found: "Bulunan konut", loading: "Konutlar yükleniyor...", loadError: "Konutlar yüklenemedi. Lütfen tekrar deneyin.", empty: "Henüz yayınlanmış konut yok.", noResults: "Aramanızla eşleşen konut yok", noResultsHint: "Şehri, bölgeyi, tarihleri veya misafir sayısını değiştirin.", showMap: "Haritada göster", ownerTitle: "Gayrimenkulünüzü mü kiralıyorsunuz?", ownerText: "Konutları yayınlayın, rezervasyonları yönetin ve Opero Homes ile istatistikleri takip edin" },
} as const;

const cardCopy = {
  ru: { guests: "гостей", bedrooms: "спальни", beds: "кровати", bathrooms: "санузла", daily: "Посуточно", weekly: "Понедельно", monthly: "Помесячно", available: "Доступно", occupied: "Занято", addressPending: "Адрес уточняется", unavailable: "Фото недоступно", busy: "Занят на выбранные даты", open: "Открыть", book: "Забронировать" },
  en: { guests: "guests", bedrooms: "bedrooms", beds: "beds", bathrooms: "bathrooms", daily: "Daily", weekly: "Weekly", monthly: "Monthly", available: "Available", occupied: "Occupied", addressPending: "Address pending", unavailable: "Photo unavailable", busy: "Busy on selected dates", open: "Open", book: "Book" },
  tr: { guests: "misafir", bedrooms: "yatak odası", beds: "yatak", bathrooms: "banyo", daily: "Günlük", weekly: "Haftalık", monthly: "Aylık", available: "Müsait", occupied: "Dolu", addressPending: "Adres bekleniyor", unavailable: "Fotoğraf yok", busy: "Seçilen tarihlerde dolu", open: "Aç", book: "Rezervasyon" },
} as const;

function getAmenities(apartment: Apartment, language: Language): string[] {
  const copy = cardCopy[language];
  const amenities: string[] = [];

  if (apartment.bedrooms > 0) amenities.push(`${apartment.bedrooms} ${copy.bedrooms}`);
  if (apartment.bathrooms > 0) amenities.push(`${apartment.bathrooms} ${copy.bathrooms}`);
  if (apartment.rentalTypes.daily) amenities.push(copy.daily);
  if (apartment.rentalTypes.weekly) amenities.push(copy.weekly);
  if (apartment.rentalTypes.monthly) amenities.push(copy.monthly);

  return amenities.slice(0, 5);
}

function PublicCatalogHeader({ language, isMapHidden, onShowMap, onLanguageChange }: { language: Language; isMapHidden: boolean; onShowMap: () => void; onLanguageChange: (language: Language) => void }) {
  const copy = catalogCopy[language];
  return (
    <header className="mb-8 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 shadow-lg shadow-black/10">
      <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Публичная навигация">
        <Link href="/" className="text-lg font-bold tracking-tight text-white">opero<span className="text-cyan-300">.</span></Link>
        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          <a href="#find-another-property" className="rounded-xl px-3 py-2 text-slate-200 hover:bg-white/10">{copy.search}</a>
          <Link href="/business" className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 font-semibold text-cyan-200 hover:bg-cyan-500/20">{copy.partner}</Link>
          <Link href="/login" className="rounded-xl border border-white/10 px-3 py-2 text-slate-200 hover:bg-white/10">{copy.login}</Link>
          <LanguageSwitcher language={language} onChange={onLanguageChange} />
        </div>
      </nav>
      {isMapHidden ? (
        <button type="button" onClick={onShowMap} className="mt-3 flex w-full items-center justify-center gap-3 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/20">
          <span aria-hidden="true" className="text-xl leading-none">⌖</span>
          <span>{copy.openMap}</span>
        </button>
      ) : null}
    </header>
  );
}

function PartnerCallout({ language }: { language: Language }) {
  const copy = catalogCopy[language];
  return (
    <section className="rounded-3xl border border-cyan-300/20 bg-[linear-gradient(120deg,rgba(8,47,73,0.95),rgba(15,23,42,0.96))] p-6 shadow-xl shadow-cyan-950/10 sm:p-8" aria-labelledby="partner-heading">
      <div className="max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">{copy.partner}</p>
        <h2 id="partner-heading" className="mt-3 text-3xl font-semibold text-white">{copy.ownerTitle}</h2>
        <p className="mt-3 text-base leading-7 text-slate-300">{copy.ownerText}</p>
        <Link href="/business" className="mt-6 inline-flex rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-200">{copy.partner}</Link>
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
  language,
}: {
  apartment: Apartment;
  bookings: ReturnType<typeof getBookings>;
  checkIn?: string;
  checkOut?: string;
  guests?: string;
  compact?: boolean;
  language: Language;
}) {
  const copy = cardCopy[language];
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
            placeholderText={copy.unavailable}
          />
          {photoCount > 0 ? <div className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-1 text-xs text-slate-200">{`1 / ${photoCount}`}</div> : null}
        </div>
      </Link>

      <div className={compact ? "p-3" : "p-4"}>
        <h2 className={`${compact ? "text-base" : "text-lg"} font-semibold text-white`}>
          <Link href={`/properties/${apartment.id}`} className="hover:text-cyan-200">{apartment.title}</Link>
        </h2>
        <p className="mt-1 text-sm text-slate-400">{getApartmentPublicLocation(apartment)}</p>
        {!compact ? <p className="mt-1 text-sm text-slate-300">{apartment.address || copy.addressPending}</p> : null}

        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-cyan-300">{formatApartmentPrice(apartment)}</p>
          <p className="text-xs text-slate-300">{availableForDates ? copy.available : copy.occupied}</p>
        </div>

        <p className="mt-2 text-sm text-slate-300">{apartment.maxGuests} {copy.guests} · {apartment.bedrooms} {copy.bedrooms} · {apartment.rooms} {copy.beds}</p>

        <div className={`${compact ? "mt-2" : "mt-3"} flex flex-wrap gap-2 text-xs`}>
          {getAmenities(apartment, language).slice(0, compact ? 2 : 5).map((amenity) => <span key={amenity} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-300">{amenity}</span>)}
        </div>

        {!availableForDates && checkIn && checkOut ? <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">{copy.busy}</p> : null}

        <div className={`${compact ? "mt-3" : "mt-4"} flex flex-wrap gap-2`}>
          <Link href={`/properties/${apartment.id}`} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">{copy.open}</Link>
          <Link href={`/properties/${apartment.id}?openBooking=1${bookingQuery}`} className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20">{copy.book}</Link>
        </div>
      </div>
    </article>
  );
}

export default function PublicCatalog() {
  const [language, setLanguage] = useLanguage();
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
  const [loadError, setLoadError] = useState(false);

  const copy = catalogCopy[language];

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const loadedApartments = await loadApartmentsFromSupabase({ publicOnly: true });
        const loadedBookings = getBookings();

        if (cancelled) return;
        setApartments(loadedApartments);
        setBookings(loadedBookings);
        setLoadError(false);
      } catch {
        if (cancelled) return;
        setLoadError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
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
        <PublicCatalogHeader language={language} isMapHidden={viewMode === "list"} onShowMap={() => setViewMode("map")} onLanguageChange={setLanguage} />
        <section className="space-y-12">
          <section id="catalog-results" aria-labelledby="catalog-heading">
            <div className="mb-6"><p className="text-sm font-medium text-cyan-300">{copy.resort}</p><h1 id="catalog-heading" className="mt-1 text-3xl font-semibold text-white">{copy.allProperties}</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">{copy.catalogIntro}</p></div>
            {viewMode === "map" && !isLoading && visibleApartments.length > 0 ? (
              <div className="mb-12 space-y-4" aria-labelledby="map-heading">
                <div>
                  <p className="text-sm font-medium text-cyan-300">{copy.map}</p>
                  <h2 id="map-heading" className="mt-1 text-2xl font-semibold text-white">{copy.chooseOnMap}</h2>
                </div>
                {mapApartments.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">
                    <p>{hasAnyPublicCoordinates ? "Объекты доступны в списке, но пока не отображаются на карте." : "Для объектов пока не указаны координаты."}</p>
                    <p className="mt-2 text-sm text-slate-400">Добавьте координаты в карточке объекта.</p>
                  </div>
                ) : (
                  <PublicCatalogMap apartments={visibleApartments} focusedApartmentId={null} checkIn={checkIn} checkOut={checkOut} guests={guests} language={language} onHide={() => setViewMode("list")} />
                )}
              </div>
            ) : null}
            {isLoading ? <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">{copy.loading}</div> : loadError ? <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-rose-100">{copy.loadError}</div> : publicApartments.length === 0 ? <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">{copy.empty}</div> : visibleApartments.length === 0 ? <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6"><p className="text-slate-100">{copy.noResults}</p><p className="mt-2 text-sm text-slate-400">{copy.noResultsHint}</p><button type="button" onClick={resetFilters} className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">{copy.reset}</button></div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visibleApartments.map((apartment) => <ApartmentCard key={apartment.id} apartment={apartment} bookings={bookings} compact language={language} />)}</div>}
          </section>

          <section id="find-another-property" aria-labelledby="search-heading">
            <div className="mb-6"><p className="text-sm font-medium text-cyan-300">{copy.otherArea}</p><h2 id="search-heading" className="mt-1 text-2xl font-semibold text-white">{copy.noMatch}</h2><p className="mt-2 max-w-2xl text-sm text-slate-300">{copy.searchIntro}</p></div>
            <div className="mb-6 rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-5">
              <div className="grid gap-2 lg:grid-cols-4"><label className="lg:col-span-2"><div className="text-xs text-slate-400">{copy.address}</div><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") document.getElementById("catalog-results")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} placeholder="Alanya, Аланья, Mahmutlar, Ataturk, 305" className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none" /></label><label><div className="text-xs text-slate-400">{copy.sort}</div><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none"><option value="recommended">{copy.recommended}</option><option value="price_asc">{copy.cheapest}</option><option value="price_desc">{copy.expensive}</option><option value="capacity_desc">{copy.capacity}</option></select></label></div>
              <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-4"><label><div className="text-xs text-slate-400">{copy.city}</div><select value={selectedCity} onChange={(event) => { setSelectedCity(event.target.value); setSelectedDistrict(""); }} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none"><option value="">{copy.allCities}</option>{cities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label><label><div className="text-xs text-slate-400">{copy.district}</div><select value={selectedDistrict} onChange={(event) => setSelectedDistrict(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none"><option value="">{copy.allDistricts}</option>{districts.map((district) => <option key={district} value={district}>{district}</option>)}</select></label><div><div className="text-xs text-slate-400">{copy.dates}</div><div className="mt-1 grid grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-white/5"><label className="relative border-r border-white/10 px-3 py-2 text-xs text-slate-400"><span className="block">{copy.checkIn}</span><span className={`block text-sm ${checkIn ? "text-white" : "text-slate-500"}`}>{checkIn || copy.addDate}</span><input type="date" aria-label={copy.checkIn} value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></label><label className="relative px-3 py-2 text-xs text-slate-400"><span className="block">{copy.checkOut}</span><span className={`block text-sm ${checkOut ? "text-white" : "text-slate-500"}`}>{checkOut || copy.addDate}</span><input type="date" aria-label={copy.checkOut} value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></label></div></div><label><div className="text-xs text-slate-400">{copy.guests}</div><input type="number" min={1} value={guests} onChange={(event) => setGuests(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none" /></label></div>
              <div className="mt-2 grid gap-2 md:grid-cols-3"><label><div className="text-xs text-slate-400">{copy.minPrice}</div><input type="number" min={0} value={minPrice} onChange={(event) => setMinPrice(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none" /></label><label><div className="text-xs text-slate-400">{copy.maxPrice}</div><input type="number" min={0} value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none" /></label><label><div className="text-xs text-slate-400">{copy.bedrooms}</div><input type="number" min={1} value={bedrooms} onChange={(event) => setBedrooms(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none" /></label><label><div className="text-xs text-slate-400">{copy.pricePeriod}</div><select value={pricePeriod} onChange={(event) => setPricePeriod(event.target.value as "" | "night" | "week" | "month")} className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none"><option value="">{copy.any}</option><option value="night">{copy.night}</option><option value="week">{copy.week}</option><option value="month">{copy.month}</option></select></label></div>
              <p className="mt-2 text-xs text-slate-500">{language === "ru" ? "Фильтр цены применяется по исходному тарифному периоду без автоматической конвертации." : language === "en" ? "The price filter uses the original rental period without automatic conversion." : "Fiyat filtresi, otomatik dönüşüm olmadan orijinal kiralama dönemini kullanır."}</p><label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={onlyAvailable} onChange={(event) => setOnlyAvailable(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-300" />{copy.availableOnly}</label>
              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3"><button type="button" onClick={() => document.getElementById("catalog-results")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">{copy.apply}</button><button type="button" onClick={resetFilters} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10">{copy.reset}</button></div>
            </div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/80 p-4"><p className="text-sm text-slate-200">{isLoading ? copy.loading : `${copy.found}: ${visibleApartments.length}`}</p><div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1"><button type="button" onClick={() => setViewMode((current) => current === "map" ? "list" : "map")} className={`rounded-lg px-3 py-1 text-sm ${viewMode === "map" ? "bg-cyan-500/20 text-cyan-200" : "text-slate-300"}`}>{viewMode === "map" ? copy.hide : copy.showMap}</button></div></div>
          </section>
          <PartnerCallout language={language} />
        </section>
      </main>
    </div>
  );
}
