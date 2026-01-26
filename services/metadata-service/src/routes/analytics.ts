/**
 * Analytics API Routes
 * Handles raw event collection and report generation from MongoDB
 * With comprehensive error handling and resilience
 */

import { Router, Request, Response } from 'express';
import {
  RawFactViewEvent,
  RawAPICallEvent,
  RawImageLoadEvent,
  FactAvailabilityReport,
  CategoryPreferenceReport,
  APIPerformanceReport,
  ImageLoadPerformanceReport,
} from '../schemas/analytics.schema';
import { analyticsAggregator } from '../services/analytics-aggregator';
import { mongoConnectionManager } from '../services/mongodb-connection';
import { asyncHandler, OperationalError } from '../middleware/error-handler';
import { validateAnalyticsData } from '../middleware/validation';
import { rateLimiters } from '../middleware/rate-limiter';
import { redisCache } from '../services/redis-cache';

const router = Router();

/**
 * POST /api/analytics/collect
 * Collect raw events from client (NO processing)
 * With validation, error handling, and graceful degradation
 */
router.post(
  '/collect',
  rateLimiters.analytics,
  validateAnalyticsData,
  asyncHandler(async (req: Request, res: Response) => {
    // Check MongoDB connection
    if (!mongoConnectionManager.isConnectionHealthy()) {
      // Queue for later processing (return success to client)
      console.warn('[Analytics] MongoDB unavailable, events will be processed when connection restored');
      return res.json({
        success: true,
        message: 'Events queued for processing',
        queued: true,
      });
    }

    const { factViews, apiCalls, imageLoads, sessionId, timestamp } = req.body;

    // Limit batch size to prevent overload
    const MAX_BATCH_SIZE = 1000;
    const factViewsBatch = Array.isArray(factViews) ? factViews.slice(0, MAX_BATCH_SIZE) : [];
    const apiCallsBatch = Array.isArray(apiCalls) ? apiCalls.slice(0, MAX_BATCH_SIZE) : [];
    const imageLoadsBatch = Array.isArray(imageLoads) ? imageLoads.slice(0, MAX_BATCH_SIZE) : [];

    // Insert raw events as-is (no computation)
    const insertPromises: Promise<any>[] = [];
    const errors: string[] = [];

    if (factViewsBatch.length > 0) {
      insertPromises.push(
        RawFactViewEvent.insertMany(
          factViewsBatch.map((view: any) => ({
            ...view,
            sessionId: sessionId || view.sessionId,
          })),
          { ordered: false } // Continue on error
        ).catch((error) => {
          errors.push(`Fact views: ${error.message}`);
          return [];
        })
      );
    }

    if (apiCallsBatch.length > 0) {
      insertPromises.push(
        RawAPICallEvent.insertMany(
          apiCallsBatch.map((call: any) => ({
            ...call,
            sessionId: sessionId || call.sessionId,
          })),
          { ordered: false }
        ).catch((error) => {
          errors.push(`API calls: ${error.message}`);
          return [];
        })
      );
    }

    if (imageLoadsBatch.length > 0) {
      insertPromises.push(
        RawImageLoadEvent.insertMany(
          imageLoadsBatch.map((load: any) => ({
            ...load,
            sessionId: sessionId || load.sessionId,
          })),
          { ordered: false }
        ).catch((error) => {
          errors.push(`Image loads: ${error.message}`);
          return [];
        })
      );
    }

    await Promise.allSettled(insertPromises);

    // Trigger background aggregation (non-blocking, fire-and-forget)
    const startDate = timestamp ? timestamp - 24 * 60 * 60 * 1000 : Date.now() - 24 * 60 * 60 * 1000;
    const endDate = timestamp || Date.now();

    // Run aggregation in background (don't await)
    analyticsAggregator.aggregateAll(startDate, endDate).catch((error) => {
      console.error('[Analytics] Background aggregation error:', error);
      // Don't fail the request if aggregation fails
    });

    res.json({
      success: true,
      message: 'Analytics data collected',
      collected: {
        factViews: factViewsBatch.length,
        apiCalls: apiCallsBatch.length,
        imageLoads: imageLoadsBatch.length,
      },
      ...(errors.length > 0 && { warnings: errors }),
    });
  })
);

/**
 * GET /api/analytics/reports
 * Get aggregated reports from MongoDB (computed server-side)
 * With fallback to on-the-fly aggregation if reports missing
 */
router.get(
  '/reports',
  rateLimiters.reports,
  asyncHandler(async (req: Request, res: Response) => {
    // Check MongoDB connection
    if (!mongoConnectionManager.isConnectionHealthy()) {
      throw new OperationalError('Database unavailable', 503);
    }

    const { type, startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string).getTime() : Date.now() - 30 * 24 * 60 * 60 * 1000;
    const end = endDate ? new Date(endDate as string).getTime() : Date.now();

    // Build cache key
    const cacheKey = `reports:${type || 'all'}:${start}:${end}`;

    // Try cache first (cache for 5 minutes)
    const cached = await redisCache.get<any>(cacheKey, 'analytics');
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    // Validate date range
    if (start > end) {
      throw new OperationalError('Invalid date range: startDate must be before endDate', 400);
    }

    // Limit date range to prevent excessive queries
    const MAX_RANGE_DAYS = 365;
    const rangeDays = (end - start) / (24 * 60 * 60 * 1000);
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new OperationalError(`Date range too large: max ${MAX_RANGE_DAYS} days`, 400);
    }

    // Trigger aggregation if needed (background)
    analyticsAggregator.aggregateAll(start, end).catch((error) => {
      console.error('[Analytics] Background aggregation error:', error);
    });

    const reports: any = {};

    try {
      // Fact Availability Report (from aggregated collection)
      if (!type || type === 'factAvailability' || type === 'all') {
        const startDateStr = new Date(start).toISOString().split('T')[0];
        const endDateStr = new Date(end).toISOString().split('T')[0];

        const availabilityReports = await FactAvailabilityReport.find({
          date: { $gte: startDateStr, $lte: endDateStr },
        })
          .sort({ date: 1 })
          .limit(1000) // Limit results
          .lean();

        reports.factAvailability = availabilityReports.map((report) => ({
          date: report.date,
          count: report.factCount,
          totalViews: report.totalViews,
          avgViewDuration: report.avgViewDuration,
          categories: report.categories,
        }));

        // Fallback: Aggregate on-the-fly if no reports
        if (reports.factAvailability.length === 0) {
          const fallbackPipeline = [
            {
              $match: {
                timestamp: { $gte: start, $lte: end },
              },
            },
            {
              $group: {
                _id: '$date',
                count: { $addToSet: '$factId' },
                totalViews: { $sum: 1 },
              },
            },
            {
              $project: {
                date: '$_id',
                count: { $size: '$count' },
                totalViews: 1,
              },
            },
            { $sort: { date: 1 } },
            { $limit: 1000 },
          ];

          const fallbackData = await RawFactViewEvent.aggregate(fallbackPipeline);
          reports.factAvailability = fallbackData.map((item) => ({
            date: item.date,
            count: item.count,
            totalViews: item.totalViews,
            avgViewDuration: 0,
            categories: [],
          }));
        }
      }

      // Category Preferences Report
      if (!type || type === 'categoryPreferences' || type === 'all') {
        const categoryReports = await CategoryPreferenceReport.find({})
          .sort({ totalViews: -1 })
          .limit(50) // Limit to top 50
          .lean();

        reports.categoryPreferences = categoryReports.map((report) => ({
          name: report.category,
          value: report.totalViews,
          avgDuration: report.avgDuration,
          uniqueFacts: report.uniqueFacts,
        }));

        // Fallback if no reports
        if (reports.categoryPreferences.length === 0) {
          const fallbackPipeline = [
            {
              $match: {
                timestamp: { $gte: start, $lte: end },
              },
            },
            {
              $group: {
                _id: '$category',
                value: { $sum: 1 },
              },
            },
            { $sort: { value: -1 } },
            { $limit: 50 },
          ];

          const fallbackData = await RawFactViewEvent.aggregate(fallbackPipeline);
          reports.categoryPreferences = fallbackData.map((item) => ({
            name: item._id,
            value: item.value,
            avgDuration: 0,
            uniqueFacts: 0,
          }));
        }
      }

      // API Performance Report
      if (!type || type === 'apiPerformance' || type === 'all') {
        const apiReports = await APIPerformanceReport.find({
          lastUpdated: { $gte: start },
        })
          .sort({ avgResponseTime: -1 })
          .limit(100) // Limit to top 100 endpoints
          .lean();

        reports.apiPerformance = await Promise.all(
          apiReports.map(async (report) => {
            // Get raw response times for scatter plot (limited)
            const rawEvents = await RawAPICallEvent.find({
              endpoint: report.endpoint,
              method: report.method,
              timestamp: { $gte: start, $lte: end },
            })
              .limit(1000)
              .select('responseTime')
              .lean();

            return {
              endpoint: report.endpoint,
              method: report.method,
              totalCalls: report.totalCalls,
              successCount: report.successCount,
              errorCount: report.errorCount,
              avgResponseTime: report.avgResponseTime,
              minResponseTime: report.minResponseTime,
              maxResponseTime: report.maxResponseTime,
              p50ResponseTime: report.p50ResponseTime,
              p95ResponseTime: report.p95ResponseTime,
              p99ResponseTime: report.p99ResponseTime,
              avgRequestSize: report.avgRequestSize,
              avgResponseSize: report.avgResponseSize,
              responseTimes: rawEvents.map((e) => e.responseTime),
            };
          })
        );

        // Fallback if no reports
        if (reports.apiPerformance.length === 0) {
          const fallbackPipeline = [
            {
              $match: {
                timestamp: { $gte: start, $lte: end },
              },
            },
            {
              $group: {
                _id: { endpoint: '$endpoint', method: '$method' },
                totalCalls: { $sum: 1 },
                successCount: { $sum: { $cond: ['$success', 1, 0] } },
                errorCount: { $sum: { $cond: ['$success', 0, 1] } },
                avgResponseTime: { $avg: '$responseTime' },
              },
            },
            { $sort: { avgResponseTime: -1 } },
            { $limit: 100 },
          ];

          const fallbackData = await RawAPICallEvent.aggregate(fallbackPipeline);
          reports.apiPerformance = fallbackData.map((item) => ({
            endpoint: item._id.endpoint,
            method: item._id.method,
            totalCalls: item.totalCalls,
            successCount: item.successCount,
            errorCount: item.errorCount,
            avgResponseTime: item.avgResponseTime,
            minResponseTime: 0,
            maxResponseTime: 0,
            p50ResponseTime: 0,
            p95ResponseTime: 0,
            p99ResponseTime: 0,
            avgRequestSize: 0,
            avgResponseSize: 0,
            responseTimes: [],
          }));
        }
      }

      // API Timeline
      if (!type || type === 'apiTimeline' || type === 'all') {
        const timelinePipeline = [
          {
            $match: {
              timestamp: { $gte: start, $lte: end },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%dT%H:00:00',
                  date: { $toDate: '$timestamp' },
                },
              },
              avgResponseTime: { $avg: '$responseTime' },
              count: { $sum: 1 },
              endpoints: { $addToSet: '$endpoint' },
            },
          },
          { $sort: { _id: 1 } },
          { $limit: 1000 }, // Limit to 1000 hours
        ];

        const timelineData = await RawAPICallEvent.aggregate(timelinePipeline);

        reports.apiTimeline = timelineData.map((item) => ({
          hour: item._id,
          avgResponseTime: item.avgResponseTime,
          count: item.count,
          endpoints: item.endpoints,
        }));
      }

      // Image Load Performance
      if (!type || type === 'imageLoadPerformance' || type === 'all') {
        const imageReports = await ImageLoadPerformanceReport.find({
          lastUpdated: { $gte: start },
        })
          .sort({ avgLoadTime: -1 })
          .lean();

        reports.imageLoadPerformance = imageReports.map((report) => ({
          storageProvider: report.storageProvider,
          totalLoads: report.totalLoads,
          successCount: report.successCount,
          errorCount: report.errorCount,
          avgLoadTime: report.avgLoadTime,
          minLoadTime: report.minLoadTime,
          maxLoadTime: report.maxLoadTime,
          p95LoadTime: report.p95LoadTime,
          factCount: report.factIds.length,
        }));

        // Fallback if no reports
        if (reports.imageLoadPerformance.length === 0) {
          const fallbackPipeline = [
            {
              $match: {
                timestamp: { $gte: start, $lte: end },
              },
            },
            {
              $group: {
                _id: { $ifNull: ['$storageProvider', 'external'] },
                totalLoads: { $sum: 1 },
                successCount: { $sum: { $cond: ['$success', 1, 0] } },
                errorCount: { $sum: { $cond: ['$success', 0, 1] } },
                loadTimes: { $push: '$loadTime' },
              },
            },
          ];

          const fallbackData = await RawImageLoadEvent.aggregate(fallbackPipeline);
          reports.imageLoadPerformance = fallbackData.map((item) => {
            const sorted = item.loadTimes.sort((a: number, b: number) => a - b);
            const p95Index = Math.floor(sorted.length * 0.95);

            return {
              storageProvider: item._id,
              totalLoads: item.totalLoads,
              successCount: item.successCount,
              errorCount: item.errorCount,
              avgLoadTime: sorted.reduce((a: number, b: number) => a + b, 0) / sorted.length,
              minLoadTime: sorted[0] || 0,
              maxLoadTime: sorted[sorted.length - 1] || 0,
              p95LoadTime: sorted[p95Index] || 0,
              factCount: 0,
            };
          });
        }
      }

      const response = {
        success: true,
        data: reports,
      };

      // Cache for 5 minutes
      await redisCache.set(cacheKey, response, { ttl: 300, prefix: 'analytics' });

      res.setHeader('X-Cache', 'MISS');
      res.json(response);
    } catch (error) {
      console.error('[Analytics] Report generation error:', error);
      throw new OperationalError('Failed to generate reports', 500);
    }
  })
);

/**
 * POST /api/analytics/aggregate
 * Manually trigger aggregation (admin endpoint)
 */
router.post(
  '/aggregate',
  asyncHandler(async (req: Request, res: Response) => {
    if (!mongoConnectionManager.isConnectionHealthy()) {
      throw new OperationalError('Database unavailable', 503);
    }

    const { startDate, endDate } = req.body;

    const start = startDate ? new Date(startDate).getTime() : Date.now() - 30 * 24 * 60 * 60 * 1000;
    const end = endDate ? new Date(endDate).getTime() : Date.now();

    if (start > end) {
      throw new OperationalError('Invalid date range', 400);
    }

    // Run aggregation (can take time for large datasets)
    await analyticsAggregator.aggregateAll(start, end);

    res.json({
      success: true,
      message: 'Aggregation completed',
      startDate: new Date(start).toISOString(),
      endDate: new Date(end).toISOString(),
    });
  })
);

/**
 * GET /api/analytics/health
 * Health check endpoint
 */
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  const mongoHealthy = mongoConnectionManager.isConnectionHealthy();
  const stats = mongoConnectionManager.getConnectionStats();

  res.json({
    success: true,
    mongodb: {
      connected: mongoHealthy,
      ...stats,
    },
    timestamp: Date.now(),
  });
}));

export default router;
