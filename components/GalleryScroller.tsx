import { useEffect, useRef, useState, memo } from 'react';
import type { Fact } from '@/types/fact';
import { FactSlide } from './FactSlide';
import { FactCard } from './FactCard';

interface GalleryScrollerProps {
  slides: Fact[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  layout?: 'slides' | 'masonry';
  onLayoutChange?: (layout: 'slides' | 'masonry') => void;
  prefetchDistance?: number;
}

const MemoizedFactSlide = memo(FactSlide);

export function GalleryScroller({
  slides,
  currentIndex,
  onIndexChange,
  layout = 'slides',
  onLayoutChange,
  prefetchDistance = 2,
}: GalleryScrollerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 10 });
  const [scrollVelocity, setScrollVelocity] = useState(0);
  const lastScrollState = useRef({ top: 0, time: Date.now() });

  useEffect(() => {
    // Only prefetch in slides mode
    if (layout !== 'slides') {
      // In masonry, we rely on browser native lazy loading + intersection observer in FactCard
      return;
    }

    // Dynamic Preloading based on Velocity
    // Base: 2 slides
    // fast scroll: up to 5 slides
    const velocityFactor = Math.min(3, Math.round(scrollVelocity * 5)); 
    const prefetchCount = 2 + velocityFactor;

    const start = Math.max(0, currentIndex - 2);
    const end = Math.min(slides.length, currentIndex + prefetchCount);
    
    setVisibleRange({ start, end });
  }, [currentIndex, slides.length, scrollVelocity, layout]);

  useEffect(() => {
    if (layout !== 'slides') return;

    const container = containerRef.current;
    if (!container) return;

    // Cache slide height to avoid layout thrashing during scroll
    let cachedSlideHeight = window.innerHeight;

    const handleResize = () => {
       cachedSlideHeight = window.innerHeight;
    };
    
    window.addEventListener('resize', handleResize);

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const now = Date.now();
      const timeDelta = now - lastScrollState.current.time;
      
      // Update velocity every 100ms or so to avoid jitter
      if (timeDelta > 50) {
        const dist = Math.abs(scrollTop - lastScrollState.current.top);
        const velocity = dist / timeDelta; // px/ms
        setScrollVelocity(velocity);
        
        lastScrollState.current = { top: scrollTop, time: now };
      }

      // Use cached height
      const newIndex = Math.round(scrollTop / cachedSlideHeight);
      
      if (newIndex !== currentIndex && newIndex >= 0 && newIndex < slides.length) {
        onIndexChange(newIndex);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [currentIndex, slides.length, onIndexChange, layout]);

  // Scroll to current index when switching back to slides
  useEffect(() => {
    if (layout === 'slides' && containerRef.current) {
        // Instant jump to correct slide
        // We use a small timeout to ensure layout is ready
        setTimeout(() => {
            if (containerRef.current) {
                containerRef.current.scrollTop = currentIndex * window.innerHeight;
            }
        }, 0);
    }
  }, [layout, currentIndex]);
  
  // Handler for card click
  const handleCardClick = (index: number) => {
    onIndexChange(index);
    onLayoutChange?.('slides');
  };

  if (layout === 'masonry') {
    return (
      <div 
        ref={containerRef}
        className="w-full h-screen overflow-y-auto bg-gray-50 dark:bg-black p-4 pt-16"
      >
        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 max-w-7xl mx-auto space-y-4">
             {slides.map((fact, index) => (
               <FactCard 
                 key={fact.id} 
                 fact={fact} 
                 onClick={() => handleCardClick(index)}
                 priority={index < 8}
               />
             ))}
        </div>
        <div className="h-20" /> {/* Bottom padding */}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="snap-y snap-mandatory overflow-y-auto h-screen"
    >
      {slides.map((fact, index) => {
        // Render window
        const isVisible = index >= visibleRange.start && index <= visibleRange.end;
        
        // Priority for LCP: Current and Next
        const isPriority = index === currentIndex || index === currentIndex + 1;

        return (
          <div
            key={fact.id}
            className="w-full h-full snap-start"
            // Use data-attribute for potential debugging/CSS
            data-index={index}
            data-state={index === currentIndex ? 'active' : 'inactive'}
          >
            {isVisible ? (
              <MemoizedFactSlide
                fact={fact}
                index={index}
                isActive={index === currentIndex}
                priority={isPriority}
                shouldPreloadGallery={index === currentIndex} // Only preload gallery for active slide
              />
            ) : (
               // Empty placeholder to maintain scroll height
               // This allows React to unmount the heavy FactSlide component
               // effectively cleaning up memory and cancelling active requests for distant slides
               null 
            )}
          </div>
        );
      })}
    </div>
  );
}

