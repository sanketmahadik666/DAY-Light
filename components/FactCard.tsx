'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import type { Fact } from '@/types/fact';
import { useImageForFact } from '@/hooks/useImageForFact';

interface FactCardProps {
  fact: Fact;
  onClick: () => void;
  priority?: boolean;
}

function FactCardComponent({ fact, onClick, priority = false }: FactCardProps) {
  const { thumbnailUrl, status, fallbackIcon } = useImageForFact(fact);
  const displayUrl = status === 'loaded' && thumbnailUrl ? thumbnailUrl : fallbackIcon;

  return (
    <motion.div
      layoutId={`card-${fact.id}`}
      className="break-inside-avoid mb-4 group cursor-pointer relative overflow-hidden rounded-xl bg-theme-milky dark:bg-gray-800 shadow-sm hover:shadow-[0_0_0_4px_var(--accent-pink)] transition-shadow duration-300"
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '50px' }}
      transition={{ duration: 0.3 }}
    >
      {/* Image Aspect Ratio Wrapper */}
      <div className="relative w-full aspect-[4/3] bg-gray-100 dark:bg-gray-700 overflow-hidden">
        <img
          src={displayUrl}
          alt={fact.title}
          loading={priority ? "eager" : "lazy"}
          className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
            status === 'fallback' ? 'opacity-50 p-8' : 'opacity-100'
          }`}
          onError={(e) => {
            e.currentTarget.src = fallbackIcon;
          }}
        />
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-theme-ink/80 via-transparent to-transparent opacity-60" />
        
        {/* Category Badge */}
        <div className="absolute top-2 right-2 px-2 py-1 text-xs font-medium text-white bg-theme-violet/80 backdrop-blur-sm rounded-full">
          {fact.category}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="text-xs font-medium text-theme-violet dark:text-blue-400 mb-1">
          {fact.year || fact.date}
        </div>
        <h3 className="text-sm font-semibold text-theme-ink dark:text-white line-clamp-3">
          {fact.title}
        </h3>
      </div>
    </motion.div>
  );
}

export const FactCard = memo(FactCardComponent);
