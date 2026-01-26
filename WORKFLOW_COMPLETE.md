# Complete Workflow - All Conditions Covered

## End-to-End Resilient Workflow

### Phase 1: Event Collection (Client-Side)

**Location**: `lib/services/analytics-collector.ts`

**Features**:
- ✅ Offline detection (navigator.onLine)
- ✅ Event batching (50 events or 30 seconds)
- ✅ Persistent queue (localStorage, 24h TTL)
- ✅ Retry logic (exponential backoff, max 3 retries)
- ✅ SendBeacon for page unload
- ✅ Queue size limits (max 100 items)
- ✅ Auto-flush on reconnect

**Flow**:
```
User Action → Track Event → Add to Buffer
  ↓
Buffer Full OR 30s Elapsed
  ↓
Check Online Status
  ├─ Online → Send to Server
  │   ├─ Success → Clear Buffer
  │   └─ Failure → Queue for Retry
  └─ Offline → Queue in localStorage
      └─ Auto-retry when Online
```

### Phase 2: Event Validation (Server-Side)

**Location**: `services/metadata-service/src/middleware/validation.ts`

**Features**:
- ✅ Type validation (string, number, boolean, array)
- ✅ Required field checks
- ✅ Pattern matching (date format, etc.)
- ✅ Range validation (min/max values)
- ✅ Batch size limits (max 1000 events)

**Flow**:
```
Receive Events → Validate Each Event
  ├─ Valid → Continue
  └─ Invalid → Return 400 with Errors
```

### Phase 3: Event Storage (Server-Side)

**Location**: `services/metadata-service/src/routes/analytics.ts`

**Features**:
- ✅ MongoDB connection health check
- ✅ Graceful degradation (queue if DB down)
- ✅ Batch inserts with error handling
- ✅ Ordered: false (continue on error)
- ✅ Background aggregation trigger

**Flow**:
```
Validated Events → Check MongoDB Health
  ├─ Healthy → Insert Events
  │   └─ Trigger Background Aggregation
  └─ Unhealthy → Return Success (Queue for Later)
      └─ Events Processed When DB Recovers
```

### Phase 4: Aggregation (Server-Side)

**Location**: `services/metadata-service/src/services/analytics-aggregator.ts`

**Features**:
- ✅ MongoDB aggregation pipelines
- ✅ Efficient computation (server-side)
- ✅ Non-blocking (fire-and-forget)
- ✅ Error handling (log, don't fail)
- ✅ Upsert operations (idempotent)

**Flow**:
```
Raw Events → Aggregation Pipelines
  ├─ Fact Availability → Group by Date
  ├─ Category Preferences → Group by Category
  ├─ API Performance → Calculate Percentiles
  └─ Image Performance → Group by Provider
      ↓
Store in Report Collections
```

### Phase 5: Report Generation (Server-Side)

**Location**: `services/metadata-service/src/routes/analytics.ts`

**Features**:
- ✅ Read from pre-computed reports
- ✅ Fallback to on-the-fly aggregation
- ✅ Result limiting (prevent overload)
- ✅ Date range validation
- ✅ Error boundaries

**Flow**:
```
Request Reports → Check MongoDB Health
  ├─ Healthy → Query Report Collections
  │   ├─ Reports Exist → Return Pre-computed
  │   └─ Reports Missing → Fallback Aggregation
  └─ Unhealthy → Return 503
```

### Phase 6: Dashboard Rendering (Client-Side)

**Location**: `components/analytics/AnalyticsDashboard.tsx`

**Features**:
- ✅ Error boundary (graceful error handling)
- ✅ Loading states
- ✅ Empty states
- ✅ Date range selector
- ✅ Auto-refresh

**Flow**:
```
Load Dashboard → Fetch Reports
  ├─ Success → Render Charts
  ├─ Error → Show Error UI
  └─ Empty → Show Empty State
```

## Resilience Features

### Network Resilience
- **Offline Detection**: Automatic
- **Queue Persistence**: localStorage
- **Retry Logic**: Exponential backoff
- **SendBeacon**: Reliable page unload
- **Timeout Handling**: 10s request timeout

### Database Resilience
- **Connection Pooling**: Min 2, Max 10
- **Auto-Reconnect**: Exponential backoff
- **Health Monitoring**: Every 30s
- **Graceful Degradation**: Queue if unavailable
- **Error Recovery**: Automatic reconnection

### Storage Resilience
- **Health Monitoring**: MinIO + Cloudinary
- **Automatic Fallback**: Primary → Backup
- **Health Checks**: Every 30s
- **Error Handling**: Graceful degradation

### Data Resilience
- **Validation**: All inputs validated
- **Sanitization**: Type checking
- **Batch Limits**: Prevent overload
- **Result Limits**: Prevent excessive data
- **Error Boundaries**: Catch React errors

## Error Scenarios Handled

### Client-Side
1. **Network Offline**: Events queued, auto-flush on reconnect
2. **Request Timeout**: Retry with backoff
3. **Server Error**: Queue for retry
4. **localStorage Full**: Remove oldest items
5. **Page Unload**: SendBeacon for reliable delivery

### Server-Side
1. **MongoDB Down**: Return success, queue for later
2. **Validation Failed**: Return 400 with details
3. **Insert Failed**: Log error, continue with others
4. **Aggregation Failed**: Log error, don't fail request
5. **Query Timeout**: Return partial data
6. **Storage Unavailable**: Automatic fallback

## Performance Guarantees

- **Client**: Zero computation, just collection
- **Server Write**: Fast inserts (indexed)
- **Server Read**: Instant (pre-computed)
- **Aggregation**: Background (non-blocking)
- **Scalability**: Handles millions of events

## Monitoring

- **Client Queue**: `analyticsCollector.getQueueStatus()`
- **MongoDB Health**: `/api/analytics/health`
- **Storage Health**: `/health` (storage service)
- **Connection Stats**: Available via health endpoints

## All Conditions Covered

✅ **Online/Offline**: Auto-detection and queueing  
✅ **Network Failures**: Retry with backoff  
✅ **Database Failures**: Graceful degradation  
✅ **Storage Failures**: Automatic fallback  
✅ **Invalid Data**: Validation and errors  
✅ **Large Datasets**: Batching and limiting  
✅ **High Load**: Connection pooling  
✅ **Memory Issues**: Batch processing  
✅ **Page Unload**: SendBeacon  
✅ **Service Restart**: Persistent queue  
✅ **Partial Failures**: Continue processing  
✅ **Timeout Issues**: Request timeouts  
✅ **Connection Loss**: Auto-reconnect  
✅ **Data Corruption**: Validation prevents  
✅ **Rate Limiting**: Batch size limits

The workflow is production-ready and handles all edge cases gracefully.
