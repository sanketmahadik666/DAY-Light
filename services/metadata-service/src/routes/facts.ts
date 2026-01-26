/**
 * Facts API Routes
 * Handles CRUD operations for facts
 */

import { Router, Request, Response } from 'express';
import { Fact } from '../schemas/fact.schema';
import { rateLimiters } from '../middleware/rate-limiter';
import { redisCache } from '../services/redis-cache';
import { asyncHandler, OperationalError } from '../middleware/error-handler';

const router = Router();

/**
 * GET /api/facts?date=YYYY-MM-DD&category=...
 * Get facts for a specific date (with caching)
 */
router.get('/', rateLimiters.facts, asyncHandler(async (req: Request, res: Response) => {
  const { date, category, year, limit = 50, offset = 0 } = req.query;

  const query: any = {};
  
  if (date) {
    query.date = date;
  }
  
  if (category) {
    query.category = category;
  }
  
  if (year) {
    query.year = parseInt(year as string);
  }

  // Build cache key
  const cacheKey = `facts:${JSON.stringify(query)}:${limit}:${offset}`;

  // Try cache first
  const cached = await redisCache.get<any>(cacheKey, 'facts');
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(cached);
  }

  const facts = await Fact.find(query)
    .sort({ year: -1, createdAt: -1 })
    .limit(parseInt(limit as string))
    .skip(parseInt(offset as string))
    .lean();

  const response = {
    success: true,
    data: facts,
    count: facts.length,
  };

  // Cache for 5 minutes
  await redisCache.set(cacheKey, response, { ttl: 300, prefix: 'facts' });

  res.setHeader('X-Cache', 'MISS');
  res.json(response);
}));

/**
 * GET /api/facts/:id
 * Get single fact by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const fact = await Fact.findOne({ id: req.params.id }).lean();

    if (!fact) {
      return res.status(404).json({
        success: false,
        error: 'Fact not found',
      });
    }

    res.json({
      success: true,
      data: fact,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/facts
 * Create new fact
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const factData = req.body;

    // Validate required fields
    if (!factData.id || !factData.title || !factData.date || !factData.category) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: id, title, date, category',
      });
    }

    // Build search text for full-text search
    const searchText = [
      factData.title,
      factData.description,
      factData.name,
    ]
      .filter(Boolean)
      .join(' ');

    const fact = new Fact({
      ...factData,
      searchText,
      keywords: extractKeywords(searchText),
    });

    await fact.save();

    res.status(201).json({
      success: true,
      data: fact.toObject(),
    });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Fact with this ID already exists',
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/facts/:id
 * Update fact
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const fact = await Fact.findOne({ id: req.params.id });

    if (!fact) {
      return res.status(404).json({
        success: false,
        error: 'Fact not found',
      });
    }

    // Update fields
    Object.assign(fact, req.body);

    // Rebuild search text if text fields changed
    if (req.body.title || req.body.description || req.body.name) {
      const searchText = [
        fact.title,
        fact.description,
        fact.name,
      ]
        .filter(Boolean)
        .join(' ');
      
      fact.searchText = searchText;
      fact.keywords = extractKeywords(searchText);
    }

    await fact.save();

    res.json({
      success: true,
      data: fact.toObject(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/facts/:id
 * Delete fact
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const fact = await Fact.findOneAndDelete({ id: req.params.id });

    if (!fact) {
      return res.status(404).json({
        success: false,
        error: 'Fact not found',
      });
    }

    res.json({
      success: true,
      message: 'Fact deleted',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/facts/search?q=query&category=...&year=...&date=...&fuzzy=true
 * Enhanced search with filters and fuzzy matching
 */
router.get('/search', rateLimiters.search, asyncHandler(async (req: Request, res: Response) => {
  const { q, category, year, date, limit = 20, offset = 0, sortBy = 'relevance', fuzzy = 'true' } = req.query;

  if (!q) {
    throw new OperationalError('Query parameter "q" is required', 400);
  }

  const { searchService } = await import('../services/search-service');
  
  const result = await searchService.search({
    query: q as string,
    category: category as string,
    year: year ? parseInt(year as string) : undefined,
    date: date as string,
    limit: parseInt(limit as string),
    offset: parseInt(offset as string),
    sortBy: sortBy as 'relevance' | 'date' | 'year',
    fuzzy: fuzzy === 'true',
  });

  res.json({
    success: true,
    data: result.facts,
    count: result.facts.length,
    total: result.total,
    query: result.query,
    filters: result.filters,
  });
}));

/**
 * GET /api/facts/autocomplete?q=query
 * Get autocomplete suggestions
 */
router.get('/autocomplete', rateLimiters.search, asyncHandler(async (req: Request, res: Response) => {
  const { q, limit = 10 } = req.query;

  if (!q || (q as string).length < 2) {
    return res.json({
      success: true,
      data: { suggestions: [] },
    });
  }

  const { searchService } = await import('../services/search-service');
  const result = await searchService.autocomplete(q as string, parseInt(limit as string));

  res.json({
    success: true,
    data: result,
  });
}));

/**
 * GET /api/facts/suggestions?q=query
 * Get search suggestions
 */
router.get('/suggestions', rateLimiters.search, asyncHandler(async (req: Request, res: Response) => {
  const { q } = req.query;

  if (!q || (q as string).length < 2) {
    return res.json({
      success: true,
      data: [],
    });
  }

  const { searchService } = await import('../services/search-service');
  const suggestions = await searchService.getSuggestions(q as string);

  res.json({
    success: true,
    data: suggestions,
  });
}));

/**
 * Helper: Extract keywords from text
 */
function extractKeywords(text: string): string[] {
  // Simple keyword extraction (can be enhanced with NLP)
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .filter((word, index, arr) => arr.indexOf(word) === index); // Unique

  return words.slice(0, 10); // Top 10 keywords
}

export default router;
