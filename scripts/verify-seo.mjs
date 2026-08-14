const baseUrl = (process.env.SEO_BASE_URL || "http://localhost:3201").replace(/\/$/, "");

async function fetchPage(path) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "follow" });
  const body = await response.text();
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function getMetaContent(body, name) {
  const match = body.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"));
  return match?.[1] || "";
}

function getCanonical(body) {
  const match = body.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  return match?.[1] || "";
}

async function verifyIndexable(path, label) {
  const { response, body } = await fetchPage(path);
  assert(response.status === 200, `${label}: expected 200, got ${response.status}`);
  assert(!/noindex/i.test(getMetaContent(body, "robots")), `${label}: noindex found`);
  assert(/<title>/i.test(body), `${label}: title missing`);
  assert(getMetaContent(body, "description"), `${label}: description missing`);
  assert(/<h1\b/i.test(body), `${label}: H1 missing`);
  assert(getCanonical(body), `${label}: canonical missing`);
  return body;
}

const home = await verifyIndexable("/", "homepage");
const propertyMatch = home.match(/href=["']\/properties\/([a-z0-9-]+)["']/i);
assert(propertyMatch, "homepage: no published property link found in initial HTML");
assert(!/<h1[^>]*>[^<]*Загружаем объекты\.\.\./i.test(home), "homepage: loading-only shell found in initial HTML");

const robots = await fetchPage("/robots.txt");
assert(robots.response.status === 200, `robots: expected 200, got ${robots.response.status}`);
assert(/Sitemap:\s*https?:\/\/[^\s]+\/sitemap\.xml/i.test(robots.body), "robots: sitemap declaration missing");

const sitemap = await fetchPage("/sitemap.xml");
assert(sitemap.response.status === 200, `sitemap: expected 200, got ${sitemap.response.status}`);
assert(/<urlset[\s>]/i.test(sitemap.body), "sitemap: urlset missing");
assert(sitemap.body.includes("/"), "sitemap: homepage missing");
for (const location of ["/rent/alanya", "/rent/mahmutlar"]) {
  assert(sitemap.body.includes(location), `sitemap: ${location} missing`);
}
assert(!/(\/admin|\/owner|\/staff|\/auth|\/booking|\/api)\b/i.test(sitemap.body), "sitemap: internal route found");
assert(sitemap.body.includes(`/properties/${propertyMatch[1]}`), "sitemap: published property missing");

for (const location of ["alanya", "mahmutlar"]) {
  const { response } = await fetchPage(`/rent/${location}`);
  if (response.status === 404) continue;
  const body = await verifyIndexable(`/rent/${location}`, `/rent/${location}`);
  assert(new RegExp(`/properties/[a-z0-9-]+`, "i").test(body), `/rent/${location}: no property links found`);
}

const propertyPath = `/properties/${propertyMatch[1]}`;
const property = await verifyIndexable(propertyPath, "property page");
assert(/application\/ld\+json/i.test(property), "property page: JSON-LD missing");

const admin = await fetchPage("/admin");
const adminRobots = admin.response.headers.get("x-robots-tag") || "";
assert(/noindex/i.test(adminRobots), `admin: expected X-Robots-Tag noindex, got ${adminRobots || "missing"}`);

console.log(JSON.stringify({
  baseUrl,
  homepage: { status: 200, propertyPath },
  robots: { status: robots.response.status },
  sitemap: { status: sitemap.response.status },
  locations: ["/rent/alanya", "/rent/mahmutlar"],
  property: { path: propertyPath, status: 200, jsonLd: true },
  admin: { status: admin.response.status, xRobotsTag: adminRobots },
}, null, 2));
