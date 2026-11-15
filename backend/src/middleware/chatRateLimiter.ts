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

  private requestBuckets = new Map<string, WindowBucket>();
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

    // 2. Sliding window request limit check
    let bucket = this.requestBuckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = {
        count: 0,
        resetAt: now + this.windowMs,
      };
      this.requestBuckets.set(key, bucket);
    }

    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    // Exceeded requests in window
    if (bucket.count >= this.maxRequests) {
      res.setHeader('Retry-After', resetSeconds);
      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(bucket.resetAt / 1000));
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests to AI Copilot. Please wait before sending another prompt.',
        retryAfterSeconds: resetSeconds,
      });
      return;
    }

    // Increment request count
    bucket.count += 1;
    const remaining = Math.max(0, this.maxRequests - bucket.count);

    res.setHeader('X-RateLimit-Limit', this.maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(bucket.resetAt / 1000));

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
      for (const [k, b] of this.requestBuckets.entries()) {
        if (now >= b.resetAt) {
          this.requestBuckets.delete(k);
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
