/**
 * Image Engine: Finds, scores, and selects the best image candidate
 * Must gracefully fail, never block UI
 */

import type { Fact, ImageMetadata, Category } from '@/types/fact';
import { extractKeywords, getFallbackIconPath } from '@/utils/helpers';
import { validateImageMetadata } from '@/lib/validators';
import { safeJsonParse, isRateLimited } from '@/lib/apiSanitizer';

const API_TIMEOUT = 2500; // 2.5 seconds
const MAX_RETRIES = 2; // Retry failed requests up to 2 times
const RETRY_DELAY = 500; // Initial retry delay in ms

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delay: number = RETRY_DELAY
): Promise<T | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
     if (error instanceof Error && error.name === 'AbortError') {
        throw error; // Convert to null outside or handle
      }
      if (attempt === maxRetries) {
        return null;
      }
      // Exponential backoff: delay * 2^attempt
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
    }
  }
  return null;
}

interface ImageCandidate {
  url: string;
  thumbnailUrl?: string;
  source: ImageMetadata['source'];
  width?: number;
  height?: number;
  license?: string;
  score: number;
  requiresValidation?: boolean;
  alt?: string;
  metadata?: any;
}

const STATIC_PHOTO_CATEGORY_MAP: Record<Category, string> = {
  Birthdays: 'people',
  Historical: 'vintage',
  Science: 'science',
  Finance: 'finance',
  Sports: 'sport',
  Festivals: 'event',
  Space: 'aerial',
  PopCulture: 'event',
  Awards: 'event',
  Technology: 'technology',
};

const STATIC_PHOTO_BASE = 'https://static.photos';
const DEFAULT_PLACEHOLDER = '/fallback/default-placeholder.png';

function sanitizeImageUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return null;
    }
    // Strip hash fragments to avoid caching mismatches
    parsed.hash = '';
    return parsed.toString();
  } catch (error) {
    return null;
  }
}

/**
 * Score an image candidate based on multiple factors
 */
function scoreCandidate(candidate: ImageCandidate, fact: Fact): number {
  let score = 0;

  // Source authority (40 points max)
  const sourceScores: Record<ImageMetadata['source'], number> = {
    wikimedia: 40,
    wikidata: 35,
    nasa: 30,
    openverse: 25,
    staticphotos: 15,
    'fallback-icon': 5,
    'fallback-default': 0,
  };
  score += sourceScores[candidate.source] || 0;

  // Exact match (25 points)
  const factText = `${fact.title} ${fact.description || ''} ${fact.name || ''}`.toLowerCase();
  const candidateText = candidate.url.toLowerCase();
  if (factText.split(' ').some(word => candidateText.includes(word.toLowerCase()))) {
    score += 25;
  }

  // Resolution preference (20 points)
  if (candidate.width && candidate.height) {
    const totalPixels = candidate.width * candidate.height;
    if (totalPixels >= 400 * 400 && totalPixels <= 1200 * 1200) {
      score += 20;
    } else if (totalPixels > 1200 * 1200) {
      score += 10; // Too large, but still usable
    }
  }

  // Aspect ratio (10 points for landscape)
  if (candidate.width && candidate.height) {
    const aspectRatio = candidate.width / candidate.height;
    if (aspectRatio >= 1.2) {
      score += 10; // Prefer landscape
    }
  }

  // License (30 points for public domain or CC)
  if (candidate.license) {
    const license = candidate.license.toLowerCase();
    if (license.includes('public domain') || 
        license.includes('cc-by') || 
        license.includes('cc0') ||
        license.includes('creative commons')) {
      score += 30;
    } else {
      // Reject if no valid license
      return -1;
    }
  } else if (candidate.source !== 'fallback-icon' && candidate.source !== 'fallback-default') {
    // Reject non-fallback images without license
    return -1;
  }

  // Thumbnail presence (5 points)
  if (candidate.thumbnailUrl) {
    score += 5;
  }

  return score;
}

/**
 * Fetch image from Wikimedia pageimages API
 * 
 * ROBUSTNESS: 
 * - Timeout protection (2.5s)
 * - Response sanitization
 * - Rate limit detection
 * - Graceful failure (never blocks UI)
 */
/**
 * Enhanced Wikimedia image fetch with retry and better search
 */
async function fetchWikimediaImage(keyword: string, signal?: AbortSignal): Promise<ImageCandidate | null> {
  return retryWithBackoff(async () => {
    try {
      if (signal?.aborted) throw new Error('Aborted');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
      
      // Link external signal to internal controller if possible, 
      // or just check signal before fetch.
      // Since we can't easily link signals in older environments, we check signal state.
      if (signal) {
          signal.addEventListener('abort', () => controller.abort());
      }

      // Try multiple search strategies for better results
      const searchStrategies = [
        keyword, // Exact keyword
        keyword.split(' ')[0], // First word
        keyword.replace(/[^a-zA-Z0-9\s]/g, ' ').trim(), // Cleaned keyword
      ];

      for (const searchTerm of searchStrategies) {
        if (!searchTerm) continue;

        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(searchTerm)}&srlimit=3&origin=*`;
        const searchResponse = await fetch(searchUrl, { signal: controller.signal });
        
        if (!searchResponse.ok) continue;
        
        // Check for rate limiting
        if (searchResponse.status === 429 || searchResponse.status === 503) {
          console.warn('Wikimedia rate limit detected');
          continue;
        }

        // Sanitize and parse response
        const { data: searchData, error: parseError } = await safeJsonParse<{
          query?: { search?: Array<{ pageid?: number; title?: string }> };
        }>(searchResponse);
        
        if (parseError || !searchData?.query?.search) continue;
        
        // Try each search result
        for (const result of searchData.query.search) {
          const pageId = result?.pageid;
          if (!pageId || typeof pageId !== 'number') continue;

          // Get page image with larger thumbnail
          const imageUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&pithumbsize=1200&pageids=${pageId}&origin=*`;
          const imageResponse = await fetch(imageUrl, { signal: controller.signal });
          if (!imageResponse.ok) continue;

          // Sanitize and parse image response
          const { data: imageData, error: imageParseError } = await safeJsonParse<{
            query?: { pages?: Record<string, { thumbnail?: { source?: string; width?: number; height?: number } }> };
          }>(imageResponse);
          
          if (imageParseError || !imageData) continue;
          
          const page = imageData?.query?.pages?.[String(pageId)];
          const thumbnail = page?.thumbnail;

          if (!thumbnail?.source) continue;

          const sanitizedUrl = sanitizeImageUrl(thumbnail.source);
          if (!sanitizedUrl) continue;

          clearTimeout(timeoutId);
          return {
            url: sanitizedUrl,
            thumbnailUrl: sanitizedUrl,
            source: 'wikimedia',
            width: thumbnail.width,
            height: thumbnail.height,
            license: 'CC-BY-SA or compatible',
            score: 0,
            alt: result.title || keyword,
          };
        }
      }

      clearTimeout(timeoutId);
      return null;
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Wikimedia fetch error:', error);
      }
      return null;
    }
  });
}

/**
 * Enhanced NASA Images API fetch with best practices
 * Uses proper query parameters, media_type filtering, and better result selection
 */
async function fetchNASAImage(keyword: string, signal?: AbortSignal): Promise<ImageCandidate | null> {
  return retryWithBackoff(async () => {
    try {
      if (signal?.aborted) throw new Error('Aborted');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
      
      if (signal) {
          signal.addEventListener('abort', () => controller.abort());
      }

      // Best practice: Use media_type=image, page_size for pagination, year_start for relevance
      // NASA API best practice: Use specific query parameters for better results
      const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(keyword)}&media_type=image&page_size=5&year_start=2000`;
      const response = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });
      clearTimeout(timeoutId);

      if (!response.ok) return null;
      
      // Check for rate limiting
      if (isRateLimited(response)) {
        console.warn('NASA API rate limit detected');
        return null;
      }

      // Sanitize and parse response
      const { data, error: parseError } = await safeJsonParse<{
        collection?: { 
          items?: Array<{ 
            href?: string; 
            data?: Array<{ 
              title?: string;
              description?: string;
              width?: number; 
              height?: number;
              date_created?: string;
            }> 
          }> 
        };
      }>(response);
      
      if (parseError || !data?.collection?.items) return null;
      
      // Try multiple items to find best image
      for (const item of data.collection.items) {
        const href = item.href;
        const metadata = item.data?.[0];

        // Validate href exists and is a string
        if (!href || typeof href !== 'string') continue;

        // Get actual image URL from links
        try {
          // Use separate timeout for links fetch (2s) - faster than main timeout
          const linksResponse = await fetch(href, { 
            signal: AbortSignal.timeout(2000), // 2s timeout for links
          });
          if (!linksResponse.ok) continue;

          // Sanitize links response
          const { data: linksData, error: linksParseError } = await safeJsonParse<Array<{
            render?: string;
            href?: string;
          }>>(linksResponse);
          
          if (linksParseError || !Array.isArray(linksData)) continue;
          
          // Find best image link (prefer render=image, then check extensions)
          const imageLink = linksData.find((link) =>
            link?.render === 'image' ||
            (link?.href && (
              link.href.endsWith('.jpg') || 
              link.href.endsWith('.jpeg') || 
              link.href.endsWith('.png') || 
              link.href.endsWith('.webp')
            ))
          );

          const sanitizedUrl = sanitizeImageUrl(imageLink?.href);
          if (!sanitizedUrl) continue;

          // Prefer images with good dimensions
          if (metadata?.width && metadata?.height) {
            const totalPixels = metadata.width * metadata.height;
            if (totalPixels < 400 * 400) continue; // Too small
          }

          return {
            url: sanitizedUrl,
            source: 'nasa',
            width: metadata?.width,
            height: metadata?.height,
            license: 'Public Domain', // NASA images are public domain
            score: 0,
            alt: metadata?.title || keyword,
            metadata: {
              ...metadata,
              date_created: metadata?.date_created,
            },
          };
        } catch (linkError) {
          // Continue to next item if link fetch fails
          continue;
        }
      }

      return null;
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('NASA fetch error:', error);
      }
      return null;
    }
  });
}

/**
 * Fetch image from Wikimedia Commons using best practices
 * Uses generator=search for better results and proper imageinfo properties
 */
async function fetchCommonsImageUrl(imageName: string, signal: AbortSignal): Promise<{ url: string; width?: number; height?: number } | null> {
  const fileTitle = `File:${imageName}`;
  // Best practice: Use iiprop=url|size|mime|thumbmime for comprehensive image info
  // Use iiurlwidth for optimal thumbnail size (1200px for good quality)
  const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime|thumbmime&iiurlwidth=1200&titles=${encodeURIComponent(fileTitle)}&origin=*`;
  const response = await fetch(infoUrl, { signal });
  if (!response.ok) return null;

  const { data, error } = await safeJsonParse<{
    query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string; mime?: string; thumbmime?: string; width?: number; height?: number; thumburl?: string }> }> };
  }>(response);
  if (error || !data) return null;

  const pages = data.query?.pages || {};
  const firstPage = Object.values(pages)[0] as { imageinfo?: Array<{ url?: string; mime?: string; thumbmime?: string; width?: number; height?: number; thumburl?: string }> };
  const imageInfo = firstPage?.imageinfo?.[0];
  if (!imageInfo?.url || !imageInfo?.mime?.startsWith('image/')) return null;

  const sanitized = sanitizeImageUrl(imageInfo.url);
  if (!sanitized) return null;

  return {
    url: sanitized,
    width: imageInfo.width,
    height: imageInfo.height,
  };
}

/**
 * Search Wikimedia Commons directly using generator=search (best practice)
 * This is more efficient than searching Wikipedia first
 */
async function fetchWikimediaCommonsImage(keyword: string, signal?: AbortSignal): Promise<ImageCandidate | null> {
  return retryWithBackoff(async () => {
    try {
      if (signal?.aborted) throw new Error('Aborted');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      if (signal) {
          signal.addEventListener('abort', () => controller.abort());
      }

      // Best practice: Use generator=search with gsrsearch for Commons search
      // Use iiprop=url|size|mime for comprehensive image info
      const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(keyword)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|size|mime|thumbmime&iiurlwidth=1200&origin=*`;
      const response = await fetch(searchUrl, { signal: controller.signal });
      
      if (!response.ok || isRateLimited(response)) {
        clearTimeout(timeoutId);
        return null;
      }

      const { data, error } = await safeJsonParse<{
        query?: { pages?: Record<string, { title?: string; imageinfo?: Array<{ url?: string; mime?: string; width?: number; height?: number; thumburl?: string }> }> };
      }>(response);
      
      if (error || !data?.query?.pages) {
        clearTimeout(timeoutId);
        return null;
      }

      // Find best image from results
      const pages = Object.values(data.query.pages);
      for (const page of pages) {
        const imageInfo = page?.imageinfo?.[0];
        if (!imageInfo?.url || !imageInfo?.mime?.startsWith('image/')) continue;

        // Prefer images with good dimensions
        if (imageInfo.width && imageInfo.height) {
          const totalPixels = imageInfo.width * imageInfo.height;
          if (totalPixels < 400 * 400) continue; // Too small
        }

        const sanitized = sanitizeImageUrl(imageInfo.url);
        if (!sanitized) continue;

        clearTimeout(timeoutId);
        return {
          url: sanitized,
          thumbnailUrl: sanitizeImageUrl(imageInfo.thumburl) ?? sanitized,
          source: 'wikimedia',
          width: imageInfo.width,
          height: imageInfo.height,
          license: 'CC-BY-SA or compatible',
          score: 0,
          alt: page.title || keyword,
        };
      }

      clearTimeout(timeoutId);
      return null;
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Wikimedia Commons fetch error:', error);
      }
      return null;
    }
  });
}

/**
 * Fetch image from Wikidata P18 property
 */
async function fetchWikidataImage(keyword: string, signal?: AbortSignal): Promise<ImageCandidate | null> {
  try {
    if (signal?.aborted) return null;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
    
    if (signal) {
        signal.addEventListener('abort', () => controller.abort());
    }

    // Search for entity
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(keyword)}&language=en&format=json&origin=*`;
    const searchResponse = await fetch(searchUrl, { signal: controller.signal });
    
    if (!searchResponse.ok) return null;

    // Sanitize search response
    const { data: searchData, error: searchParseError } = await safeJsonParse<{
      search?: Array<{ id?: string }>;
    }>(searchResponse);
    
    if (searchParseError || !searchData) return null;
    
    const entityId = searchData?.search?.[0]?.id;
    if (!entityId || typeof entityId !== 'string') return null;

    // Get P18 (image) property
    const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&props=claims&format=json&origin=*`;
    const entityResponse = await fetch(entityUrl, { signal: controller.signal });
    if (!entityResponse.ok) return null;
    
    // Check for rate limiting
    if (isRateLimited(entityResponse)) {
      console.warn('Wikidata rate limit detected');
      return null;
    }

    // Sanitize entity response
    const { data: entityData, error: entityParseError } = await safeJsonParse<{
      entities?: Record<string, { claims?: { P18?: Array<{ mainsnak?: { datavalue?: { value?: string } } }> } }>;
    }>(entityResponse);
    
    if (entityParseError || !entityData) return null;
    
    const imageClaim = entityData?.entities?.[entityId]?.claims?.P18?.[0];
    if (!imageClaim?.mainsnak?.datavalue?.value) return null;

    const imageName = imageClaim?.mainsnak?.datavalue?.value;
    if (!imageName || typeof imageName !== 'string') return null;
    
    // Sanitize image name to prevent injection
    const sanitizedName = imageName.replace(/[^a-zA-Z0-9._-]/g, '');
    if (!sanitizedName) return null;

    const commonsImage = await fetchCommonsImageUrl(sanitizedName, controller.signal);
    if (!commonsImage) return null;

    return {
      url: commonsImage.url,
      source: 'wikidata',
      width: commonsImage.width,
      height: commonsImage.height,
      license: 'CC-BY-SA or compatible',
      score: 0,
    };
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error('Wikidata fetch error:', error);
    }
    return null;
  }
}

/**
 * Enhanced Openverse API fetch with best practices
 * Uses proper query parameters, license filtering, size filtering, and pagination
 */
async function fetchOpenverseImage(keyword: string, signal?: AbortSignal): Promise<ImageCandidate | null> {
  return retryWithBackoff(async () => {
    try {
      if (signal?.aborted) throw new Error('Aborted');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      if (signal) {
          signal.addEventListener('abort', () => controller.abort());
      }
      
      // Best practice: Try different search terms for better results
      const searchTerms = [
        keyword,
        keyword.split(' ').slice(0, 2).join(' '), // First two words
        keyword.split(' ')[0], // First word only
      ];

      for (const searchTerm of searchTerms) {
        if (!searchTerm) continue;

        // Best practice: Use proper Openverse API parameters
        // license: Filter by CC licenses (cc0, cc-by, cc-by-sa)
        // size: Filter by size (small, medium, large)
        // page_size: Number of results per page (max 20)
        // aspect_ratio: Optional filter for aspect ratio
        const url = `https://api.openverse.engineering/v1/images/?q=${encodeURIComponent(searchTerm)}&license=cc0,cc-by,cc-by-sa&license_type=commercial,modification&size=medium,large&page_size=5&page=1`;
        const response = await fetch(url, { 
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'DAY-LIGHT/3.0 (+https://daylight.app)',
          },
        });
        
        if (!response.ok || isRateLimited(response)) {
          // Check rate limit headers
          const retryAfter = response.headers.get('retry-after');
          if (retryAfter) {
            console.warn(`Openverse rate limit: retry after ${retryAfter}s`);
          }
          continue;
        }

        const { data, error } = await safeJsonParse<{
          results?: Array<{
            id?: string;
            url?: string;
            thumbnail?: string;
            width?: number;
            height?: number;
            license?: string;
            license_version?: string;
            title?: string;
            creator?: string;
            creator_url?: string;
            foreign_landing_url?: string;
          }>;
          result_count?: number;
        }>(response);
        
        if (error || !data?.results?.length) continue;

        // Try each result to find the best one
        // Best practice: Score results by quality metrics
        const scoredResults = data.results
          .map(image => {
            let score = 0;
            
            // Prefer images with good dimensions
            if (image.width && image.height) {
              const totalPixels = image.width * image.height;
              if (totalPixels >= 800 * 600 && totalPixels <= 2000 * 1500) {
                score += 10; // Optimal size
              } else if (totalPixels >= 400 * 400) {
                score += 5; // Acceptable size
              } else {
                return null; // Too small
              }
              
              // Prefer landscape images
              const aspectRatio = image.width / image.height;
              if (aspectRatio >= 1.2 && aspectRatio <= 2.0) {
                score += 5; // Good aspect ratio
              }
            }
            
            // Prefer CC0 (public domain equivalent)
            if (image.license === 'cc0') {
              score += 5;
            }
            
            return { image, score };
          })
          .filter((item): item is { image: NonNullable<typeof data.results[0]>, score: number } => item !== null)
          .sort((a, b) => b.score - a.score);

        // Try best scored results first
        for (const { image } of scoredResults) {
          const sanitizedUrl = sanitizeImageUrl(image.url);
          if (!sanitizedUrl) continue;

          clearTimeout(timeoutId);
          return {
            url: sanitizedUrl,
            thumbnailUrl: sanitizeImageUrl(image.thumbnail) ?? sanitizedUrl,
            source: 'openverse',
            width: image.width,
            height: image.height,
            license: image.license ? `CC ${image.license.toUpperCase()}${image.license_version ? ` ${image.license_version}` : ''}` : 'Creative Commons',
            score: 0,
            alt: image.title || keyword,
            metadata: {
              id: image.id,
              creator: image.creator,
              creator_url: image.creator_url,
              foreign_landing_url: image.foreign_landing_url,
            },
          };
        }
      }

      clearTimeout(timeoutId);
      return null;
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Openverse fetch error:', error);
      }
      return null;
    }
  });
}

/**
 * Fetch image from StaticPhotos service
 * Best practice: Use category mapping for relevant images
 * Note: StaticPhotos is a simple URL-based service, no API key required
 */
async function fetchStaticPhotosImage(category: Category): Promise<ImageCandidate | null> {
  try {
    const mapped = STATIC_PHOTO_CATEGORY_MAP[category] || 'event';
    
    // Best practice: Use optimal dimensions for web (16:9 aspect ratio)
    // Common sizes: 1200x630 (Facebook), 1920x1080 (Full HD), 1600x900 (HD)
    // We use 1200x630 for good quality and reasonable file size
    const url = `${STATIC_PHOTO_BASE}/${mapped}/1200x630`;
    const sanitizedUrl = sanitizeImageUrl(url);
    if (!sanitizedUrl) return null;
    
    // Validate URL is accessible (non-blocking check)
    // Note: StaticPhotos URLs are deterministic, so we can trust them
    // But we should validate the response is actually an image
    return {
      url: sanitizedUrl,
      source: 'staticphotos',
      license: 'StaticPhotos',
      score: 0,
      requiresValidation: true, // Validate it's actually an image
      alt: `${category} category image`,
    };
  } catch (error) {
    console.error('StaticPhotos fetch error:', error);
    return null;
  }
}

function getLocalFallbackCandidate(category: Category): ImageCandidate {
  return {
    url: getFallbackIconPath(category),
    source: 'fallback-icon',
    license: 'Local Fallback',
    score: 0,
    requiresValidation: false,
    alt: `${category} fallback icon`,
  };
}

function getDefaultPlaceholderCandidate(): ImageCandidate {
  return {
    url: DEFAULT_PLACEHOLDER,
    source: 'fallback-default',
    license: 'Generic Placeholder',
    score: 0,
    requiresValidation: false,
    alt: 'Generic placeholder image',
  };
}

/**
 * Validate and fetch image metadata (check MIME type, size)
 */
export async function validateImage(url: string): Promise<{ valid: boolean; metadata?: Partial<ImageMetadata> }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    const response = await fetch(url, {
      signal: controller.signal,
      method: 'HEAD',
      redirect: 'manual',
    });
    clearTimeout(timeoutId);

    if (!response.ok || (response.status >= 300 && response.status < 400)) {
      return { valid: false };
    }

    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');

    if (!contentType || !contentType.startsWith('image/')) {
      return { valid: false };
    }

    const size = contentLength ? parseInt(contentLength, 10) : undefined;
    if (size && size > 2 * 1024 * 1024) {
      return { valid: false }; // > 2MB
    }

    return {
      valid: true,
      metadata: {
        mimeType: contentType,
        size,
      },
    };
  } catch (error) {
    return { valid: false };
  }
}

/**
 * Enhanced candidate selection with parallel fetching and better scoring
 */
async function selectBestCandidateFromTier(
  fetchers: Array<() => Promise<ImageCandidate | null>>,
  fact: Fact
): Promise<ImageMetadata | null> {
  if (fetchers.length === 0) return null;
  
  // Fetch all candidates in parallel for speed
  const results = await Promise.allSettled(
    fetchers.map(fetcher => fetcher().catch(() => null))
  );
  
  const candidates = results
    .filter((result): result is PromiseFulfilledResult<ImageCandidate | null> => 
      result.status === 'fulfilled' && result.value !== null
    )
    .map(result => result.value as ImageCandidate);
  
  if (candidates.length === 0) return null;

  // Score all candidates
  const scoredCandidates = candidates
    .map(candidate => ({
      candidate,
      score: scoreCandidate(candidate, fact),
    }))
    .filter(item => item.score >= 0)
    .sort((a, b) => {
      // Sort by score, then by source priority
      if (b.score !== a.score) return b.score - a.score;
      const sourcePriority: Record<ImageMetadata['source'], number> = {
        wikimedia: 1,
        wikidata: 2,
        nasa: 3,
        openverse: 4,
        staticphotos: 5,
        'fallback-icon': 6,
        'fallback-default': 7,
      };
      return (sourcePriority[a.candidate.source] || 99) - (sourcePriority[b.candidate.source] || 99);
    });

  // Validate and return best candidate
  for (const item of scoredCandidates) {
    const candidate = item.candidate;
    
    // Skip validation for local fallbacks
    if (candidate.requiresValidation === false) {
      return buildMetadata(candidate, fact);
    }
    
    // Validate remote images
    const validation = await validateImage(candidate.url);
    if (validation.valid) {
      return buildMetadata(candidate, fact, validation.metadata);
    }
  }

  return null;
}

function buildMetadata(
  candidate: ImageCandidate,
  fact: Fact,
  validation?: Partial<ImageMetadata>
): ImageMetadata {
  return {
    url: candidate.url,
    thumbnailUrl: candidate.thumbnailUrl || candidate.url,
    source: candidate.source,
    width: candidate.width,
    height: candidate.height,
    aspectRatio:
      candidate.width && candidate.height ? candidate.width / candidate.height : undefined,
    license: candidate.license,
    alt: candidate.alt || `${fact.title} - ${fact.category}`,
    cachedAt: Date.now(),
    size: validation?.size,
    mimeType: validation?.mimeType,
  };
}

/**
 * Enhanced main image engine: Find best image for a fact
 * Tries multiple keywords and strategies for best results
 */
export async function findImageForFact(fact: Fact, signal?: AbortSignal): Promise<ImageMetadata | null> {
  try {
    if (signal?.aborted) return null;
    // Extract keywords with multiple strategies
    const text = `${fact.title} ${fact.description || ''} ${fact.name || ''}`;
    const keywords = extractKeywords(text);
    
    // Build keyword priority list
    const keywordList: string[] = [];
    
    // Add primary keywords
    if (keywords.length > 0) {
      keywordList.push(keywords[0]);
      if (keywords.length > 1) keywordList.push(keywords[1]);
    }
    
    // Add fact title if not already included
    if (fact.title && !keywordList.includes(fact.title.toLowerCase())) {
      keywordList.push(fact.title);
    }
    
    // Add fact name if available
    if (fact.name && !keywordList.includes(fact.name.toLowerCase())) {
      keywordList.push(fact.name);
    }
    
    // Fallback to title if no keywords
    if (keywordList.length === 0) {
      keywordList.push(fact.title || 'history');
    }
    
    const primaryKeyword = keywordList[0];

    // Build tier fetchers with enhanced strategies
    const tierFetchers: Array<Array<() => Promise<ImageCandidate | null>>> = [
      // Tier 1: High-quality sources (parallel fetch)
      // Best practice: Try multiple sources in parallel for speed
      [
        () => fetchWikimediaImage(primaryKeyword, signal),
        () => fetchWikimediaCommonsImage(primaryKeyword, signal), // Direct Commons search
        () => fetchWikidataImage(primaryKeyword, signal),
        // Try alternative keywords
        ...(keywordList.length > 1 ? [
          () => fetchWikimediaImage(keywordList[1], signal),
          () => fetchWikimediaCommonsImage(keywordList[1], signal),
        ] : []),
      ],
      // Tier 2: Category-specific sources
      fact.category === 'Space' || fact.category === 'Science'
        ? [
            () => fetchNASAImage(primaryKeyword, signal),
            ...(keywordList.length > 1 ? [() => fetchNASAImage(keywordList[1], signal)] : []),
          ]
        : [],
      // Tier 3: Creative Commons sources
      [
        () => fetchOpenverseImage(primaryKeyword, signal),
        ...(keywordList.length > 1 ? [() => fetchOpenverseImage(keywordList[1], signal)] : []),
      ],
      // Tier 4: Static category photos
      [
        () => fetchStaticPhotosImage(fact.category),
      ],
      // Tier 5: Local fallback icons
      [
        async () => getLocalFallbackCandidate(fact.category),
      ],
      // Tier 6: Generic placeholder
      [
        async () => getDefaultPlaceholderCandidate(),
      ],
    ];

    // Try each tier sequentially (but parallel within tier)
    for (const tier of tierFetchers) {
      if (tier.length === 0) continue;
      
      const metadata = await selectBestCandidateFromTier(tier, fact);
      if (metadata) {
        return metadata;
      }
    }

    // Final guard: return generic placeholder (should never reach here)
    return buildMetadata(getDefaultPlaceholderCandidate(), fact);
  } catch (error) {
    console.error('Image engine error:', error);
    // Return fallback instead of null
    return buildMetadata(getLocalFallbackCandidate(fact.category), fact);
  }
}

/**
 * Fetch a gallery of images for a given keyword
 * Aggregates results from multiple sources
 */
/**
 * Fetch a gallery of images for a given keyword
 * Aggregates results from multiple sources
 */
export async function fetchImageGallery(keyword: string, signal?: AbortSignal): Promise<ImageCandidate[]> {
  try {
    if (signal?.aborted) return [];
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 seconds total
    
    if (signal) {
        signal.addEventListener('abort', () => controller.abort());
    }

    // STRATEGY OPTIMIZATION:
    // User reported that previous gallery fetch was disappointing. 
    // We now use the main engine's robust keyword extraction to try multiple angles.
    const keywords = extractKeywords(keyword);
    // Ensure the original keyword is included first if it wasn't extracted
    if (!keywords.includes(keyword)) {
      keywords.unshift(keyword);
    }
    // Also try splitting complex titles?
    if (keyword.split(' ').length > 3) {
      keywords.push(keyword.split(' ').slice(0, 2).join(' ')); // Try shorter phrase
    }

    const allImages: ImageCandidate[] = [];
    const uniqueImages = new Map<string, ImageCandidate>();

    // Parallel fetch for primary keyword
    const fetchForKeyword = async (term: string) => {
      const [nasa, wiki, open] = await Promise.all([
         fetchNASAGalleryImages(term, controller.signal).catch(() => []),
         fetchWikimediaGalleryImages(term, controller.signal).catch(() => []),
         fetchOpenverseGalleryImages(term, controller.signal).catch(() => [])
      ]);
      return [...nasa, ...wiki, ...open];
    };

    // Try primary strategy
    const primaryResults = await fetchForKeyword(keywords[0]);
    primaryResults.forEach(img => uniqueImages.set(img.url, img));

    // If results are thin (< 5), try secondary keywords immediately
    if (uniqueImages.size < 5 && keywords.length > 1) {
       const secondaryResults = await fetchForKeyword(keywords[1]);
       secondaryResults.forEach(img => uniqueImages.set(img.url, img));
    }

    clearTimeout(timeoutId);

    // Sort by score (quality) and shuffle slightly for variety? 
    // For now, simple sort: width*height desc
    return Array.from(uniqueImages.values())
      .sort((a, b) => {
         const scoreA = (a.width || 0) * (a.height || 0);
         const scoreB = (b.width || 0) * (b.height || 0);
         return scoreB - scoreA;
      });

  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Gallery fetch error:', error);
    }
    return [];
  }
}

/**
 * Fetch multiple NASA images
 */
async function fetchNASAGalleryImages(keyword: string, signal: AbortSignal): Promise<ImageCandidate[]> {
    try {
        const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(keyword)}&media_type=image&page_size=25&year_start=1990`;
        const response = await fetch(url, { signal, headers: { 'Accept': 'application/json' } });
        if (!response.ok) return [];

        const { data } = await safeJsonParse<{ collection?: { items?: any[] } }>(response);
        if (!data?.collection?.items) return [];

        const candidates: ImageCandidate[] = [];
        const itemsToProcess = data.collection.items.slice(0, 20); // Increased limit to 20
        
        await Promise.all(itemsToProcess.map(async (item) => {
             const href = item.href;
             const metadata = item.data?.[0];
             if (!href || typeof href !== 'string') return;

             try {
                const linksRes = await fetch(href, { signal });
                if (!linksRes.ok) return;
                const { data: links } = await safeJsonParse<any[]>(linksRes);
                
                // Find medium sized jpg if possible
                const imageLink = links?.find((l: any) => l?.href?.match(/medium\.(jpg|jpeg)$/i)) 
                                || links?.find((l: any) => l?.href?.match(/small\.(jpg|jpeg)$/i))
                                || links?.find((l: any) => l?.render === 'image');

                if (imageLink?.href) {
                     candidates.push({
                         url: imageLink.href,
                         thumbnailUrl: imageLink.href, 
                         source: 'nasa',
                         width: metadata?.width,
                         height: metadata?.height,
                         license: 'Public Domain',
                         score: 10,
                         alt: metadata?.title || keyword
                     });
                }
             } catch (e) { /* ignore individual failures */ }
        }));

        return candidates;
    } catch (e) {
        return [];
    }
}

/**
 * Fetch multiple Wikimedia images
 */
async function fetchWikimediaGalleryImages(keyword: string, signal: AbortSignal): Promise<ImageCandidate[]> {
    try {
        const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(keyword)}&gsrnamespace=6&gsrlimit=25&prop=imageinfo&iiprop=url|size|mime|thumbmime&iiurlwidth=400&origin=*`; // Increased limit to 25
        const response = await fetch(searchUrl, { signal });
        if (!response.ok) return [];

        const { data } = await safeJsonParse<any>(response);
        if (!data?.query?.pages) return [];

        const candidates: ImageCandidate[] = [];
        Object.values(data.query.pages).forEach((page: any) => {
            const info = page?.imageinfo?.[0];
            if (info?.url && info.mime?.startsWith('image/')) {
                 candidates.push({
                     url: info.url,
                     thumbnailUrl: info.thumburl || info.url,
                     source: 'wikimedia',
                     width: info.width,
                     height: info.height,
                     license: 'CC-BY-SA',
                     score: 10,
                     alt: page.title
                 });
            }
        });
        return candidates;
    } catch (e) {
        return [];
    }
}

/**
 * Fetch multiple Openverse images
 */
async function fetchOpenverseGalleryImages(keyword: string, signal: AbortSignal): Promise<ImageCandidate[]> {
    try {
        const url = `https://api.openverse.engineering/v1/images/?q=${encodeURIComponent(keyword)}&license=cc0,cc-by,cc-by-sa&size=medium,large&page_size=25`; // Increased limit to 25
        const response = await fetch(url, { 
            signal,
            headers: { 'Accept': 'application/json', 'User-Agent': 'DAY-LIGHT/3.0' }
        });
        if (!response.ok) return [];
        
        const { data } = await safeJsonParse<any>(response);
        if (!data?.results) return [];

        const candidates: ImageCandidate[] = [];
        data.results.forEach((img: any) => {
             if (img.url) {
                 candidates.push({
                     url: img.url,
                     thumbnailUrl: img.thumbnail || img.url, // Openverse usually provides thumb
                     source: 'openverse',
                     width: img.width,
                     height: img.height,
                     license: 'Creative Commons',
                     score: 10,
                     alt: img.title
                 });
             }
        });
        return candidates;
    } catch (e) {
        return [];
    }
}

