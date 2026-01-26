/**
 * Enhanced Search Service
 * Provides advanced search with filters, autocomplete, and fuzzy matching
 */

import { Fact } from '../schemas/fact.schema';
import { redisCache } from './redis-cache';

export interface SearchOptions {
  query: string;
  category?: string;
  year?: number;
  date?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'relevance' | 'date' | 'year';
  fuzzy?: boolean;
}

export interface SearchResult {
  facts: any[];
  total: number;
  query: string;
  filters: {
    category?: string;
    year?: number;
    date?: string;
  };
}

export interface AutocompleteResult {
  suggestions: Array<{
    text: string;
    type: 'title' | 'category' | 'keyword';
    count?: number;
  }>;
}

class SearchService {
  /**
   * Enhanced search with filters and fuzzy matching
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const {
      query,
      category,
      year,
      date,
      limit = 20,
      offset = 0,
      sortBy = 'relevance',
      fuzzy = true,
    } = options;

    // Build query
    const mongoQuery: any = {};

    // Text search
    if (query && query.trim()) {
      if (fuzzy) {
        // Fuzzy search using regex
        const searchRegex = new RegExp(
          query
            .split(' ')
            .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|'),
          'i'
        );
        mongoQuery.$or = [
          { title: searchRegex },
          { description: searchRegex },
          { name: searchRegex },
          { searchText: searchRegex },
          { keywords: { $in: query.toLowerCase().split(' ') } },
        ];
      } else {
        // Exact text search
        mongoQuery.$text = { $search: query };
      }
    }

    // Filters
    if (category) {
      mongoQuery.category = category;
    }

    if (year) {
      mongoQuery.year = year;
    }

    if (date) {
      mongoQuery.date = date;
    }

    // Build sort
    let sort: any = {};
    if (sortBy === 'relevance' && query && !fuzzy) {
      sort = { score: { $meta: 'textScore' } };
    } else if (sortBy === 'date') {
      sort = { date: -1 };
    } else if (sortBy === 'year') {
      sort = { year: -1 };
    } else {
      sort = { createdAt: -1 };
    }

    // Execute query
    const queryBuilder = Fact.find(mongoQuery);

    if (sortBy === 'relevance' && query && !fuzzy) {
      queryBuilder.select({ score: { $meta: 'textScore' } });
    }

    const facts = await queryBuilder
      .sort(sort)
      .limit(parseInt(limit.toString()))
      .skip(parseInt(offset.toString()))
      .lean();

    // Get total count (cached)
    const cacheKey = `search:count:${JSON.stringify(mongoQuery)}`;
    const cachedCount = await redisCache.get<number>(cacheKey, 'search');

    let total: number;
    if (cachedCount !== null) {
      total = cachedCount;
    } else {
      total = await Fact.countDocuments(mongoQuery);
      // Cache count for 5 minutes
      await redisCache.set(cacheKey, total, { ttl: 300, prefix: 'search' });
    }

    return {
      facts,
      total,
      query: query || '',
      filters: {
        category,
        year,
        date,
      },
    };
  }

  /**
   * Autocomplete suggestions
   */
  async autocomplete(query: string, limit: number = 10): Promise<AutocompleteResult> {
    if (!query || query.length < 2) {
      return { suggestions: [] };
    }

    // Check cache
    const cacheKey = `autocomplete:${query.toLowerCase()}`;
    const cached = await redisCache.get<AutocompleteResult>(cacheKey, 'search');
    if (cached) {
      return cached;
    }

    const searchRegex = new RegExp(
      query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i'
    );

    const suggestions: AutocompleteResult['suggestions'] = [];

    // Title suggestions
    const titleMatches = await Fact.find(
      { title: searchRegex },
      { title: 1, _id: 0 }
    )
      .limit(limit)
      .lean();

    titleMatches.forEach((fact: any) => {
      if (fact.title) {
        suggestions.push({
          text: fact.title,
          type: 'title',
        });
      }
    });

    // Category suggestions
    const categoryMatches = await Fact.distinct('category', {
      category: searchRegex,
    });

    categoryMatches.slice(0, 5).forEach((cat) => {
      suggestions.push({
        text: cat,
        type: 'category',
      });
    });

    // Keyword suggestions
    const keywordMatches = await Fact.find(
      { keywords: { $in: [new RegExp(query, 'i')] } },
      { keywords: 1, _id: 0 }
    )
      .limit(limit)
      .lean();

    keywordMatches.forEach((fact: any) => {
      if (fact.keywords) {
        fact.keywords
          .filter((k: string) => k.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 3)
          .forEach((keyword: string) => {
            if (!suggestions.find((s) => s.text === keyword)) {
              suggestions.push({
                text: keyword,
                type: 'keyword',
              });
            }
          });
      }
    });

    // Remove duplicates and limit
    const unique = suggestions
      .filter((s, index, self) => self.findIndex((t) => t.text === s.text) === index)
      .slice(0, limit);

    const result = { suggestions: unique };

    // Cache for 1 minute
    await redisCache.set(cacheKey, result, { ttl: 60, prefix: 'search' });

    return result;
  }

  /**
   * Get popular searches
   */
  async getPopularSearches(limit: number = 10): Promise<Array<{ query: string; count: number }>> {
    // This would typically come from analytics
    // For now, return empty or use keyword frequency
    const popularKeywords = await Fact.aggregate([
      { $unwind: '$keywords' },
      { $group: { _id: '$keywords', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);

    return popularKeywords.map((item) => ({
      query: item._id,
      count: item.count,
    }));
  }

  /**
   * Get search suggestions based on current query
   */
  async getSuggestions(query: string): Promise<string[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const cacheKey = `suggestions:${query.toLowerCase()}`;
    const cached = await redisCache.get<string[]>(cacheKey, 'search');
    if (cached) {
      return cached;
    }

    const searchRegex = new RegExp(
      `^${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      'i'
    );

    const suggestions = await Fact.distinct('title', {
      title: searchRegex,
    });

    const result = suggestions.slice(0, 10);

    // Cache for 5 minutes
    await redisCache.set(cacheKey, result, { ttl: 300, prefix: 'search' });

    return result;
  }
}

export const searchService = new SearchService();
