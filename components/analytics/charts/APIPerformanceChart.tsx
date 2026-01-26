/**
 * API Performance Bar Chart (Recharts)
 * Shows multiple metrics per endpoint
 */

'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface APIPerformanceData {
  endpoint: string;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p95ResponseTime: number;
}

interface APIPerformanceChartProps {
  data: APIPerformanceData[];
}

export function APIPerformanceChart({ data }: APIPerformanceChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No data available
      </div>
    );
  }

  // Format endpoint names for display
  const chartData = data.map((item) => ({
    ...item,
    endpoint: item.endpoint.replace(/^\/api\//, '').substring(0, 20),
    fullEndpoint: item.endpoint,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={chartData}
        margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis
          dataKey="endpoint"
          angle={-45}
          textAnchor="end"
          height={80}
          stroke="#666"
          tick={{ fill: '#666', fontSize: 11 }}
        />
        <YAxis stroke="#666" tick={{ fill: '#666', fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
          }}
          formatter={(value: number, name: string) => {
            if (name === 'avgResponseTime' || name === 'p95ResponseTime') {
              return [`${value.toFixed(2)}ms`, name === 'avgResponseTime' ? 'Avg Response Time' : 'P95 Response Time'];
            }
            return [value, name];
          }}
        />
        <Legend />
        <Bar dataKey="successCount" fill="#10b981" name="Success" />
        <Bar dataKey="errorCount" fill="#ef4444" name="Errors" />
        <Bar dataKey="avgResponseTime" fill="#3b82f6" name="Avg Response (ms)" />
        <Bar dataKey="p95ResponseTime" fill="#8b5cf6" name="P95 Response (ms)" />
      </BarChart>
    </ResponsiveContainer>
  );
}
