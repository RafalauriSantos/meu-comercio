// The version of the app that is running. next.config.ts fills these at build time: the version comes from
// package.json (Semantic Versioning, see docs/PROJECT_WORKFLOW.md), the commit and the build time from the
// deploy. Outside a build (tests, scripts) they fall back to values that say so.

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0-dev';
export const COMMIT_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA || '';
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || '';

export interface VersionInfo {
  version: string;
  commit: string;
  builtAt: string;
}

export function getVersionInfo(): VersionInfo {
  return { version: APP_VERSION, commit: COMMIT_SHA.slice(0, 7), builtAt: BUILD_TIME };
}

/** "v0.1.0 · 8890df1": the version and, when the deploy knows it, the short commit. */
export function formatVersionLabel(info: VersionInfo = getVersionInfo()): string {
  return info.commit ? `v${info.version} · ${info.commit}` : `v${info.version}`;
}
