# Resilience & Error Handling - Complete Workflow

## Client-Side Resilience

### Event Collection
- **Offline Detection**: Automatically detects network status
- **Queue Management**: Failed events queued in localStorage
- **Retry Logic**: Exponential backoff (max 3 retries)
- **Persistent Queue**: Survives page reloads (24h TTL)
- **Batch Flushing**: Prevents overwhelming server
- **SendBeacon**: Reliable delivery on page unload

### Error Handling
- **Graceful Degradation**: Continues working even if analytics fails
- **Silent Failures**: Errors logged but don't break app
- **Queue Limits**: Prevents localStorage overflow (max 100 items)
- **Auto-Retry**: Processes failed queue when back online

## Server-Side Resilience

### MongoDB Connection
- **Connection Pooling**: Min 2, Max 10 connections
- **Auto-Reconnect**: Exponential backoff (max 5 attempts)
- **Health Checks**: Ping every 30 seconds
- **Graceful Shutdown**: Closes connections on SIGTERM/SIGINT
- **Event Listeners**: Monitors connection state

### Data Validation
- **Input Validation**: Validates all event data before processing
- **Type Checking**: Ensures correct data types
- **Range Validation**: Prevents invalid values
- **Pattern Matching**: Validates date formats, etc.
- **Batch Limits**: Prevents overload (max 1000 events per batch)

### Error Handling
- **Try-Catch Blocks**: All async operations wrapped
- **Operational Errors**: User-friendly error messages
- **Error Logging**: Comprehensive error logging
- **Graceful Degradation**: Returns partial data if some queries fail
- **Fallback Aggregation**: On-the-fly aggregation if reports missing

### Storage Health Monitoring
- **MinIO Health**: Checks availability every 30 seconds
- **Cloudinary Health**: Monitors Cloudinary status
- **Automatic Fallback**: Switches to backup provider if primary fails
- **Health Endpoint**: `/health` shows provider status

## Workflow Resilience

### Event Collection Flow
```
1. Event Collected → Memory Buffer
2. Batch Size Reached OR 30s Elapsed → Flush
3. Network Check → Online?
   - Yes → Send to Server
   - No → Queue in localStorage
4. Send Success? → Clear Buffer
5. Send Failed? → Queue for Retry
6. Retry Queue → Process when Online
```

### Server Processing Flow
```
1. Receive Events → Validate
2. Validation Passed? → Insert to MongoDB
3. MongoDB Available? → Insert Events
4. MongoDB Unavailable? → Return Success (Queue for Later)
5. Background Aggregation → Non-blocking
6. Aggregation Failed? → Log, Don't Fail Request
```

### Report Generation Flow
```
1. Request Reports → Check MongoDB Connection
2. Connection Healthy? → Query Reports
3. Reports Exist? → Return Pre-computed Data
4. Reports Missing? → Fallback Aggregation
5. Aggregation Failed? → Return Empty Data (Don't Crash)
```

## Edge Cases Handled

### Network Issues
- ✅ Offline detection
- ✅ Queue persistence
- ✅ Auto-retry on reconnect
- ✅ SendBeacon for page unload

### Database Issues
- ✅ Connection pooling
- ✅ Auto-reconnect
- ✅ Health monitoring
- ✅ Graceful degradation

### Storage Issues
- ✅ MinIO unavailable → Fallback to Cloudinary
- ✅ Cloudinary unavailable → Fallback to MinIO
- ✅ Both unavailable → Return error (don't crash)

### Data Issues
- ✅ Invalid events → Validation errors
- ✅ Missing fields → Default values
- ✅ Large batches → Batch limiting
- ✅ Date range too large → Validation error

### Performance Issues
- ✅ Slow queries → Timeout handling
- ✅ Large datasets → Result limiting
- ✅ Memory issues → Batch processing
- ✅ CPU overload → Background processing

## Monitoring & Health Checks

### Client Health
- Queue status: `analyticsCollector.getQueueStatus()`
- Session ID: `analyticsCollector.getSessionId()`
- Online status: Automatic detection

### Server Health
- MongoDB: `/api/analytics/health`
- Storage: `/health` (storage service)
- Connection stats: Available via health endpoints

## Recovery Strategies

1. **Client Offline**: Events queued, auto-flush on reconnect
2. **Server Down**: Events queued, retry with backoff
3. **MongoDB Down**: Return success, queue for later processing
4. **Storage Down**: Automatic fallback to backup provider
5. **Validation Failed**: Return 400 with error details
6. **Aggregation Failed**: Log error, return partial data

## Performance Optimizations

- **Batch Processing**: Events batched (50 events or 30s)
- **Connection Pooling**: Reuse MongoDB connections
- **Indexed Queries**: All queries use indexes
- **Result Limiting**: Prevent excessive data transfer
- **Background Processing**: Aggregation doesn't block API
- **Caching**: Pre-computed reports for fast reads

## All Conditions Covered

✅ **Online/Offline**: Automatic detection and queueing  
✅ **Network Failures**: Retry with exponential backoff  
✅ **Database Failures**: Graceful degradation  
✅ **Storage Failures**: Automatic fallback  
✅ **Invalid Data**: Validation and error messages  
✅ **Large Datasets**: Batching and limiting  
✅ **High Load**: Connection pooling and queuing  
✅ **Memory Issues**: Batch processing and cleanup  
✅ **Page Unload**: SendBeacon for reliable delivery  
✅ **Service Restart**: Persistent queue survives restarts

The workflow is designed to work smoothly in all conditions with comprehensive error handling and graceful degradation.
