import type { Apartment } from "@/types/apartment";
import type { Booking } from "@/types/booking";
import type { Client } from "@/types/client";
import type { User } from "@/types/user";
import { hasEffectivePermission } from "@/lib/permissions";

function apartmentPublicationStatus(apartment: Apartment): "draft" | "published" | "hidden" | "archived" {
  if (apartment.publicationStatus) {
    return apartment.publicationStatus;
  }

  return "draft";
}

function isInternalUser(user: User): boolean {
  return user.role !== "Гость";
}

function isApprovedInternalUser(user: User): boolean {
  if (!isInternalUser(user)) return false;
  return user.status === "Активен";
}

export function canViewProperty(currentUser: User, apartment: Apartment): boolean {
  const publicationStatus = apartmentPublicationStatus(apartment);

  if (publicationStatus === "published") {
    return true;
  }

  if (!isApprovedInternalUser(currentUser)) {
    return false;
  }

  return hasEffectivePermission(currentUser, "properties.view");
}

export function canViewBooking(currentUser: User, booking: Booking): boolean {
  if (currentUser.role === "Владелец") return true;
  if (currentUser.role === "Менеджер") return true;

  if (currentUser.role === "Гость") {
    return Boolean(currentUser.clientId && booking.clientId === currentUser.clientId);
  }

  return currentUser.status === "Активен" && hasEffectivePermission(currentUser, "bookings.view");
}

export function canManageBooking(currentUser: User, booking: Booking): boolean {
  if (currentUser.role === "Владелец" || currentUser.role === "Менеджер") {
    return true;
  }

  if (currentUser.role === "Гость") {
    return Boolean(currentUser.clientId && booking.clientId === currentUser.clientId && booking.status !== "cancelled");
  }

  return currentUser.status === "Активен" && hasEffectivePermission(currentUser, "bookings.manage");
}

export function canViewClient(currentUser: User, client: Client): boolean {
  if (currentUser.role === "Гость") {
    return Boolean(currentUser.clientId && currentUser.clientId === client.id);
  }

  return currentUser.status === "Активен" && hasEffectivePermission(currentUser, "clients.view");
}

export function canApproveUser(currentUser: User): boolean {
  if (currentUser.status !== "Активен") {
    return false;
  }

  return hasEffectivePermission(currentUser, "users.approve");
}
