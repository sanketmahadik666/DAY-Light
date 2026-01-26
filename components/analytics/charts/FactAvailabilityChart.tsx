/**
 * Fact Availability Time Series Chart (Recharts)
 * Multiple line chart variations
 */

'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface FactAvailabilityData {
  date: string;
  count: number;
}

interface FactAvailabilityChartProps {
  data: FactAvailabilityData[];
}

export function FactAvailabilityChart({ data }: FactAvailabilityChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No data available
      </div>
    );
  }

  // Format data for chart
  const chartData = data.map((item) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    count: item.count,
    fullDate: item.date,
  }));

  // Calculate average for reference line
  const avg = chartData.reduce((sum, item) => sum + item.count, 0) / chartData.length;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={chartData}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis
          dataKey="date"
          stroke="#666"
          tick={{ fill: '#666', fontSize: 12 }}
        />
        <YAxis
          stroke="#666"
          tick={{ fill: '#666', fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
          }}
          labelFormatter={(label) => `Date: ${label}`}
          formatter={(value: number) => [`${value} facts`, 'Count']}
        />
        <Legend />
        <ReferenceLine
          y={avg}
          label={{ value: `Avg: ${avg.toFixed(1)}`, position: 'top' }}
          stroke="#888"
          strokeDasharray="5 5"
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ fill: '#3b82f6', r: 4 }}
          activeDot={{ r: 6 }}
          name="Facts Available"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
