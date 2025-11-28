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
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [hiResUrl, setHiResUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<ImageLoadStatus['status']>('loading');
  const [source, setSource] = useState<ImageMetadata['source'] | null>(null);
  const fallbackIcon = getFallbackIconPath(fact.category);

  const loadImage = useCallback(async () => {
    // Always return fallback immediately
    setStatus('fallback');
    setSource('fallback-icon');
    setThumbnailUrl(fallbackIcon);
    setHiResUrl(fallbackIcon);

    if (!fact) return;

    const slug = normalizeKey(fact.title || fact.id);

    try {
      // Layer 1: IndexedDB metadata
      const cachedImage = await getImage(fact.category, slug);
      if (cachedImage && cachedImage.value.url) {
        setThumbnailUrl(cachedImage.value.thumbnailUrl || cachedImage.value.url);
        setHiResUrl(cachedImage.value.url);
        setStatus('loaded');
        setSource(cachedImage.value.source);
        return;
      }

      // Layer 2: Service Worker Cache (binary)
      // ROBUSTNESS: Enhanced SW cache checking with better validation
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        try {
          // Try to get image from any known source URL
          const potentialUrls: string[] = [];
          
          // Add fact's imageUrl if available
          if (fact.imageUrl) {
            potentialUrls.push(fact.imageUrl);
          }
          
          // Try to construct Wikimedia URL from fact title
          if (fact.name || fact.title) {
            const wikiTitle = (fact.name || fact.title).replace(/\s+/g, '_');
            potentialUrls.push(`https://upload.wikimedia.org/wikipedia/commons/thumb/`);
          }
          
          // Try each potential URL
          for (const url of potentialUrls) {
            try {
              const swResponse = await fetch(url, { 
                cache: 'force-cache',
                signal: AbortSignal.timeout(1000), // 1s timeout for SW cache
              });
              
              // Validate it's actually an image
              const contentType = swResponse.headers.get('content-type');
              if (swResponse.ok && contentType && contentType.startsWith('image/')) {
                // Validate image size from headers
                const contentLength = swResponse.headers.get('content-length');
                if (contentLength) {
                  const size = parseInt(contentLength, 10);
                  if (size > 2 * 1024 * 1024) continue; // Skip if > 2MB
                }
                
                const metadata: ImageMetadata = {
                  url: swResponse.url,
                  source: 'wikimedia',
                  cachedAt: Date.now(),
                  mimeType: contentType,
                };
                
                setThumbnailUrl(metadata.url);
                setHiResUrl(metadata.url);
                setStatus('loaded');
                setSource(metadata.source);
                
                // Cache in IDB (non-blocking)
                setImage(fact.category, slug, metadata).catch((idbError) => {
                  console.warn('Failed to cache image in IDB:', idbError);
                });
                return;
              }
            } catch (swError) {
              // Continue to next URL
              continue;
            }
          }
        } catch (swError) {
          // SW cache miss or error, continue to next layer
          // Don't log - this is expected when SW doesn't have the image
        }
      }

      // Layer 3: Fresh network fetch (via imageEngine)
      // This is async and non-blocking
      const imageMetadata = await findImageForFact(fact);
      if (imageMetadata && imageMetadata.url) {
        setThumbnailUrl(imageMetadata.thumbnailUrl || imageMetadata.url);
        setHiResUrl(imageMetadata.url);
        setStatus('loaded');
        setSource(imageMetadata.source);
        
        // Cache in IDB
        await setImage(fact.category, slug, imageMetadata);
        return;
      }

      // Layer 4: Fallback static icon per category
      // Already set above, no change needed
      setStatus('fallback');
      setSource('fallback-icon');
    } catch (error) {
      console.error('Image load error:', error);
      setStatus('error');
      // Still show fallback
    }
  }, [fact, fallbackIcon]);

  useEffect(() => {
    loadImage();
  }, [loadImage]);

  return {
    thumbnailUrl,
    hiResUrl,
    status,
    source,
    fallbackIcon,
  };
}

