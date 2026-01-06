'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
const ALLOWED_HOSTS = new Set([
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'images-assets.nasa.gov',
  'apod.nasa.gov',
  'static.photos',
]);
import { motion } from 'framer-motion';
import type { ImageLoadStatus } from '@/types/fact';

interface ImageLayerProps {
  imageUrl: string | null;
  fallbackIcon: string;
  alt: string;
  priority?: boolean;
  isActive?: boolean;
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
}: ImageLayerProps) {
  const [useUltimateFallback, setUseUltimateFallback] = useState(false);
  // Track if we should show the main image
  const [imageSrc, setImageSrc] = useState<string>(imageUrl || fallbackIcon);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Reset state when inputs change
    if (imageUrl) {
        setImageSrc(imageUrl);
        setUseUltimateFallback(false);
        setIsLoaded(false);
    } else {
        setImageSrc(fallbackIcon);
        setUseUltimateFallback(imageUrl === null); // If explicitly null, maybe don't fallback immediately? Logic says null = fallback
        setIsLoaded(false);
    }
  }, [imageUrl, fallbackIcon]);

  const handleError = () => {
    if (imageSrc !== fallbackIcon && imageSrc !== ULTIMATE_FALLBACK) {
        // First fallback level
        setImageSrc(fallbackIcon);
    } else if (imageSrc === fallbackIcon) {
        // Second fallback level
        setUseUltimateFallback(true);
        setImageSrc(ULTIMATE_FALLBACK);
    }
  };

  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-gray-900">
      <motion.div
        className="absolute inset-0"
        animate={{
          scale: isActive ? 1.02 : 1,
        }}
        transition={{
          duration: 0.5,
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
              onLoad={() => setIsLoaded(true)}
              onError={handleError}
              unoptimized={imageSrc.startsWith('http') && !ALLOWED_HOSTS.has(new URL(imageSrc).hostname)} // Skip optimization for unknown hosts to avoid 400s from Next.js
            />
        )}
        
        {/* Placeholder/Loading State - show fallback underneath while loading */}
        {!isLoaded && !useUltimateFallback && (
             <img
                src={fallbackIcon}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-50 blur-sm"
            />
        )}

      </motion.div>
      
      {/* Gradient overlay for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/10 z-0" />
    </div>
  );
}

