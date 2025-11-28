/**
 * Text helpers, date formatting, slug/normalizeKey utilities
 */

import type { Category } from '@/types/fact';

/**
 * Normalize a string to a slug/key format
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Normalize a key for storage (IndexedDB, etc.)
 */
export function normalizeKey(key: string): string {
  return slugify(key).replace(/\s+/g, '_');
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse YYYY-MM-DD to Date
 */
export function parseDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get date string for today
 */
export function getTodayDateString(): string {
  return formatDate(new Date());
}

/**
 * Extract keywords from fact text
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];
  
  // Remove common stop words and extract meaningful words
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 10); // Limit to top 10 keywords
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Get fallback icon path for category
 */
export function getFallbackIconPath(category: Category): string {
  const iconMap: Record<Category, string> = {
    Birthdays: 'person_silhouette',
    Historical: 'landmark_icon',
    Science: 'atom_or_rocket_icon',
    Finance: 'currency_icon',
    Sports: 'stadium_or_ball_icon',
    Festivals: 'colorful_event_icon',
    Space: 'galaxy_placeholder',
    PopCulture: 'music_or_movie_icon',
    Awards: 'trophy_icon',
    Technology: 'chip_or_circuit_icon',
  };
  return `/fallback/${iconMap[category]}.svg`;
}

/**
 * Check if date string is valid YYYY-MM-DD format
 */
export function isValidDateString(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = parseDate(dateString);
  return !isNaN(date.getTime());
}

/**
 * Get month and day from date string (for API calls)
 */
export function getMonthDay(dateString: string): { month: string; day: string } {
  const [, month, day] = dateString.split('-');
  return { month, day };
}

