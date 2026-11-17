/**
 * The `voltar` of /login, only if it is an internal path: one leading "/", no "//", no "\", no scheme
 * and no control characters. Anything else is ignored, so the login cannot redirect to another site.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  if (raw.includes('\\') || raw.includes('://') || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  return raw;
}

/** The login page that sends the person back to where they were. */
export function loginUrlWithReturn(pathname: string, search: string): string {
  return `/login?voltar=${encodeURIComponent(pathname + search)}`;
}
