'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { Fact } from '@/types/fact';

interface FactOverlayProps {
  fact: Fact;
  isExpanded: boolean;
  onExpand: () => void;
  onGalleryOpen?: () => void;
}

export function FactOverlay({ fact, isExpanded, onExpand, onGalleryOpen }: FactOverlayProps) {
  return (
    <div className="relative z-10 max-w-[900px] mx-auto px-6 py-12 text-white">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4 text-balance">
          {fact.title}
        </h1>

        {fact.year && (
          <div className="text-xl md:text-2xl mb-4 opacity-90">
            {fact.year}
          </div>
        )}

        <AnimatePresence>
          {isExpanded && fact.description && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-4 text-lg md:text-xl leading-relaxed"
            >
              <p>{fact.description}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            onClick={onExpand}
            className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-colors"
            aria-expanded={isExpanded ? true : undefined}
            aria-label={isExpanded ? 'Collapse description' : 'Expand description'}
            target-lint-error-ids="a216cdd8-7b4c-4a77-8901-ab4b0007f5c9"
          >
            {isExpanded ? 'Less' : 'More'}
          </button>

          {onGalleryOpen && (
            <button
              onClick={onGalleryOpen}
              className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-colors flex items-center gap-2"
              aria-label="View image gallery"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Gallery
            </button>
          )}

          {fact.sourceUrl && (
            <a
              href={fact.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-colors"
            >
              Source
            </a>
          )}
        </div>
      </motion.div>
    </div>
  );
}

