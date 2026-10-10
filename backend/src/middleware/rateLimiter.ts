import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * In-memory brute-force rate limiter for sensitive authentication endpoints.
 * @param maxAttempts Maximum attempts permitted within window
 * @param windowMs Time window in milliseconds (default 15 minutes)
 */
export function createRateLimiter(maxAttempts = 10, windowMs = 15 * 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Generate key based on client IP and optionally email
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const emailKey = req.body?.email ? `:${String(req.body.email).toLowerCase().trim()}` : '';
    const key = `${clientIp}${emailKey}`;
    const now = Date.now();

    const record = rateLimitStore.get(key);

    if (!record || record.resetAt <= now) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= maxAttempts) {
      const waitMinutes = Math.ceil((record.resetAt - now) / 60000);
      res.status(429).json({
        error: `Too many login attempts. Please wait ${waitMinutes} minute${waitMinutes > 1 ? 's' : ''} before trying again.`,
        retryAfterMinutes: waitMinutes,
      });
      return;
    }

    record.count += 1;
    return next();
  };
}

/**
 * Resets the rate limit for a successful authentication
 */
export function resetRateLimit(req: Request): void {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const emailKey = req.body?.email ? `:${String(req.body.email).toLowerCase().trim()}` : '';
  rateLimitStore.delete(`${clientIp}${emailKey}`);
}
