/**
 * Analytics Aggregation Cron Job
 * Runs periodically to aggregate raw events into reports
 * Can be scheduled via node-cron or external scheduler
 */

import { analyticsAggregator } from '../services/analytics-aggregator';

/**
 * Run aggregation for last 24 hours
 */
export async function runDailyAggregation(): Promise<void> {
  const endDate = Date.now();
  const startDate = endDate - 24 * 60 * 60 * 1000; // 24 hours ago

  console.log(`[Analytics] Starting daily aggregation: ${new Date(startDate).toISOString()} to ${new Date(endDate).toISOString()}`);

  try {
    await analyticsAggregator.aggregateAll(startDate, endDate);
    console.log('[Analytics] Daily aggregation completed successfully');
  } catch (error) {
    console.error('[Analytics] Daily aggregation failed:', error);
    throw error;
  }
}

/**
 * Run aggregation for last 7 days
 */
export async function runWeeklyAggregation(): Promise<void> {
  const endDate = Date.now();
  const startDate = endDate - 7 * 24 * 60 * 60 * 1000; // 7 days ago

  console.log(`[Analytics] Starting weekly aggregation: ${new Date(startDate).toISOString()} to ${new Date(endDate).toISOString()}`);

  try {
    await analyticsAggregator.aggregateAll(startDate, endDate);
    console.log('[Analytics] Weekly aggregation completed successfully');
  } catch (error) {
    console.error('[Analytics] Weekly aggregation failed:', error);
    throw error;
  }
}

/**
 * Run aggregation for custom date range
 */
export async function runCustomAggregation(startDate: number, endDate: number): Promise<void> {
  console.log(`[Analytics] Starting custom aggregation: ${new Date(startDate).toISOString()} to ${new Date(endDate).toISOString()}`);

  try {
    await analyticsAggregator.aggregateAll(startDate, endDate);
    console.log('[Analytics] Custom aggregation completed successfully');
  } catch (error) {
    console.error('[Analytics] Custom aggregation failed:', error);
    throw error;
  }
}

// Example: Schedule with node-cron (if installed)
// import cron from 'node-cron';
// 
// // Run every hour
// cron.schedule('0 * * * *', () => {
//   runDailyAggregation().catch(console.error);
// });
//
// // Run daily at midnight
// cron.schedule('0 0 * * *', () => {
//   runWeeklyAggregation().catch(console.error);
// });
