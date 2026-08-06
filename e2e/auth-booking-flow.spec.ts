import { test, expect } from "@playwright/test";

test("anonymous booking request is rejected by the API", async ({ request }) => {
  const response = await request.post("/api/guest/bookings", {
    data: {
      apartmentId: "61901461-0d6d-4e61-98c6-b26738d10c37",
      checkIn: "2026-08-05",
      checkOut: "2026-08-07",
      guests: 2,
      guestName: "Анонимный клиент",
      guestEmail: "anonymous@example.com",
      guestPhone: "+90 555 000 0000",
    },
  });

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    errorCode: "session_expired",
  });
});

test("unauthenticated booking preserves apartment and dates through login redirect", async ({ page }) => {
  const bookingPath = "/guest/book/new?apartmentId=61901461-0d6d-4e61-98c6-b26738d10c37&checkIn=2026-08-05&checkOut=2026-08-07&guests=2";

  await page.goto(bookingPath);
  await expect(page).toHaveURL(/\/guest\/login\?next=/);

  const next = new URL(page.url()).searchParams.get("next");
  expect(next).toBe(bookingPath);
});