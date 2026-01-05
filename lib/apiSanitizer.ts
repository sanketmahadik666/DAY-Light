/**
 * API Response Sanitization Utilities
 * 
 * CRITICAL: Always sanitize external API responses before use
 * Protects against: malformed JSON, XSS, rate limits, unexpected formats
 */

/**
 * Check if response indicates rate limiting
 */
export function isRateLimited(response: Response): boolean {
  const status = response.status;
  const retryAfter = response.headers.get('retry-after');
  
  // 429 = Too Many Requests, 503 = Service Unavailable
  if (status === 429 || status === 503) {
    return true;
  }
  
  // Check for rate limit headers
  const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
  if (rateLimitRemaining === '0') {
    return true;
  }
  
  return false;
}

/**
 * Safely parse JSON with error handling
 */
export async function safeJsonParse<T>(response: Response): Promise<{ data: T | null; error: Error | null }> {
  try {
    // Check content-type
    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('application/json') && !contentType.includes('text/json')) {
      // Some APIs return JSON with text/plain, so we'll still try
      // But log a warning in development
      if (typeof window !== 'undefined' && (window as any).__DEV__) {
        console.warn('Unexpected content-type for JSON:', contentType);
      }
    }

    const text = await response.text();
    
    // Basic sanity check - should start with { or [
    if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      return {
        data: null,
        error: new Error('Response is not valid JSON'),
      };
    }

    const data = JSON.parse(text) as T;
    return { data, error: null };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
         // Propagate abort error
         throw error;
    }
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Failed to parse JSON'),
    };
  }
}

/**
 * Sanitize string to prevent XSS (basic)
 */
export function sanitizeString(str: string): string {
  if (typeof str !== 'string') return '';
  
  // Remove potentially dangerous characters
  return str
    .replace(/[<>]/g, '') // Remove < and >
    .trim()
    .slice(0, 10000); // Limit length
}

/**
 * Validate API response structure
 */
export function validateApiResponse(data: unknown): data is Record<string, unknown> {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  
  // Should be an object (not array at root)
  if (Array.isArray(data)) {
    return false;
  }
  
  return true;
}

/**
 * Extract error message from API response
 */
export function extractApiError(response: Response, data?: unknown): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const error = (data as { error: unknown }).error;
    if (typeof error === 'string') {
      return error;
    }
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return String((error as { message: unknown }).message);
    }
  }
  
  return `API error: ${response.status} ${response.statusText}`;
}

/**
 * Check if response is likely an error page (HTML)
 */
export function isErrorPage(response: Response): boolean {
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('text/html')) {
    return true;
  }
  
  // Check status
  if (response.status >= 400) {
    return true;
  }
  
  return false;
}

