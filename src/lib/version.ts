/**
 * The identity of a build, and how a running page tells whether the server
 * has moved on to a newer one.
 *
 * The values come from next.config.ts at build time: the client bundle keeps
 * the ones it was built with, the server answers /api/version with its own.
 */

export interface VersionInfo {
  /** package.json version, e.g. "0.1.0". */
  version: string;
  /** Git commit (or a local stand-in); what actually distinguishes two deployments. */
  buildId: string;
  /** ISO timestamp of the build. */
  builtAt: string;
}

/** What this page was built as. */
export const CURRENT_VERSION: VersionInfo = {
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0",
  buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev",
  builtAt: process.env.NEXT_PUBLIC_BUILT_AT ?? "",
};

/** How often an open page asks the server which build it is running. */
export const VERSION_CHECK_INTERVAL_MS = 30_000;

export function isVersionInfo(value: unknown): value is VersionInfo {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.version === "string" && typeof v.buildId === "string" && v.buildId.length > 0 && typeof v.builtAt === "string";
}

/**
 * Whether `remote` is a different build from `current`. A different build id
 * is the real signal; a different version string counts too, so bumping
 * package.json without a new commit is still noticed.
 */
export function isNewerBuild(current: VersionInfo, remote: VersionInfo): boolean {
  return remote.buildId !== current.buildId || remote.version !== current.version;
}

/** "v0.1.0 (bac18d9)" — for the settings page and the update notice. */
export function formatVersion(info: VersionInfo): string {
  return `v${info.version} (${shortBuildId(info.buildId)})`;
}

export function shortBuildId(buildId: string): string {
  return buildId.length > 7 && !buildId.startsWith("local-") ? buildId.slice(0, 7) : buildId;
}
