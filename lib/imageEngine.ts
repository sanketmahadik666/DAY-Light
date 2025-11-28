/**
 * Image Engine: Finds, scores, and selects the best image candidate
 * Must gracefully fail, never block UI
 */

import type { Fact, ImageMetadata, Category } from '@/types/fact';
import { extractKeywords } from '@/utils/helpers';
import { validateImageMetadata } from '@/lib/validators';
import { safeJsonParse, isRateLimited } from '@/lib/apiSanitizer';

const API_TIMEOUT = 2500; // 2.5 seconds

interface ImageCandidate {
  url: string;
  thumbnailUrl?: string;
  source: ImageMetadata['source'];
  width?: number;
  height?: number;
  license?: string;
  score: number;
  metadata?: any;
}

/**
 * Score an image candidate based on multiple factors
 */
function scoreCandidate(candidate: ImageCandidate, fact: Fact): number {
  let score = 0;

  // Source authority (40 points max)
  const sourceScores: Record<ImageMetadata['source'], number> = {
    wikimedia: 40,
    nasa: 35,
    wikidata: 25,
    static: 10,
    fallback: 0,
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
  } else if (candidate.source !== 'fallback') {
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
async function fetchWikimediaImage(keyword: string): Promise<ImageCandidate | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(keyword)}&srlimit=1&origin=*`;
    const searchResponse = await fetch(searchUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!searchResponse.ok) return null;
    
    // Check for rate limiting
    if (searchResponse.status === 429 || searchResponse.status === 503) {
      console.warn('Wikimedia rate limit detected');
      return null;
    }

    // Sanitize and parse response
    const { data: searchData, error: parseError } = await safeJsonParse<{
      query?: { search?: Array<{ pageid?: number }> };
    }>(searchResponse);
    
    if (parseError || !searchData) return null;
    
    const pageId = searchData?.query?.search?.[0]?.pageid;
    if (!pageId || typeof pageId !== 'number') return null;

    // Get page image
    const imageUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&pithumbsize=800&pageids=${pageId}&origin=*`;
    const imageResponse = await fetch(imageUrl, { signal: controller.signal });
    if (!imageResponse.ok) return null;

    // Sanitize and parse image response
    const { data: imageData, error: imageParseError } = await safeJsonParse<{
      query?: { pages?: Record<string, { thumbnail?: { source?: string; width?: number; height?: number } }> };
    }>(imageResponse);
    
    if (imageParseError || !imageData) return null;
    
    const page = imageData?.query?.pages?.[String(pageId)];
    const thumbnail = page?.thumbnail;

    if (!thumbnail?.source) return null;

    return {
      url: thumbnail.source,
      thumbnailUrl: thumbnail.source,
      source: 'wikimedia',
      width: thumbnail.width,
      height: thumbnail.height,
      license: 'CC-BY-SA or compatible', // Wikimedia default
      score: 0, // Will be scored later
    };
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error('Wikimedia fetch error:', error);
    }
    return null;
  }
}

/**
 * Fetch image from NASA API (for Science/Space categories)
 */
async function fetchNASAImage(keyword: string): Promise<ImageCandidate | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(keyword)}&media_type=image&page_size=1`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    
    // Check for rate limiting
    if (isRateLimited(response)) {
      console.warn('NASA API rate limit detected');
      return null;
    }

    // Sanitize and parse response
    const { data, error: parseError } = await safeJsonParse<{
      collection?: { items?: Array<{ href?: string; data?: Array<{ width?: number; height?: number }> }> };
    }>(response);
    
    if (parseError || !data) return null;
    
    const item = data?.collection?.items?.[0];
    if (!item) return null;

    const href = item.href;
    const metadata = item.data?.[0];

    // Validate href exists and is a string
    if (!href || typeof href !== 'string') return null;

    // Get actual image URL from links
    const linksResponse = await fetch(href, { signal: controller.signal });
    if (!linksResponse.ok) return null;

    // Sanitize links response
    const { data: linksData, error: linksParseError } = await safeJsonParse<Array<{
      render?: string;
      href?: string;
    }>>(linksResponse);
    
    if (linksParseError || !Array.isArray(linksData)) return null;
    
    const imageLink = linksData.find((link) => 
      link?.render === 'image' || 
      (link?.href && (link.href.endsWith('.jpg') || link.href.endsWith('.png') || link.href.endsWith('.webp')))
    );

    if (!imageLink?.href) return null;

    return {
      url: imageLink.href,
      source: 'nasa',
      width: metadata?.width,
      height: metadata?.height,
      license: 'Public Domain', // NASA images are public domain
      score: 0,
      metadata,
    };
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error('NASA fetch error:', error);
    }
    return null;
  }
}

/**
 * Fetch image from Wikidata P18 property
 */
async function fetchWikidataImage(keyword: string): Promise<ImageCandidate | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

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
    
    const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(sanitizedName)}?width=800`;

    return {
      url: imageUrl,
      source: 'wikidata',
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
 * Validate and fetch image metadata (check MIME type, size)
 */
export async function validateImage(url: string): Promise<{ valid: boolean; metadata?: Partial<ImageMetadata> }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    const response = await fetch(url, { 
      signal: controller.signal,
      method: 'HEAD', // Only fetch headers
    });
    clearTimeout(timeoutId);

    if (!response.ok) return { valid: false };

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
 * Main image engine: Find best image for a fact
 */
export async function findImageForFact(fact: Fact): Promise<ImageMetadata | null> {
  try {
    // Extract keywords
    const text = `${fact.title} ${fact.description || ''} ${fact.name || ''}`;
    const keywords = extractKeywords(text);
    const primaryKeyword = keywords[0] || fact.title;

    // Fetch from multiple sources in parallel
    const sources: Promise<ImageCandidate | null>[] = [];

    // Always try Wikimedia first (highest authority)
    sources.push(fetchWikimediaImage(primaryKeyword));

    // Try Wikidata
    sources.push(fetchWikidataImage(primaryKeyword));

    // Try NASA for Science/Space categories
    if (fact.category === 'Science' || fact.category === 'Space') {
      sources.push(fetchNASAImage(primaryKeyword));
    }

    // Wait for all sources (with timeout)
    const results = await Promise.allSettled(sources);
    const candidates: ImageCandidate[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        candidates.push(result.value);
      }
    }

    if (candidates.length === 0) {
      return null; // No candidates found, will use fallback
    }

    // Score all candidates
    const scoredCandidates = candidates
      .map(candidate => ({
        ...candidate,
        score: scoreCandidate(candidate, fact),
      }))
      .filter(c => c.score >= 0) // Remove rejected candidates
      .sort((a, b) => b.score - a.score); // Sort by score descending

    if (scoredCandidates.length === 0) {
      return null;
    }

    const bestCandidate = scoredCandidates[0];

    // Validate the image
    const validation = await validateImage(bestCandidate.url);
    if (!validation.valid) {
      return null;
    }

    // Build metadata
    const metadata: ImageMetadata = {
      url: bestCandidate.url,
      thumbnailUrl: bestCandidate.thumbnailUrl || bestCandidate.url,
      source: bestCandidate.source,
      width: bestCandidate.width,
      height: bestCandidate.height,
      aspectRatio: bestCandidate.width && bestCandidate.height
        ? bestCandidate.width / bestCandidate.height
        : undefined,
      license: bestCandidate.license,
      alt: `${fact.title} - ${fact.category}`,
      cachedAt: Date.now(),
      size: validation.metadata?.size,
      mimeType: validation.metadata?.mimeType,
    };

    return metadata;
  } catch (error) {
    console.error('Image engine error:', error);
    return null; // Gracefully fail
  }
}

