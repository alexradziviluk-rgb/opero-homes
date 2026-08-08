export function formatBookingReference(id: string): string {
  return `Бронь ${id.slice(0, 8).toUpperCase()}`;
}