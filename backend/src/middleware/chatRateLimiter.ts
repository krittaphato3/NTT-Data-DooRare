import type { NextFunction, Request, Response } from 'express';

export interface ChatRateLimiterOptions {
  /** Time window in milliseconds (default: 60,000 ms = 1 minute). */
  windowMs?: number;
  /** Maximum number of chat requests permitted within the time window (default: 20). */
  maxRequests?: number;
  /** Maximum number of concurrent active SSE streaming connections permitted per key (default: 3). */
  maxConcurrentStreams?: number;
  /** Custom key generator (default: req.user?.id || req.ip || 'anonymous'). */
  keyGenerator?: (req: Request) => string;
}

interface WindowBucket {
  count: number;
  resetAt: number;
}

class ChatRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly maxConcurrentStreams: number;
  private readonly keyGenerator: (req: Request) => string;

  private requestBuckets = new Map<string, number[]>();
  private activeStreams = new Map<string, number>();

  constructor(options: ChatRateLimiterOptions = {}) {
    this.windowMs = options.windowMs ?? 60_000;
    this.maxRequests = options.maxRequests ?? 20;
    this.maxConcurrentStreams = options.maxConcurrentStreams ?? 3;
    this.keyGenerator = options.keyGenerator ?? ((req) => req.user?.id || req.ip || 'anonymous');
  }

  /**
   * Resets all in-memory rate limiting state (useful for tests).
   */
  reset(): void {
    this.requestBuckets.clear();
    this.activeStreams.clear();
  }

  /**
   * Returns current active stream count for a key.
   */
  getActiveStreamCount(key: string): number {
    return this.activeStreams.get(key) ?? 0;
  }

  /**
   * Express middleware function enforcing rate and concurrency limits.
   */
  middleware = (req: Request, res: Response, next: NextFunction): void => {
    const key = this.keyGenerator(req);
    const now = Date.now();

    // 1. Check concurrent streaming connections limit
    const currentActive = this.activeStreams.get(key) ?? 0;
    if (currentActive >= this.maxConcurrentStreams) {
      res.setHeader('Retry-After', 5);
      res.status(429).json({
        error: 'CONCURRENT_STREAM_LIMIT',
        message: 'Maximum concurrent AI chat streams reached. Please wait for current response to complete.',
      });
      return;
    }

    // 2. True sliding window log limit check
    const windowStart = now - this.windowMs;
    const timestamps = (this.requestBuckets.get(key) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= this.maxRequests) {
      const oldestInWindow = timestamps[0];
      const resetSeconds = Math.max(1, Math.ceil((oldestInWindow + this.windowMs - now) / 1000));
      const resetAtTimestamp = Math.ceil((oldestInWindow + this.windowMs) / 1000);

      res.setHeader('Retry-After', resetSeconds);
      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', resetAtTimestamp);
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests to AI Copilot. Please wait before sending another prompt.',
        retryAfterSeconds: resetSeconds,
      });
      return;
    }

    // Record request timestamp
    timestamps.push(now);
    this.requestBuckets.set(key, timestamps);

    const remaining = Math.max(0, this.maxRequests - timestamps.length);
    const oldestTimestamp = timestamps[0];
    const resetAt = Math.ceil((oldestTimestamp + this.windowMs) / 1000);

    res.setHeader('X-RateLimit-Limit', this.maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetAt);

    // 3. Track active streaming connection
    this.activeStreams.set(key, currentActive + 1);

    let streamReleased = false;
    const releaseStream = () => {
      if (!streamReleased) {
        streamReleased = true;
        const active = this.activeStreams.get(key) ?? 1;
        if (active <= 1) {
          this.activeStreams.delete(key);
        } else {
          this.activeStreams.set(key, active - 1);
        }
      }
    };

    res.on('finish', releaseStream);
    res.on('close', releaseStream);

    // Garbage collect expired buckets periodically
    if (this.requestBuckets.size > 500) {
      for (const [k, tsList] of this.requestBuckets.entries()) {
        const valid = tsList.filter((t) => t > windowStart);
        if (valid.length === 0) {
          this.requestBuckets.delete(k);
        } else {
          this.requestBuckets.set(k, valid);
        }
      }
    }

    next();
  };
}

export const defaultChatRateLimiter = new ChatRateLimiter();

export function createChatRateLimiter(options?: ChatRateLimiterOptions): ChatRateLimiter {
  return new ChatRateLimiter(options);
}
