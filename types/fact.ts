/**
 * Core type definitions for DAY-LIGHT v3.0-final
 */

export type Category =
  | 'Birthdays'
  | 'Historical'
  | 'Science'
  | 'Finance'
  | 'Sports'
  | 'Festivals'
  | 'Space'
  | 'PopCulture'
  | 'Awards'
  | 'Technology';

export interface Fact {
  id: string;
  title: string;
  description?: string;
  name?: string;
  date: string; // YYYY-MM-DD format
  category: Category;
  year?: number;
  source?: string;
  sourceUrl?: string;
  imageUrl?: string;
  imageMetadata?: ImageMetadata;
}

export interface ImageMetadata {
  url: string;
  thumbnailUrl?: string;
  source: 'wikimedia' | 'wikidata' | 'nasa' | 'static' | 'fallback';
  width?: number;
  height?: number;
  aspectRatio?: number;
  license?: string;
  alt?: string;
  cachedAt?: number; // timestamp
  size?: number; // bytes
  mimeType?: string;
}

export interface FactEntry {
  date: string; // YYYY-MM-DD
  facts: Fact[];
  cachedAt: number; // timestamp
  ttl: number; // milliseconds (24h = 86400000)
}

export interface CacheEntry<T> {
  key: string;
  value: T;
  cachedAt: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export interface ImageCacheEntry extends CacheEntry<ImageMetadata> {
  category: Category;
  slug: string;
}

export interface RandomPool {
  dates: string[]; // Array of YYYY-MM-DD dates
  lastUpdated: number;
}

export interface MetaStore {
  randomPool: RandomPool;
  lastSync: number;
  version: string;
}

export interface FallbackIcon {
  category: Category;
  iconName: string;
  path: string;
}

export const FALLBACK_ICONS: Record<Category, string> = {
  Birthdays: 'person_silhouette',
  Historical: 'landmark_icon',
  Science: 'atom_or_rocket_icon',
  Finance: 'currency_icon',
  Sports: 'stadium_or_ball_icon',
  Festivals: 'colorful_event_icon',
  Space: 'galaxy_placeholder',
  PopCulture: 'music_or_movie_icon',
  Awards: 'trophy_icon',
  Technology: 'chip_or_circuit_icon',
};

export interface ImageLoadStatus {
  status: 'loading' | 'loaded' | 'error' | 'fallback';
  source?: ImageMetadata['source'];
  url?: string;
  error?: Error;
}

export interface GalleryState {
  currentIndex: number;
  slides: Fact[];
  isLoading: boolean;
  error: Error | null;
}

