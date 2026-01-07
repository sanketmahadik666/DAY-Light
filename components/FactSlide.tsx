'use client';

import { useState, memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { Fact } from '@/types/fact';
import { ImageLayer } from './ImageLayer';
import { FactOverlay } from './FactOverlay';
import { ImageGallery } from './ImageGallery';
import { useImageForFact } from '@/hooks/useImageForFact';
import { useFactImages } from '@/hooks/useFactImages';

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

  const imageUrl = hiResUrl || fallbackIcon;

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
        />
      )}
    </motion.div>
  );
});

