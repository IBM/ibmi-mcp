/**
 * @fileoverview Provides a generic `RateLimiter` class for implementing rate limiting logic.
 * It supports configurable time windows, request limits, and automatic cleanup of expired entries.
 * @module utils/security/rateLimiter
 */
import { environment } from "../../config/index.js"; // For environment-specific behavior
import { BaseErrorCode, McpError } from "../../types-global/errors.js";
import { logger, RequestContext, requestContextService } from "../index.js"; // Centralized internal imports

/**
 * Defines configuration options for the {@link RateLimiter}.
 * @typedef {object} RateLimitConfig
 * @property {number} windowMs - The time window in milliseconds during which requests are counted.
 * @property {number} maxRequests - The maximum number of requests allowed from a single key within the `windowMs`.
 * @property {string} [errorMessage] - A custom error message template when the rate limit is exceeded.
 *                                     Can include `{waitTime}` placeholder for seconds until reset.
 * @property {boolean} [skipInDevelopment=false] - If true, rate limiting checks are skipped when `environment` is 'development'.
 * @property {(identifier: string, context?: RequestContext) => string} [keyGenerator] - An optional function to generate a custom key for rate limiting
 *                                                                                      based on an identifier and request context.
 * @property {number} [cleanupInterval] - How often, in milliseconds, to run the cleanup process for expired rate limit entries.
 */
export interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Custom error message template */
  errorMessage?: string;
  /** Whether to skip rate limiting in certain environments (e.g. development) */
  skipInDevelopment?: boolean;
  /** Custom key generator function */
  keyGenerator?: (identifier: string, context?: RequestContext) => string;
  /** How often to run cleanup of expired entries (in milliseconds) */
  cleanupInterval?: number;
}

/**
 * Represents an individual entry for tracking requests against a rate limit key.
 * @typedef {object} RateLimitEntry
 * @property {number} count - The current number of requests recorded for this key within the current window.
 * @property {number} resetTime - The timestamp (in milliseconds since epoch) when this entry's count will reset.
 */
export interface RateLimitEntry {
  /** Current request count */
  count: number;
  /** When the window resets (timestamp) */
  resetTime: number;
}

/**
 * A generic rate limiter class that can be used to control the frequency of operations
 * based on unique keys (e.g., user ID, IP address). It uses an in-memory store.
 * @class RateLimiter
 */
export class RateLimiter {
  /**
   * Stores the current request counts and reset times for each rate-limited key.
   * @private
   * @type {Map<string, RateLimitEntry>}
   */
  private limits: Map<string, RateLimitEntry>;
  /**
   * Timer ID for the periodic cleanup of expired entries.
   * @private
   * @type {NodeJS.Timeout | null}
   */
  private cleanupTimer: NodeJS.Timeout | null = null;

  /**
   * Default configuration values for the rate limiter.
   * @private
   * @static
   * @readonly
   * @type {RateLimitConfig}
   */
  private static DEFAULT_CONFIG: RateLimitConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    errorMessage:
      "Rate limit exceeded. Please try again in {waitTime} seconds.",
    skipInDevelopment: false,
    cleanupInterval: 5 * 60 * 1000, // 5 minutes
  };

  /**
   * Creates a new `RateLimiter` instance.
   * @param {RateLimitConfig} config - Configuration options for this rate limiter instance.
   *                                   These will be merged with `RateLimiter.DEFAULT_CONFIG`.
   */
  constructor(private config: RateLimitConfig) {
    this.config = { ...RateLimiter.DEFAULT_CONFIG, ...config };
    this.limits = new Map();
    this.startCleanupTimer();
  }

  /**
   * Starts the periodic timer to clean up expired rate limit entries from the store.
   * If a timer already exists, it's cleared and a new one is started based on the current `cleanupInterval`.
   * @private
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    const interval =
      this.config.cleanupInterval ?? RateLimiter.DEFAULT_CONFIG.cleanupInterval;

    if (interval && interval > 0) {
      // Ensure interval is positive
      this.cleanupTimer = setInterval(() => {
        this.cleanupExpiredEntries();
      }, interval);

      if (this.cleanupTimer.unref) {
        this.cleanupTimer.unref(); // Allow Node.js process to exit if this is the only active timer
      }
    }
  }

  /**
   * Iterates through stored rate limit entries and removes those whose `resetTime` has passed.
   * This helps prevent memory leaks over time.
   * @private
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, entry] of this.limits.entries()) {
      if (now >= entry.resetTime) {
        this.limits.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      const logContext = requestContextService.createRequestContext({
        operation: "RateLimiter.cleanupExpiredEntries",
        cleanedCount: expiredCount,
        totalRemainingAfterClean: this.limits.size,
      });
      logger.debug(
        `Cleaned up ${expiredCount} expired rate limit entries`,
        logContext,
      );
    }
  }

  /**
   * Updates the configuration of the rate limiter instance.
   * Partial configuration can be provided to override specific settings.
   * If `cleanupInterval` is changed, the cleanup timer will be restarted.
   * @param {Partial<RateLimitConfig>} config - New configuration options to merge with the existing ones.
   * @public
   */
  public configure(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.cleanupInterval !== undefined) {
      this.startCleanupTimer();
    }
  }

  /**
   * Retrieves a copy of the current rate limiter configuration.
   * @returns {RateLimitConfig} The current configuration.
   * @public
   */
  public getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  /**
   * Resets all rate limits by clearing the internal store of tracked keys.
   * @public
   */
  public reset(): void {
    this.limits.clear();
    const logContext = requestContextService.createRequestContext({
      operation: "RateLimiter.reset",
    });
    logger.debug("Rate limiter reset, all limits cleared", logContext);
  }

  /**
   * Checks if a request associated with a given key exceeds the configured rate limit.
   * If the limit is exceeded, an `McpError` with `BaseErrorCode.RATE_LIMITED` is thrown.
   * Rate limiting can be skipped in development environments if `config.skipInDevelopment` is true.
   *
   * @param {string} key - A unique identifier for the request source (e.g., user ID, IP address).
   *                       This key is used to track request counts.
   * @param {RequestContext} [context] - Optional request context, which can be used by a custom `keyGenerator`.
   * @throws {McpError} If the rate limit is exceeded.
   * @public
   */
  public check(key: string, context?: RequestContext): void {
    if (this.config.skipInDevelopment && environment === "development") {
      return;
    }

    const limitKey = this.config.keyGenerator
      ? this.config.keyGenerator(key, context)
      : key;

    const now = Date.now();

    const entry = this.limits.get(limitKey);

    if (!entry || now >= entry.resetTime) {
      this.limits.set(limitKey, {
        count: 1,
        resetTime: now + this.config.windowMs,
      });
      return;
    }

    if (entry.count >= this.config.maxRequests) {
      const waitTime = Math.ceil((entry.resetTime - now) / 1000);
      const errorMessage = (
        this.config.errorMessage || RateLimiter.DEFAULT_CONFIG.errorMessage!
      ).replace("{waitTime}", waitTime.toString());

      throw new McpError(BaseErrorCode.RATE_LIMITED, errorMessage, {
        waitTimeSeconds: waitTime,
        key: limitKey,
        limit: this.config.maxRequests,
        windowMs: this.config.windowMs,
      });
    }

    entry.count++;
  }

  /**
   * Retrieves the current rate limit status for a specific key.
   * @param {string} key - The rate limit key (as generated by `keyGenerator` or the original identifier).
   * @returns {{ current: number; limit: number; remaining: number; resetTime: number } | null}
   *          An object with the current count, configured limit, remaining requests, and reset timestamp,
   *          or `null` if no rate limit entry exists for the key.
   * @public
   */
  public getStatus(key: string): {
    current: number;
    limit: number;
    remaining: number;
    resetTime: number;
  } | null {
    const entry = this.limits.get(key);
    if (!entry) {
      return null;
    }
    return {
      current: entry.count,
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - entry.count),
      resetTime: entry.resetTime,
    };
  }

  /**
   * Stops the cleanup timer and clears all rate limit entries.
   * This should be called if the rate limiter instance is no longer needed, to free resources.
   * @public
   */
  public dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.limits.clear();
  }
}

/**
 * Default singleton instance of the `RateLimiter`.
 * This instance is initialized with default configuration values:
 * - `windowMs`: 15 minutes (900,000 ms)
 * - `maxRequests`: 100
 * Use `rateLimiter.configure({})` to customize its settings.
 * @type {RateLimiter}
 */
export const rateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 100,
});
