/**
 * Notable People Resolver
 * 
 * ROBUSTNESS RULES:
 * - Handles multiple name spellings
 * - Normalizes with Wikidata QIDs
 * - Caches resolutions to avoid repeated lookups
 * - Graceful fallback if resolution fails
 * 
 * Purpose:
 * - Resolve person names to canonical form
 * - Map to Wikidata QID for consistency
 * - Handle aliases and alternate spellings
 * - Cache resolutions for performance
 */

import type { Fact } from '@/types/fact';
import { safeJsonParse, isRateLimited } from '@/lib/apiSanitizer';
import { getMeta, setMeta } from '@/lib/indexedCache';

const API_TIMEOUT = 2000; // 2s timeout
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

interface PersonResolution {
  canonicalName: string;
  qid: string | null;
  aliases: string[];
  normalizedAt: number;
}

interface ResolutionCache {
  [key: string]: PersonResolution;
}

/**
 * Normalize name for lookup (lowercase, remove special chars)
 */
function normalizeNameForLookup(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 100);
}

/**
 * Search Wikidata for person entity
 */
async function searchWikidataPerson(name: string): Promise<{
  qid: string | null;
  canonicalName: string;
  aliases: string[];
} | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    // Search with person filter
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&type=item&format=json&origin=*`;
    const response = await fetch(searchUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok || isRateLimited(response)) return null;

    const { data, error } = await safeJsonParse<{
      search?: Array<{
        id?: string;
        label?: string;
        description?: string;
        aliases?: string[];
        match?: { type?: string };
      }>;
    }>(response);

    if (error || !data?.search?.[0]) return null;

    const entity = data.search[0];

    // Verify it's a person (check description or match type)
    const description = entity.description?.toLowerCase() || '';
    const isPerson = 
      description.includes('person') ||
      description.includes('human') ||
      description.includes('actor') ||
      description.includes('scientist') ||
      description.includes('politician') ||
      entity.match?.type === 'label';

    if (!isPerson && !entity.id) return null;

    // Get full entity data for aliases
    let aliases: string[] = [];
    if (entity.id) {
      try {
        const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entity.id}&props=aliases&format=json&origin=*`;
        const entityResponse = await fetch(entityUrl, { signal: controller.signal });
        
        if (entityResponse.ok) {
          const { data: entityData } = await safeJsonParse<{
            entities?: Record<string, {
              aliases?: Record<string, Array<{ value?: string }>>;
            }>;
          }>(entityResponse);

          const entityObj = entityData?.entities?.[entity.id];
          if (entityObj?.aliases) {
            // Collect all aliases from all languages
            for (const langAliases of Object.values(entityObj.aliases)) {
              for (const alias of langAliases) {
                if (alias.value) {
                  aliases.push(alias.value);
                }
              }
            }
          }
        }
      } catch (err) {
        // Silent fail for aliases
      }
    }

    return {
      qid: entity.id || null,
      canonicalName: entity.label || name,
      aliases: [...new Set(aliases)], // Remove duplicates
    };
  } catch (error) {
    return null; // Graceful failure
  }
}

/**
 * Get cached resolution
 */
async function getCachedResolution(normalizedName: string): Promise<PersonResolution | null> {
  try {
    const cache = await getMeta<ResolutionCache>('person_resolutions');
    if (!cache) return null;

    const resolution = cache[normalizedName];
    if (!resolution) return null;

    // Check TTL
    const age = Date.now() - resolution.normalizedAt;
    if (age > CACHE_TTL) {
      // Expired, remove from cache
      delete cache[normalizedName];
      await setMeta('person_resolutions', cache);
      return null;
    }

    return resolution;
  } catch (error) {
    return null; // Cache read failed, continue to lookup
  }
}

/**
 * Cache resolution
 */
async function cacheResolution(normalizedName: string, resolution: PersonResolution): Promise<void> {
  try {
    const cache = (await getMeta<ResolutionCache>('person_resolutions')) || {};
    cache[normalizedName] = resolution;
    await setMeta('person_resolutions', cache);
  } catch (error) {
    // Silent fail - caching is optional
  }
}

/**
 * Resolve person name to canonical form with QID
 * 
 * @param name - Person name to resolve
 * @returns Resolution with canonical name, QID, and aliases
 */
export async function resolvePersonName(name: string): Promise<PersonResolution> {
  if (!name || typeof name !== 'string') {
    return {
      canonicalName: name || 'Unknown',
      qid: null,
      aliases: [],
      normalizedAt: Date.now(),
    };
  }

  const normalizedLookup = normalizeNameForLookup(name);

  // Check cache first
  const cached = await getCachedResolution(normalizedLookup);
  if (cached) {
    return cached;
  }

  // Search Wikidata
  const result = await searchWikidataPerson(name);

  if (result) {
    const resolution: PersonResolution = {
      canonicalName: result.canonicalName,
      qid: result.qid,
      aliases: result.aliases,
      normalizedAt: Date.now(),
    };

    // Cache for future use
    await cacheResolution(normalizedLookup, resolution);

    return resolution;
  }

  // No resolution found, return original name
  const fallback: PersonResolution = {
    canonicalName: name,
    qid: null,
    aliases: [],
    normalizedAt: Date.now(),
  };

  // Cache fallback to avoid repeated lookups
  await cacheResolution(normalizedLookup, fallback);

  return fallback;
}

/**
 * Resolve fact person name and update fact
 * Non-blocking, returns fact with resolved name if available
 */
export async function resolveFactPerson(fact: Fact): Promise<Fact> {
  // Only resolve if fact has a name and is in Birthdays category
  if (fact.category !== 'Birthdays' || !fact.name) {
    return fact;
  }

  try {
    // Resolve with timeout
    const resolution = await Promise.race([
      resolvePersonName(fact.name),
      new Promise<PersonResolution>((resolve) => {
        setTimeout(() => {
          resolve({
            canonicalName: fact.name || fact.title,
            qid: null,
            aliases: [],
            normalizedAt: Date.now(),
          });
        }, 1500); // 1.5s timeout
      }),
    ]);

    // Update fact with canonical name if different
    if (resolution.canonicalName && resolution.canonicalName !== fact.name) {
      return {
        ...fact,
        name: resolution.canonicalName,
        // Add QID to fact metadata if we have it
        source: resolution.qid ? `wikidata:${resolution.qid}` : fact.source,
      };
    }

    return fact;
  } catch (error) {
    // Silent fail - return original fact
    return fact;
  }
}

/**
 * Batch resolve multiple facts
 * Non-blocking, processes in background
 */
export async function resolveFactPersons(facts: Fact[]): Promise<Fact[]> {
  // Only resolve Birthday facts
  const birthdayFacts = facts.filter(f => f.category === 'Birthdays' && f.name);
  
  if (birthdayFacts.length === 0) {
    return facts;
  }

  // Resolve in parallel (with limit to avoid rate limits)
  const resolutionPromises = birthdayFacts.slice(0, 10).map(fact => 
    resolveFactPerson(fact).catch(() => fact) // Fallback to original on error
  );

  const resolved = await Promise.all(resolutionPromises);

  // Map resolved facts back to original array
  const resolvedMap = new Map(resolved.map(f => [f.id, f]));
  
  return facts.map(fact => resolvedMap.get(fact.id) || fact);
}

