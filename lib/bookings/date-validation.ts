export function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function hasPastBookingDate(checkIn: string, checkOut: string): boolean {
  const todayIso = getTodayIso();
  return checkIn < todayIso || checkOut < todayIso;
}