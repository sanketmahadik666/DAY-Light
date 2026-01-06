/**
 * IndexedDB cache utilities with LRU eviction and TTL management
 * Now supports gzip compression via pako
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import pako from 'pako';
import type { FactEntry, ImageCacheEntry, MetaStore, RandomPool } from '@/types/fact';

const DB_NAME = 'daylight-v3';
const DB_VERSION = 1;

// Wrapper for compressed data
interface CompressedData {
  compressed: true;
  data: Uint8Array; // Compressed JSON string
  originalSize: number;
}

type StoredFactEntry = (FactEntry | (Omit<FactEntry, 'facts'> & { facts: never; compressedData: CompressedData })) & { key: string };
type StoredImageEntry = ImageCacheEntry | (Omit<ImageCacheEntry, 'value'> & { value: never; compressedData: CompressedData });

interface DaylightDB extends DBSchema {
  facts: {
    key: string; // format: "facts:YYYY-MM-DD"
    value: StoredFactEntry;
    indexes: { 'by-date': string };
  };
  images: {
    key: string; // format: "img:{category}:{slug}"
    value: StoredImageEntry;
    indexes: { 'by-category': string; 'by-last-accessed': number };
  };
  meta: {
    key: string;
    value: RandomPool | { lastSync: number } | { version: string } | { key: string; value: unknown };
  };
}

let dbInstance: IDBPDatabase<DaylightDB> | null = null;

// --- Compression Helpers ---

function compress<T>(data: T): CompressedData {
  const json = JSON.stringify(data);
  const compressed = pako.deflate(json);
  return {
    compressed: true,
    data: compressed,
    originalSize: json.length
  };
}

function decompress<T>(data: CompressedData): T {
  try {
    const json = pako.inflate(data.data, { to: 'string' });
    return JSON.parse(json) as T;
  } catch (e) {
    console.error('Decompression failed:', e);
    throw new Error('Decompression failed');
  }
}

// ---------------------------

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
 * Get fact entry for a date (Transparent decompression)
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

    if ('compressedData' in entry && entry.compressedData) {
      const decompressedFacts = decompress<FactEntry['facts']>(entry.compressedData);
      return {
        ...entry,
        facts: decompressedFacts,
        // Remove compression metadata from result
      } as FactEntry;
    }

    // Legacy fallback (uncompressed)
    return entry as FactEntry;
  } catch (error) {
    console.error(`Error getting facts for ${date}:`, error);
    return null;
  }
}

/**
 * Set fact entry for a date (Transparent compression)
 */
export async function setFacts(date: string, facts: FactEntry['facts']): Promise<boolean> {
  try {
    const db = await initDB();
    const key = `facts:${date}`;
    
    const compressedFacts = compress(facts);

    const entry: StoredFactEntry = {
      key,
      date,
      compressedData: compressedFacts,
      cachedAt: Date.now(),
      ttl: 24 * 60 * 60 * 1000, // 24 hours
    } as any; // Cast needed due to union complexity

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
 * Get image cache entry (Transparent decompression)
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

    if ('compressedData' in entry && entry.compressedData) {
      const decompressedValue = decompress<ImageCacheEntry['value']>(entry.compressedData);
      return {
        ...entry,
        value: decompressedValue,
      } as ImageCacheEntry;
    }

    return entry as ImageCacheEntry;
  } catch (error) {
    console.error(`Error getting image ${category}:${slug}:`, error);
    return null;
  }
}

/**
 * Prune images using Smart LRU
 * - Limit: 200 images
 * - Scoring: lastAccessed + (categoryBonus)
 */
async function pruneImagesIfNeeded(db: IDBPDatabase<DaylightDB>, activeCategory?: string): Promise<void> {
  try {
    const MAX_IMAGES = 200;
    const count = await db.count('images');
    
    if (count <= MAX_IMAGES) return;

    // Get all images
    const allImages = await db.getAllFromIndex('images', 'by-last-accessed');
    
    // Calculate scores
    const scoredImages = allImages.map(img => {
      let score = img.lastAccessed;
      if (activeCategory && img.category === activeCategory) {
        score += 1000000000;
      }
      return { key: img.key, score };
    });

    // Sort by score ascending (lowest score first -> to be deleted)
    scoredImages.sort((a, b) => a.score - b.score);

    // Delete oldest entries until we're under the limit
    const toDeleteCount = count - MAX_IMAGES;
    if (toDeleteCount <= 0) return;

    const toDelete = scoredImages.slice(0, toDeleteCount);
    
    // Batch delete
    const tx = db.transaction('images', 'readwrite');
    await Promise.all([
      ...toDelete.map(item => tx.store.delete(item.key)),
      tx.done
    ]);
    
  } catch (error) {
    console.error('Error pruning images:', error);
  }
}

// --- Write Batching Logic ---

interface QueueItem {
  entry: any; // StoredImageEntry (using any to avoid union headaches)
  category: string;
}

const WRITE_BATCH_SIZE = 10;
const WRITE_BATCH_TIMEOUT = 500; // ms
let writeQueue: QueueItem[] = [];
let writeTimer: NodeJS.Timeout | null = null;
let isFlushing = false;

async function flushWriteQueue() {
  if (writeQueue.length === 0) return;
  if (isFlushing) return;

  isFlushing = true;
  const batch = [...writeQueue];
  writeQueue = [];
  
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }

  try {
    const db = await initDB();
    const tx = db.transaction('images', 'readwrite');
    
    // Execute all puts
    await Promise.all([
      ...batch.map(item => tx.store.put(item.entry)),
      tx.done
    ]);

    // Prune once per batch using the category of the most recent item
    // This isn't perfect but good heuristic
    if (batch.length > 0) {
      const lastItem = batch[batch.length - 1];
      await pruneImagesIfNeeded(db, lastItem.category);
    }

  } catch (error) {
    console.error('Error flushing batch:', error);
    // In a real app we might retry or requeue, but for cache we can drop
  } finally {
    isFlushing = false;
    // If more items came in while flushing, schedule next
    if (writeQueue.length > 0) {
      triggerFlush();
    }
  }
}

function triggerFlush() {
  if (writeTimer) return;
  writeTimer = setTimeout(flushWriteQueue, WRITE_BATCH_TIMEOUT);
}

/**
 * Set image cache entry (Batched High-Performance)
 */
export async function setImage(
  category: string,
  slug: string,
  value: ImageCacheEntry['value']
): Promise<boolean> {
  try {
    const key = `img:${category}:${slug}`;
    const now = Date.now();
    
    const compressedValue = compress(value);
    
    const entry: any = {
      key,
      compressedData: compressedValue,
      cachedAt: now,
      ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
      accessCount: 1,
      lastAccessed: now,
      category: category as any,
      slug,
    };

    // Add to queue
    writeQueue.push({ entry, category });

    // Flush if full or schedule timer
    if (writeQueue.length >= WRITE_BATCH_SIZE) {
      // Force flush if we hit batch size
      if (writeTimer) clearTimeout(writeTimer);
      writeTimer = null;
      // We don't await this, we return true immediately (Optimistic UI)
      flushWriteQueue();
    } else {
      triggerFlush();
    }

    return true;
  } catch (error) {
    console.error(`Error setting image ${category}:${slug}:`, error);
    return false;
  }
}

/**
 * Get storage usage estimate
 * Returns usage in bytes and percentage
 */
export async function getStorageUsage(): Promise<{ usage: number; quota: number; percent: number } | null> {
  if (!navigator.storage || !navigator.storage.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percent = quota > 0 ? (usage / quota) * 100 : 0;

    return { usage, quota, percent };
  } catch (error) {
    console.error('Error estimating storage:', error);
    return null;
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

