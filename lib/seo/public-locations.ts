import type { PublicApartment } from "@/types/apartment";
import { getAddressDistrictFallback, normalizeSearchValue } from "@/lib/apartments/public-catalog";

export type PublicLocation = {
  slug: string;
  title: string;
  heading: string;
  description: string;
  matches: (apartment: PublicApartment) => boolean;
};

function normalized(value: string): string {
  return normalizeSearchValue(value).replace(/[.,-]/g, " ").replace(/\s+/g, " ").trim();
}

const isAlanya = (apartment: PublicApartment) => {
  const city = normalized(apartment.city);
  return city.includes("alanya") || city.includes("аланья") || city.includes("алания");
};

const isMahmutlar = (apartment: PublicApartment) => {
  const district = normalized(getAddressDistrictFallback(apartment));
  return district.includes("mahmutlar") || district.includes("махмутлар");
};

export const publicLocations: PublicLocation[] = [
  {
    slug: "alanya",
    title: "Аренда квартир в Аланье | Opero Homes",
    heading: "Аренда квартир в Аланье",
    description: "Опубликованные квартиры в Аланье для посуточной, понедельной и помесячной аренды через Opero Homes.",
    matches: isAlanya,
  },
  {
    slug: "mahmutlar",
    title: "Аренда квартир в Махмутларе | Opero Homes",
    heading: "Аренда квартир в Махмутларе",
    description: "Подберите опубликованную квартиру в Махмутларе: реальные условия аренды, характеристики и актуальные контакты Opero Homes.",
    matches: isMahmutlar,
  },
];

export function getPublicLocation(slug: string): PublicLocation | null {
  return publicLocations.find((location) => location.slug === slug) ?? null;
}

export function getApartmentsForLocation(apartments: PublicApartment[], location: PublicLocation): PublicApartment[] {
  return apartments.filter((apartment) => location.matches(apartment));
}

export function getLocationSlugForApartment(apartment: PublicApartment): string | null {
  return publicLocations.find((location) => location.matches(apartment))?.slug ?? null;
}
