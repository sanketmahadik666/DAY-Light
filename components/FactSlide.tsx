'use client';

import { useState, memo, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { Fact } from '@/types/fact';
import { ImageLayer } from './ImageLayer';
import { FactOverlay } from './FactOverlay';
import { ImageGallery } from './ImageGallery';
import { useImageForFact } from '@/hooks/useImageForFact';
import { useFactImages } from '@/hooks/useFactImages';
import { useFactViewTracking } from '@/lib/services/analytics-collector';

interface FactSlideProps {
  fact: Fact;
  index: number;
  isActive: boolean;
  onEnter?: () => void;
  onExit?: () => void;
  priority?: boolean;
  shouldPreloadGallery?: boolean;
}

export const FactSlide = memo(function FactSlide({
  fact,
  index,
  isActive,
  onEnter,
  onExit,
  priority = false,
  shouldPreloadGallery = false,
}: FactSlideProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { hiResUrl, fallbackIcon } = useImageForFact(fact);
  const { 
    images: galleryImages, 
    isLoading: galleryLoading, 
    error: galleryError, 
    fetchGallery, 
    isOpen: isGalleryOpen, 
    setIsOpen: setGalleryOpen 
  } = useFactImages(fact, shouldPreloadGallery);
  
  // Analytics tracking
  const trackFactView = useFactViewTracking();
  const endViewTrackingRef = useRef<(() => void) | null>(null);

  const imageUrl = hiResUrl || fallbackIcon;

  // Track fact view when slide becomes active
  useEffect(() => {
    if (isActive) {
      const endTracking = trackFactView(fact.id, fact.date, fact.category, index);
      endViewTrackingRef.current = endTracking;
      
      return () => {
        if (endViewTrackingRef.current) {
          endViewTrackingRef.current();
        }
      };
    }
  }, [isActive, fact, index, trackFactView]);

  const handleGalleryOpen = useCallback(() => {
    setGalleryOpen(true);
    fetchGallery();
  }, [setGalleryOpen, fetchGallery]);

  return (
    <motion.div
      className="w-screen h-screen relative bg-black/5 dark:bg-black snap-start overflow-hidden"
      style={{ 
        zIndex: 1, // Ensure slides are below modal (z-100) and button (z-60)
        position: 'relative', // Ensure proper stacking context
        willChange: 'opacity, transform',
      }}
      role="group"
      aria-roledescription="slide"
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1, ease: 'linear' }}
      onViewportEnter={onEnter}
      onViewportLeave={onExit}
    >
      <ImageLayer
        imageUrl={imageUrl}
        fallbackIcon={fallbackIcon}
        alt={`${fact.title} - ${fact.category}`}
        priority={priority}
        isActive={isActive}
        factId={fact.id}
      />

      <FactOverlay
        fact={fact}
        isExpanded={isExpanded}
        onExpand={() => setIsExpanded(!isExpanded)}
        onGalleryOpen={handleGalleryOpen}
      />

      {isGalleryOpen && (
        <ImageGallery
          isOpen={isGalleryOpen}
          onClose={() => setGalleryOpen(false)}
          images={galleryImages}
          isLoading={galleryLoading}
          error={galleryError}
          title={fact.title || fact.category}
          fact={fact}
        />
      )}
    </motion.div>
  );
});

