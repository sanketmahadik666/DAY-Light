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
  const [currentUrl, setCurrentUrl] = useState<string>(fallbackIcon);
  const [status, setStatus] = useState<ImageLoadStatus['status']>('loading');
  const [showHiRes, setShowHiRes] = useState(false);
  const [useUltimateFallback, setUseUltimateFallback] = useState(false);

  useEffect(() => {
    if (imageUrl) {
      setCurrentUrl(imageUrl);
      setStatus('loading');
      setUseUltimateFallback(false);
      
      // Preload image
      const img = new window.Image();
      img.onload = () => {
        setStatus('loaded');
        setTimeout(() => setShowHiRes(true), 100);
      };
      img.onerror = () => {
        setStatus('error');
        // Try fallback icon
        setCurrentUrl(fallbackIcon);
        // Test if fallback icon exists (non-blocking check)
        const fallbackImg = new window.Image();
        fallbackImg.onerror = () => {
          // Fallback icon missing, use ultimate fallback
          setUseUltimateFallback(true);
          setCurrentUrl(ULTIMATE_FALLBACK);
        };
        fallbackImg.onload = () => {
          setUseUltimateFallback(false);
        };
        fallbackImg.src = fallbackIcon;
      };
      img.src = imageUrl;
    } else {
      // No image URL, use fallback icon
      setCurrentUrl(fallbackIcon);
      setStatus('fallback');
      // Test if fallback icon exists (non-blocking check)
      const fallbackImg = new window.Image();
      fallbackImg.onerror = () => {
        // Fallback icon missing, use ultimate fallback
        setUseUltimateFallback(true);
        setCurrentUrl(ULTIMATE_FALLBACK);
      };
      fallbackImg.onload = () => {
        setUseUltimateFallback(false);
      };
      fallbackImg.src = fallbackIcon;
    }
  }, [imageUrl, fallbackIcon]);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      <motion.div
        className="absolute inset-0"
        animate={{
          scale: isActive ? 1.03 : 1,
        }}
        transition={{
          duration: 0.35,
          ease: 'easeOut',
        }}
      >
        {(() => {
          if (useUltimateFallback) {
            return (
              <img
                src={ULTIMATE_FALLBACK}
                alt={alt}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            );
          }

          const canUseNextImage = (() => {
            try {
              const parsed = new URL(currentUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
              if (parsed.origin === (typeof window !== 'undefined' ? window.location.origin : parsed.origin)) return true;
              return ALLOWED_HOSTS.has(parsed.hostname);
            } catch {
              return currentUrl.startsWith('/');
            }
          })();

          if (!canUseNextImage) {
            return (
              <img
                src={currentUrl}
                alt={alt}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={() => {
                  setUseUltimateFallback(true);
                  setCurrentUrl(ULTIMATE_FALLBACK);
                }}
              />
            );
          }

          return (
            <Image
              src={currentUrl}
              alt={alt}
              fill
              priority={priority}
              className="object-cover"
              sizes="100vw"
              quality={showHiRes ? 90 : 75}
              onError={() => {
                setUseUltimateFallback(true);
                setCurrentUrl(ULTIMATE_FALLBACK);
              }}
            />
          );
        })()}
      </motion.div>
      
      {/* Gradient overlay for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/10 z-0" />
    </div>
  );
}

