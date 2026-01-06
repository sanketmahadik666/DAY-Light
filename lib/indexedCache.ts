/**
 * IndexedDB cache utilities with LRU eviction and TTL management
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { FactEntry, ImageCacheEntry, MetaStore, RandomPool } from '@/types/fact';

const DB_NAME = 'daylight-v3';
const DB_VERSION = 1;

interface DaylightDB extends DBSchema {
  facts: {
    key: string; // format: "facts:YYYY-MM-DD"
    value: FactEntry;
    indexes: { 'by-date': string };
  };
  images: {
    key: string; // format: "img:{category}:{slug}"
    value: ImageCacheEntry;
    indexes: { 'by-category': string; 'by-last-accessed': number };
  };
  meta: {
    key: string;
    value: RandomPool | { lastSync: number } | { version: string } | { key: string; value: unknown };
  };
}

let dbInstance: IDBPDatabase<DaylightDB> | null = null;

/**
 * Initialize IndexedDB
 */
export async function initDB(): Promise<IDBPDatabase<DaylightDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<DaylightDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Facts store
      if (!db.objectStoreNames.contains('facts')) {
        const factsStore = db.createObjectStore('facts', { keyPath: 'key' });
        factsStore.createIndex('by-date', 'date');
      }

      // Images store
      if (!db.objectStoreNames.contains('images')) {
        const imagesStore = db.createObjectStore('images', { keyPath: 'key' });
        imagesStore.createIndex('by-category', 'category');
        imagesStore.createIndex('by-last-accessed', 'lastAccessed');
      }

      // Meta store
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    },
  });

  return dbInstance;
}

/**
 * Health check: Test DB with small operation
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const db = await initDB();
    const testKey = '__health_check__';
    await db.put('meta', { key: testKey, value: { test: true } as any });
    await db.delete('meta', testKey);
    return true;
  } catch (error) {
    console.error('IndexedDB health check failed:', error);
    return false;
  }
}

/**
 * Get fact entry for a date
 */
export async function getFacts(date: string): Promise<FactEntry | null> {
  try {
    const db = await initDB();
    const key = `facts:${date}`;
    const entry = await db.get('facts', key);
    
    if (!entry) return null;

    // Check TTL (24 hours = 86400000ms)
    const now = Date.now();
    const age = now - entry.cachedAt;
    if (age > entry.ttl) {
      // Expired, delete and return null
      await db.delete('facts', key);
      return null;
    }

    return entry;
  } catch (error) {
    console.error(`Error getting facts for ${date}:`, error);
    return null;
  }
}

/**
 * Set fact entry for a date
 */
export async function setFacts(date: string, facts: FactEntry['facts']): Promise<boolean> {
  try {
    const db = await initDB();
    const key = `facts:${date}`;
    const entry: FactEntry & { key: string } = {
      key,
      date,
      facts,
      cachedAt: Date.now(),
      ttl: 24 * 60 * 60 * 1000, // 24 hours
    };
    await db.put('facts', entry);
    return true;
  } catch (error) {
    console.error(`Error setting facts for ${date}:`, error);
    // Try to delete the specific key if corruption detected
    if (error instanceof Error && error.name === 'DataError') {
      try {
        const db = await initDB();
        await db.delete('facts', `facts:${date}`);
      } catch (deleteError) {
        console.error('Failed to delete corrupted key:', deleteError);
      }
    }
    return false;
  }
}

/**
 * Get image cache entry
 */
export async function getImage(
  category: string,
  slug: string
): Promise<ImageCacheEntry | null> {
  try {
    const db = await initDB();
    const key = `img:${category}:${slug}`;
    const entry = await db.get('images', key);
    
    if (!entry) return null;

    // Check TTL (30 days = 2592000000ms)
    const now = Date.now();
    const age = now - entry.cachedAt;
    if (age > entry.ttl) {
      await db.delete('images', key);
      return null;
    }

    // Update access metadata
    entry.lastAccessed = now;
    entry.accessCount += 1;
    await db.put('images', entry);

    return entry;
  } catch (error) {
    console.error(`Error getting image ${category}:${slug}:`, error);
    return null;
  }
}

/**
 * Set image cache entry
 */
export async function setImage(
  category: string,
  slug: string,
  value: ImageCacheEntry['value']
): Promise<boolean> {
  try {
    const db = await initDB();
    const key = `img:${category}:${slug}`;
    const now = Date.now();
    
    const entry: ImageCacheEntry = {
      key,
      value,
      cachedAt: now,
      ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
      accessCount: 1,
      lastAccessed: now,
      category: category as any,
      slug,
    };

    await db.put('images', entry);

    // Check if we need to prune (max 300 entries)
    await pruneImagesIfNeeded(db);

    return true;
  } catch (error) {
    console.error(`Error setting image ${category}:${slug}:`, error);
    return false;
  }
}

/**
 * Prune images using LRU if we exceed 100 entries (Aggressive cleanup)
 */
async function pruneImagesIfNeeded(db: IDBPDatabase<DaylightDB>): Promise<void> {
  try {
    const count = await db.count('images');
    if (count <= 100) return;

    // Get all images sorted by last accessed
    const allImages = await db.getAllFromIndex('images', 'by-last-accessed');
    
    // Sort by last accessed (oldest first)
    allImages.sort((a, b) => a.lastAccessed - b.lastAccessed);

    // Delete oldest entries until we're under 100
    const toDelete = allImages.slice(0, count - 100);
    for (const entry of toDelete) {
      await db.delete('images', entry.key);
    }
  } catch (error) {
    console.error('Error pruning images:', error);
  }
}

/**
 * Get meta value
 */
export async function getMeta<T>(key: string): Promise<T | null> {
  try {
    const db = await initDB();
    const entry = await db.get('meta', key);
    if (!entry) return null;
    
    // Cast entire entry.value to any to bypass strict type checking
    // We do runtime validation to handle both wrapped and direct formats
    const rawValue = (entry as any).value;
    
    // Check if it's the wrapped format (has both 'value' and 'key' properties)
    if (rawValue && typeof rawValue === 'object' && 'value' in rawValue && 'key' in rawValue) {
      // Old wrapped format - extract the inner value
      return rawValue.value as T;
    }
    
    // Direct format - return as-is
    return rawValue as T;
  } catch (error) {
    console.error(`Error getting meta ${key}:`, error);
    return null;
  }
}

/**
 * Set meta value
 */
export async function setMeta<T>(key: string, value: T): Promise<boolean> {
  try {
    const db = await initDB();
    await db.put('meta', { key, value: value as any });
    return true;
  } catch (error) {
    console.error(`Error setting meta ${key}:`, error);
    return false;
  }
}

/**
 * Delete specific key (for corruption recovery)
 */
export async function deleteKey(store: 'facts' | 'images' | 'meta', key: string): Promise<boolean> {
  try {
    const db = await initDB();
    await db.delete(store, key);
    return true;
  } catch (error) {
    console.error(`Error deleting ${store}:${key}:`, error);
    return false;
  }
}

/**
 * Clear all data (use with caution)
 */
export async function clearAll(): Promise<boolean> {
  try {
    const db = await initDB();
    await db.clear('facts');
    await db.clear('images');
    await db.clear('meta');
    return true;
  } catch (error) {
    console.error('Error clearing IndexedDB:', error);
    return false;
  }
}

