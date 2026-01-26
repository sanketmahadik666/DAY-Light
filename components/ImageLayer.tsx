'use client';

import Image from 'next/image';
import { useState, useEffect, useMemo, useRef } from 'react';
const ALLOWED_HOSTS = new Set([
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'images-assets.nasa.gov',
  'apod.nasa.gov',
  'static.photos',
]);
import { motion } from 'framer-motion';
import type { ImageLoadStatus } from '@/types/fact';
import { trackImageLoad } from '@/lib/services/analytics-collector';

interface ImageLayerProps {
  imageUrl: string | null;
  fallbackIcon: string;
  alt: string;
  priority?: boolean;
  isActive?: boolean;
  factId?: string; // Add factId for tracking
}

/**
 * Ultimate fallback: SVG gradient placeholder
 * Used when fallback icon file is missing
 * This ensures we ALWAYS have something to display
 */
const ULTIMATE_FALLBACK = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiMxYTFiMWUiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiMwMDAwMDAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2cpIi8+PC9zdmc+';

export function ImageLayer({
  imageUrl,
  fallbackIcon,
  alt,
  priority = false,
  isActive = false,
  factId,
}: ImageLayerProps) {
  const [useUltimateFallback, setUseUltimateFallback] = useState(false);
  // Track if we should show the main image
  const [imageSrc, setImageSrc] = useState<string>(imageUrl || fallbackIcon);
  const [isLoaded, setIsLoaded] = useState(false);
  const loadStartTimeRef = useRef<number>(0);

  useEffect(() => {
    // Reset state when inputs change
    if (imageUrl && imageUrl !== imageSrc) {
        setImageSrc(imageUrl);
        setIsLoaded(false);
        loadStartTimeRef.current = Date.now();
    } else if (!imageUrl && imageSrc !== fallbackIcon) {
        setImageSrc(fallbackIcon);
        setIsLoaded(false);
        loadStartTimeRef.current = Date.now();
    }
  }, [imageUrl, fallbackIcon, imageSrc]);

  const handleError = () => {
    if (imageSrc !== fallbackIcon && imageSrc !== ULTIMATE_FALLBACK) {
        // First fallback level
        setImageSrc(fallbackIcon);
        if (factId) {
          const loadTime = Date.now() - loadStartTimeRef.current;
          trackImageLoad(factId, imageSrc, loadTime, false);
        }
    } else if (imageSrc === fallbackIcon) {
        // Second fallback level
        setUseUltimateFallback(true);
        setImageSrc(ULTIMATE_FALLBACK);
        if (factId) {
          const loadTime = Date.now() - loadStartTimeRef.current;
          trackImageLoad(factId, fallbackIcon, loadTime, false);
        }
    }
  };

  const handleLoad = () => {
    setIsLoaded(true);
    if (factId && imageSrc) {
      const loadTime = Date.now() - loadStartTimeRef.current;
      // Determine storage provider from URL
      let storageProvider: 'minio' | 'cloudinary' | undefined;
      if (imageSrc.includes('minio') || imageSrc.includes('daylight-storage')) {
        storageProvider = 'minio';
      } else if (imageSrc.includes('cloudinary') || imageSrc.includes('res.cloudinary.com')) {
        storageProvider = 'cloudinary';
      }
      trackImageLoad(factId, imageSrc, loadTime, true, storageProvider);
    }
  };

  // Safe check for optimization
  const shouldOptimize = useMemo(() => {
    if (!imageSrc) return false;
    if (!imageSrc.startsWith('http')) return true; // Local images are fine
    
    try {
      const url = new URL(imageSrc);
      return ALLOWED_HOSTS.has(url.hostname);
    } catch (e) {
      // If URL parsing fails, default to unoptimized to avoid hydration mismatches or Next.js errors
      console.warn(`[ImageLayer] Invalid URL for optimization check: ${imageSrc}`);
      return false; 
    }
  }, [imageSrc]); // Only re-calc when source changes

  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-gray-900">
      <motion.div
        className="absolute inset-0"
        whileHover={undefined} // Explicitly disable hover here if not needed
        animate={{
          scale: isActive ? 1.015 : 1,
        }}
        transition={{
          duration: 0.8,
          ease: 'linear',
        }}
      >
        {useUltimateFallback ? (
           <img
             src={ULTIMATE_FALLBACK}
             alt={alt}
             className="w-full h-full object-cover opacity-50"
             loading="lazy"
           />
        ) : (
             <Image
              src={imageSrc}
              alt={alt}
              fill
              priority={priority}
              className={`object-cover transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
              sizes="100vw"
              onLoad={handleLoad}
              onError={handleError}
              unoptimized={!shouldOptimize} 
            />
        )}
        
        {/* Placeholder/Loading State - show fallback underneath while loading */}
        {!isLoaded && !useUltimateFallback && (
             <img
                src={fallbackIcon}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-50 blur-sm"
                aria-hidden="true"
            />
        )}

      </motion.div>
      
      {/* Gradient overlay for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/10 z-0" />
    </div>
  );
}
