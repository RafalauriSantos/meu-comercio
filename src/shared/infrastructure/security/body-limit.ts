// 12.5: a mutation on the API with a body over the limit is refused with 413 before any route reads it.
// It looks at the Content-Length the client announced. A request that does not announce its size (no header,
// or a header that is not a number) is not decided here; the platform limits those.

export const BODY_LIMIT_BYTES = 1_048_576; // 1 MB
// The spreadsheet import accepts up to 600 thousand characters, which can pass 1 MB with accents.
export const IMPORT_BODY_LIMIT_BYTES = 2_097_152; // 2 MB

const IMPORT_PATH = '/api/products/import';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isBodyTooLarge(params: { method: string; pathname: string; contentLength?: string | null }): boolean {
  const { method, pathname, contentLength } = params;
  if (!MUTATING_METHODS.has(method.toUpperCase())) return false;
  if (pathname !== '/api' && !pathname.startsWith('/api/')) return false;
  if (!contentLength) return false;

  const size = Number(contentLength);
  if (!Number.isFinite(size) || size < 0) return false;

  const limit = pathname === IMPORT_PATH ? IMPORT_BODY_LIMIT_BYTES : BODY_LIMIT_BYTES;
  return size > limit;
}
