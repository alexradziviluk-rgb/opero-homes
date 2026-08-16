import type { Apartment } from "@/types/apartment";

export function getApartmentStaffId(apartment: Pick<Apartment, "id" | "internalNumber">): string {
  return apartment.internalNumber != null ? String(apartment.internalNumber) : apartment.id.slice(0, 8);
}

export function getApartmentStaffLabel(apartment: Pick<Apartment, "id" | "internalNumber" | "title">): string {
  return `${apartment.title} — ID ${getApartmentStaffId(apartment)}`;
}
