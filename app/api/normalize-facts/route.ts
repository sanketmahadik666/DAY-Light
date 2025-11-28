/**
 * Serverless Fact Normalization Worker
 * 
 * CRITICAL ROBUSTNESS RULES:
 * - Never block client (returns quickly)
 * - Always validates input/output
 * - Gracefully handles failures
 * - Sanitizes all data
 * 
 * Purpose:
 * - Cleans raw API data
 * - Removes duplicates
 * - Extends descriptions
 * - Assigns categories correctly
 * - Validates dates (handles BC/BCE)
 * - Returns normalized facts
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Fact, Category } from '@/types/fact';
import { FactSchema, parseFact } from '@/lib/validators';
import { sanitizeString } from '@/lib/apiSanitizer';

const MAX_FACTS = 50; // Limit to prevent abuse
const TIMEOUT_MS = 2000; // 2s timeout

interface NormalizeRequest {
  facts: unknown[];
  date: string;
  category?: Category;
}

/**
 * Validate and parse date (handles BC/BCE)
 */
function parseDateWithBCE(dateStr: string | number | undefined): { year: number | null; isBCE: boolean } {
  if (!dateStr) return { year: null, isBCE: false };
  
  const str = String(dateStr).trim();
  const isBCE = /BCE?$/i.test(str) || str.startsWith('-');
  
  // Extract numeric year
  const yearMatch = str.match(/-?\d+/);
  if (!yearMatch) return { year: null, isBCE: false };
  
  let year = parseInt(yearMatch[0], 10);
  if (isBCE && year > 0) {
    year = -year; // Convert to negative for BCE
  }
  
  // Sanity check: reasonable year range
  if (year < -10000 || year > new Date().getFullYear() + 10) {
    return { year: null, isBCE: false };
  }
  
  return { year, isBCE };
}

/**
 * Remove duplicates based on title similarity
 */
function removeDuplicates(facts: Fact[]): Fact[] {
  const seen = new Set<string>();
  const normalized = new Map<string, Fact>();
  
  for (const fact of facts) {
    // Normalize title for comparison
    const normalizedTitle = fact.title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .trim()
      .slice(0, 100);
    
    // Check if we've seen a similar title
    if (seen.has(normalizedTitle)) {
      continue; // Skip duplicate
    }
    
    seen.add(normalizedTitle);
    normalized.set(fact.id, fact);
  }
  
  return Array.from(normalized.values());
}

/**
 * Extend description with additional context
 */
function extendDescription(fact: Fact): string {
  let description = fact.description || fact.title;
  
  // Add year if available
  if (fact.year) {
    const yearStr = fact.year < 0 ? `${Math.abs(fact.year)} BCE` : `${fact.year}`;
    if (!description.includes(yearStr)) {
      description = `${description} (${yearStr})`;
    }
  }
  
  // Add category context if missing
  if (fact.category && !description.toLowerCase().includes(fact.category.toLowerCase())) {
    // Only add if description is short
    if (description.length < 200) {
      description = `${description} - ${fact.category} event`;
    }
  }
  
  return sanitizeString(description).slice(0, 1000); // Limit length
}

/**
 * Assign category based on content analysis
 */
function assignCategory(fact: Fact, defaultCategory?: Category): Category {
  // If already has valid category, keep it
  if (fact.category && ['Birthdays', 'Historical', 'Science', 'Finance', 'Sports', 'Festivals', 'Space', 'PopCulture', 'Awards', 'Technology'].includes(fact.category)) {
    return fact.category;
  }
  
  // Use default if provided
  if (defaultCategory) {
    return defaultCategory;
  }
  
  // Analyze title/description for category hints
  const text = `${fact.title} ${fact.description || ''}`.toLowerCase();
  
  // Category keywords
  const categoryKeywords: Record<Category, string[]> = {
    Birthdays: ['born', 'birthday', 'birth', 'birthplace'],
    Historical: ['war', 'battle', 'treaty', 'declared', 'established', 'founded'],
    Science: ['discovered', 'invented', 'scientific', 'experiment', 'theory', 'nobel'],
    Finance: ['currency', 'bank', 'stock', 'market', 'economic', 'financial'],
    Sports: ['championship', 'olympic', 'world cup', 'tournament', 'athlete', 'sport'],
    Festivals: ['holiday', 'festival', 'celebration', 'tradition', 'ceremony'],
    Space: ['space', 'astronaut', 'nasa', 'planet', 'moon', 'mars', 'galaxy'],
    PopCulture: ['movie', 'film', 'music', 'album', 'song', 'award', 'oscar', 'grammy'],
    Awards: ['award', 'prize', 'nobel', 'pulitzer', 'oscar', 'grammy', 'trophy'],
    Technology: ['computer', 'software', 'internet', 'technology', 'digital', 'ai', 'algorithm'],
  };
  
  // Score each category
  let bestCategory: Category = 'Historical'; // Default
  let bestScore = 0;
  
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    const score = keywords.filter(keyword => text.includes(keyword)).length;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as Category;
    }
  }
  
  return bestCategory;
}

/**
 * Normalize a single fact
 */
function normalizeFact(rawFact: unknown, date: string, category?: Category): Fact | null {
  // Parse and validate
  const parsed = parseFact(rawFact);
  if (!parsed) return null;
  
  // Parse date with BCE support
  const { year, isBCE } = parseDateWithBCE(parsed.year);
  
  // Assign category
  const assignedCategory = assignCategory(parsed, category);
  
  // Extend description
  const extendedDescription = extendDescription({
    ...parsed,
    year: year || undefined,
    category: assignedCategory,
  });
  
  // Build normalized fact
  const normalized: Fact = {
    id: parsed.id || `${date}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: sanitizeString(parsed.title).slice(0, 500),
    description: extendedDescription,
    name: parsed.name ? sanitizeString(parsed.name).slice(0, 200) : undefined,
    date,
    category: assignedCategory,
    year: year || undefined,
    source: parsed.source || 'normalized',
    sourceUrl: parsed.sourceUrl,
    imageUrl: parsed.imageUrl,
    imageMetadata: parsed.imageMetadata,
  };
  
  return normalized;
}

/**
 * POST /api/normalize-facts
 * Normalizes raw fact data from APIs
 */
export async function POST(request: NextRequest) {
  try {
    // Timeout protection
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    const body = await request.json().catch(() => null);
    clearTimeout(timeoutId);
    
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }
    
    const { facts, date, category } = body as NormalizeRequest;
    
    // Validate input
    if (!Array.isArray(facts)) {
      return NextResponse.json(
        { error: 'Facts must be an array' },
        { status: 400 }
      );
    }
    
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'Invalid date format (YYYY-MM-DD required)' },
        { status: 400 }
      );
    }
    
    // Limit array size
    const limitedFacts = facts.slice(0, MAX_FACTS);
    
    // Normalize each fact
    const normalized: Fact[] = [];
    for (const rawFact of limitedFacts) {
      const normalizedFact = normalizeFact(rawFact, date, category);
      if (normalizedFact) {
        normalized.push(normalizedFact);
      }
    }
    
    // Remove duplicates
    const deduplicated = removeDuplicates(normalized);
    
    // Return normalized facts
    return NextResponse.json({
      facts: deduplicated,
      count: deduplicated.length,
      normalized: true,
    });
    
  } catch (error) {
    console.error('Fact normalization error:', error);
    
    // Always return something, even on error
    return NextResponse.json(
      { 
        error: 'Normalization failed',
        facts: [],
        count: 0,
        normalized: false,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/normalize-facts (health check)
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'fact-normalization-worker',
    version: '3.0-final',
  });
}

