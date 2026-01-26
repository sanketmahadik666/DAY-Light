/**
 * Analytics API Routes
 * Handles analytics data collection and reporting
 */

import { Router, Request, Response } from 'express';
import { FactViewEvent, APICallEvent, CategoryPreference } from '../schemas/analytics.schema';

const router = Router();

/**
 * POST /api/analytics/collect
 * Collect analytics data
 */
router.post('/collect', async (req: Request, res: Response) => {
  try {
    const { factViews, apiCalls, timestamp } = req.body;

    // Insert fact views
    if (Array.isArray(factViews) && factViews.length > 0) {
      await FactViewEvent.insertMany(factViews);
    }

    // Insert API calls
    if (Array.isArray(apiCalls) && apiCalls.length > 0) {
      await APICallEvent.insertMany(apiCalls);
    }

    // Update category preferences
    if (Array.isArray(factViews) && factViews.length > 0) {
      const categoryMap = new Map<string, { count: number; duration: number }>();

      factViews.forEach((view: any) => {
        const cat = view.category;
        const stats = categoryMap.get(cat) || { count: 0, duration: 0 };
        stats.count++;
        stats.duration += view.viewDuration || 0;
        categoryMap.set(cat, stats);
      });

      for (const [category, stats] of categoryMap.entries()) {
        await CategoryPreference.findOneAndUpdate(
          { category },
          {
            $inc: {
              viewCount: stats.count,
              totalDuration: stats.duration,
            },
            $set: {
              lastViewed: timestamp || Date.now(),
              date: new Date().toISOString().split('T')[0],
            },
          },
          { upsert: true, new: true }
        ).then((doc) => {
          if (doc) {
            doc.avgDuration = doc.totalDuration / doc.viewCount;
            return doc.save();
          }
        });
      }
    }

    res.json({
      success: true,
      message: 'Analytics data collected',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/analytics/reports
 * Get analytics reports for charts
 */
router.get('/reports', async (req: Request, res: Response) => {
  try {
    const { type, startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string).getTime() : Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
    const end = endDate ? new Date(endDate as string).getTime() : Date.now();

    const reports: any = {};

    // Fact availability time series
    if (!type || type === 'factAvailability' || type === 'all') {
      const factViews = await FactViewEvent.find({
        timestamp: { $gte: start, $lte: end },
      }).sort({ timestamp: 1 });

      const availabilityByDate = new Map<string, number>();
      factViews.forEach((view) => {
        const date = new Date(view.timestamp).toISOString().split('T')[0];
        availabilityByDate.set(date, (availabilityByDate.get(date) || 0) + 1);
      });

      reports.factAvailability = Array.from(availabilityByDate.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }

    // Category preferences (pie chart)
    if (!type || type === 'categoryPreferences' || type === 'all') {
      const preferences = await CategoryPreference.find({}).sort({ viewCount: -1 });
      reports.categoryPreferences = preferences.map((pref) => ({
        name: pref.category,
        value: pref.viewCount,
        avgDuration: pref.avgDuration,
      }));
    }

    // API performance
    if (!type || type === 'apiPerformance' || type === 'all') {
      const apiCalls = await APICallEvent.find({
        timestamp: { $gte: start, $lte: end },
      });

      const endpointStats = new Map<
        string,
        {
          calls: number[];
          success: number;
          errors: number;
        }
      >();

      apiCalls.forEach((call) => {
        const stats = endpointStats.get(call.endpoint) || {
          calls: [],
          success: 0,
          errors: 0,
        };
        stats.calls.push(call.responseTime);
        if (call.success) {
          stats.success++;
        } else {
          stats.errors++;
        }
        endpointStats.set(call.endpoint, stats);
      });

      reports.apiPerformance = Array.from(endpointStats.entries()).map(([endpoint, stats]) => {
        const sorted = stats.calls.sort((a, b) => a - b);
        const p95Index = Math.floor(sorted.length * 0.95);

        return {
          endpoint,
          totalCalls: stats.calls.length,
          successCount: stats.success,
          errorCount: stats.errors,
          avgResponseTime: stats.calls.reduce((a, b) => a + b, 0) / stats.calls.length,
          minResponseTime: sorted[0] || 0,
          maxResponseTime: sorted[sorted.length - 1] || 0,
          p95ResponseTime: sorted[p95Index] || 0,
          responseTimes: stats.calls, // For scatter plot
        };
      });
    }

    // API response time over time (line chart)
    if (!type || type === 'apiTimeline' || type === 'all') {
      const apiCalls = await APICallEvent.find({
        timestamp: { $gte: start, $lte: end },
      })
        .sort({ timestamp: 1 })
        .limit(1000); // Limit for performance

      const timeline = new Map<string, { timestamp: number; responseTime: number; endpoint: string }[]>();

      apiCalls.forEach((call) => {
        const hour = new Date(call.timestamp).toISOString().slice(0, 13) + ':00:00';
        const data = timeline.get(hour) || [];
        data.push({
          timestamp: call.timestamp,
          responseTime: call.responseTime,
          endpoint: call.endpoint,
        });
        timeline.set(hour, data);
      });

      reports.apiTimeline = Array.from(timeline.entries()).map(([hour, data]) => ({
        hour,
        avgResponseTime: data.reduce((a, b) => a + b.responseTime, 0) / data.length,
        count: data.length,
        endpoints: Array.from(new Set(data.map((d) => d.endpoint))),
      }));
    }

    res.json({
      success: true,
      data: reports,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
