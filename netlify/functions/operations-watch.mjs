export const config = {
  schedule: "*/10 * * * *",
};

export default async function handler() {
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const workerSecret = process.env.OPERATIONS_WORKER_SECRET;

  if (!siteUrl || !workerSecret) {
    console.error("operations-watch: required runtime configuration is missing");
    return new Response("Operations watcher is not configured", { status: 503 });
  }

  const response = await fetch(`${siteUrl}/api/operations/watch`, {
    method: "POST",
    headers: { "x-operations-worker-secret": workerSecret },
  });

  if (!response.ok) {
    console.error(`operations-watch: worker returned HTTP ${response.status}`);
    return new Response("Operations watcher failed", { status: 502 });
  }

  return new Response("Operations watcher completed", { status: 200 });
}