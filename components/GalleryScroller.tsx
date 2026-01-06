'use client';

import { useEffect, useRef, useState, memo } from 'react';
import type { Fact } from '@/types/fact';
import { FactSlide } from './FactSlide';

interface GalleryScrollerProps {
  slides: Fact[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  prefetchDistance?: number;
}

const MemoizedFactSlide = memo(FactSlide);

export function GalleryScroller({
  slides,
  currentIndex,
  onIndexChange,
  prefetchDistance = 2,
}: GalleryScrollerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 10 });
  const prevSlidesLengthRef = useRef<number>(slides.length);

  useEffect(() => {
    const start = Math.max(0, currentIndex - 3);
    const end = Math.min(slides.length, currentIndex + 4);
    setVisibleRange({ start, end });
  }, [currentIndex, slides.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const slideHeight = window.innerHeight;
      const newIndex = Math.round(scrollTop / slideHeight);
      
      if (newIndex !== currentIndex && newIndex >= 0 && newIndex < slides.length) {
        onIndexChange(newIndex);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, slides.length]); // onIndexChange is stable from useCallback, don't need in deps

  // Scroll to current index
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const slideHeight = window.innerHeight;
    
    // CRITICAL: If slides array changed (new date/facts), ALWAYS jump instantly
    // This prevents overlap during date changes
    const slidesChanged = prevSlidesLengthRef.current !== slides.length;
    const isAtTop = container.scrollTop === 0;
    
    // Always use 'auto' (instant) if slides changed or at top
    // Only use 'smooth' for normal navigation within same slides
    const behavior: ScrollBehavior = slidesChanged || isAtTop
      ? 'auto'
      : 'smooth';

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      if (container) {
        container.scrollTo({
          top: currentIndex * slideHeight,
          behavior,
        });
      }
    });

    // Update previous length for next render
    prevSlidesLengthRef.current = slides.length;
  }, [currentIndex, slides.length]);

  return (
    <div
      ref={containerRef}
      className="snap-y snap-mandatory overflow-y-auto h-screen"
    >
      {slides.map((fact, index) => {
        // Only render visible slides + prefetch range
        if (index < visibleRange.start || index > visibleRange.end) {
          return null;
        }

        return (
          <MemoizedFactSlide
            key={fact.id}
            fact={fact}
            index={index}
            isActive={index === currentIndex}
            priority={index === currentIndex || index === currentIndex + 1}
          />
        );
      })}
    </div>
  );
}

