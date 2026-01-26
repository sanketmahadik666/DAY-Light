# Analytics Architecture - Complete Data Flow

## Design Principles

1. **Client-Side (Quiet)**: Only collects raw events, ZERO computation
2. **Server-Side**: All aggregation happens in MongoDB with efficient pipelines
3. **Storage Integration**: Tracks MinIO and Cloudinary performance
4. **Cost Efficiency**: Computation distributed to client, server only aggregates

## Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT-SIDE (Browser)                        │
│                    Zero Computation - Just Events                │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐  ┌─────────▼────────┐  ┌────────▼────────┐
│ Fact Views     │  │ API Calls        │  │ Image Loads      │
│ - factId       │  │ - endpoint       │  │ - factId         │
│ - date         │  │ - responseTime  │  │ - imageUrl       │
│ - category     │  │ - statusCode    │  │ - loadTime       │
│ - viewDuration │  │ - requestSize   │  │ - storageProvider│
│ - timestamp    │  │ - responseSize  │  │ - success        │
└───────┬────────┘  └─────────┬────────┘  └────────┬────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ Analytics Collector│
                    │ - Batches events  │
                    │ - Flushes every   │
                    │   30s or 50 events│
                    └─────────┬─────────┘
                              │
                    POST /api/analytics/collect
                    (Raw events only - no processing)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SERVER-SIDE (Metadata Service)               │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ MongoDB: Raw Events│
                    │ Collections:       │
                    │ - raw_fact_views   │
                    │ - raw_api_calls    │
                    │ - raw_image_loads  │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ Aggregation Service│
                    │ (MongoDB Pipelines)│
                    │ - Fact Availability│
                    │ - Category Prefs   │
                    │ - API Performance  │
                    │ - Image Performance│
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ MongoDB: Reports  │
                    │ Collections:      │
                    │ - fact_availability│
                    │ - category_prefs   │
                    │ - api_performance │
                    │ - image_performance│
                    └─────────┬─────────┘
                              │
                    GET /api/analytics/reports
                    (Pre-computed data)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DASHBOARD (Frontend)                         │
│                    Charts from Pre-computed Data                 │
└─────────────────────────────────────────────────────────────────┘
```

## MongoDB Collections

### Raw Events (Write-Heavy)

**analytics_raw_fact_views**
- Indexes: `date`, `category`, `timestamp`, `factId`, `sessionId`
- Purpose: Store every fact view event
- TTL: Optional (e.g., 90 days)

**analytics_raw_api_calls**
- Indexes: `endpoint`, `timestamp`, `success`, `sessionId`
- Purpose: Store every API call with timing
- TTL: Optional (e.g., 90 days)

**analytics_raw_image_loads**
- Indexes: `factId`, `storageProvider`, `timestamp`, `sessionId`
- Purpose: Store every image load event
- TTL: Optional (e.g., 90 days)

### Aggregated Reports (Read-Heavy)

**analytics_reports_fact_availability**
- Index: `date` (unique)
- Purpose: Daily fact availability metrics
- Updated: Hourly/daily aggregation

**analytics_reports_category_preferences**
- Index: `category` (unique)
- Purpose: Category popularity metrics
- Updated: Hourly/daily aggregation

**analytics_reports_api_performance**
- Index: `endpoint + method` (unique)
- Purpose: API performance metrics
- Updated: Hourly/daily aggregation

**analytics_reports_image_loads**
- Index: `storageProvider + reportDate` (unique)
- Purpose: Storage provider performance
- Updated: Hourly/daily aggregation

## Aggregation Pipelines

### Fact Availability
```javascript
[
  { $match: { timestamp: { $gte: start, $lte: end } } },
  { $group: { _id: '$date', facts: { $addToSet: '$factId' }, views: { $sum: 1 } } },
  { $project: { date: '$_id', factCount: { $size: '$facts' }, totalViews: '$views' } }
]
```

### Category Preferences
```javascript
[
  { $match: { timestamp: { $gte: start, $lte: end } } },
  { $group: { _id: '$category', views: { $sum: 1 }, duration: { $sum: '$viewDuration' } } },
  { $project: { category: '$_id', totalViews: '$views', avgDuration: { $divide: ['$duration', '$views'] } } }
]
```

### API Performance
```javascript
[
  { $match: { timestamp: { $gte: start, $lte: end } } },
  { $group: { _id: { endpoint: '$endpoint', method: '$method' }, times: { $push: '$responseTime' } } },
  { $project: { endpoint: '$_id.endpoint', responseTimes: '$times' } }
]
```

## Performance Optimizations

1. **Indexes**: All query fields indexed
2. **Aggregation**: Runs in background, doesn't block API
3. **Caching**: Reports cached in MongoDB (fast reads)
4. **Batch Processing**: Events batched client-side
5. **TTL**: Optional TTL on raw events to manage storage

## Storage Provider Detection

- **MinIO**: URL contains `minio` or `daylight-storage`
- **Cloudinary**: URL contains `cloudinary` or `res.cloudinary.com`
- **External**: All other URLs

## Workflow Summary

1. **Client**: User interacts → Events collected
2. **Client**: Batch flush → POST to `/api/analytics/collect`
3. **Server**: Insert raw events → MongoDB
4. **Server**: Background aggregation → MongoDB pipelines
5. **Server**: Store reports → Aggregated collections
6. **Dashboard**: Request reports → Read from aggregated collections
7. **Dashboard**: Render charts → Pre-computed data

## Benefits

- **Zero Client Computation**: All processing server-side
- **Fast Reports**: Pre-computed, instant retrieval
- **Scalable**: Handles millions of events
- **Cost Effective**: Minimal server CPU
- **Comprehensive**: All insights from MongoDB + Storage
