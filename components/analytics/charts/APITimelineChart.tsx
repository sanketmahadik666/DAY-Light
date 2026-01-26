/**
 * API Timeline Line Chart (Recharts)
 * Multiple line chart variations with reference lines
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

interface APITimelineData {
  hour: string;
  avgResponseTime: number;
  count: number;
  endpoints: string[];
}

interface APITimelineChartProps {
  data: APITimelineData[];
}

export function APITimelineChart({ data }: APITimelineChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No data available
      </div>
    );
  }

  // Format hour for display
  const chartData = data.map((item) => ({
    ...item,
    hourDisplay: new Date(item.hour).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  }));

  // Calculate average for reference line
  const avg = chartData.reduce((sum, item) => sum + item.avgResponseTime, 0) / chartData.length;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={chartData}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis
          dataKey="hourDisplay"
          stroke="#666"
          tick={{ fill: '#666', fontSize: 11 }}
        />
        <YAxis
          stroke="#666"
          tick={{ fill: '#666', fontSize: 12 }}
          label={{ value: 'Response Time (ms)', angle: -90, position: 'insideLeft' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
          }}
          formatter={(value: number, name: string, props: any) => [
            `${value.toFixed(2)}ms`,
            `${props.payload.count} calls`,
          ]}
        />
        <Legend />
        <ReferenceLine
          y={avg}
          label={{ value: `Avg: ${avg.toFixed(2)}ms`, position: 'top' }}
          stroke="#888"
          strokeDasharray="5 5"
        />
        <Line
          type="monotone"
          dataKey="avgResponseTime"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ fill: '#3b82f6', r: 3 }}
          activeDot={{ r: 5 }}
          name="Avg Response Time"
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke="#10b981"
          strokeWidth={1}
          strokeDasharray="5 5"
          dot={false}
          name="Call Count"
          yAxisId={1}
        />
        <YAxis yAxisId={1} orientation="right" stroke="#10b981" />
      </LineChart>
    </ResponsiveContainer>
  );
}
