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

    it('should return null when all sources fail', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await findImageForFact(baseFact);
      expect(result).toBeNull();
    });

    it('should return image metadata when validation succeeds', async () => {
      // Mock Wikipedia search
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('{"query":{"search":[{"pageid":123}]}}'),
      } as Response);

      // Mock Wikipedia image API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('{"query":{"pages":{"123":{"thumbnail":{"source":"https://example.com/img.jpg","width":400,"height":300}}}}}'),
      } as Response);

      // Mock image validation
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

      const result = await findImageForFact(baseFact);
      expect(result).toBeDefined();
      expect(result?.url).toBe('https://example.com/img.jpg');
      expect(result?.source).toBe('wikimedia');
    });

    it('should handle timeout gracefully', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      const result = await findImageForFact(baseFact);
      expect(result).toBeNull();
    });

    it('should try NASA for Science category', async () => {
      const scienceFact = { ...baseFact, category: 'Science' as const };

      // Mock all fetches to fail except NASA
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Mock NASA API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('{"collection":{"items":[{"href":"https://nasa.gov/img"}]}}'),
      } as Response);

      // Mock NASA links API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('[{"render":"image","href":"https://nasa.gov/final.jpg"}]'),
      } as Response);

      // Mock validation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => 'image/jpeg',
        },
      } as Response);

      const result = await findImageForFact(scienceFact);
      expect(result?.source).toBe('nasa');
    });
  });
});