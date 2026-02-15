import { LRUCache } from 'lru-cache';

/**
 * Server-side cache entry with expiration
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * In-memory LRU cache for API responses
 * - Max 500 entries
 * - TTL per entry
 */
const cache = new LRUCache<string, CacheEntry<unknown>>({
  max: 500,
});

/**
 * Get value from cache
 * Returns null if not found or expired
 */
export function getFromCache<T = unknown>(key: string): T | null {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  // Check if expired
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.value as T;
}

/**
 * Set value in cache with TTL
 * @param key - Cache key
 * @param value - Value to cache
 * @param ttlMs - Time to live in milliseconds
 */
export function setCache<T = unknown>(key: string, value: T, ttlMs: number): void {
  const entry: CacheEntry<T> = {
    value,
    expiresAt: Date.now() + ttlMs,
  };

  cache.set(key, entry);
}

/**
 * Clear a specific key from cache
 */
export function clearCacheKey(key: string): void {
  cache.delete(key);
}

/**
 * Clear all cache entries
 */
export function clearAllCache(): void {
  cache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: cache.size,
    max: cache.max,
  };
}

/**
 * Common TTL values (in milliseconds)
 */
export const TTL = {
  ONE_HOUR: 60 * 60 * 1000,
  SIX_HOURS: 6 * 60 * 60 * 1000,
  TWELVE_HOURS: 12 * 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
  ONE_WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;
