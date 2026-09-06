import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

/**
 * Every build gets an identity: the package version, a build id and the time
 * it was built. The client bundle carries the values it was built with, and
 * /api/version reports the values the server is running, so an open tab can
 * tell when a newer deployment has landed (see src/features/version).
 */
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

function resolveBuildId(): string {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? process.env.BUILD_ID;
  if (fromEnv) return fromEnv.slice(0, 12);
  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return `local-${Date.now().toString(36)}`;
  }
}

const buildId = resolveBuildId();
const builtAt = new Date().toISOString();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  generateBuildId: () => buildId,
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_ID: buildId,
    NEXT_PUBLIC_BUILT_AT: builtAt,
  },
};

export default nextConfig;
