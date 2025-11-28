/**
 * useFacts: Core data loader with multi-layer fallback chain
 * Must resolve facts from IDB -> SW -> Static JSON -> API safely
 * Always return facts instantly (IDB or static) before network calls
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Fact, FactEntry } from '@/types/fact';
import { getFacts, setFacts } from '@/lib/indexedCache';
import { getMonthDay } from '@/utils/helpers';
import { parseFact } from '@/lib/validators';
import { isRateLimited } from '@/lib/apiSanitizer';
const cloneFacts = (facts: Fact[]): Fact[] =>
  JSON.parse(JSON.stringify(facts)) as Fact[];

interface UseFactsResult {
  facts: Fact[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

const API_TIMEOUT = 2500; // 2.5 seconds

/**
 * Fetch facts from Wikimedia OnThisDay API
 */
async function fetchFactsFromAPI(date: string, category?: string): Promise<Fact[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
    const params = new URLSearchParams({ date });
    if (category) {
      params.set('category', category);
    }
    const response = await fetch(`/api/facts?${params.toString()}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (isRateLimited(response)) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }
      throw new Error(`API error: ${response.status}`);
    }

    const json = await response.json();
    if (!json?.facts || !Array.isArray(json.facts)) {
      return [];
    }

    return json.facts as Fact[];
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('API request timeout');
    }
    throw error;
  }
}

/**
 * Fetch facts from static JSON fallback
 */
const missingStaticJsonDates = new Set<string>();

async function fetchFactsFromStatic(date: string): Promise<Fact[]> {
  if (missingStaticJsonDates.has(date)) {
    return [];
  }

  try {
    const response = await fetch(`/static-data/${date}.json`, {
      signal: AbortSignal.timeout(API_TIMEOUT),
    });

    if (response.status === 404) {
      missingStaticJsonDates.add(date);
      return [];
    }

    if (!response.ok) {
      throw new Error(`Static JSON error: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data.facts) ? data.facts : [];
  } catch (error) {
    console.warn('Static JSON fetch failed:', error);
    return [];
  }
}

/**
 * Get minimal offline fact (title only)
 */
function getMinimalOfflineFact(date: string): Fact[] {
  return [
    {
      id: `${date}-offline`,
      title: `Facts for ${date}`,
      date,
      category: 'Historical',
    },
  ];
}

/**
 * Main hook: useFacts
 */
export function useFacts(date: string, category?: string): UseFactsResult {
  const [facts, setFactsState] = useState<Fact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Use ref to avoid stale closure in refreshInBackground
  const refreshInBackgroundRef = useRef<(() => Promise<void>) | null>(null);

  const loadFacts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Layer 1: IndexedDB (fresh, TTL 24h)
      // ROBUSTNESS: IDB can fail, so we wrap in try-catch
      let cachedEntry: FactEntry | null = null;
      try {
        cachedEntry = await getFacts(date);
      } catch (idbError) {
        // IDB failed, log and continue to next layer
        console.warn('IndexedDB read failed, falling back to static JSON:', idbError);
      }
      
      if (cachedEntry && cachedEntry.facts.length > 0) {
        setFactsState(cachedEntry.facts);
        setLoading(false);
        
        // Refresh in background (non-blocking)
        if (refreshInBackgroundRef.current) {
          refreshInBackgroundRef.current().catch(() => {
            // Silent fail in background
          });
        }
        return;
      }

      // Layer 2: Service Worker Runtime Cache (JSON)
      // This is handled by SW automatically, try static JSON
      const staticFacts = await fetchFactsFromStatic(date);
      if (staticFacts.length > 0) {
        const safeStatic = cloneFacts(staticFacts);
        setFactsState(safeStatic);
        setLoading(false);
        
        // Cache in IDB (non-blocking, can fail silently)
        setFacts(date, safeStatic).catch((idbError) => {
          console.warn('Failed to cache facts in IDB:', idbError);
        });
        
        // Refresh in background (non-blocking)
        if (refreshInBackgroundRef.current) {
          refreshInBackgroundRef.current().catch(() => {
            // Silent fail in background
          });
        }
        return;
      }

      // Layer 3: Static JSON (/static-data/YYYY-MM-DD.json)
      // Already tried above, if failed, try API

      // Layer 4: API (with timeout)
      try {
        const apiFacts = await fetchFactsFromAPI(date, category);
        if (apiFacts.length > 0) {
          const safeApiFacts = cloneFacts(apiFacts);
          setFactsState(safeApiFacts);
          await setFacts(date, safeApiFacts);
          setLoading(false);
          return;
        }
      } catch (apiError) {
        console.error('API fetch failed:', apiError);
      }

      // Layer 5: Minimal Offline Fact (title only)
      const minimalFacts = getMinimalOfflineFact(date);
      setFactsState(minimalFacts);
      setLoading(false);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setLoading(false);
      
      // Fallback to minimal fact
      const minimalFacts = getMinimalOfflineFact(date);
      setFactsState(minimalFacts);
    }
  }, [date, category]);

  // Define refreshInBackground and store in ref
  const refreshInBackground = useCallback(async () => {
    try {
      const apiFacts = await fetchFactsFromAPI(date, category);
      if (apiFacts.length > 0) {
        const safeApiFacts = cloneFacts(apiFacts);
        // Update IDB (non-blocking)
        setFacts(date, safeApiFacts).catch((idbError) => {
          console.warn('Background: Failed to cache in IDB:', idbError);
        });
        // Update state
        setFactsState(safeApiFacts);
      }
    } catch (error) {
      // Silent fail in background - don't log to avoid noise
      // Only log in development mode (check via window.__DEV__ or similar)
      if (typeof window !== 'undefined' && (window as any).__DEV__) {
        console.debug('Background refresh failed (expected in offline mode):', error);
      }
    }
  }, [date, category]);
  
  // Store in ref for use in loadFacts
  refreshInBackgroundRef.current = refreshInBackground;

  const refresh = useCallback(async () => {
    await loadFacts();
  }, [loadFacts]);

  useEffect(() => {
    loadFacts();
  }, [loadFacts]);

  return { facts, loading, error, refresh };
}

