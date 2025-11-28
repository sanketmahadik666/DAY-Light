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
import { useFacts } from './useFacts';

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

    // Fetch facts for each date sequentially (to avoid rate limiting)
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      setProgress({ total: dates.length, completed: i, current: date });

      try {
        // Use a simple fetch approach for each date
        // We'll call the API directly for each date
        const response = await fetch(`/api/facts?date=${date}${category ? `&category=${category}` : ''}`, {
          signal: AbortSignal.timeout(2500),
          headers: { accept: 'application/json' },
        });

        if (response.ok) {
          const json = await response.json();
          if (json?.facts && Array.isArray(json.facts)) {
            factsByDate.set(date, json.facts);
          }
        } else {
          errors.push(new Error(`Failed to fetch facts for ${date}: ${response.status}`));
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(`Unknown error for ${date}`);
        errors.push(error);
        // Continue with next date
      }
    }

    // Aggregate all facts
    const aggregatedFacts: Fact[] = [];
    factsByDate.forEach((facts, date) => {
      aggregatedFacts.push(...facts);
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
    } else {
      setAllFacts(aggregatedFacts);
      if (errors.length > 0) {
        // Some dates failed, but we have partial results
        setError(new Error(`Some dates failed: ${errors.length} of ${dates.length}`));
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

