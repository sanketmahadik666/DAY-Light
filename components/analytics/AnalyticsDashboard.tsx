/**
 * Analytics Dashboard
 * Comprehensive analytics dashboard with multiple chart types
 */

'use client';

import { useState, useEffect } from 'react';
import { FactAvailabilityChart } from './charts/FactAvailabilityChart';
import { CategoryPreferencesChart } from './charts/CategoryPreferencesChart';
import { APIPerformanceChart } from './charts/APIPerformanceChart';
import { APITimelineChart } from './charts/APITimelineChart';
import { APIScatterChart } from './charts/APIScatterChart';
import { APIRadarChart } from './charts/APIRadarChart';
import { APIRadialChart } from './charts/APIRadialChart';

interface AnalyticsData {
  factAvailability?: Array<{ date: string; count: number }>;
  categoryPreferences?: Array<{ name: string; value: number; avgDuration: number }>;
  apiPerformance?: Array<{
    endpoint: string;
    totalCalls: number;
    successCount: number;
    errorCount: number;
    avgResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    p95ResponseTime: number;
    responseTimes: number[];
  }>;
  apiTimeline?: Array<{
    hour: string;
    avgResponseTime: number;
    count: number;
    endpoints: string[];
  }>;
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData>({});
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: 'all',
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });

      const response = await fetch(`/api/analytics/reports?${params.toString()}`);
      const result = await response.json();

      if (result.success) {
        setData(result.data || {});
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Analytics Dashboard
          </h1>
          
          {/* Date Range Selector */}
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) =>
                  setDateRange({ ...dateRange, startDate: e.target.value })
                }
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) =>
                  setDateRange({ ...dateRange, endDate: e.target.value })
                }
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
              />
            </div>
            <button
              onClick={loadAnalytics}
              className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Fact Availability - Time Series (Recharts Line Chart) */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Fact Availability Over Time
            </h2>
            <FactAvailabilityChart data={data.factAvailability || []} />
          </div>

          {/* Category Preferences - Pie Chart (Recharts) */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Most Viewed Categories
            </h2>
            <CategoryPreferencesChart data={data.categoryPreferences || []} />
          </div>

          {/* API Performance - Bar Chart (Recharts) */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              API Performance Metrics
            </h2>
            <APIPerformanceChart data={data.apiPerformance || []} />
          </div>

          {/* API Timeline - Line Chart (Recharts) */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              API Response Time Timeline
            </h2>
            <APITimelineChart data={data.apiTimeline || []} />
          </div>

          {/* API Scatter Plot (Recharts) */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              API Response Time Distribution
            </h2>
            <APIScatterChart data={data.apiPerformance || []} />
          </div>

          {/* API Radar Chart (ECharts) */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              API Performance Radar
            </h2>
            <APIRadarChart data={data.apiPerformance || []} />
          </div>

          {/* API Radial Chart (ECharts) */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              API Success Rate Radial
            </h2>
            <APIRadialChart data={data.apiPerformance || []} />
          </div>
        </div>
      </div>
    </div>
  );
}
