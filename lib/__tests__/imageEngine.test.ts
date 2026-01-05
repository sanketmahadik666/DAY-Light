/**
 * Unit tests for imageEngine.ts
 * Tests image fetching, scoring, validation, and fallback logic
 */

import { findImageForFact, validateImage } from '../imageEngine';
import type { Fact, ImageMetadata } from '@/types/fact';

// Mock fetch
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('imageEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

// Mock apiSanitizer
jest.mock('@/lib/apiSanitizer', () => ({
  safeJsonParse: jest.fn(async (response) => {
      if (response && response.text) {
          try {
             const text = await response.text();
             const data = JSON.parse(text);
             return { data, error: null };
          } catch (e) {
             return { data: null, error: e };
          }
      }
      return { data: null, error: 'Invalid response' };
  }),
  isRateLimited: jest.fn().mockReturnValue(false),
}));

  describe('validateImage', () => {
    it('should accept valid image URLs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'image/jpeg';
            if (name === 'content-length') return '100000';
            return null;
          },
        },
      } as Response);

      const result = await validateImage('https://example.com/img.jpg');
      expect(result.valid).toBe(true);
    });

    it('should reject HTML content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => 'text/html',
        },
      } as Response);

      const result = await validateImage('https://example.com/img.jpg');
      expect(result.valid).toBe(false);
    });

    it('should reject oversized images', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'image/jpeg';
            if (name === 'content-length') return '3000000'; // 3MB
            return null;
          },
        },
      } as Response);

      const result = await validateImage('https://example.com/img.jpg');
      expect(result.valid).toBe(false);
    });
  });

  describe('findImageForFact', () => {
    const baseFact: Fact = {
      id: '1',
      title: 'Test Fact',
      description: 'A test fact about science',
      category: 'Science',
      date: '2024-01-01',
      source: 'test',
    };

    it('should return fallback when all sources fail', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      const result = await findImageForFact(baseFact);
      expect(result).not.toBeNull();
      expect(result?.source).toBe('fallback-default'); // or 'fallback-icon' depending on logic
    });

    it('should return image metadata when validation succeeds', async () => {
      // Mock fetch based on URL
      mockFetch.mockImplementation(async (urlInput) => {
         const url = urlInput.toString();
         if (url.includes('action=query&format=json&list=search')) {
             return {
                 ok: true,
                 text: () => Promise.resolve('{"query":{"search":[{"pageid":123}]}}'),
                 headers: { get: () => 'application/json' }
             } as unknown as Response;
         }
         if (url.includes('prop=pageimages')) {
             return {
                 ok: true,
                 text: () => Promise.resolve('{"query":{"pages":{"123":{"thumbnail":{"source":"https://example.com/img.jpg","width":400,"height":300}}}}}'),
                 headers: { get: () => 'application/json' }
             } as unknown as Response;
         }
         if (url === 'https://example.com/img.jpg') {
             return {
                 ok: true,
                 headers: {
                    get: (name: string) => {
                        if (name === 'content-type') return 'image/jpeg';
                        if (name === 'content-length') return '100000';
                        return null;
                    }
                 }
             } as unknown as Response;
         }
         // Fail others
         return { ok: false, status: 404 } as unknown as Response;
      });

      const result = await findImageForFact(baseFact);
      expect(result).toBeDefined();
      expect(result?.url).toBe('https://example.com/img.jpg');
      expect(result?.source).toBe('wikimedia');
    });

    it('should handle timeout gracefully', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      // Mock fetch to simulate abort or just generic failure
      mockFetch.mockImplementation(() => Promise.reject(abortError));

      const result = await findImageForFact(baseFact);
      // Should result in fallback
      expect(result?.source).toContain('fallback');
    });

    it('should try NASA for Science category', async () => {
      const scienceFact = { ...baseFact, category: 'Science' as const };
      
      mockFetch.mockImplementation(async (urlInput) => {
         const url = urlInput.toString();
         if (url.includes('images-api.nasa.gov')) {
            return {
                ok: true,
                text: () => Promise.resolve('{"collection":{"items":[{"href":"https://nasa.gov/img"}]}}'),
                headers: { get: () => 'application/json' }
            } as unknown as Response;
         }
         if (url === 'https://nasa.gov/img') {
             return {
                 ok: true,
                 text: () => Promise.resolve('[{"render":"image","href":"https://nasa.gov/final.jpg"}]'),
                 headers: { get: () => 'application/json' }
             } as unknown as Response;
         }
         if (url === 'https://nasa.gov/final.jpg') {
            return {
                ok: true,
                 headers: {
                    get: (name: string) => {
                        if (name === 'content-type') return 'image/jpeg';
                        if (name === 'content-length') return '100000';
                        return null;
                    }
                 }
            } as unknown as Response;
         }
         return { ok: false, status: 404 } as unknown as Response;
      });

      const result = await findImageForFact(scienceFact);
      
      // Since parallel execution, NASA fetch should resolve.
      // However, Wikimedia fetch (Tier 1) also runs in parallel?
      // No, Tier 1 is Wikimedia. Tier 2 is NASA.
      // Logic: tries Tier 1. If Tier 1 returns null, tries Tier 2.
      // My mock fails Wikimedia (returns 404), so it should fall through to NASA.
      
      expect(result?.source).toBe('nasa');
    });
  });
});