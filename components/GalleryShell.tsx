'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { GalleryScroller } from './GalleryScroller';
import { useFacts } from '@/hooks/useFacts';
import { storage, STORAGE_KEYS } from '@/lib/storage';
import type { Fact } from '@/types/fact';

interface GalleryContextType {
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  slides: Fact[];
}

const GalleryContext = createContext<GalleryContextType | null>(null);

export function useGalleryContext() {
  const context = useContext(GalleryContext);
  if (!context) {
    throw new Error('useGalleryContext must be used within GalleryShell');
  }
  return context;
}

interface GalleryShellProps {
  initialDate: string;
  initialCategory?: string;
  onClose?: () => void;
}

export function GalleryShell({
  initialDate,
  initialCategory,
  onClose,
}: GalleryShellProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [date, setDate] = useState(initialDate);
  const { facts, loading, error } = useFacts(date, initialCategory);

  // Save last visited date
  useEffect(() => {
    storage.set(STORAGE_KEYS.LAST_DATE, date);
  }, [date]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' && currentIndex < facts.length - 1) {
        e.preventDefault();
        setCurrentIndex(prev => prev + 1);
      } else if (e.key === 'ArrowUp' && currentIndex > 0) {
        e.preventDefault();
        setCurrentIndex(prev => prev - 1);
      } else if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, facts.length, onClose]);

  // Prevent body scroll when gallery is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleIndexChange = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  if (loading && facts.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading facts...</div>
      </div>
    );
  }

  if (error && facts.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-red-500">Error loading facts: {error.message}</div>
      </div>
    );
  }

  return (
    <GalleryContext.Provider value={{ currentIndex, setCurrentIndex, slides: facts }}>
      <div
        className="fixed inset-0 z-50 bg-black"
        role="region"
        aria-label="Fact gallery"
        aria-live="polite"
      >
        <GalleryScroller
          slides={facts}
          currentIndex={currentIndex}
          onIndexChange={handleIndexChange}
          prefetchDistance={2}
        />
      </div>
    </GalleryContext.Provider>
  );
}

