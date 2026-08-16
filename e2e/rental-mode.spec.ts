import { expect, test } from "@playwright/test";
import { getRentalSearchMode, getRentalSearchPrice, isApartmentSuitableForRentalSearch } from "@/lib/apartments/rental-mode";
import type { Apartment } from "@/types/apartment";

function fixture(overrides: Partial<Pick<Apartment, "rentalTypes" | "dailyPrice" | "monthlyPrice">>): Pick<Apartment, "rentalTypes" | "dailyPrice" | "monthlyPrice"> {
  return {
    rentalTypes: { daily: false, weekly: false, monthly: false },
    dailyPrice: null,
    monthlyPrice: null,
    ...overrides,
  };
}

test.describe("rental mode search contract", () => {
  const shortStay = { checkIn: "2030-08-10", checkOut: "2030-08-15" };
  const monthlyStay = { checkIn: "2030-08-10", checkOut: "2030-09-10" };

  test("classifies short and monthly stays", () => {
    expect(getRentalSearchMode(shortStay.checkIn, shortStay.checkOut)).toBe("short");
    expect(getRentalSearchMode(monthlyStay.checkIn, monthlyStay.checkOut)).toBe("monthly");
  });

  test("A daily-only, B monthly-only, and C mixed inventory follow the same rules", () => {
    const daily = fixture({ rentalTypes: { daily: true, weekly: false, monthly: false }, dailyPrice: 100 });
    const monthly = fixture({ rentalTypes: { daily: false, weekly: false, monthly: true }, monthlyPrice: 1600 });
    const mixed = fixture({ rentalTypes: { daily: true, weekly: false, monthly: true }, dailyPrice: 110, monthlyPrice: 3200 });

    expect([daily, monthly, mixed].map((item) => isApartmentSuitableForRentalSearch(item, "short"))).toEqual([true, false, true]);
    expect([daily, monthly, mixed].map((item) => isApartmentSuitableForRentalSearch(item, "monthly"))).toEqual([false, true, true]);
    expect(getRentalSearchPrice(daily, "short")?.period).toBe("night");
    expect(getRentalSearchPrice(monthly, "monthly")?.period).toBe("month");
    expect(getRentalSearchPrice(monthly, "short")).toBeNull();
  });
});