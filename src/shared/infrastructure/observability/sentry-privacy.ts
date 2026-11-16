// Single privacy filter and options for Sentry (errors only). Spec 21.1 part 2.
// Rule above all: if anything in the filter throws, the event is DROPPED (null), never sent dirty.
// Events are rebuilt from an allowlist of fields: unknown fields do not leave the process.

export type SentryRuntime = "server" | "edge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const SQL = /failed query:|\bparams:|\b(?:select|insert|update|delete)\s/i;
const SQLSTATE_IN_TEXT = /SQLSTATE[:\s]+([0-9A-Z]{5})\b/i;
// 5 chars, uppercase/digits, at least one digit (so "EPERM" is not taken as a SQLSTATE).
const SQLSTATE_CODE = /^(?=.*\d)[0-9A-Z]{5}$/;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const SECRET_KV =
  /(\w*(?:owner_?pin|pin|password|passwd|senha|secret|token|authorization|cookie))("?\s*[:=]\s*)"?[^",}\s]+"?/gi;
const CPF = /(?<!\d)\d{3}[.\s/-]?\d{3}[.\s/-]?\d{3}[.\s/-]?\d{2}(?!\d)/g;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

const FIXED_DB = "Database error";
// Output of our own SQL rewrite (kept as is, so scrubbing twice gives the same result).
const FIXED_DB_OUT = /^Database error(?: \(SQLSTATE [0-9A-Z]{5}\))?(?: \(cause SQLSTATE [0-9A-Z]{5}(?:, [0-9A-Z]{5})*\))?$/;

// Allowlist: error classes whose message is a FIXED text with no user data (src/modules/{customers,sales}/domain/errors.ts).
// NoOpenCashSessionError also exists in cash/application with another text: that text does not match, so it is dropped.
// The message is kept only if it is EXACTLY the fixed text (these classes accept a custom message).
// Left out on purpose (message interpolates a name, id, phone or value): CustomerNotFoundError,
// CustomerAlreadyExistsError, CustomerInactiveError, CashSessionNotOpenError, and every generic type (Error, SyntaxError...).
const SAFE_MESSAGES: Record<string, string> = {
  CreditLimitExceededError: "Customer credit limit exceeded",
  InvalidOwnerPinError: "Invalid or unauthorized owner PIN",
  DebtSettlementExceedsBalanceError: "Payment amount exceeds current customer debt",
  NoOpenCashSessionError: "Cannot settle customer debt without an active open cash session",
  SaleAlreadyCancelledError: "Venda já se encontra cancelada.",
};
const SAFE_MESSAGE_TEXTS = new Set(Object.values(SAFE_MESSAGES));

function sqlState(text: string, code?: unknown): string | undefined {
  const fromText = SQLSTATE_IN_TEXT.exec(text)?.[1];
  if (fromText && SQLSTATE_CODE.test(fromText)) return fromText;
  return typeof code === "string" && SQLSTATE_CODE.test(code) ? code : undefined;
}

// SQLSTATE codes of the original error and its cause chain (bounded, cycle-safe). Never throws.
function hintCodes(hint: Any): string[] {
  const codes: string[] = [];
  try {
    const seen = new Set<unknown>();
    let cur = hint?.originalException;
    for (let depth = 0; cur && typeof cur === "object" && depth < 5 && !seen.has(cur); depth++) {
      seen.add(cur);
      const c = cur.code;
      if (typeof c === "string" && SQLSTATE_CODE.test(c) && !codes.includes(c)) codes.push(c);
      cur = cur.cause;
    }
    return codes;
  } catch {
    return [];
  }
}

function dbMessage(state?: string, causes: string[] = []): string {
  const base = state ? `${FIXED_DB} (SQLSTATE ${state})` : FIXED_DB;
  return causes.length ? `${base} (cause SQLSTATE ${causes.join(", ")})` : base;
}

// The EMAIL regex is quadratic on long text without spaces: the input is cut before any regex runs.
const MAX_TEXT = 2000;

function scrubText(input: string): string {
  const text = input.slice(0, MAX_TEXT);
  if (SQL.test(text)) return dbMessage(sqlState(text));
  return text
    .replace(SECRET_KV, "$1=[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
    .replace(EMAIL, "[email]")
    .replace(UUID, "[id]")
    .replace(CPF, "[cpf]")
    .replace(/R\$\s*[\d.,]+/g, "[num]")
    .replace(/(?<!\d)\+?\d[\d.,-]{2,}\d/g, "[num]");
}

// Free text of an event (message, logentry): only our own SQL rewrite or a fixed safe text survives.
function scrubMessage(text: string): string | undefined {
  if (SQL.test(text)) return dbMessage(sqlState(text));
  return FIXED_DB_OUT.test(text) || SAFE_MESSAGE_TEXTS.has(text) ? text : undefined;
}

// Path segments that are fixed words of our own routes. Any other segment is user data and never leaves.
const ROUTE_WORDS = new Set(
  ("api auth login logout me register cash close current deposit open withdrawal customers metrics search balance " +
    "settle inventory restock products barcode import reports sales recent cancel setup owner status store settings " +
    "users operators version gestao pdv clientes vendas :id [param]").split(" "),
);
const UUID_FULL = new RegExp(`^${UUID.source}$`, "i");

// Decodes once only to compare; the output is a known word, ":id" or "[param]", never the decoded text.
function scrubSegment(s: string): string {
  let d = s;
  try {
    d = decodeURIComponent(s);
  } catch {
    // keep as is
  }
  if (ROUTE_WORDS.has(d)) return d;
  if (/^\d+$/.test(d) || /^[0-9a-f]{16,}$/i.test(d) || UUID_FULL.test(d)) return ":id";
  return d === "" ? "" : "[param]";
}

const noQuery = (s: string) => s.split(/[?#]/)[0];

// Origin (host only: no credentials, no port) + path; no query, no hash; free segments become "[param]".
function scrubPath(url: string): string {
  const method = /^([A-Z]{3,10}) ([\s\S]*)$/.exec(url);
  if (method) return `${method[1]} ${scrubPath(method[2])}`;
  const u = noQuery(url);
  const m = /^((?:[a-z][a-z0-9+.-]*:)?\/\/)([^/]*)(.*)$/i.exec(u);
  if (!m) return u.split("/").map(scrubSegment).join("/");
  const host = m[2].slice(m[2].lastIndexOf("@") + 1).replace(/:\d*$/, "");
  return m[1] + (/^[a-z0-9.-]+$/i.test(host) ? host : "[host]") + m[3].split("/").map(scrubSegment).join("/");
}

// Allowed frame origins keep their path: our deploy folder, the app source map scheme and static assets.
const KEEP_FILE = /^(?:\/var\/task\/|app:\/\/\/|https?:\/\/[^/]+\/_next\/static\/)/;
// Local absolute paths, UNC, file: and blob: URLs: only the file name is kept.
const LOCAL_PATH = /^(?:[A-Za-z]:|\\\\|file:|blob:|\/|~)/;

// Frame filename/function/module: no query/hash, no folders outside the allowed ones, no e-mail, no CPF.
function scrubFrameString(v: unknown, isFunction = false): string | undefined {
  if (typeof v !== "string") return undefined;
  let t = noQuery(v.slice(0, MAX_TEXT));
  if (isFunction) return /\s|\d{6}/.test(t) ? "[anonymous]" : t.replace(EMAIL, "[email]");
  if (!KEEP_FILE.test(t) && LOCAL_PATH.test(t)) t = t.split(/[\\/]/).pop() || "[path]";
  return t.replace(UUID, "[id]").replace(EMAIL, "[email]").replace(CPF, "[cpf]");
}

function scrubFrame(f: Any): Any {
  const out: Any = {};
  for (const k of ["filename", "function", "module"]) {
    const v = scrubFrameString(f[k], k === "function");
    if (v !== undefined) out[k] = v;
  }
  if (typeof f.lineno === "number" && Number.isFinite(f.lineno)) out.lineno = f.lineno;
  if (typeof f.colno === "number" && Number.isFinite(f.colno)) out.colno = f.colno;
  if (typeof f.in_app === "boolean") out.in_app = f.in_app;
  return out;
}

function scrubException(v: Any, codes: string[]): Any {
  const out: Any = {};
  const type = typeof v.type === "string" && /^(?!.*\d{6})[A-Za-z_$][\w$.]{0,80}$/.test(v.type) ? v.type : "Error";
  out.type = type;
  if (typeof v.value === "string") {
    if (SQL.test(v.value)) {
      const state = sqlState(v.value, v.code) ?? codes[0];
      out.value = dbMessage(state, codes.filter((c) => c !== state));
    } else if (FIXED_DB_OUT.test(v.value) || SAFE_MESSAGES[type] === v.value) {
      out.value = v.value;
    }
  }
  const code = v.code ?? v.mechanism?.data?.code;
  if (typeof code === "string" && SQLSTATE_CODE.test(code)) out.code = code;
  const mech = v.mechanism;
  if (mech && typeof mech === "object") {
    const m: Any = {};
    if (typeof mech.type === "string" && /^[a-z][a-z0-9_.-]{0,80}$/.test(mech.type)) m.type = mech.type;
    if (typeof mech.handled === "boolean") m.handled = mech.handled;
    if (Object.keys(m).length) out.mechanism = m;
  }
  const frames = v.stacktrace?.frames;
  if (frames !== undefined && !Array.isArray(frames)) throw new Error("unexpected frames");
  if (frames) out.stacktrace = { frames: frames.map((f: Any) => scrubFrame(f ?? {})) };
  return out;
}

const hex = (n: number) => new RegExp(`^[0-9a-f]{${n}}$`);
function scrubTrace(t: Any): Any {
  const out: Any = {};
  const pick = (k: string, re: RegExp) => {
    if (typeof t[k] === "string" && re.test(t[k])) out[k] = t[k];
  };
  pick("trace_id", hex(32));
  pick("span_id", hex(16));
  pick("parent_span_id", hex(16));
  pick("op", /^[a-z][a-z0-9_.]{0,63}$/);
  pick("origin", /^[a-z][a-z0-9_.]{0,63}$/);
  pick("status", /^[a-z_]{1,32}$/);
  return out;
}

function clean(event: Any, hint?: Any): Any {
  const e = { ...event };
  const out: Any = {};
  // Top-level fields: short plain strings (no space, no "@"), or finite numbers for times. Anything else is dropped.
  for (const k of ["event_id", "level", "platform", "environment", "release", "dist", "type"]) {
    if (typeof e[k] === "string" && /^[\w.+:-]{1,64}$/.test(e[k])) out[k] = e[k];
  }
  for (const k of ["timestamp", "start_timestamp"]) {
    if (typeof e[k] === "number" && Number.isFinite(e[k])) out[k] = e[k];
  }
  if (e.sdk && typeof e.sdk === "object") {
    const name = typeof e.sdk.name === "string" && /^[\w.@/-]{1,80}$/.test(e.sdk.name) ? e.sdk.name : undefined;
    const version = typeof e.sdk.version === "string" && /^[\w.+-]{1,40}$/.test(e.sdk.version) ? e.sdk.version : undefined;
    out.sdk = { name, version, settings: { infer_ip: "never" } };
  }
  if (typeof e.transaction === "string") out.transaction = scrubText(scrubPath(e.transaction));
  if (typeof e.message === "string") {
    const m = scrubMessage(e.message);
    if (m !== undefined) out.message = m;
  }
  if (e.logentry) {
    out.logentry = {};
    if (typeof e.logentry.message === "string") {
      const m = scrubMessage(e.logentry.message);
      if (m !== undefined) out.logentry.message = m;
    }
  }
  if (e.exception) {
    const values = e.exception.values;
    if (values !== undefined && !Array.isArray(values)) throw new Error("unexpected exception.values");
    const codes = hintCodes(hint);
    if (values) out.exception = { values: values.map((v: Any) => scrubException(v ?? {}, codes)) };
  }
  if (e.request) {
    out.request = {};
    if (typeof e.request.method === "string" && /^[A-Z]{3,10}$/.test(e.request.method)) out.request.method = e.request.method;
    if (typeof e.request.url === "string") out.request.url = scrubText(scrubPath(e.request.url));
  }
  if (e.tags && typeof e.tags.runtime === "string") out.tags = { runtime: scrubText(e.tags.runtime) };
  const trace = e.contexts?.trace;
  if (trace && typeof trace === "object") {
    const t = scrubTrace(trace);
    if (Object.keys(t).length) out.contexts = { trace: t };
  }
  if (Array.isArray(e.fingerprint)) out.fingerprint = e.fingerprint.map((f: unknown) => (typeof f === "string" ? scrubText(f) : ""));
  out.breadcrumbs = [];
  return out;
}

export function scrubEvent(event: Any, hint?: Any): Any {
  try {
    return clean(event, hint);
  } catch {
    return null;
  }
}

export function scrubSpan(span: Any): Any {
  try {
    const out: Any = {};
    for (const k of ["span_id", "trace_id", "parent_span_id", "start_timestamp", "timestamp", "op", "origin", "status"]) {
      if (span[k] !== undefined) out[k] = span[k];
    }
    if (typeof span.description === "string") out.description = scrubText(scrubPath(span.description));
    out.data = {};
    return out;
  } catch {
    return { data: {} };
  }
}

export function scrubTransaction(event: Any): Any {
  try {
    const out = clean(event);
    if (event.spans !== undefined) {
      if (!Array.isArray(event.spans)) throw new Error("unexpected spans");
      out.spans = event.spans.map(scrubSpan);
    }
    return out;
  } catch {
    return null;
  }
}

export function scrubLog(log: Any): Any {
  try {
    const out: Any = {};
    for (const k of ["level", "severity_number", "timestamp", "trace_id"]) {
      if (log[k] !== undefined) out[k] = log[k];
    }
    for (const k of ["message", "body"]) {
      if (typeof log[k] === "string") out[k] = scrubText(log[k]);
    }
    return out;
  } catch {
    return null;
  }
}

// Metrics are not used: drop them (they carry free-form attributes).
export function scrubMetric(): null {
  return null;
}

// Default integrations that collect data we do not want (names confirmed in @sentry/* 11.12).
// Not removed on purpose, because the event is rebuilt from an allowlist (breadcrumbs, contexts, extra, request
// and frame vars never leave) and maxBreadcrumbs is 0: NodeFetch, RequestData, LocalVariablesAsync,
// NodeSystemError, ZodErrors, ExtraErrorData.
const REMOVED_INTEGRATIONS = new Set([
  "BrowserSession",
  "BrowserTracing",
  "Replay",
  "HttpContext",
  "CultureContext",
  "Breadcrumbs",
  "Console",
  "Context",
  "Modules",
  "ContextLines",
  "ProcessSession",
]);

// httpIntegration is the SDK factory, passed in by the server config only (server only).
export function buildSentryOptions(
  dsn: string | undefined,
  _runtime: SentryRuntime,
  httpIntegration?: (options: { sessions: boolean }) => { name: string },
) {
  // _runtime is part of the contract; the options are the same for all runtimes on purpose.
  if (!dsn) return null;
  // Only the real production deploy sends: Preview never does. Without certainty of production (no Vercel variable), it does not send.
  const environment = process.env.VERCEL_ENV || "unknown";
  return {
    dsn,
    enabled: process.env.NODE_ENV === "production" && environment === "production",
    environment,
    // No outgoing request (Neon, etc.) receives sentry-trace or baggage headers.
    tracePropagationTargets: [] as string[],
    release: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
    // v11 has no sendDefaultPii: personal data is controlled by dataCollection (default collects everything).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [] as never[],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      frameContextLines: 0,
    },
    sendClientReports: false,
    includeServerName: false,
    maxBreadcrumbs: 0,
    integrations: (defaults: Array<{ name: string }>) => {
      const kept = defaults.filter((i) => !REMOVED_INTEGRATIONS.has(i.name));
      // Http sends request-session aggregates outside beforeSend: on the server it is replaced by one with sessions off.
      return httpIntegration ? [...kept.filter((i) => i.name !== "Http"), httpIntegration({ sessions: false })] : kept;
    },
    ignoreErrors: [
      "AbortError",
      "The operation was aborted",
      "Failed to fetch",
      "NetworkError when attempting to fetch resource",
      "Load failed",
      "ChunkLoadError",
      /Loading chunk .* failed/,
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "NEXT_REDIRECT",
      "NEXT_NOT_FOUND",
    ] as Array<string | RegExp>,
    denyUrls: [/^chrome-extension:\/\//i, /^moz-extension:\/\//i, /^safari(?:-web)?-extension:\/\//i] as RegExp[],
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubTransaction,
    beforeSendSpan: scrubSpan,
    beforeSendLog: scrubLog,
    beforeSendMetric: scrubMetric,
  };
}
