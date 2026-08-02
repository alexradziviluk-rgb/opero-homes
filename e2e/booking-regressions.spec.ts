import { expect, test } from "@playwright/test";
import { persistBookingStatus } from "@/lib/bookings/remote-bookings";
import type { Booking } from "@/types/booking";

const bookingFixture: Booking = {
  id: "b85d31b0-37a3-421d-8378-2c76a893eb95",
  apartmentId: "apartment-1",
  clientId: "",
  guestName: "Regression guest",
  guestPhone: "",
  guestEmail: "",
  checkIn: "2031-01-10",
  checkOut: "2031-01-12",
  guests: 2,
  rentalType: "daily",
  pricePerPeriod: 810,
  periodsCount: 2,
  accommodationAmount: 1620,
  cleaningFee: 0,
  deposit: 0,
  discount: 0,
  totalAmount: 1620,
  paidAmount: 0,
  status: "pending",
  paymentStatus: "unpaid",
  source: "website",
  notes: "",
  createdAt: "2031-01-01T00:00:00.000Z",
  updatedAt: "2031-01-01T00:00:00.000Z",
};

test("reject transport uses the valid operational lifecycle", async () => {
  const originalFetch = globalThis.fetch;
  let request: RequestInit | undefined;

  globalThis.fetch = async (_input, init) => {
    request = init;
    return new Response(JSON.stringify({
      ok: true,
      data: { id: bookingFixture.id, status: "cancelled", request_status: "rejected" },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    await persistBookingStatus(bookingFixture, "rejected");
  } finally {
    globalThis.fetch = originalFetch;
  }

  expect(JSON.parse(String(request?.body))).toEqual({ status: "cancelled", requestStatus: "rejected" });
});

test("pending bookings reload has no hydration error", async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on("pageerror", (error) => {
    if (error.message.includes("React error #418") || error.message.includes("Minified React error #418")) {
      hydrationErrors.push(error.message);
    }
  });

  await page.goto("/bookings?status=pending");
  await page.reload();

  expect(hydrationErrors).toEqual([]);
});

