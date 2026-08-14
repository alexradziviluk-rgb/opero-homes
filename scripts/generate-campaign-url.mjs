const [destination, source, medium, campaign, content = "", term = ""] = process.argv.slice(2);
const siteOrigin = "https://operohq.netlify.app";

if (!destination || !source || !medium || !campaign) {
  console.error("Usage: npm run campaign:url -- <destination> <source> <medium> <campaign> [content] [term]");
  process.exit(1);
}

const url = new URL(destination, siteOrigin);
if (url.origin !== siteOrigin) {
  throw new Error("Destination must stay on https://operohq.netlify.app");
}

for (const [key, value] of [["utm_source", source], ["utm_medium", medium], ["utm_campaign", campaign], ["utm_content", content], ["utm_term", term]]) {
  if (value) url.searchParams.set(key, value.slice(0, 200));
}

console.log(url.toString());