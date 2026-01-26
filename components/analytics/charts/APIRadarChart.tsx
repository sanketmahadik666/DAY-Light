/**
 * API Performance Radar Chart (ECharts)
 */

'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface APIPerformanceData {
  endpoint: string;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  avgResponseTime: number;
  p95ResponseTime: number;
}

interface APIRadarChartProps {
  data: APIPerformanceData[];
}

export function APIRadarChart({ data }: APIRadarChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    // Initialize chart
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    // Prepare data for radar chart (top 5 endpoints)
    const topEndpoints = data.slice(0, 5);
    const maxValues = {
      totalCalls: Math.max(...topEndpoints.map((d) => d.totalCalls)),
      successCount: Math.max(...topEndpoints.map((d) => d.successCount)),
      avgResponseTime: Math.max(...topEndpoints.map((d) => d.avgResponseTime)),
      p95ResponseTime: Math.max(...topEndpoints.map((d) => d.p95ResponseTime)),
    };

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e0e0e0',
        borderWidth: 1,
        borderRadius: 8,
      },
      radar: {
        indicator: [
          { name: 'Total Calls', max: maxValues.totalCalls },
          { name: 'Success Count', max: maxValues.successCount },
          { name: 'Avg Response (ms)', max: maxValues.avgResponseTime },
          { name: 'P95 Response (ms)', max: maxValues.p95ResponseTime },
        ],
        center: ['50%', '55%'],
        radius: '70%',
        axisName: {
          color: '#666',
          fontSize: 12,
        },
        splitArea: {
          areaStyle: {
            color: ['rgba(59, 130, 246, 0.1)', 'rgba(59, 130, 246, 0.05)'],
          },
        },
      },
      series: topEndpoints.map((endpoint, index) => ({
        type: 'radar',
        data: [
          {
            value: [
              endpoint.totalCalls,
              endpoint.successCount,
              endpoint.avgResponseTime,
              endpoint.p95ResponseTime,
            ],
            name: endpoint.endpoint.replace(/^\/api\//, '').substring(0, 20),
          },
        ],
        areaStyle: {
          opacity: 0.3,
        },
        lineStyle: {
          width: 2,
        },
      })),
    };

    chartInstance.current.setOption(option);

    // Handle resize
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
