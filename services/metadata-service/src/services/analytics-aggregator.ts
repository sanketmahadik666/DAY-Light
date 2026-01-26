/**
 * Analytics Aggregator Service
 * Processes raw events and generates aggregated reports
 * All computation happens server-side for efficiency
 */

import {
  RawFactViewEvent,
  RawAPICallEvent,
  RawImageLoadEvent,
  FactAvailabilityReport,
  CategoryPreferenceReport,
  APIPerformanceReport,
  ImageLoadPerformanceReport,
} from '../schemas/analytics.schema';

export class AnalyticsAggregator {
  /**
   * Aggregate fact availability by date
   */
  async aggregateFactAvailability(startDate: number, endDate: number): Promise<void> {
    const pipeline = [
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: '$date',
          factCount: { $addToSet: '$factId' },
          totalViews: { $sum: 1 },
          avgViewDuration: { $avg: '$viewDuration' },
          categories: {
            $push: {
              category: '$category',
              factId: '$factId',
            },
          },
        },
      },
      {
        $project: {
          date: '$_id',
          uniqueFacts: { $size: '$factCount' },
          totalViews: 1,
          avgViewDuration: { $ifNull: ['$avgViewDuration', 0] },
          categories: {
            $reduce: {
              input: '$categories',
              initialValue: [],
              in: {
                $concatArrays: [
                  '$$value',
                  {
                    $cond: {
                      if: { $in: ['$$this.category', '$$value.category'] },
                      then: [],
                      else: [
                        {
                          category: '$$this.category',
                          count: {
                            $size: {
                              $filter: {
                                input: '$categories',
                                as: 'cat',
                                cond: { $eq: ['$$cat.category', '$$this.category'] },
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ];

    const results = await RawFactViewEvent.aggregate(pipeline);

    // Upsert reports
    for (const result of results) {
      await FactAvailabilityReport.findOneAndUpdate(
        { date: result.date },
        {
          $set: {
            factCount: result.uniqueFacts,
            uniqueFacts: result.uniqueFacts,
            totalViews: result.totalViews,
            avgViewDuration: result.avgViewDuration,
            categories: result.categories,
            reportDate: new Date().toISOString().split('T')[0],
            lastUpdated: Date.now(),
          },
        },
        { upsert: true }
      );
    }
  }

  /**
   * Aggregate category preferences
   */
  async aggregateCategoryPreferences(startDate: number, endDate: number): Promise<void> {
    const pipeline = [
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: '$category',
          totalViews: { $sum: 1 },
          uniqueFacts: { $addToSet: '$factId' },
          totalDuration: { $sum: { $ifNull: ['$viewDuration', 0] } },
          lastViewed: { $max: '$timestamp' },
          factIds: { $push: '$factId' },
        },
      },
      {
        $project: {
          category: '$_id',
          totalViews: 1,
          uniqueFacts: { $size: '$uniqueFacts' },
          totalDuration: 1,
          avgDuration: { $divide: ['$totalDuration', '$totalViews'] },
          lastViewed: 1,
          factIds: {
            $slice: [
              {
                $reduce: {
                  input: '$factIds',
                  initialValue: [],
                  in: {
                    $cond: {
                      if: { $in: ['$$this', '$$value'] },
                      then: '$$value',
                      else: { $concatArrays: ['$$value', ['$$this']] },
                    },
                  },
                },
              },
              10, // Top 10 facts
            ],
          },
        },
      },
    ];

    const results = await RawFactViewEvent.aggregate(pipeline);

    // Upsert reports
    for (const result of results) {
      await CategoryPreferenceReport.findOneAndUpdate(
        { category: result.category },
        {
          $set: {
            totalViews: result.totalViews,
            uniqueFacts: result.uniqueFacts,
            totalDuration: result.totalDuration,
            avgDuration: result.avgDuration,
            lastViewed: result.lastViewed,
            factIds: result.factIds,
            reportDate: new Date().toISOString().split('T')[0],
            lastUpdated: Date.now(),
          },
        },
        { upsert: true }
      );
    }
  }

  /**
   * Aggregate API performance metrics
   */
  async aggregateAPIPerformance(startDate: number, endDate: number): Promise<void> {
    const pipeline = [
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            endpoint: '$endpoint',
            method: '$method',
          },
          calls: { $push: '$$ROOT' },
          totalCalls: { $sum: 1 },
          successCount: {
            $sum: { $cond: ['$success', 1, 0] },
          },
          errorCount: {
            $sum: { $cond: ['$success', 0, 1] },
          },
          responseTimes: { $push: '$responseTime' },
          requestSizes: { $push: { $ifNull: ['$requestSize', 0] } },
          responseSizes: { $push: { $ifNull: ['$responseSize', 0] } },
        },
      },
      {
        $project: {
          endpoint: '$_id.endpoint',
          method: '$_id.method',
          totalCalls: 1,
          successCount: 1,
          errorCount: 1,
          responseTimes: 1,
          requestSizes: 1,
          responseSizes: 1,
        },
      },
    ];

    const results = await RawAPICallEvent.aggregate(pipeline);

    // Calculate percentiles and upsert
    for (const result of results) {
      const sortedTimes = [...result.responseTimes].sort((a, b) => a - b);
      const sortedRequestSizes = [...result.requestSizes].sort((a, b) => a - b);
      const sortedResponseSizes = [...result.responseSizes].sort((a, b) => a - b);

      const getPercentile = (arr: number[], p: number) => {
        const index = Math.floor(arr.length * p);
        return arr[index] || 0;
      };

      const avgResponseTime = sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length;
      const avgRequestSize = sortedRequestSizes.reduce((a, b) => a + b, 0) / sortedRequestSizes.length;
      const avgResponseSize = sortedResponseSizes.reduce((a, b) => a + b, 0) / sortedResponseSizes.length;

      await APIPerformanceReport.findOneAndUpdate(
        { endpoint: result.endpoint, method: result.method },
        {
          $set: {
            totalCalls: result.totalCalls,
            successCount: result.successCount,
            errorCount: result.errorCount,
            avgResponseTime,
            minResponseTime: sortedTimes[0] || 0,
            maxResponseTime: sortedTimes[sortedTimes.length - 1] || 0,
            p50ResponseTime: getPercentile(sortedTimes, 0.5),
            p95ResponseTime: getPercentile(sortedTimes, 0.95),
            p99ResponseTime: getPercentile(sortedTimes, 0.99),
            totalRequestSize: sortedRequestSizes.reduce((a, b) => a + b, 0),
            totalResponseSize: sortedResponseSizes.reduce((a, b) => a + b, 0),
            avgRequestSize,
            avgResponseSize,
            reportDate: new Date().toISOString().split('T')[0],
            lastUpdated: Date.now(),
          },
        },
        { upsert: true }
      );
    }
  }

  /**
   * Aggregate image load performance
   */
  async aggregateImageLoadPerformance(startDate: number, endDate: number): Promise<void> {
    const pipeline = [
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { $ifNull: ['$storageProvider', 'external'] },
          loads: { $push: '$$ROOT' },
          totalLoads: { $sum: 1 },
          successCount: {
            $sum: { $cond: ['$success', 1, 0] },
          },
          errorCount: {
            $sum: { $cond: ['$success', 0, 1] },
          },
          loadTimes: { $push: '$loadTime' },
          factIds: { $addToSet: '$factId' },
        },
      },
      {
        $project: {
          storageProvider: '$_id',
          totalLoads: 1,
          successCount: 1,
          errorCount: 1,
          loadTimes: 1,
          factIds: 1,
        },
      },
    ];

    const results = await RawImageLoadEvent.aggregate(pipeline);

    // Calculate metrics and upsert
    for (const result of results) {
      const sortedTimes = [...result.loadTimes].sort((a, b) => a - b);
      const avgLoadTime = sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length;
      const p95Index = Math.floor(sortedTimes.length * 0.95);

      await ImageLoadPerformanceReport.findOneAndUpdate(
        {
          storageProvider: result.storageProvider,
          reportDate: new Date().toISOString().split('T')[0],
        },
        {
          $set: {
            totalLoads: result.totalLoads,
            successCount: result.successCount,
            errorCount: result.errorCount,
            avgLoadTime,
            minLoadTime: sortedTimes[0] || 0,
            maxLoadTime: sortedTimes[sortedTimes.length - 1] || 0,
            p95LoadTime: sortedTimes[p95Index] || 0,
            factIds: result.factIds,
            lastUpdated: Date.now(),
          },
        },
        { upsert: true }
      );
    }
  }

  /**
   * Run all aggregations for a date range
   */
  async aggregateAll(startDate: number, endDate: number): Promise<void> {
    await Promise.all([
      this.aggregateFactAvailability(startDate, endDate),
      this.aggregateCategoryPreferences(startDate, endDate),
      this.aggregateAPIPerformance(startDate, endDate),
      this.aggregateImageLoadPerformance(startDate, endDate),
    ]);
  }
}

export const analyticsAggregator = new AnalyticsAggregator();
