import { useState, useEffect, useCallback, useMemo } from 'react';
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

export function useImageForFact(fact: Fact): UseImageForFactResult {
  const fallbackIcon = useMemo(() => getFallbackIconPath(fact.category), [fact.category]);
  
  const [state, setState] = useState<Omit<UseImageForFactResult, 'fallbackIcon'>>({
    thumbnailUrl: fallbackIcon,
    hiResUrl: fallbackIcon,
    status: 'fallback',
    source: 'fallback-icon',
  });

  useEffect(() => {
    if (!fact) return;

    const controller = new AbortController();
    const slug = normalizeKey(fact.title || fact.id);

    const load = async () => {
      try {
        const cachedImage = await getImage(fact.category, slug);
        if (controller.signal.aborted) return;

        if (cachedImage && cachedImage.value.url) {
          setState({
            thumbnailUrl: cachedImage.value.thumbnailUrl || cachedImage.value.url,
            hiResUrl: cachedImage.value.url,
            status: 'loaded',
            source: cachedImage.value.source,
          });
          return;
        }

        const metadata = await findImageForFact(fact, controller.signal);
        if (controller.signal.aborted) return;

        if (metadata && metadata.url) {
          await setImage(fact.category, slug, metadata);
          if (controller.signal.aborted) return;
          
          setState({
            thumbnailUrl: metadata.thumbnailUrl || metadata.url,
            hiResUrl: metadata.url,
            status: 'loaded',
            source: metadata.source,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Image load error:', error);
        }
      }
    };

    load();
    return () => controller.abort();
  }, [fact.id, fact.title, fact.category, fallbackIcon]);

  return { ...state, fallbackIcon };
}

