/**
 * Category Preferences Pie Chart (Recharts)
 */

'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface CategoryPreferenceData {
  name: string;
  value: number;
  avgDuration: number;
}

interface CategoryPreferencesChartProps {
  data: CategoryPreferenceData[];
}

const COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#06b6d4',
  '#f97316',
  '#6366f1',
  '#14b8a6',
];

export function CategoryPreferencesChart({ data }: CategoryPreferencesChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No data available
      </div>
    );
  }

  // Format data with percentage
  const chartData = data.map((item) => ({
    ...item,
    percentage: ((item.value / data.reduce((sum, d) => sum + d.value, 0)) * 100).toFixed(1),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percentage }) => `${name}: ${percentage}%`}
          outerRadius={100}
          fill="#8884d8"
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
          }}
          formatter={(value: number, name: string, props: any) => [
            `${value} views (${props.payload.percentage}%)`,
            `Avg Duration: ${(props.payload.avgDuration / 1000).toFixed(1)}s`,
          ]}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => value}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
