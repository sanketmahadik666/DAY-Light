# Analytics Schemas - Complete Reference

## Raw Event Schemas (Client → Server)

### RawFactViewEvent
```typescript
{
  factId: string;           // Unique fact identifier
  date: string;            // YYYY-MM-DD format
  category: string;        // Fact category
  timestamp: number;        // Unix timestamp (ms)
  viewDuration?: number;   // Milliseconds viewed
  slideIndex: number;      // Position in gallery
  sessionId: string;       // User session ID
  userId?: string;         // Optional user ID
}
```

**Collection**: `analytics_raw_fact_views`  
**Indexes**: `date`, `category`, `timestamp`, `factId`, `sessionId`

### RawAPICallEvent
```typescript
{
  endpoint: string;        // API endpoint URL
  method: string;          // HTTP method
  statusCode: number;      // HTTP status code
  responseTime: number;    // Response time in ms
  timestamp: number;       // Unix timestamp (ms)
  success: boolean;        // Request success
  error?: string;         // Error message if failed
  requestSize?: number;   // Request size in bytes
  responseSize?: number;  // Response size in bytes
  sessionId: string;      // User session ID
  userId?: string;        // Optional user ID
}
```

**Collection**: `analytics_raw_api_calls`  
**Indexes**: `endpoint`, `timestamp`, `success`, `sessionId`

### RawImageLoadEvent
```typescript
{
  factId: string;          // Associated fact ID
  imageUrl: string;        // Image URL
  storageProvider?: 'minio' | 'cloudinary'; // Detected provider
  loadTime: number;        // Load time in ms
  timestamp: number;       // Unix timestamp (ms)
  success: boolean;        // Load success
  sessionId: string;       // User session ID
  userId?: string;        // Optional user ID
}
```

**Collection**: `analytics_raw_image_loads`  
**Indexes**: `factId`, `storageProvider`, `timestamp`, `sessionId`

## Aggregated Report Schemas (Server-Generated)

### FactAvailabilityReport
```typescript
{
  date: string;            // YYYY-MM-DD (unique)
  factCount: number;       // Number of unique facts
  uniqueFacts: number;     // Same as factCount
  totalViews: number;      // Total view count
  avgViewDuration: number; // Average view duration (ms)
  categories: Array<{      // Category breakdown
    category: string;
    count: number;
  }>;
  reportDate: string;      // When report was generated
  lastUpdated: number;     // Last update timestamp
}
```

**Collection**: `analytics_reports_fact_availability`  
**Index**: `date` (unique)

### CategoryPreferenceReport
```typescript
{
  category: string;        // Category name (unique)
  totalViews: number;     // Total views for category
  uniqueFacts: number;    // Number of unique facts
  totalDuration: number;  // Total view duration (ms)
  avgDuration: number;    // Average duration (ms)
  lastViewed: number;     // Last view timestamp
  factIds: string[];      // Top 10 viewed fact IDs
  reportDate: string;     // When report was generated
  lastUpdated: number;    // Last update timestamp
}
```

**Collection**: `analytics_reports_category_preferences`  
**Index**: `category` (unique)

### APIPerformanceReport
```typescript
{
  endpoint: string;        // API endpoint
  method: string;         // HTTP method
  totalCalls: number;     // Total API calls
  successCount: number;   // Successful calls
  errorCount: number;     // Failed calls
  avgResponseTime: number; // Average response time (ms)
  minResponseTime: number; // Minimum response time (ms)
  maxResponseTime: number; // Maximum response time (ms)
  p50ResponseTime: number; // 50th percentile (ms)
  p95ResponseTime: number; // 95th percentile (ms)
  p99ResponseTime: number; // 99th percentile (ms)
  avgRequestSize: number;  // Average request size (bytes)
  avgResponseSize: number; // Average response size (bytes)
  reportDate: string;     // When report was generated
  lastUpdated: number;    // Last update timestamp
}
```

**Collection**: `analytics_reports_api_performance`  
**Index**: `endpoint + method` (unique)

### ImageLoadPerformanceReport
```typescript
{
  storageProvider: 'minio' | 'cloudinary' | 'external';
  totalLoads: number;     // Total image loads
  successCount: number;   // Successful loads
  errorCount: number;     // Failed loads
  avgLoadTime: number;    // Average load time (ms)
  minLoadTime: number;    // Minimum load time (ms)
  maxLoadTime: number;    // Maximum load time (ms)
  p95LoadTime: number;    // 95th percentile (ms)
  factIds: string[];      // Facts with images from provider
  reportDate: string;      // When report was generated
  lastUpdated: number;    // Last update timestamp
}
```

**Collection**: `analytics_reports_image_loads`  
**Index**: `storageProvider + reportDate` (unique)

## Data Flow Summary

1. **Client** → Raw events collected (no computation)
2. **Client** → Batch flush to `/api/analytics/collect`
3. **Server** → Insert raw events into MongoDB
4. **Server** → Background aggregation (MongoDB pipelines)
5. **Server** → Store aggregated reports
6. **Dashboard** → Request `/api/analytics/reports`
7. **Server** → Return pre-computed reports from MongoDB
8. **Dashboard** → Render charts (no computation)

## Storage Integration

- **MinIO URLs**: Detected from URL pattern (`minio`, `daylight-storage`)
- **Cloudinary URLs**: Detected from URL pattern (`cloudinary`, `res.cloudinary.com`)
- **External URLs**: All other image sources
- **Performance Tracking**: Load times tracked per provider
- **Reports**: Show which storage performs better
