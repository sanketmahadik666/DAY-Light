/**
 * Enhanced Data Sources Integration
 * 
 * ROBUSTNESS RULES:
 * - All sources have timeouts (2.5s)
 * - All responses are sanitized
 * - Graceful fallback if source fails
 * - Never blocks UI
 * 
 * Additional Sources:
 * - Wikidata (structured data)
 * - NASA APOD (Astronomy Picture of the Day)
 * - NASA EPIC (Earth Polychromatic Imaging Camera)
 * - GitHub static datasets
 */

import type { Fact, ImageMetadata } from '@/types/fact';
import { safeJsonParse, isRateLimited } from '@/lib/apiSanitizer';
import { parseFact } from '@/lib/validators';

const API_TIMEOUT = 2500;

/**
 * Fetch additional data from Wikidata
 * Returns structured data: QID, descriptions, aliases
 */
export async function fetchWikidataData(entityName: string): Promise<{
  qid?: string;
  description?: string;
  aliases?: string[];
  imageUrl?: string;
} | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    // Search for entity
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(entityName)}&language=en&format=json&origin=*`;
    const response = await fetch(searchUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok || isRateLimited(response)) return null;

    const { data, error } = await safeJsonParse<{
      search?: Array<{
        id?: string;
        description?: string;
        aliases?: string[];
        url?: string;
      }>;
    }>(response);

    if (error || !data?.search?.[0]) return null;

    const entity = data.search[0];

    // Get full entity data for image
    let imageUrl: string | undefined;
    if (entity.id) {
      try {
        const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entity.id}&props=claims&format=json&origin=*`;
        const entityResponse = await fetch(entityUrl, { signal: controller.signal });
        
        if (entityResponse.ok) {
          const { data: entityData } = await safeJsonParse<{
            entities?: Record<string, {
              claims?: {
                P18?: Array<{ mainsnak?: { datavalue?: { value?: string } } }>;
              };
            }>;
          }>(entityResponse);

          const imageClaim = entityData?.entities?.[entity.id]?.claims?.P18?.[0];
          const imageName = imageClaim?.mainsnak?.datavalue?.value;
          
          if (imageName && typeof imageName === 'string') {
            // Use Wikimedia API to get the direct image URL (avoid Special:FilePath redirects)
            try {
              const fileTitle = `File:${imageName}`;
              const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|mime|size&titles=${encodeURIComponent(fileTitle)}&origin=*`;
              const infoResp = await fetch(infoUrl, { signal: controller.signal });
              if (infoResp.ok) {
                const { data: infoData } = await safeJsonParse<{ query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string }> }> } }>(infoResp);
                const pages = infoData?.query?.pages || {};
                const firstPage = Object.values(pages)[0] as any;
                const directUrl = firstPage?.imageinfo?.[0]?.url;
                if (directUrl && typeof directUrl === 'string') {
                  imageUrl = directUrl;
                }
              }
            } catch (err) {
              // Silent fail - fall back to Special:FilePath only as last resort (but prefer none)
              imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageName)}?width=800`;
            }
          }
        }
      } catch (err) {
        // Silent fail for image fetch
      }
    }

    return {
      qid: entity.id,
      description: entity.description,
      aliases: entity.aliases,
      imageUrl,
    };
  } catch (error) {
    return null; // Graceful failure
  }
}

/**
 * Fetch NASA Astronomy Picture of the Day
 * For Space category facts
 */
export async function fetchNASAAPOD(date?: string): Promise<{
  title?: string;
  explanation?: string;
  url?: string;
  hdurl?: string;
} | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    // Use DEMO_KEY for public access (or env var for production)
    // Note: In Next.js, env vars are available at build time
    // For runtime, use a config file or API route
    const apiKey = 'DEMO_KEY'; // Default, can be overridden via API route
    const dateParam = date ? `&date=${date}` : '';
    const url = `https://api.nasa.gov/planetary/apod?api_key=${apiKey}${dateParam}`;

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok || isRateLimited(response)) return null;

    const { data, error } = await safeJsonParse<{
      title?: string;
      explanation?: string;
      url?: string;
      hdurl?: string;
      media_type?: string;
    }>(response);

    if (error || !data) return null;

    // Only return if it's an image
    if (data.media_type !== 'image') return null;

    return {
      title: data.title,
      explanation: data.explanation,
      url: data.url,
      hdurl: data.hdurl,
    };
  } catch (error) {
    return null; // Graceful failure
  }
}

/**
 * Fetch NASA EPIC (Earth Polychromatic Imaging Camera) images
 * For Space category, Earth-related facts
 */
export async function fetchNASAEPIC(date?: string): Promise<{
  image?: string;
  caption?: string;
  date?: string;
} | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    // EPIC API endpoint
    const dateParam = date ? `&date=${date}` : '';
    const url = `https://api.nasa.gov/EPIC/api/natural/images${dateParam}`;

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok || isRateLimited(response)) return null;

    const { data, error } = await safeJsonParse<Array<{
      image?: string;
      caption?: string;
      date?: string;
    }>>(response);

    if (error || !Array.isArray(data) || data.length === 0) return null;

    const latest = data[0];
    if (!latest.image) return null;

    // Construct image URL
    const imageDate = latest.date?.split(' ')[0]?.replace(/-/g, '/');
    const imageUrl = imageDate 
      ? `https://epic.gsfc.nasa.gov/archive/natural/${imageDate}/png/${latest.image}.png`
      : null;

    if (!imageUrl) return null;

    return {
      image: imageUrl,
      caption: latest.caption,
      date: latest.date,
    };
  } catch (error) {
    return null; // Graceful failure
  }
}

/**
 * Fetch from GitHub static dataset
 * For historical datasets hosted on GitHub
 */
export async function fetchGitHubDataset(
  repo: string,
  path: string,
  branch: string = 'main'
): Promise<unknown | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    // GitHub raw content URL
    const url = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok || isRateLimited(response)) return null;

    const { data, error } = await safeJsonParse(response);

    if (error || !data) return null;

    return data;
  } catch (error) {
    return null; // Graceful failure
  }
}

/**
 * Enhance fact with additional data sources
 * Non-blocking, returns enhanced fact or original if enhancement fails
 */
export async function enhanceFactWithAdditionalSources(
  fact: Fact
): Promise<Fact> {
  // Only enhance if we have a name/title to search
  const searchTerm = fact.name || fact.title;
  if (!searchTerm) return fact;

  // Work on a shallow copy to avoid mutating caller state
  const enhancedFact: Fact = { ...fact };

  // Try Wikidata enhancement (non-blocking)
  try {
    const wikidataData = await Promise.race([
      fetchWikidataData(searchTerm),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)), // 2s timeout
    ]);

    if (wikidataData) {
      // Enhance description if available
      if (wikidataData.description && !enhancedFact.description) {
        enhancedFact.description = wikidataData.description.slice(0, 500);
      }

      // Add image if not present
      if (wikidataData.imageUrl && !enhancedFact.imageUrl) {
        enhancedFact.imageUrl = wikidataData.imageUrl;
      }
    }
  } catch (error) {
    // Silent fail - continue with original fact
  }

  // Try NASA APOD for Space category
  if (fact.category === 'Space') {
    try {
      const apod = await Promise.race([
        fetchNASAAPOD(fact.date),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);

      if (apod?.url && !enhancedFact.imageUrl) {
        enhancedFact.imageUrl = apod.hdurl || apod.url;
        if (apod.explanation && !enhancedFact.description) {
          enhancedFact.description = apod.explanation.slice(0, 500);
        }
      }
    } catch (error) {
      // Silent fail
    }
  }

  return enhancedFact;
}

