/**
 * Zod schemas and validation helpers for API payloads
 */

import { z } from 'zod';
import type { Category, Fact, ImageMetadata } from '@/types/fact';

/**
 * Category enum schema
 */
export const CategorySchema = z.enum([
  'Birthdays',
  'Historical',
  'Science',
  'Finance',
  'Sports',
  'Festivals',
  'Space',
  'PopCulture',
  'Awards',
  'Technology',
]);

/**
 * Image metadata schema
 */
export const ImageMetadataSchema = z.object({
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  source: z.enum(['wikimedia', 'wikidata', 'nasa', 'static', 'fallback']),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  aspectRatio: z.number().positive().optional(),
  license: z.string().optional(),
  alt: z.string().optional(),
  cachedAt: z.number().optional(),
  size: z.number().positive().max(2 * 1024 * 1024).optional(), // Max 2MB
  mimeType: z.string().regex(/^image\//).optional(),
});

/**
 * Fact schema
 */
export const FactSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  name: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  category: CategorySchema,
  year: z.number().int().positive().optional(),
  source: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  imageMetadata: ImageMetadataSchema.optional(),
});

/**
 * Fact entry (cached facts for a date)
 */
export const FactEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  facts: z.array(FactSchema),
  cachedAt: z.number(),
  ttl: z.number().positive(),
});

/**
 * Validate image MIME type
 */
export function isValidImageMimeType(mimeType: string): boolean {
  return /^image\/(jpeg|jpg|png|webp|avif|gif|svg)$/i.test(mimeType);
}

/**
 * Validate image size (max 2MB)
 */
export function isValidImageSize(size: number): boolean {
  return size > 0 && size <= 2 * 1024 * 1024; // 2MB
}

/**
 * Validate image metadata
 */
export function validateImageMetadata(metadata: Partial<ImageMetadata>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (metadata.mimeType && !isValidImageMimeType(metadata.mimeType)) {
    errors.push('Invalid MIME type. Must be an image type.');
  }

  if (metadata.size !== undefined && !isValidImageSize(metadata.size)) {
    errors.push('Image size exceeds 2MB limit.');
  }

  if (!metadata.url) {
    errors.push('Image URL is required.');
  }

  if (!metadata.license && metadata.source !== 'fallback') {
    errors.push('License information is required for non-fallback images.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parse and validate fact from API response
 */
export function parseFact(data: unknown): Fact | null {
  try {
    return FactSchema.parse(data);
  } catch (error) {
    console.error('Failed to parse fact:', error);
    return null;
  }
}

/**
 * Parse and validate fact entry
 */
export function parseFactEntry(data: unknown) {
  try {
    return FactEntrySchema.parse(data);
  } catch (error) {
    console.error('Failed to parse fact entry:', error);
    return null;
  }
}

