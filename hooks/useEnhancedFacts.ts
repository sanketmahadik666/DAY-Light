/**
 * Enhanced Facts Hook with Normalization and Additional Sources
 * 
 * ROBUSTNESS RULES:
 * - Always returns facts instantly (cached first)
 * - Normalization is optional enhancement (never blocks)
 * - Additional sources are background-only
 * - Graceful fallback if enhancements fail
 * 
 * Features:
 * - Uses fact normalization worker
 * - Integrates additional data sources
 * - Resolves notable people names
 * - All enhancements are non-blocking
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Fact } from '@/types/fact';
import { useFacts } from './useFacts';
import { enhanceFactWithAdditionalSources } from '@/lib/dataSources';
import { resolveFactPersons } from '@/lib/notablePeopleResolver';

interface UseEnhancedFactsResult {
  facts: Fact[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  enhanced: boolean; // Whether enhancements have been applied
}

/**
 * Call normalization worker (optional enhancement)
 */
async function normalizeFacts(
  facts: Fact[],
  date: string,
  category?: string
): Promise<Fact[]> {
  try {
    // Sanitize facts before sending to avoid cyclic objects or functions
    const sanitized = facts.map(f => ({
      id: f.id,
      title: f.title,
      description: f.description,
      name: f.name,
      date: f.date,
      category: f.category,
      year: f.year,
      source: f.source,
      sourceUrl: f.sourceUrl,
      imageUrl: f.imageUrl,
      // imageMetadata is optional and must be plain data
      imageMetadata: f.imageMetadata ? {
        url: f.imageMetadata.url,
        thumbnailUrl: f.imageMetadata.thumbnailUrl,
        source: f.imageMetadata.source,
        width: f.imageMetadata.width,
        height: f.imageMetadata.height,
        aspectRatio: f.imageMetadata.aspectRatio,
        license: f.imageMetadata.license,
        alt: f.imageMetadata.alt,
        cachedAt: f.imageMetadata.cachedAt,
        size: f.imageMetadata.size,
        mimeType: f.imageMetadata.mimeType,
      } : undefined,
    }));

    const response = await fetch('/api/normalize-facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: sanitized, date, category }),
      signal: AbortSignal.timeout(2000), // 2s timeout
    });

    if (!response.ok) {
      throw new Error(`Normalization failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.facts && Array.isArray(data.facts) && data.facts.length > 0) {
      return data.facts;
    }
  } catch (error) {
    // Silent fail - return original facts
    if (typeof window !== 'undefined' && (window as any).__DEV__) {
      console.debug('Fact normalization failed (expected in offline mode):', error);
    }
  }

  return facts; // Fallback to original
}

/**
 * Enhanced Facts Hook
 * 
 * Uses base useFacts hook, then applies enhancements:
 * 1. Normalization (via API worker)
 * 2. Additional data sources
 * 3. Notable people resolution
 * 
 * All enhancements are non-blocking and optional
 */
export function useEnhancedFacts(
  date: string,
  category?: string,
  enableEnhancements: boolean = true
): UseEnhancedFactsResult {
  const { facts: baseFacts, loading, error, refresh: baseRefresh } = useFacts(date, category);
  const [enhancedFacts, setEnhancedFacts] = useState<Fact[]>(baseFacts);
  const [enhanced, setEnhanced] = useState(false);
  const enhancementRef = useRef<Promise<void> | null>(null);

  const applyEnhancements = useCallback(async (facts: Fact[]) => {
    if (!enableEnhancements || facts.length === 0) {
      setEnhancedFacts(facts);
      return;
    }

    // Prevent duplicate enhancement runs
    if (enhancementRef.current) {
      await enhancementRef.current;
      return;
    }

    const enhancementPromise = (async () => {
      try {
        let processed = facts;

        // Step 1: Normalize facts (optional, non-blocking)
        try {
          processed = await normalizeFacts(processed, date, category);
        } catch (err) {
          // Continue with original facts
        }

        // Step 2: Resolve notable people (non-blocking)
        try {
          processed = await resolveFactPersons(processed);
        } catch (err) {
          // Continue without resolution
        }

        // Step 3: Enhance with additional sources (non-blocking, background)
        // Only enhance first 5 facts to avoid rate limits
        const toEnhance = processed.slice(0, 5);
        const enhanced = await Promise.all(
          toEnhance.map(fact => 
            enhanceFactWithAdditionalSources(fact).catch(() => fact)
          )
        );

        // Combine enhanced with rest
        const final = [...enhanced, ...processed.slice(5)];

        setEnhancedFacts(final);
        setEnhanced(true);
      } catch (error) {
        // Fallback to original facts
        setEnhancedFacts(facts);
      } finally {
        enhancementRef.current = null;
      }
    })();

    enhancementRef.current = enhancementPromise;
    await enhancementPromise;
  }, [date, category, enableEnhancements]);

  // Apply enhancements when base facts change
  // CRITICAL: Don't include applyEnhancements in deps to prevent infinite loops
  useEffect(() => {
    if (!loading && baseFacts.length > 0) {
      applyEnhancements(baseFacts);
    } else {
      setEnhancedFacts(baseFacts);
      setEnhanced(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFacts, loading]); // Only depend on baseFacts and loading, not applyEnhancements

  const refresh = useCallback(async () => {
    setEnhanced(false);
    await baseRefresh();
  }, [baseRefresh]);

  return {
    facts: enhancedFacts,
    loading,
    error,
    refresh,
    enhanced,
  };
}

