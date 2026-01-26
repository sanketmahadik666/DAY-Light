# Analytics Dashboard Setup

## Installation

Install required charting libraries:

```bash
npm install recharts echarts
```

## Features

### Charts Implemented

1. **Fact Availability Time Series** (Recharts Line Chart)
   - Shows fact availability over time
   - Reference line for average
   - Custom tooltips

2. **Category Preferences** (Recharts Pie Chart)
   - Most viewed categories
   - Percentage breakdown
   - Average duration per category

3. **API Performance** (Recharts Bar Chart)
   - Success/error counts per endpoint
   - Average and P95 response times
   - Multiple metrics comparison

4. **API Timeline** (Recharts Line Chart)
   - Response time over time
   - Call count overlay
   - Reference lines

5. **API Scatter Plot** (Recharts)
   - Response time distribution
   - Per-endpoint visualization
   - Color-coded by endpoint

6. **API Radar Chart** (ECharts)
   - Multi-dimensional performance view
   - Top 5 endpoints comparison
   - Multiple metrics radar

7. **API Radial Chart** (ECharts)
   - Success rate visualization
   - Donut/pie style
   - Interactive tooltips

## Usage

1. Access dashboard at `/analytics`
2. Select date range
3. View real-time analytics

## Data Collection

Analytics are automatically collected:
- Fact views tracked in `FactSlide`
- API calls tracked via `trackedFetch`
- Data flushed every 30 seconds or 50 events

## API Endpoints

- `POST /api/analytics/collect` - Collect analytics data
- `GET /api/analytics/reports?type=all&startDate=...&endDate=...` - Get reports
