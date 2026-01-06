import { useState, useEffect, useCallback } from 'react';
import type { Fact, ImageMetadata } from '@/types/fact';
import { fetchImageGallery } from '@/lib/imageEngine';
import { normalizeKey } from '@/utils/helpers';

interface GalleryImage {
  url: string;
  thumbnailUrl: string;
  source: string;
  alt: string;
  width?: number;
  height?: number;
}

interface UseFactImagesResult {
  images: GalleryImage[];
  isLoading: boolean;
  error: string | null;
  fetchGallery: () => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

// Memory cache with TTL to prevent bloat
// 5 minutes TTL
const CACHE_TTL = 5 * 60 * 1000;

interface CacheEntry {
  data: GalleryImage[];
  timestamp: number;
}

const galleryCache = new Map<string, CacheEntry>();

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of galleryCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      galleryCache.delete(key);
    }
  }
}

export function useFactImages(fact: Fact, shouldPreload: boolean = false): UseFactImagesResult {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const key = normalizeKey(fact.title || fact.id);

  const fetchGallery = useCallback(async () => {
    if (images.length > 0) return; // Don't refetch if we have images
    
    // Check cache with TTL
    if (galleryCache.has(key)) {
        const entry = galleryCache.get(key)!;
        if (Date.now() - entry.timestamp < CACHE_TTL) {
            setImages(entry.data);
            setHasFetched(true);
            return;
        } else {
            galleryCache.delete(key);
        }
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use title + category for better search
      const searchTerm = fact.title || fact.category;
      const results = await fetchImageGallery(searchTerm);
      
      const galleryImages: GalleryImage[] = results.map(r => ({
          url: r.url,
          thumbnailUrl: r.thumbnailUrl || r.url,
          source: r.source,
          alt: r.alt || fact.title,
          width: r.width,
          height: r.height
      }));

      if (galleryImages.length === 0) {
          setError('No images found');
      } else {
          setImages(galleryImages);
          
          // Lazy pruning before adding new entry
          pruneCache();
          galleryCache.set(key, { 
              data: galleryImages, 
              timestamp: Date.now() 
          });
          
          setHasFetched(true);
      }
    } catch (err) {
      setError('Failed to load images');
    } finally {
      setIsLoading(false);
    }
  }, [fact.title, fact.category, key, images.length]);

  // Background preloading logic
  useEffect(() => {
    if (shouldPreload && !hasFetched && !isLoading && !galleryCache.has(key)) {
      // Small delay to prioritize main image LCP
      const timer = setTimeout(() => {
        fetchGallery();
      }, 2000); 
      return () => clearTimeout(timer);
    }
  }, [shouldPreload, hasFetched, isLoading, key, fetchGallery]);

  // Return cached result immediately if available (even before effect runs)
  useEffect(() => {
      if (galleryCache.has(key) && images.length === 0) {
          const entry = galleryCache.get(key)!;
          if (Date.now() - entry.timestamp < CACHE_TTL) {
              setImages(entry.data);
              setHasFetched(true);
          } else {
              galleryCache.delete(key);
          }
      }
  }, [key, images.length]);

  // Preload if user hovers? (Optional optimization)
  
  return {
    images,
    isLoading,
    error,
    fetchGallery,
    isOpen,
    setIsOpen
  };
}
