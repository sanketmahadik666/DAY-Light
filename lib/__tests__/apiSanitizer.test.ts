/**
 * Unit tests for apiSanitizer.ts
 * Tests all sanitization, rate limiting, and error handling logic
 */

import {
  isRateLimited,
  safeJsonParse,
  sanitizeString,
  validateApiResponse,
  extractApiError,
  isErrorPage,
} from '../apiSanitizer';

// Mock fetch for Response objects
const createMockResponse = (options: {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  json?: () => Promise<any>;
  text?: () => Promise<string>;
}): Response => {
  return {
    status: options.status || 200,
    statusText: options.statusText || 'OK',
    headers: {
      get: (name: string) => options.headers?.[name] || null,
    },
    json: options.json || (() => Promise.resolve({})),
    text: options.text || (() => Promise.resolve('{}')),
  } as Response;
};

describe('apiSanitizer', () => {
  describe('isRateLimited', () => {
    it('should detect 429 status code', () => {
      const response = createMockResponse({ status: 429 });
      expect(isRateLimited(response)).toBe(true);
    });

    it('should detect 503 status code', () => {
      const response = createMockResponse({ status: 503 });
      expect(isRateLimited(response)).toBe(true);
    });

    it('should detect rate limit header at 0', () => {
      const response = createMockResponse({
        headers: { 'x-ratelimit-remaining': '0' },
      });
      expect(isRateLimited(response)).toBe(true);
    });

    it('should not detect rate limiting for normal responses', () => {
      const response = createMockResponse({ status: 200 });
      expect(isRateLimited(response)).toBe(false);
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON successfully', async () => {
      const mockResponse = createMockResponse({
        text: () => Promise.resolve('{"key": "value"}'),
      });

      const result = await safeJsonParse(mockResponse);
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ key: 'value' });
    });

    it('should reject non-JSON starting text', async () => {
      const mockResponse = createMockResponse({
        text: () => Promise.resolve('Not JSON'),
      });

      const result = await safeJsonParse(mockResponse);
      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Response is not valid JSON');
    });

    it('should handle invalid JSON', async () => {
      const mockResponse = createMockResponse({
        text: () => Promise.resolve('{invalid json}'),
      });

      const result = await safeJsonParse(mockResponse);
      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(Error);
    });

    it('should warn on unexpected content-type', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const mockResponse = createMockResponse({
        headers: { 'content-type': 'text/plain' },
        text: () => Promise.resolve('{"key": "value"}'),
      });

      await safeJsonParse(mockResponse);
      expect(consoleSpy).toHaveBeenCalledWith('Unexpected content-type for JSON:', 'text/plain');
      consoleSpy.mockRestore();
    });
  });

  describe('sanitizeString', () => {
    it('should remove dangerous characters', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert("xss")script');
    });

    it('should limit string length', () => {
      const longString = 'a'.repeat(20000);
      expect(sanitizeString(longString)).toHaveLength(10000);
    });

    it('should handle non-string inputs', () => {
      expect(sanitizeString(null as any)).toBe('');
      expect(sanitizeString(undefined as any)).toBe('');
      expect(sanitizeString(123 as any)).toBe('');
    });

    it('should trim whitespace', () => {
      expect(sanitizeString('  test  ')).toBe('test');
    });
  });

  describe('validateApiResponse', () => {
    it('should reject null/undefined', () => {
      expect(validateApiResponse(null)).toBe(false);
      expect(validateApiResponse(undefined)).toBe(false);
    });

    it('should reject arrays at root level', () => {
      expect(validateApiResponse([])).toBe(false);
    });

    it('should accept valid objects', () => {
      expect(validateApiResponse({ key: 'value' })).toBe(true);
    });

    it('should reject non-objects', () => {
      expect(validateApiResponse('string')).toBe(false);
      expect(validateApiResponse(123)).toBe(false);
    });
  });

  describe('extractApiError', () => {
    it('should extract error from data.error', () => {
      const response = createMockResponse({ status: 400, statusText: 'Bad Request' });
      const data = { error: 'Custom error message' };
      expect(extractApiError(response, data)).toBe('Custom error message');
    });

    it('should extract error from data.error.message', () => {
      const response = createMockResponse({ status: 500 });
      const data = { error: { message: 'Nested error' } };
      expect(extractApiError(response, data)).toBe('Nested error');
    });

    it('should fallback to status text', () => {
      const response = createMockResponse({ status: 404, statusText: 'Not Found' });
      expect(extractApiError(response)).toBe('API error: 404 Not Found');
    });
  });

  describe('isErrorPage', () => {
    it('should detect HTML content-type', () => {
      const response = createMockResponse({
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
      expect(isErrorPage(response)).toBe(true);
    });

    it('should detect 4xx/5xx status codes', () => {
      const response = createMockResponse({ status: 500 });
      expect(isErrorPage(response)).toBe(true);
    });

    it('should not detect success responses', () => {
      const response = createMockResponse({ status: 200 });
      expect(isErrorPage(response)).toBe(false);
    });
  });
});