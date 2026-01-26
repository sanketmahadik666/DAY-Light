'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useGalleryStorageSync } from '@/hooks/useGalleryStorageSync';
import type { Fact } from '@/types/fact';

interface GalleryImage {
  url: string;
  thumbnailUrl: string;
  source: string;
  alt: string;
  width?: number;
  height?: number;
}

interface ImageGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  images: GalleryImage[];
  isLoading: boolean;
  error: string | null;
  title: string;
  fact?: Fact; // Add fact for storage sync
}

export function ImageGallery({ 
  isOpen, 
  onClose, 
  images, 
  isLoading, 
  error, 
  title,
  fact 
}: ImageGalleryProps) {
  const imageRefs = useRef<Map<string, HTMLImageElement>>(new Map());
  
  // Storage sync hook - only enabled when gallery is open and fact is provided
  const {
    isSyncing,
    syncProgress,
    loadedCount,
    totalCount,
    allLoaded,
    registerImageElement,
  } = useGalleryStorageSync({
    fact: fact!,
    images,
    isLoading,
    enabled: isOpen && !!fact && images.length > 0,
    onSyncComplete: (synced) => {
      console.log(`Synced ${synced} images to storage`);
    },
    onSyncError: (error) => {
      console.error('Storage sync error:', error);
    },
  });

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Image gallery for ${title}`}
        >
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-5xl h-[85vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-white/10"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-black/50 backdrop-blur-sm z-10">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate pr-4">
                  Images: {title}
                </h2>
                {/* Storage sync status */}
                {fact && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {isSyncing ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        Syncing to storage... {Math.round(syncProgress)}%
                      </span>
                    ) : allLoaded ? (
                      <span className="text-green-600 dark:text-green-400">
                        ✓ All images loaded ({loadedCount}/{totalCount})
                      </span>
                    ) : (
                      <span>
                        Loading images... ({loadedCount}/{totalCount})
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
                aria-label="Close gallery"
              >
                <svg className="w-6 h-6 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full py-20 space-y-4">
                  <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-500 dark:text-gray-400">Searching the universe...</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                   <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-full text-red-500">
                     <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                     </svg>
                   </div>
                   <p className="text-gray-600 dark:text-gray-300">{error}</p>
                </div>
              ) : images.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-gray-500 dark:text-gray-400">No additional images found.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {images.map((img, idx) => (
                    <motion.div
                      key={img.url}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="group relative aspect-video bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden cursor-zoom-in"
                      onClick={() => window.open(img.url, '_blank')}
                    >
                      <img 
                        ref={(el) => {
                          if (el) {
                            imageRefs.current.set(img.url, el);
                            registerImageElement(img.url, el);
                          } else {
                            imageRefs.current.delete(img.url);
                            registerImageElement(img.url, null);
                          }
                        }}
                        src={img.thumbnailUrl} 
                        alt={img.alt}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <p className="text-xs font-medium text-white/90 truncate">{img.source}</p>
                          <p className="text-xs text-white/60 truncate">{img.alt}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Footer */}
            {!isLoading && !error && images.length > 0 && (
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-800 text-center text-xs text-gray-500">
                    Showing {images.length} top results
                    {isSyncing && (
                      <div className="mt-2">
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                          <div 
                            className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${syncProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
