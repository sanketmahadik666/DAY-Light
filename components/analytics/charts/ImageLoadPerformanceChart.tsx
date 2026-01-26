/**
 * Image Load Performance Chart (ECharts)
 * Shows MinIO vs Cloudinary performance
 */

'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface ImageLoadPerformanceData {
  storageProvider: 'minio' | 'cloudinary' | 'external';
  totalLoads: number;
  successCount: number;
  errorCount: number;
  avgLoadTime: number;
  p95LoadTime: number;
}

interface ImageLoadPerformanceChartProps {
  data: ImageLoadPerformanceData[];
}

export function ImageLoadPerformanceChart({ data }: ImageLoadPerformanceChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e0e0e0',
        borderWidth: 1,
        borderRadius: 8,
      },
      legend: {
        data: ['Total Loads', 'Success', 'Errors', 'Avg Load Time (ms)', 'P95 Load Time (ms)'],
        bottom: 0,
      },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.storageProvider.toUpperCase()),
        axisLabel: { color: '#666', fontSize: 12 },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Count',
          position: 'left',
          axisLabel: { color: '#666', fontSize: 12 },
        },
        {
          type: 'value',
          name: 'Time (ms)',
          position: 'right',
          axisLabel: { color: '#666', fontSize: 12 },
        },
      ],
      series: [
        {
          name: 'Total Loads',
          type: 'bar',
          data: data.map((d) => d.totalLoads),
          itemStyle: { color: '#3b82f6' },
        },
        {
          name: 'Success',
          type: 'bar',
          data: data.map((d) => d.successCount),
          itemStyle: { color: '#10b981' },
        },
        {
          name: 'Errors',
          type: 'bar',
          data: data.map((d) => d.errorCount),
          itemStyle: { color: '#ef4444' },
        },
        {
          name: 'Avg Load Time (ms)',
          type: 'line',
          yAxisIndex: 1,
          data: data.map((d) => d.avgLoadTime),
          itemStyle: { color: '#8b5cf6' },
          lineStyle: { width: 2 },
        },
        {
          name: 'P95 Load Time (ms)',
          type: 'line',
          yAxisIndex: 1,
          data: data.map((d) => d.p95LoadTime),
          itemStyle: { color: '#ec4899' },
          lineStyle: { width: 2, type: 'dashed' },
        },
      ],
    };

    chartInstance.current.setOption(option);

    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No data available
      </div>
    );
  }

  return (
    <div ref={chartRef} style={{ width: '100%', height: '300px' }} />
  );
}
