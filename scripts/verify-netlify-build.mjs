import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const command = "netlify";
const result = spawnSync(command, ["build"], {
  encoding: "utf8",
  shell: process.platform === "win32",
  stdio: ["inherit", "pipe", "pipe"],
});
const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

process.stdout.write(output);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const forbiddenPatterns = [
  /Failed to compile CJS module/i,
  /Could not resolve /i,
  /Bundling of edge function failed/i,
];

const releaseArtifacts = [
  ".next/server/webpack-runtime.js",
  ".next/server/middleware.js",
  ".netlify/edge-functions/manifest.json",
];

const bundleError = forbiddenPatterns.find((pattern) => pattern.test(output));
if (bundleError) {
  throw new Error(`Netlify build output contains a bundler error: ${bundleError}`);
}

const missingArtifact = releaseArtifacts.find((path) => !existsSync(path));
if (missingArtifact) {
  throw new Error(`Netlify build is missing required artifact: ${missingArtifact}`);
}

console.log("Netlify build verification passed.");