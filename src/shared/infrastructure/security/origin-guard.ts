export function isAllowedOrigin(params: {
  method: string;
  origin?: string | null;
  host?: string | null;
  referer?: string | null;
}): boolean {
  const { method, origin, host, referer } = params;
  const upperMethod = method.toUpperCase();

  // Safe HTTP methods do not mutate state
  if (upperMethod === 'GET' || upperMethod === 'HEAD' || upperMethod === 'OPTIONS') {
    return true;
  }

  // If no host is provided, cannot verify
  if (!host) {
    return true;
  }

  const normalizedHost = host.toLowerCase().trim();

  if (origin) {
    try {
      const originUrl = new URL(origin);
      const originHost = originUrl.host.toLowerCase();

      // Same-origin match
      if (originHost === normalizedHost) {
        return true;
      }

      // Local development tolerance
      const isLocalHost = normalizedHost.startsWith('localhost') || normalizedHost.startsWith('127.0.0.1');
      const isLocalOrigin = originHost.startsWith('localhost') || originHost.startsWith('127.0.0.1');
      if (isLocalHost && isLocalOrigin) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererHost = refererUrl.host.toLowerCase();

      if (refererHost === normalizedHost) {
        return true;
      }

      const isLocalHost = normalizedHost.startsWith('localhost') || normalizedHost.startsWith('127.0.0.1');
      const isLocalReferer = refererHost.startsWith('localhost') || refererHost.startsWith('127.0.0.1');
      if (isLocalHost && isLocalReferer) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  return true;
}
