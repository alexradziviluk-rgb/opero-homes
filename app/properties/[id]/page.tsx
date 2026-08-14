import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import GuestPropertyDetailsPage from "@/app/guest/properties/[id]/page";
import { loadApartmentFromSupabase } from "@/lib/apartments/supabase-apartments";
import { formatApartmentPrice, getApartmentPhotoUrl, getApartmentPublicLocation, isApartmentPublic } from "@/lib/apartments/public-catalog";
import { resolvePublicSiteUrl } from "@/lib/auth/site-url";
import { getLocationSlugForApartment } from "@/lib/seo/public-locations";

export const revalidate = 600;

type PropertyPageProps = { params: Promise<{ id: string }> };

async function getPublicApartment(id: string) {
	try {
		const apartment = await loadApartmentFromSupabase(id, { publicOnly: true });
		return apartment && isApartmentPublic(apartment) ? apartment : null;
	} catch {
		return null;
	}
}

export async function generateMetadata({ params }: PropertyPageProps): Promise<Metadata> {
	const { id } = await params;
	const apartment = await getPublicApartment(id);
	if (!apartment) {
		return { title: "Объект не найден", robots: { index: false, follow: false } };
	}

	const location = getApartmentPublicLocation(apartment);
	const description = apartment.shortDesc.trim() || `${apartment.title} в ${location}. Посмотрите характеристики, фото и условия аренды в Opero Homes.`;
	const canonical = `${resolvePublicSiteUrl()}/properties/${apartment.id}`;
	return {
		title: apartment.title,
		description,
		alternates: { canonical },
		robots: { index: true, follow: true },
		openGraph: { type: "website", url: canonical, title: apartment.title, description },
	};
}

export default async function PropertyPage({ params }: PropertyPageProps) {
	const { id } = await params;
	const apartment = await getPublicApartment(id);
	if (!apartment) notFound();

	const siteUrl = resolvePublicSiteUrl();
	const canonical = `${siteUrl}/properties/${apartment.id}`;
	const locationSlug = getLocationSlugForApartment(apartment);
	const image = getApartmentPhotoUrl(apartment.photos?.[0]) ?? getApartmentPhotoUrl(apartment.coverPhotoUrl ?? undefined);
	const description = apartment.shortDesc.trim() || `${apartment.title} в ${getApartmentPublicLocation(apartment)}.`;
	const jsonLd = {
		"@context": "https://schema.org",
		"@type": "Accommodation",
		name: apartment.title,
		description,
		url: canonical,
		image: image ? [image] : undefined,
		address: {
			"@type": "PostalAddress",
			addressLocality: apartment.city,
			addressRegion: apartment.district || undefined,
			addressCountry: apartment.country || "TR",
		},
		numberOfBedrooms: apartment.bedrooms || undefined,
		occupancy: apartment.maxGuests ? { "@type": "QuantitativeValue", maxValue: apartment.maxGuests } : undefined,
		offers: apartment.dailyPrice || apartment.weeklyPrice || apartment.monthlyPrice ? {
			"@type": "Offer",
			price: apartment.dailyPrice ?? apartment.weeklyPrice ?? apartment.monthlyPrice,
			priceCurrency: "EUR",
			url: canonical,
			availability: "https://schema.org/InStock",
		} : undefined,
	};

	return (
		<>
			<article className="mx-auto mb-6 max-w-7xl rounded-2xl border border-white/10 bg-slate-900/80 p-5 text-slate-100 sm:p-8">
				<nav aria-label="Хлебные крошки" className="text-sm text-slate-400">
					  <Link href="/" className="hover:text-cyan-200">Главная</Link> <span aria-hidden="true">→</span>{" "}
					  {locationSlug ? <a href={`/rent/${locationSlug}`} className="hover:text-cyan-200">Аренда</a> : <span>Аренда</span>} <span aria-hidden="true">→</span>{" "}
					<span>{apartment.title}</span>
				</nav>
				<h1 className="mt-4 text-3xl font-semibold text-white">{apartment.title}</h1>
				<p className="mt-2 text-base text-cyan-200">{getApartmentPublicLocation(apartment)}</p>
				<p className="mt-4 max-w-3xl leading-7 text-slate-300">{description}</p>
				<div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
					<span>{apartment.maxGuests} гостей</span>
					<span>{apartment.bedrooms} спальни</span>
					<span>{apartment.bathrooms} санузла</span>
					<span>{formatApartmentPrice(apartment)}</span>
				</div>
			</article>
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
			<GuestPropertyDetailsPage initialApartment={apartment} />
		</>
	);
}
