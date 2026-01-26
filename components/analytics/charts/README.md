# Analytics Charts

## Chart Types

### Recharts Charts

1. **FactAvailabilityChart** - Line Chart
   - Simple line chart showing fact availability over time
   - Reference line for average
   - Custom tooltips with date formatting

2. **CategoryPreferencesChart** - Pie Chart
   - Shows category distribution
   - Percentage labels
   - Color-coded segments

3. **APIPerformanceChart** - Bar Chart
   - Multiple metrics per endpoint
   - Success/error counts
   - Response time metrics

4. **APITimelineChart** - Line Chart
   - Response time over time
   - Dual Y-axis (response time + call count)
   - Reference lines

5. **APIScatterChart** - Scatter Plot
   - Response time distribution
   - Per-endpoint visualization
   - Color-coded points

### ECharts Charts

6. **APIRadarChart** - Radar Chart
   - Multi-dimensional performance view
   - Top 5 endpoints
   - Multiple metrics comparison

7. **APIRadialChart** - Radial/Pie Chart
   - Success rate visualization
   - Donut style
   - Interactive tooltips

## Installation

```bash
npm install recharts echarts
```

## Usage

All charts are used in `AnalyticsDashboard` component. Access at `/analytics` route.
