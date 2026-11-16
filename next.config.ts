import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// The version is the one in package.json (Semantic Versioning). The commit comes from the deploy, when it knows it.
const { version } = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string };

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "",
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// No auth token, no source map upload, no telemetry: the build needs no network and no secret.
export default withSentryConfig(nextConfig, {
  telemetry: false,
  silent: true,
  sourcemaps: { disable: true },
  buildTimeInstrumentation: false,
  bundleSizeOptimizations: { excludeDebugStatements: true, excludeTracing: true, excludeReplayIframe: true, excludeReplayShadowDom: true, excludeReplayWorker: true },
});
