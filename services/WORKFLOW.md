# Analytics Workflow - End-to-End

## Complete Workflow

### 1. Client-Side Event Collection (Quiet - No Computation)

**Fact View Tracking**:
```typescript
// In FactSlide component
const trackFactView = useFactViewTracking();
const endTracking = trackFactView(fact.id, fact.date, fact.category, index);
// ... user views slide ...
endTracking(); // Records view duration
```

**API Call Tracking**:
```typescript
// Automatic via trackedFetch wrapper
const response = await trackedFetch('/api/facts?date=2024-01-15');
// Automatically tracks: endpoint, responseTime, statusCode, sizes
```

**Image Load Tracking**:
```typescript
// In ImageLayer component
trackImageLoad(factId, imageUrl, loadTime, success, storageProvider);
// Storage provider auto-detected from URL
```

### 2. Event Batching & Flushing

**Analytics Collector**:
- Collects events in memory (max 50 events)
- Auto-flushes every 30 seconds
- Flushes on page unload
- Sends raw events only (no processing)

**Payload Structure**:
```json
{
  "factViews": [...],
  "apiCalls": [...],
  "imageLoads": [...],
  "sessionId": "session_1234567890_abc",
  "timestamp": 1234567890000
}
```

### 3. Server-Side Event Storage

**POST /api/analytics/collect**:
1. Receives raw events
2. Inserts into MongoDB raw collections
3. Triggers background aggregation (non-blocking)
4. Returns success immediately

**MongoDB Collections**:
- `analytics_raw_fact_views` - All fact view events
- `analytics_raw_api_calls` - All API call events
- `analytics_raw_image_loads` - All image load events

### 4. Background Aggregation (Server-Side)

**Aggregation Service**:
- Runs MongoDB aggregation pipelines
- Computes metrics (averages, percentiles, counts)
- Stores results in report collections
- Runs in background (doesn't block API)

**Report Collections**:
- `analytics_reports_fact_availability` - Daily fact metrics
- `analytics_reports_category_preferences` - Category popularity
- `analytics_reports_api_performance` - API performance metrics
- `analytics_reports_image_loads` - Storage provider performance

### 5. Report Generation (Server-Side)

**GET /api/analytics/reports**:
1. Reads from aggregated report collections (fast)
2. If reports missing, triggers aggregation in background
3. Returns pre-computed data for charts
4. Includes raw data for scatter plots if needed

### 6. Dashboard Rendering (Client-Side)

**Analytics Dashboard**:
- Requests reports from API
- Receives pre-computed data
- Renders charts using Recharts/ECharts
- No computation on client

## Data Sources

### MongoDB
- Raw events (write-heavy)
- Aggregated reports (read-heavy)
- Facts metadata
- Storage references

### MinIO/Cloudinary
- Image URLs tracked in events
- Storage provider detected from URL
- Performance metrics per provider

## Performance Characteristics

- **Client**: Zero computation, just event collection
- **Server Write**: Fast inserts (indexed collections)
- **Server Read**: Instant (pre-computed reports)
- **Aggregation**: Background (doesn't block)
- **Scalability**: Handles millions of events

## Storage Provider Detection

```typescript
// Auto-detection from URL
if (url.includes('minio') || url.includes('daylight-storage')) {
  storageProvider = 'minio';
} else if (url.includes('cloudinary') || url.includes('res.cloudinary.com')) {
  storageProvider = 'cloudinary';
} else {
  storageProvider = 'external';
}
```

## Chart Data Sources

1. **Fact Availability**: `analytics_reports_fact_availability`
2. **Category Preferences**: `analytics_reports_category_preferences`
3. **API Performance**: `analytics_reports_api_performance` + raw events for scatter
4. **API Timeline**: Raw events aggregated hourly
5. **Image Performance**: `analytics_reports_image_loads`

All reports generated server-side from MongoDB, ensuring comprehensive insights with minimal client computation.
