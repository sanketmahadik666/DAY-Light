/**
 * useImageForFact: Image resolver with progressive loading
 * Connects to imageEngine + SW + IDB
 * MUST return fallback immediately; upgrade later
 */

import { useState, useEffect, useCallback } from 'react';
import type { Fact, ImageMetadata, ImageLoadStatus } from '@/types/fact';
import { getImage, setImage } from '@/lib/indexedCache';
import { findImageForFact } from '@/lib/imageEngine';
import { getFallbackIconPath } from '@/utils/helpers';
import { normalizeKey } from '@/utils/helpers';

interface UseImageForFactResult {
  thumbnailUrl: string | null;
  hiResUrl: string | null;
  status: ImageLoadStatus['status'];
  source: ImageMetadata['source'] | null;
  fallbackIcon: string;
}

/**
 * Main hook: useImageForFact
 */
export function useImageForFact(fact: Fact): UseImageForFactResult {
  const [state, setState] = useState<Omit<UseImageForFactResult, 'fallbackIcon'>>({
    thumbnailUrl: null,
    hiResUrl: null,
    status: 'loading',
    source: null,
  });
  const fallbackIcon = getFallbackIconPath(fact.category);

  useEffect(() => {
    if (!fact) return;

    const controller = new AbortController();
    const signal = controller.signal;
    const slug = normalizeKey(fact.title || fact.id);

    // Initial state reset
    setState({
      thumbnailUrl: fallbackIcon,
      hiResUrl: fallbackIcon,
      status: 'fallback',
      source: 'fallback-icon',
    });

    const load = async () => {
      // Layer 1: Check IndexedDB (Fastest Local)
      try {
        const cachedImage = await getImage(fact.category, slug);
        if (signal.aborted) return;

        if (cachedImage && cachedImage.value.url) {
          setState({
            thumbnailUrl: cachedImage.value.thumbnailUrl || cachedImage.value.url,
            hiResUrl: cachedImage.value.url,
            status: 'loaded',
            source: cachedImage.value.source,
          });
          // Even if we have a cached image, we might want to stale-while-revalidate 
          // if it's very old? For now, trust the cache to avoid noise.
          return;
        }
      } catch (e) {
        // IDB failed, proceed to next layers
      }

      if (signal.aborted) return;

      // Layer 2 & 3: Service Worker & Network (Parallel)
      // We start the network fetch immediately, but we also check SW cache
      // If SW cache hits, we use it. If Network returns first or SW misses, we use Network.

      try {
         // Start Image Engine Search
         const enginePromise = findImageForFact(fact, signal).then(async (metadata) => {
             if (signal.aborted) return null;
             if (metadata && metadata.url) {
                // Cache this fresh result
                await setImage(fact.category, slug, metadata);
                return metadata;
             }
             return null;
         });

         const result = await enginePromise;
         
         if (signal.aborted) return;

         if (result) {
            setState({
                thumbnailUrl: result.thumbnailUrl || result.url,
                hiResUrl: result.url,
                status: 'loaded',
                source: result.source,
            });
         } else {
             // Keep fallback
         }

      } catch (error) {
        if (!signal.aborted) {
           console.error('Image load error:', error);
           // Keep fallback state, maybe update status to 'error' if strictly needed,
           // but 'fallback' is usually better UX than 'error'
        }
      }
    };

    load();

    return () => {
      controller.abort();
    };
  }, [fact.id, fact.title, fact.category, fallbackIcon]); // Minimized dependencies

  return {
    ...state,
    fallbackIcon,
  };
}

