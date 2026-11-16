import * as Sentry from "@sentry/nextjs";
import { buildSentryOptions } from "./src/shared/infrastructure/observability/sentry-privacy";

// Without a DSN the SDK is not initialized: nothing is sent and nothing is printed.
const options = buildSentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN, "server", Sentry.httpIntegration);
if (options) Sentry.init(options);
