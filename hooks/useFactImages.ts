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

// Simple in-memory cache to avoid refetching gallery for same session
const galleryCache = new Map<string, GalleryImage[]>();

export function useFactImages(fact: Fact): UseFactImagesResult {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const key = normalizeKey(fact.title || fact.id);

  const fetchGallery = useCallback(async () => {
    if (hasFetched && images.length > 0) return;
    if (galleryCache.has(key)) {
        setImages(galleryCache.get(key)!);
        setHasFetched(true);
        return;
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
          galleryCache.set(key, galleryImages);
          setHasFetched(true);
      }
    } catch (err) {
      setError('Failed to load images');
    } finally {
      setIsLoading(false);
    }
  }, [fact.title, fact.category, key, hasFetched, images.length]);

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
