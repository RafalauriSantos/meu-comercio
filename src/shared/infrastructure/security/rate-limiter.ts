export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTimeMs: number;
  retryAfterSeconds: number;
}

interface ClientRecord {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private readonly clients: Map<string, ClientRecord> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(options: RateLimitOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
  }

  public check(identifier: string, now: number = Date.now()): RateLimitResult {
    let record = this.clients.get(identifier);
    if (!record) {
      record = { timestamps: [] };
      this.clients.set(identifier, record);
    }

    const windowStart = now - this.windowMs;
    // Filter timestamps within current sliding window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= this.maxRequests) {
      const oldestInWindow = record.timestamps[0];
      const resetTimeMs = oldestInWindow + this.windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));

      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: 0,
        resetTimeMs,
        retryAfterSeconds,
      };
    }

    record.timestamps.push(now);
    const remaining = this.maxRequests - record.timestamps.length;
    const resetTimeMs = now + this.windowMs;

    return {
      allowed: true,
      limit: this.maxRequests,
      remaining,
      resetTimeMs,
      retryAfterSeconds: 0,
    };
  }

  public reset(identifier?: string): void {
    if (identifier) {
      this.clients.delete(identifier);
    } else {
      this.clients.clear();
    }
  }
}
