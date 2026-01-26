/**
 * Redis Cache Service
 * Handles caching for metadata, reports, and frequently accessed data
 */

import { createClient, RedisClientType } from 'redis';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

class RedisCacheService {
  private client: RedisClientType | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY = 5000;

  constructor() {
    this.initializeClient();
  }

  /**
   * Initialize Redis client
   */
  private async initializeClient(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.client = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > this.MAX_RECONNECT_ATTEMPTS) {
              console.error('[Redis] Max reconnection attempts reached');
              return new Error('Max reconnection attempts reached');
            }
            return this.RECONNECT_DELAY * Math.pow(2, retries);
          },
        },
      });

      this.client.on('error', (error) => {
        console.error('[Redis] Error:', error);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('[Redis] Connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.client.on('disconnect', () => {
        console.warn('[Redis] Disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      console.error('[Redis] Failed to initialize:', error);
      this.isConnected = false;
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string, prefix: string = 'default'): Promise<T | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const fullKey = `${prefix}:${key}`;
      const value = await this.client!.get(fullKey);
      
      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`[Redis] Get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(
    key: string,
    value: any,
    options: CacheOptions = {}
  ): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const fullKey = `${options.prefix || 'default'}:${key}`;
      const serialized = JSON.stringify(value);
      
      if (options.ttl) {
        await this.client!.setEx(fullKey, options.ttl, serialized);
      } else {
        await this.client!.set(fullKey, serialized);
      }

      return true;
    } catch (error) {
      console.error(`[Redis] Set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string, prefix: string = 'default'): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const fullKey = `${prefix}:${key}`;
      await this.client!.del(fullKey);
      return true;
    } catch (error) {
      console.error(`[Redis] Delete error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async deletePattern(pattern: string, prefix: string = 'default'): Promise<number> {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      const fullPattern = `${prefix}:${pattern}`;
      const keys = await this.client!.keys(fullPattern);
      
      if (keys.length === 0) {
        return 0;
      }

      return await this.client!.del(keys);
    } catch (error) {
      console.error(`[Redis] Delete pattern error for ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string, prefix: string = 'default'): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const fullKey = `${prefix}:${key}`;
      const result = await this.client!.exists(fullKey);
      return result === 1;
    } catch (error) {
      console.error(`[Redis] Exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get or set (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key, options.prefix);
    if (cached !== null) {
      return cached;
    }

    // Fetch and cache
    const value = await fetchFn();
    await this.set(key, value, options);
    return value;
  }

  /**
   * Increment counter
   */
  async increment(key: string, prefix: string = 'default', by: number = 1): Promise<number> {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      const fullKey = `${prefix}:${key}`;
      return await this.client!.incrBy(fullKey, by);
    } catch (error) {
      console.error(`[Redis] Increment error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Set expiration
   */
  async expire(key: string, seconds: number, prefix: string = 'default'): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const fullKey = `${prefix}:${key}`;
      await this.client!.expire(fullKey, seconds);
      return true;
    } catch (error) {
      console.error(`[Redis] Expire error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Graceful disconnect
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        console.log('[Redis] Disconnected gracefully');
      } catch (error) {
        console.error('[Redis] Error during disconnect:', error);
      }
    }
  }
}

export const redisCache = new RedisCacheService();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await redisCache.disconnect();
});

process.on('SIGINT', async () => {
  await redisCache.disconnect();
});
