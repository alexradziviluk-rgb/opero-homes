const baseUrl = (process.env.ADS_BASE_URL || "http://localhost:3201").replace(/\/$/, "");
const campaign = "?utm_source=google&utm_medium=cpc&utm_campaign=alanya_rent&utm_content=release-test";
import { chromium } from "@playwright/test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchPage(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return { response, body: await response.text() };
}

const landing = await fetchPage(`/rent/alanya${campaign}`);
assert(landing.response.status === 200, `landing: expected 200, got ${landing.response.status}`);
assert(/rel=["']canonical["'][^>]+href=["']https:\/\/operohq\.netlify\.app\/rent\/alanya["']/i.test(landing.body), "landing: canonical contains campaign parameters or is missing");
assert(!/(email|phone|telephone|telegram|access_token|service_role|guestName|guestPhone|guestEmail)/i.test(landing.body), "landing: possible PII marker found");

const property = await fetchPage("/properties/257ef8f0-df4f-426e-846b-765209d5d505" + campaign);
assert(property.response.status === 200, `property: expected 200, got ${property.response.status}`);
assert(/Календарь доступности/i.test(property.body), "property: availability/calendar content missing");

const sourceFiles = [
  "lib/analytics/client.ts",
  "components/analytics/AnalyticsScripts.tsx",
  "app/guest/properties/[id]/page.tsx",
  "app/guest/book/new/page.tsx",
];
const analyticsSource = await (await import("node:fs/promises")).readFile("lib/analytics/client.ts", "utf8");
for (const eventName of ["property_view", "availability_search", "booking_started", "booking_completed", "contact_started", "manager_requested", "owner_lead_started"]) {
  assert(analyticsSource.includes(`"${eventName}"`), `events: ${eventName} is missing from the analytics contract`);
}
for (const metaEvent of ["ViewContent", "Search", "InitiateCheckout", "Purchase", "Contact"]) {
  assert(analyticsSource.includes(`"${metaEvent}"`), `meta: ${metaEvent} mapping is missing`);
}

for (const file of sourceFiles) {
  const body = await (await import("node:fs/promises")).readFile(file, "utf8");
  const trackingCalls = body.match(/trackEvent\([\s\S]*?\);/g) || [];
  assert(!trackingCalls.some((call) => /(guestEmail|guestPhone|guestName|contactEmail|contactPhone|message|access_token)/i.test(call)), `${file}: possible PII analytics payload marker found`);
}

const bookingSource = await (await import("node:fs/promises")).readFile("app/guest/book/new/page.tsx", "utf8");
assert(bookingSource.indexOf('trackEvent("booking_completed"') > bookingSource.indexOf('if (!response.ok || !payload.ok || !payload.data)'), "booking_completed: event must follow successful booking response");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/rent/alanya${campaign}`, { waitUntil: "networkidle" });
  const attribution = await page.evaluate(() => sessionStorage.getItem("opero-utm-attribution"));
  const parsedAttribution = attribution ? JSON.parse(attribution) : null;
  assert(parsedAttribution?.utm_source === "google" && parsedAttribution?.utm_content === "release-test", "attribution: UTM values were not retained in session storage");
  assert(typeof parsedAttribution?.landing_page === "string" && parsedAttribution.landing_page.startsWith("/rent/alanya?"), "attribution: landing page was not retained");
} finally {
  await browser.close();
}

console.log(JSON.stringify({ baseUrl, landing: 200, property: 200, canonical: "clean", attribution: "retained", pii: "not detected", bookingCompletedAfterSuccess: true }, null, 2));