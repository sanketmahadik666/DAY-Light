/**
 * Gallery Storage Sync Hook
 * Tracks when all gallery images are loaded and triggers backend storage automation
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { syncGalleryImagesToStorage } from '@/lib/services/storage-sync';
import type { Fact } from '@/types/fact';

interface GalleryImage {
  url: string;
  thumbnailUrl: string;
  source: string;
  alt: string;
  width?: number;
  height?: number;
}

interface UseGalleryStorageSyncOptions {
  fact: Fact;
  images: GalleryImage[];
  isLoading: boolean;
  enabled?: boolean;
  onSyncComplete?: (synced: number) => void;
  onSyncError?: (error: Error) => void;
}

interface ImageLoadState {
  url: string;
  loaded: boolean;
  error: boolean;
  timestamp?: number;
}

export function useGalleryStorageSync({
  fact,
  images,
  isLoading,
  enabled = true,
  onSyncComplete,
  onSyncError,
}: UseGalleryStorageSyncOptions) {
  const [imageLoadStates, setImageLoadStates] = useState<Map<string, ImageLoadState>>(new Map());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const loadStateRef = useRef<Map<string, ImageLoadState>>(new Map());
  const syncTriggeredRef = useRef(false);
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Initialize load states when images change
  useEffect(() => {
    if (images.length === 0 || isLoading) {
      loadStateRef.current.clear();
      imageElementsRef.current.clear();
      setImageLoadStates(new Map());
      syncTriggeredRef.current = false;
      return;
    }

    const newStates = new Map<string, ImageLoadState>();
    images.forEach((img) => {
      newStates.set(img.url, {
        url: img.url,
        loaded: false,
        error: false,
      });
    });
    loadStateRef.current = newStates;
    setImageLoadStates(new Map(newStates));
    syncTriggeredRef.current = false;
  }, [images, isLoading]);

  // Track individual image load events
  const handleImageLoad = useCallback((url: string, element: HTMLImageElement) => {
    const state = loadStateRef.current.get(url);
    if (state && !state.loaded) {
      state.loaded = true;
      state.timestamp = Date.now();
      loadStateRef.current.set(url, state);
      setImageLoadStates(new Map(loadStateRef.current));
    }
  }, []);

  const handleImageError = useCallback((url: string) => {
    const state = loadStateRef.current.get(url);
    if (state) {
      state.error = true;
      state.loaded = true; // Mark as "processed" even on error
      state.timestamp = Date.now();
      loadStateRef.current.set(url, state);
      setImageLoadStates(new Map(loadStateRef.current));
    }
  }, []);

  // Check if all images are loaded
  const allImagesLoaded = useCallback(() => {
    if (images.length === 0) return false;
    const states = Array.from(loadStateRef.current.values());
    return states.length === images.length && states.every(s => s.loaded);
  }, [images.length]);

  // Trigger storage sync when all images are loaded
  useEffect(() => {
    if (!enabled || isLoading || images.length === 0) return;
    if (syncTriggeredRef.current) return;
    if (!allImagesLoaded()) return;

    // Small delay to ensure all load events are processed
    const syncTimer = setTimeout(async () => {
      if (syncTriggeredRef.current) return;
      syncTriggeredRef.current = true;
      setIsSyncing(true);
      setSyncProgress(0);

      try {
        // Get loaded images with metadata
        const loadedImages = images
          .map((img) => {
            const state = loadStateRef.current.get(img.url);
            const element = imageElementsRef.current.get(img.url);
            
            if (state?.loaded && !state.error && element) {
              return {
                url: img.url,
                thumbnailUrl: img.thumbnailUrl,
                source: img.source,
                alt: img.alt,
                width: img.width || element.naturalWidth,
                height: img.height || element.naturalHeight,
                factId: fact.id,
                date: fact.date,
                category: fact.category,
                title: fact.title,
              };
            }
            return null;
          })
          .filter((img): img is NonNullable<typeof img> => img !== null);

        if (loadedImages.length === 0) {
          setIsSyncing(false);
          return;
        }

        // Sync to storage with progress tracking
        const result = await syncGalleryImagesToStorage(loadedImages, (progress) => {
          setSyncProgress(progress);
        });

        onSyncComplete?.(result.synced);
        setIsSyncing(false);
      } catch (error) {
        console.error('Gallery storage sync error:', error);
        onSyncError?.(error instanceof Error ? error : new Error('Unknown error'));
        setIsSyncing(false);
        syncTriggeredRef.current = false; // Allow retry
      }
    }, 500); // 500ms delay after all images loaded

    return () => clearTimeout(syncTimer);
  }, [enabled, isLoading, images, fact, allImagesLoaded, onSyncComplete, onSyncError]);

  // Register image element for tracking
  const registerImageElement = useCallback((url: string, element: HTMLImageElement | null) => {
    if (element) {
      imageElementsRef.current.set(url, element);
      
      // Set up load/error listeners
      const handleLoad = () => handleImageLoad(url, element);
      const handleError = () => handleImageError(url);
      
      if (element.complete && element.naturalWidth > 0) {
        // Already loaded
        handleLoad();
      } else {
        element.addEventListener('load', handleLoad, { once: true });
        element.addEventListener('error', handleError, { once: true });
      }
    } else {
      imageElementsRef.current.delete(url);
    }
  }, [handleImageLoad, handleImageError]);

  return {
    isSyncing,
    syncProgress,
    loadedCount: Array.from(imageLoadStates.values()).filter(s => s.loaded).length,
    totalCount: images.length,
    allLoaded: allImagesLoaded(),
    registerImageElement,
  };
}
