/**
 * API Success Rate Radial Chart (ECharts)
 */

'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface APIPerformanceData {
  endpoint: string;
  totalCalls: number;
  successCount: number;
  errorCount: number;
}

interface APIRadialChartProps {
  data: APIPerformanceData[];
}

export function APIRadialChart({ data }: APIRadialChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    // Initialize chart
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    // Prepare data for radial chart (top 6 endpoints)
    const topEndpoints = data.slice(0, 6).map((item) => ({
      name: item.endpoint.replace(/^\/api\//, '').substring(0, 15),
      successRate: (item.successCount / item.totalCalls) * 100,
      totalCalls: item.totalCalls,
    }));

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const data = params.data;
          return `${data.name}<br/>Success Rate: ${data.value.toFixed(1)}%<br/>Total Calls: ${data.totalCalls}`;
        },
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e0e0e0',
        borderWidth: 1,
        borderRadius: 8,
      },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: (params: any) => `${params.name}\n${params.value.toFixed(1)}%`,
            fontSize: 11,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 13,
              fontWeight: 'bold',
            },
          },
          data: topEndpoints.map((item) => ({
            value: item.successRate,
            name: item.name,
            totalCalls: item.totalCalls,
          })),
        },
      ],
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
