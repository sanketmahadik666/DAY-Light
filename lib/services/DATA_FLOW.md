# Analytics Data Flow Architecture

## Overview

**Client-Side**: Only collects raw events, NO computation  
**Server-Side**: All aggregation and report generation from MongoDB

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT-SIDE (Quiet)                      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Fact Views   │  │ API Calls    │  │ Image Loads  │    │
│  │ (Raw Events) │  │ (Raw Events) │  │ (Raw Events) │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │             │
│         └─────────────────┼─────────────────┘             │
│                           │                                 │
│                  ┌────────▼────────┐                        │
│                  │ Analytics       │                        │
│                  │ Collector       │                        │
│                  │ (Batch Flush)  │                        │
│                  └────────┬────────┘                        │
└───────────────────────────┼─────────────────────────────────┘
                            │
                            │ POST /api/analytics/collect
                            │ (Raw events only)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVER-SIDE                              │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │ MongoDB: Raw Events Collections                    │   │
│  │  - analytics_raw_fact_views                        │   │
│  │  - analytics_raw_api_calls                         │   │
│  │  - analytics_raw_image_loads                       │   │
│  └────────────────────────────────────────────────────┘   │
│                            │                                │
│                            ▼                                │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Analytics Aggregator Service                       │   │
│  │  - Fact Availability Aggregation                    │   │
│  │  - Category Preferences Aggregation                 │   │
│  │  - API Performance Aggregation                      │   │
│  │  - Image Load Performance Aggregation               │   │
│  └────────────────────────────────────────────────────┘   │
│                            │                                │
│                            ▼                                │
│  ┌────────────────────────────────────────────────────┐   │
│  │ MongoDB: Aggregated Reports Collections            │   │
│  │  - analytics_reports_fact_availability             │   │
│  │  - analytics_reports_category_preferences          │   │
│  │  - analytics_reports_api_performance               │   │
│  │  - analytics_reports_image_loads                  │   │
│  └────────────────────────────────────────────────────┘   │
│                            │                                │
│                            ▼                                │
│  ┌────────────────────────────────────────────────────┐   │
│  │ GET /api/analytics/reports                         │   │
│  │ Returns pre-computed reports from MongoDB          │   │
│  └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Schema Structure

### Raw Events (Client → Server)

**RawFactViewEvent**:
```typescript
{
  factId: string;
  date: string; // YYYY-MM-DD
  category: string;
  timestamp: number;
  viewDuration?: number;
  slideIndex: number;
  sessionId: string;
}
```

**RawAPICallEvent**:
```typescript
{
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  timestamp: number;
  success: boolean;
  error?: string;
  requestSize?: number;
  responseSize?: number;
  sessionId: string;
}
```

**RawImageLoadEvent**:
```typescript
{
  factId: string;
  imageUrl: string;
  storageProvider?: 'minio' | 'cloudinary';
  loadTime: number;
  timestamp: number;
  success: boolean;
  sessionId: string;
}
```

### Aggregated Reports (Server-Generated)

**FactAvailabilityReport**:
```typescript
{
  date: string; // YYYY-MM-DD (unique)
  factCount: number;
  uniqueFacts: number;
  totalViews: number;
  avgViewDuration: number;
  categories: Array<{ category: string; count: number }>;
  reportDate: string;
  lastUpdated: number;
}
```

**CategoryPreferenceReport**:
```typescript
{
  category: string; // unique
  totalViews: number;
  uniqueFacts: number;
  totalDuration: number;
  avgDuration: number;
  lastViewed: number;
  factIds: string[]; // Top 10
  reportDate: string;
  lastUpdated: number;
}
```

**APIPerformanceReport**:
```typescript
{
  endpoint: string;
  method: string;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  avgRequestSize: number;
  avgResponseSize: number;
  reportDate: string;
  lastUpdated: number;
}
```

**ImageLoadPerformanceReport**:
```typescript
{
  storageProvider: 'minio' | 'cloudinary' | 'external';
  totalLoads: number;
  successCount: number;
  errorCount: number;
  avgLoadTime: number;
  minLoadTime: number;
  maxLoadTime: number;
  p95LoadTime: number;
  factIds: string[];
  reportDate: string;
  lastUpdated: number;
}
```

## Workflow

### 1. Event Collection (Client)
- User views fact → `trackFactView()` called
- API call made → `trackedFetch()` wrapper tracks it
- Image loads → `trackImageLoad()` called
- Events batched in memory (max 50 events or 30 seconds)

### 2. Event Sync (Client → Server)
- Batch flushed to `/api/analytics/collect`
- Raw events inserted into MongoDB (no processing)
- Background aggregation triggered (non-blocking)

### 3. Aggregation (Server)
- MongoDB aggregation pipelines process raw events
- Computes metrics (averages, percentiles, counts)
- Stores results in aggregated report collections
- Runs in background (doesn't block API response)

### 4. Report Generation (Server)
- Dashboard requests `/api/analytics/reports`
- Server reads from aggregated collections (fast)
- Returns pre-computed data for charts
- If aggregation needed, triggers in background

## Performance Benefits

1. **Client-Side**: Zero computation, just event collection
2. **Server-Side**: Efficient MongoDB aggregations with indexes
3. **Reports**: Pre-computed, instant retrieval
4. **Scalability**: Can handle millions of events
5. **Cost**: Minimal server CPU, computation distributed

## Storage Integration

- **MinIO/Cloudinary**: Image URLs tracked in `RawImageLoadEvent`
- **Storage Provider**: Detected from URL pattern
- **Performance Metrics**: Load times tracked per provider
- **Reports**: Show which storage performs better
