'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Fact } from '@/types/fact';
import { ImageLayer } from './ImageLayer';
import { FactOverlay } from './FactOverlay';
import { useImageForFact } from '@/hooks/useImageForFact';

interface FactSlideProps {
  fact: Fact;
  index: number;
  isActive: boolean;
  onEnter?: () => void;
  onExit?: () => void;
  priority?: boolean;
}

export function FactSlide({
  fact,
  index,
  isActive,
  onEnter,
  onExit,
  priority = false,
}: FactSlideProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { hiResUrl, fallbackIcon } = useImageForFact(fact);

  const imageUrl = hiResUrl || fallbackIcon;

  return (
    <motion.div
      className="w-screen h-screen relative bg-black/5 dark:bg-black snap-start"
      style={{ 
        zIndex: 1, // Ensure slides are below modal (z-100) and button (z-60)
        position: 'relative', // Ensure proper stacking context
      }}
      role="group"
      aria-roledescription="slide"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }} // Faster transition to prevent overlap
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
      />
    </motion.div>
  );
}

