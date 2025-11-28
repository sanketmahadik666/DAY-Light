/**
 * useFacts: Core data loader with multi-layer fallback chain
 * Must resolve facts from IDB -> SW -> Static JSON -> API safely
 * Always return facts instantly (IDB or static) before network calls
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Fact, FactEntry } from '@/types/fact';
import { getFacts, setFacts } from '@/lib/indexedCache';
import { formatDate, getMonthDay } from '@/utils/helpers';
import { parseFact } from '@/lib/validators';
import { safeJsonParse, isRateLimited, extractApiError } from '@/lib/apiSanitizer';

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
    const { month, day } = getMonthDay(date);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    // Determine API endpoint based on category
    let endpoint = '';
    if (category === 'Birthdays') {
      endpoint = `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/births/${month}/${day}`;
    } else if (category === 'Historical') {
      endpoint = `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${month}/${day}`;
    } else {
      // Default to events
      endpoint = `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${month}/${day}`;
    }

    const response = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      // Check for rate limiting
      if (isRateLimited(response)) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }
      throw new Error(`API error: ${response.status}`);
    }
    
    // Check if response is HTML error page
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      throw new Error('API returned HTML instead of JSON');
    }

    // Sanitize and parse JSON response
    const { data, error: parseError } = await safeJsonParse<{
      texts?: unknown[];
      births?: unknown[];
      events?: unknown[];
    }>(response);
    
    if (parseError || !data) {
      throw new Error(parseError?.message || 'Failed to parse API response');
    }
    
    // Transform API response to Fact format
    const facts: Fact[] = [];
    const items = (data.texts || data.births || data.events || []) as Array<{
      text?: string;
      year?: number;
      pages?: Array<{ title?: string; content_urls?: { desktop?: { page?: string } } }>;
    }>;

    items.forEach((item: any, index: number) => {
      const fact: Fact = {
        id: `${date}-${index}`,
        title: item.text || item.pages?.[0]?.title || 'Untitled',
        description: item.text,
        name: item.pages?.[0]?.title,
        date,
        category: (category as any) || 'Historical',
        year: item.year,
        source: 'wikimedia',
        sourceUrl: item.pages?.[0]?.content_urls?.desktop?.page,
      };

      const parsed = parseFact(fact);
      if (parsed) {
        facts.push(parsed);
      }
    });

    return facts;
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
async function fetchFactsFromStatic(date: string): Promise<Fact[]> {
  try {
    const response = await fetch(`/static-data/${date}.json`, {
      signal: AbortSignal.timeout(API_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`Static JSON not found: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data.facts) ? data.facts : [];
  } catch (error) {
    console.error('Static JSON fetch failed:', error);
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
        setFactsState(staticFacts);
        setLoading(false);
        
        // Cache in IDB (non-blocking, can fail silently)
        setFacts(date, staticFacts).catch((idbError) => {
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
          setFactsState(apiFacts);
          await setFacts(date, apiFacts);
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
        // Update IDB (non-blocking)
        setFacts(date, apiFacts).catch((idbError) => {
          console.warn('Background: Failed to cache in IDB:', idbError);
        });
        // Update state
        setFactsState(apiFacts);
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

