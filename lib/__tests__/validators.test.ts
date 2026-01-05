import {
  isValidImageMimeType,
  isValidImageSize,
  validateImageMetadata,
  parseFact,
  parseFactEntry,
  FactSchema,
} from '../validators';
import type { Fact, ImageMetadata } from '@/types/fact';

describe('Validators', () => {
  describe('isValidImageMimeType', () => {
    it('should validate allowed mime types', () => {
      expect(isValidImageMimeType('image/jpeg')).toBe(true);
      expect(isValidImageMimeType('image/png')).toBe(true);
      expect(isValidImageMimeType('image/webp')).toBe(true);
    });

    it('should reject invalid mime types', () => {
      expect(isValidImageMimeType('application/json')).toBe(false);
      expect(isValidImageMimeType('text/plain')).toBe(false);
      expect(isValidImageMimeType('image/bmp')).toBe(false);
    });
  });

  describe('isValidImageSize', () => {
    it('should validate correct sizes', () => {
      expect(isValidImageSize(1024)).toBe(true);
      expect(isValidImageSize(2 * 1024 * 1024)).toBe(true);
    });

    it('should reject invalid sizes', () => {
      expect(isValidImageSize(0)).toBe(false);
      expect(isValidImageSize(2 * 1024 * 1024 + 1)).toBe(false);
    });
  });

  describe('validateImageMetadata', () => {
    const validMetadata: ImageMetadata = {
      url: 'https://example.com/image.jpg',
      source: 'wikimedia',
      mimeType: 'image/jpeg',
      size: 1024,
      license: 'CC-BY',
    };

    it('should return valid for correct metadata', () => {
      const result = validateImageMetadata(validMetadata);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate required fields', () => {
      const result = validateImageMetadata({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Image URL is required.');
    });

    it('should validate mime type inside metadata', () => {
      const result = validateImageMetadata({
        ...validMetadata,
        mimeType: 'text/plain',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid MIME type. Must be an image type.');
    });

    it('should validate size inside metadata', () => {
      const result = validateImageMetadata({
        ...validMetadata,
        size: 3 * 1024 * 1024,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Image size exceeds 2MB limit.');
    });
    
     it('should require license for non-fallback sources', () => {
      const result = validateImageMetadata({
        url: 'https://example.com',
        source: 'wikimedia',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('License information is required for non-fallback images.');
    });
    
    it('should NOT require license for fallback sources', () => {
      const result = validateImageMetadata({
        url: 'https://example.com',
        source: 'fallback-default',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('parseFact', () => {
    const validFact = {
      id: '1',
      title: 'Fact Title',
      date: '2023-01-01',
      category: 'Science',
    };

    it('should parse valid fact', () => {
      const result = parseFact(validFact);
      expect(result).toEqual(validFact);
    });

    it('should return null for invalid fact', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const result = parseFact({ ...validFact, date: 'invalid-date' });
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
  
    describe('parseFactEntry', () => {
    const validEntry = {
      date: '2023-01-01',
      facts: [],
      cachedAt: 123456,
      ttl: 3600
    };

    it('should parse valid entry', () => {
      const result = parseFactEntry(validEntry);
      expect(result).toEqual(validEntry);
    });

    it('should return null for invalid entry', () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = parseFactEntry({ ...validEntry, ttl: 'invalid' });
        expect(result).toBeNull();
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
  });
});
