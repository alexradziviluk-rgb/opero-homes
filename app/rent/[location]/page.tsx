import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadApartmentsFromSupabase } from "@/lib/apartments/supabase-apartments";
import { formatApartmentPrice, getApartmentPhotoUrl, getApartmentPublicLocation } from "@/lib/apartments/public-catalog";
import { getApartmentsForLocation, getPublicLocation, publicLocations } from "@/lib/seo/public-locations";
import { resolvePublicSiteUrl } from "@/lib/auth/site-url";

type LocationPageProps = { params: Promise<{ location: string }> };

export const revalidate = 600;

async function getLocationData(slug: string) {
  const location = getPublicLocation(slug);
  if (!location) return null;

  try {
    const apartments = await loadApartmentsFromSupabase({ publicOnly: true });
    const matchedApartments = getApartmentsForLocation(apartments, location);
    return matchedApartments.length > 0 ? { location, apartments: matchedApartments } : null;
  } catch {
    return null;
  }
}

export function generateStaticParams() {
  return publicLocations.map(({ slug }) => ({ location: slug }));
}

export async function generateMetadata({ params }: LocationPageProps): Promise<Metadata> {
  const { location: slug } = await params;
  const location = getPublicLocation(slug);
  const data = await getLocationData(slug);
  if (!location || !data) {
    return { title: "Страница не найдена", robots: { index: false, follow: false } };
  }

  const canonical = `${resolvePublicSiteUrl()}/rent/${location.slug}`;
  return {
    title: location.title,
    description: location.description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      url: canonical,
      title: location.title,
      description: location.description,
    },
  };
}

export default async function LocationPage({ params }: LocationPageProps) {
  const { location: slug } = await params;
  const data = await getLocationData(slug);
  if (!data) notFound();

  const { location, apartments } = data;
  const siteUrl = resolvePublicSiteUrl();
  const canonical = `${siteUrl}/rent/${location.slug}`;
  const districts = [...new Set(apartments.map((apartment) => apartment.district.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru-RU"));
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: location.title,
      description: location.description,
      url: canonical,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Аренда", item: `${siteUrl}/rent/${location.slug}` },
      ],
    },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <nav aria-label="Хлебные крошки" className="text-sm text-slate-400">
        <Link href="/" className="hover:text-cyan-200">Главная</Link> <span aria-hidden="true">→</span>{" "}
        <span>Аренда</span> <span aria-hidden="true">→</span>{" "}
        <span>{location.heading.replace("Аренда квартир в ", "")}</span>
      </nav>

      <header className="mt-6 max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">Opero Homes</p>
        <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">{location.heading}</h1>
        <p className="mt-4 text-base leading-7 text-slate-300">{location.description}</p>
        <p className="mt-3 text-sm text-slate-400">Доступно опубликованных объектов: {apartments.length}</p>
        {districts.length > 0 ? <p className="mt-2 text-sm text-slate-400">Районы: {districts.join(", ")}</p> : null}
      </header>

      <section className="mt-10" aria-labelledby="location-properties-heading">
        <h2 id="location-properties-heading" className="text-2xl font-semibold text-white">Опубликованные квартиры</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {apartments.map((apartment) => {
            const image = getApartmentPhotoUrl(apartment.photos?.[0]) ?? getApartmentPhotoUrl(apartment.coverPhotoUrl ?? undefined);
            return (
              <article key={apartment.id} className="overflow-hidden rounded-lg border border-white/10 bg-slate-900/80">
                <Link href={`/properties/${apartment.id}`} className="block">
                  {image ? <Image src={image} alt={apartment.title} width={640} height={416} unoptimized className="h-52 w-full object-cover" /> : <div className="flex h-52 items-center justify-center bg-slate-800 text-sm text-slate-400">Фото скоро появится</div>}
                </Link>
                <div className="p-5">
                  <h3 className="text-lg font-semibold text-white"><Link href={`/properties/${apartment.id}`} className="hover:text-cyan-200">{apartment.title}</Link></h3>
                  <p className="mt-2 text-sm text-slate-400">{getApartmentPublicLocation(apartment)}</p>
                  <p className="mt-3 text-cyan-300">{formatApartmentPrice(apartment)}</p>
                  <p className="mt-2 text-sm text-slate-300">{apartment.maxGuests} гостей · {apartment.bedrooms} спальни · {apartment.bathrooms} санузла</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/properties/${apartment.id}`} className="inline-flex rounded-xl border border-cyan-400/30 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/10">Проверить доступность</Link>
                    <Link href={`/properties/${apartment.id}?openBooking=1`} className="inline-flex rounded-xl bg-cyan-300 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-200">Забронировать</Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-12 max-w-3xl" aria-labelledby="location-about-heading">
        <h2 id="location-about-heading" className="text-2xl font-semibold text-white">Аренда через Opero Homes</h2>
        <p className="mt-3 leading-7 text-slate-300">Opero Homes помогает сравнить реальные опубликованные объекты, изучить характеристики и перейти к условиям бронирования. Выберите квартиру выше, чтобы посмотреть фотографии, расположение и доступные даты.</p>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}
