/**
 * Rate Limiting Middleware
 * Uses Redis for distributed rate limiting
 */

import { Request, Response, NextFunction } from 'express';
import { redisCache } from '../services/redis-cache';

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

export function rateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (req) => {
      // Default: use IP address
      return req.ip || req.socket.remoteAddress || 'unknown';
    },
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    message = 'Too many requests, please try again later.',
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if Redis is not available
    if (!redisCache.isAvailable()) {
      return next();
    }

    const key = `ratelimit:${keyGenerator(req)}:${Math.floor(Date.now() / windowMs)}`;
    const count = await redisCache.increment(key, 'ratelimit', 1);

    // Set expiration for the key
    if (count === 1) {
      await redisCache.expire(key, Math.ceil(windowMs / 1000), 'ratelimit');
    }

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(Date.now() + windowMs).toISOString());

    if (count > maxRequests) {
      res.status(429).json({
        success: false,
        error: message,
        retryAfter: Math.ceil(windowMs / 1000),
      });
      return;
    }

    // Track response status for skip options
    const originalSend = res.send;
    res.send = function (body) {
      const statusCode = res.statusCode;

      if (skipSuccessfulRequests && statusCode < 400) {
        // Decrement on successful request
        redisCache.increment(key, 'ratelimit', -1).catch(() => {});
      }

      if (skipFailedRequests && statusCode >= 400) {
        // Decrement on failed request
        redisCache.increment(key, 'ratelimit', -1).catch(() => {});
      }

      return originalSend.call(this, body);
    };

    next();
  };
}

/**
 * Per-endpoint rate limiters
 */
export const rateLimiters = {
  // Strict rate limit for analytics collection
  analytics: rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
    keyGenerator: (req) => {
      // Use session ID if available, otherwise IP
      return req.body?.sessionId || req.ip || 'unknown';
    },
  }),

  // Moderate rate limit for fact queries
  facts: rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 200, // 200 requests per minute
  }),

  // Lenient rate limit for reports
  reports: rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 50, // 50 requests per minute
  }),

  // Strict rate limit for search
  search: rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute
  }),

  // Very strict for image processing
  imageProcessing: rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20, // 20 requests per minute
  }),
};
