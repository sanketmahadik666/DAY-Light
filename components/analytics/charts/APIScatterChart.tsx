/**
 * API Scatter Plot (Recharts)
 * Shows response time distribution
 */

'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface APIPerformanceData {
  endpoint: string;
  totalCalls: number;
  responseTimes: number[];
}

interface APIScatterChartProps {
  data: APIPerformanceData[];
}

const COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#ef4444',
];

export function APIScatterChart({ data }: APIScatterChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No data available
      </div>
    );
  }

  // Prepare scatter data
  const scatterData = data.flatMap((item, index) =>
    item.responseTimes.map((time, timeIndex) => ({
      x: index,
      y: time,
      endpoint: item.endpoint,
      callIndex: timeIndex,
      color: COLORS[index % COLORS.length],
    }))
  );

  // Get endpoint labels
  const endpoints = data.map((item) => item.endpoint.replace(/^\/api\//, '').substring(0, 15));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart
        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
        <XAxis
          type="number"
          dataKey="x"
          name="Endpoint"
          domain={[0, data.length - 1]}
          tickFormatter={(value) => endpoints[value] || ''}
          stroke="#666"
          tick={{ fill: '#666', fontSize: 11 }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="Response Time"
          unit="ms"
          stroke="#666"
          tick={{ fill: '#666', fontSize: 12 }}
        />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
          }}
          formatter={(value: number, name: string, props: any) => [
            `${value.toFixed(2)}ms`,
            props.payload.endpoint,
          ]}
        />
        <Scatter name="Response Times" data={scatterData} fill="#3b82f6">
          {scatterData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
