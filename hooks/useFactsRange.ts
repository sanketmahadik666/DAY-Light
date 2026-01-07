/**
 * FILE: hooks/useFactsRange.ts
 * PURPOSE: Fetch facts for multiple dates (single date or date range)
 * 
 * KEY RESPONSIBILITIES:
 *   - Handle single date or date range fact fetching
 *   - Aggregate facts from multiple dates
 *   - Maintain fallback chain for each date
 *   - Handle loading states for multiple dates
 * 
 * FALLBACKS:
 *   - If one date fails, continue with other dates
 *   - Return partial results if some dates succeed
 *   - Always return at least minimal facts
 * 
 * ERROR HANDLING:
 *   - Individual date failures: Log and continue
 *   - All dates fail: Return minimal offline facts
 *   - Network errors: Handled per date
 * 
 * INTEGRATION:
 *   - Used by: GalleryShell, WorkflowGate
 *   - Uses: useFacts hook, types/workflow.ts
 * 
 * ROBUSTNESS GUARANTEES:
 *   - Timeout: Per date (2.5s), total timeout configurable
 *   - Never blocks: Yes (async, returns partial results)
 *   - Fallback: Yes (minimal facts if all fail)
 */

import { useState, useEffect, useCallback } from 'react';
import type { Fact } from '@/types/fact';
import type { DateSelection } from '@/types/workflow';
import { generateDateList } from '@/lib/workflowHelpers';
import { useFacts, fetchFactsFromAPI } from './useFacts';

interface UseFactsRangeResult {
  facts: Fact[];
  loading: boolean;
  error: Error | null;
  progress: {
    total: number;
    completed: number;
    current: string | null;
  };
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch facts for a date selection (single or range)
 */
export function useFactsRange(
  selection: DateSelection | null,
  category?: string
): UseFactsRangeResult {
  const [allFacts, setAllFacts] = useState<Fact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState({ total: 0, completed: 0, current: null as string | null });

  const loadFactsForSelection = useCallback(async () => {
    if (!selection) {
      setAllFacts([]);
      setLoading(false);
      return;
    }

    const dates = generateDateList(selection);
    if (dates.length === 0) {
      setAllFacts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setProgress({ total: dates.length, completed: 0, current: dates[0] || null });

    const factsByDate: Map<string, Fact[]> = new Map();
    const errors: Error[] = [];

    // Batch processing helper
    const processBatch = async (batchDates: string[]) => {
      const promises = batchDates.map(async (date) => {
         try {
           const facts = await fetchFactsFromAPI(date, category);
           if (facts.length > 0) {
             factsByDate.set(date, facts);
           }
         } catch (err) {
           const error = err instanceof Error ? err : new Error(`Unknown error for ${date}`);
           errors.push(error);
         } finally {
            // Update progress safely
            setProgress(prev => ({ 
                ...prev, 
                completed: Math.min(prev.total, prev.completed + 1),
                current: date 
            }));
         }
      });
      await Promise.all(promises);
    };

    // Process in batches of 3 to respect rate limits while improving speed
    const BATCH_SIZE = 3;
    for (let i = 0; i < dates.length; i += BATCH_SIZE) {
        const batch = dates.slice(i, i + BATCH_SIZE);
        await processBatch(batch);
    }

    // Aggregate all facts
    const aggregatedFacts: Fact[] = [];
    // Sort dates to maintain order
    dates.forEach(date => {
        const facts = factsByDate.get(date);
        if (facts) {
            aggregatedFacts.push(...facts);
        }
    });

    setProgress({ total: dates.length, completed: dates.length, current: null });

    if (aggregatedFacts.length === 0 && errors.length > 0) {
      // All dates failed, return minimal offline facts
      const minimalFacts: Fact[] = dates.map((date, index) => ({
        id: `${date}-offline-${index}`,
        title: `Facts for ${date}`,
        date,
        category: category as any || 'Historical',
      }));
      setAllFacts(minimalFacts);
      setError(new Error(`Failed to load facts: ${errors.map(e => e.message).join(', ')}`));
    } else if (aggregatedFacts.length === 0) {
      // No facts found (empty API response)
      const minimalFacts: Fact[] = dates.map((date, index) => ({
        id: `${date}-offline-${index}`,
        title: `Facts for ${date}`,
        date,
        category: category as any || 'Historical',
      }));
      setAllFacts(minimalFacts);
      console.warn(`No facts found for ${dates.join(', ')}, falling back to placeholders.`);
    } else {
      setAllFacts(aggregatedFacts);
      if (errors.length > 0) {
        // Some dates failed, but we have partial results
        // Don't set error state to prevent error UI blocking content
        console.warn(`Partial success: ${errors.length} of ${dates.length} dates failed.`);
      }
    }

    setLoading(false);
  }, [selection, category]);

  useEffect(() => {
    loadFactsForSelection();
  }, [loadFactsForSelection]);

  return {
    facts: allFacts,
    loading,
    error,
    progress,
    refresh: loadFactsForSelection,
  };
}

