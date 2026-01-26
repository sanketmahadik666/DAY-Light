/**
 * Analytics Data Collector (Client-Side)
 * Resilient event collection with retry, queue, and graceful degradation
 */

interface RawFactViewEvent {
  factId: string;
  date: string; // YYYY-MM-DD
  category: string;
  timestamp: number;
  viewDuration?: number;
  slideIndex: number;
  sessionId?: string;
}

interface RawAPICallEvent {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  timestamp: number;
  success: boolean;
  error?: string;
  requestSize?: number;
  responseSize?: number;
  sessionId?: string;
}

interface RawImageLoadEvent {
  factId: string;
  imageUrl: string;
  storageProvider?: 'minio' | 'cloudinary';
  loadTime: number;
  timestamp: number;
  success: boolean;
  sessionId?: string;
}

interface QueuedEvent {
  type: 'factView' | 'apiCall' | 'imageLoad';
  data: RawFactViewEvent | RawAPICallEvent | RawImageLoadEvent;
  retryCount: number;
  queuedAt: number;
}

class AnalyticsCollector {
  private factViews: RawFactViewEvent[] = [];
  private apiCalls: RawAPICallEvent[] = [];
  private imageLoads: RawImageLoadEvent[] = [];
  private failedQueue: QueuedEvent[] = []; // Persistent queue for failed events
  private readonly BATCH_SIZE = 50;
  private readonly FLUSH_INTERVAL = 30000; // 30 seconds
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 5000; // 5 seconds
  private flushTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private sessionId: string;
  private isOnline: boolean = true;
  private isFlushing: boolean = false;

  constructor() {
    // Generate session ID
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (typeof window !== 'undefined') {
      this.startAutoFlush();
      this.startRetryQueue();
      this.setupOnlineListener();
      this.loadPersistedQueue();
      
      // Flush on page unload
      window.addEventListener('beforeunload', () => {
        this.flushSync();
      });

      // Flush on visibility change (tab switch)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flushSync();
        }
      });
    }
  }

  /**
   * Setup online/offline listener
   */
  private setupOnlineListener(): void {
    if (typeof window === 'undefined') return;

    this.isOnline = navigator.onLine;

    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('[Analytics] Back online, flushing queue');
      this.flush();
      this.processFailedQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('[Analytics] Gone offline, queuing events');
    });
  }

  /**
   * Load persisted queue from localStorage
   */
  private loadPersistedQueue(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem('analytics_failed_queue');
      if (stored) {
        const queue = JSON.parse(stored) as QueuedEvent[];
        this.failedQueue = queue.filter((item) => {
          // Remove events older than 24 hours
          return Date.now() - item.queuedAt < 24 * 60 * 60 * 1000;
        });
        
        if (this.failedQueue.length > 0) {
          console.log(`[Analytics] Loaded ${this.failedQueue.length} queued events`);
          this.persistQueue();
        }
      }
    } catch (error) {
      console.error('[Analytics] Failed to load persisted queue:', error);
    }
  }

  /**
   * Persist failed queue to localStorage
   */
  private persistQueue(): void {
    if (typeof window === 'undefined') return;

    try {
      // Limit queue size to prevent localStorage overflow
      const maxQueueSize = 100;
      const queueToStore = this.failedQueue.slice(0, maxQueueSize);
      localStorage.setItem('analytics_failed_queue', JSON.stringify(queueToStore));
    } catch (error) {
      console.error('[Analytics] Failed to persist queue:', error);
      // If localStorage is full, remove oldest items
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        this.failedQueue = this.failedQueue.slice(0, 50);
        try {
          localStorage.setItem('analytics_failed_queue', JSON.stringify(this.failedQueue));
        } catch (e) {
          // If still fails, clear queue
          this.failedQueue = [];
          localStorage.removeItem('analytics_failed_queue');
        }
      }
    }
  }

  /**
   * Track fact view (raw event only)
   */
  trackFactView(factId: string, date: string, category: string, slideIndex: number): () => void {
    const startTime = Date.now();
    const event: RawFactViewEvent = {
      factId,
      date,
      category,
      timestamp: startTime,
      slideIndex,
      sessionId: this.sessionId,
    };

    this.factViews.push(event);

    // Return function to track view duration
    return () => {
      const duration = Date.now() - startTime;
      event.viewDuration = duration;
    };
  }

  /**
   * Track API call (raw event only)
   */
  trackAPICall(
    endpoint: string,
    method: string,
    statusCode: number,
    responseTime: number,
    success: boolean,
    error?: string,
    requestSize?: number,
    responseSize?: number
  ): void {
    const event: RawAPICallEvent = {
      endpoint,
      method,
      statusCode,
      responseTime,
      timestamp: Date.now(),
      success,
      error,
      requestSize,
      responseSize,
      sessionId: this.sessionId,
    };

    this.apiCalls.push(event);

    // Auto-flush if batch size reached
    if (this.apiCalls.length >= this.BATCH_SIZE) {
      this.flush();
    }
  }

  /**
   * Track image load (raw event only)
   */
  trackImageLoad(
    factId: string,
    imageUrl: string,
    loadTime: number,
    success: boolean,
    storageProvider?: 'minio' | 'cloudinary'
  ): void {
    const event: RawImageLoadEvent = {
      factId,
      imageUrl,
      storageProvider,
      loadTime,
      timestamp: Date.now(),
      success,
      sessionId: this.sessionId,
    };

    this.imageLoads.push(event);
  }

  /**
   * Start auto-flush timer
   */
  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      if (!this.isFlushing && (this.factViews.length > 0 || this.apiCalls.length > 0 || this.imageLoads.length > 0)) {
        this.flush();
      }
    }, this.FLUSH_INTERVAL);
  }

  /**
   * Start retry queue processor
   */
  private startRetryQueue(): void {
    this.retryTimer = setInterval(() => {
      if (this.isOnline && this.failedQueue.length > 0) {
        this.processFailedQueue();
      }
    }, this.RETRY_DELAY);
  }

  /**
   * Process failed queue with exponential backoff
   */
  private async processFailedQueue(): Promise<void> {
    if (this.failedQueue.length === 0 || !this.isOnline) return;

    const toRetry = this.failedQueue.filter((item) => item.retryCount < this.MAX_RETRIES);
    if (toRetry.length === 0) {
      // Remove items that exceeded max retries
      this.failedQueue = this.failedQueue.filter((item) => item.retryCount >= this.MAX_RETRIES);
      this.persistQueue();
      return;
    }

    // Process oldest items first
    toRetry.sort((a, b) => a.queuedAt - b.queuedAt);
    const batch = toRetry.slice(0, 10); // Process 10 at a time

    for (const item of batch) {
      try {
        const payload = this.buildPayloadFromQueueItem(item);
        const success = await this.sendToBackend(payload);

        if (success) {
          // Remove from queue
          this.failedQueue = this.failedQueue.filter((q) => q !== item);
        } else {
          // Increment retry count
          item.retryCount++;
        }
      } catch (error) {
        item.retryCount++;
      }
    }

    this.persistQueue();
  }

  /**
   * Build payload from queue item
   */
  private buildPayloadFromQueueItem(item: QueuedEvent): any {
    const payload: any = {
      sessionId: this.sessionId,
      timestamp: Date.now(),
    };

    if (item.type === 'factView') {
      payload.factViews = [item.data];
    } else if (item.type === 'apiCall') {
      payload.apiCalls = [item.data];
    } else if (item.type === 'imageLoad') {
      payload.imageLoads = [item.data];
    }

    return payload;
  }

  /**
   * Send payload to backend with timeout
   */
  private async sendToBackend(payload: any): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch('/api/analytics/collect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return true;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('[Analytics] Request timeout');
      } else {
        console.warn('[Analytics] Send failed:', error);
      }
      
      return false;
    }
  }

  /**
   * Flush raw events to backend (NO processing)
   */
  async flush(): Promise<void> {
    if (this.isFlushing) return;
    if (!this.isOnline) {
      console.log('[Analytics] Offline, queuing events');
      this.queueCurrentEvents();
      return;
    }

    if (this.factViews.length === 0 && this.apiCalls.length === 0 && this.imageLoads.length === 0) {
      return;
    }

    this.isFlushing = true;

    const payload = {
      factViews: [...this.factViews],
      apiCalls: [...this.apiCalls],
      imageLoads: [...this.imageLoads],
      sessionId: this.sessionId,
      timestamp: Date.now(),
    };

    // Clear buffers immediately (optimistic)
    this.factViews = [];
    this.apiCalls = [];
    this.imageLoads = [];

    try {
      const success = await this.sendToBackend(payload);

      if (!success) {
        // Re-queue events on failure
        this.queuePayload(payload);
      }
    } catch (error) {
      console.error('[Analytics] Flush error:', error);
      // Re-queue events on error
      this.queuePayload(payload);
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Queue current events for retry
   */
  private queueCurrentEvents(): void {
    this.factViews.forEach((event) => {
      this.failedQueue.push({
        type: 'factView',
        data: event,
        retryCount: 0,
        queuedAt: Date.now(),
      });
    });

    this.apiCalls.forEach((event) => {
      this.failedQueue.push({
        type: 'apiCall',
        data: event,
        retryCount: 0,
        queuedAt: Date.now(),
      });
    });

    this.imageLoads.forEach((event) => {
      this.failedQueue.push({
        type: 'imageLoad',
        data: event,
        retryCount: 0,
        queuedAt: Date.now(),
      });
    });

    this.factViews = [];
    this.apiCalls = [];
    this.imageLoads = [];
    this.persistQueue();
  }

  /**
   * Queue payload for retry
   */
  private queuePayload(payload: any): void {
    if (payload.factViews) {
      payload.factViews.forEach((event: RawFactViewEvent) => {
        this.failedQueue.push({
          type: 'factView',
          data: event,
          retryCount: 0,
          queuedAt: Date.now(),
        });
      });
    }

    if (payload.apiCalls) {
      payload.apiCalls.forEach((event: RawAPICallEvent) => {
        this.failedQueue.push({
          type: 'apiCall',
          data: event,
          retryCount: 0,
          queuedAt: Date.now(),
        });
      });
    }

    if (payload.imageLoads) {
      payload.imageLoads.forEach((event: RawImageLoadEvent) => {
        this.failedQueue.push({
          type: 'imageLoad',
          data: event,
          retryCount: 0,
          queuedAt: Date.now(),
        });
      });
    }

    this.persistQueue();
  }

  /**
   * Synchronous flush (for page unload)
   */
  flushSync(): void {
    if (this.factViews.length === 0 && this.apiCalls.length === 0 && this.imageLoads.length === 0) {
      return;
    }

    const payload = {
      factViews: [...this.factViews],
      apiCalls: [...this.apiCalls],
      imageLoads: [...this.imageLoads],
      sessionId: this.sessionId,
      timestamp: Date.now(),
    };

    // Use sendBeacon for reliable delivery on page unload
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics/collect', blob);
    } else {
      // Fallback: Use fetch with keepalive
      fetch('/api/analytics/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        // If fetch fails, queue for retry
        this.queuePayload(payload);
      });
    }

    // Clear buffers
    this.factViews = [];
    this.apiCalls = [];
    this.imageLoads = [];
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): { failed: number; pending: number } {
    return {
      failed: this.failedQueue.length,
      pending: this.factViews.length + this.apiCalls.length + this.imageLoads.length,
    };
  }
}

// Singleton instance
export const analyticsCollector = typeof window !== 'undefined' 
  ? new AnalyticsCollector()
  : null;

/**
 * Hook for tracking fact views
 */
export function useFactViewTracking() {
  if (!analyticsCollector) {
    return () => () => {};
  }

  return (factId: string, date: string, category: string, slideIndex: number) => {
    return analyticsCollector.trackFactView(factId, date, category, slideIndex);
  };
}

/**
 * API call wrapper with performance tracking and retry
 */
export async function trackedFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const startTime = performance.now();
  const method = options?.method || 'GET';
  let requestSize = 0;
  let responseSize = 0;

  // Estimate request size
  if (options?.body) {
    if (typeof options.body === 'string') {
      requestSize = new Blob([options.body]).size;
    } else if (options.body instanceof FormData) {
      // FormData size estimation
      requestSize = Array.from(options.body.entries()).reduce((size, [key, value]) => {
        return size + key.length + (value instanceof File ? value.size : String(value).length);
      }, 0);
    }
  }

  try {
    const response = await fetch(url, options);
    const responseTime = performance.now() - startTime;

    // Get response size from headers
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      responseSize = parseInt(contentLength, 10);
    } else {
      // Clone response to read body for size if needed
      try {
        const clonedResponse = response.clone();
        const blob = await clonedResponse.blob();
        responseSize = blob.size;
      } catch (e) {
        // Ignore if can't read body
      }
    }

    analyticsCollector?.trackAPICall(
      url,
      method,
      response.status,
      responseTime,
      response.ok,
      response.ok ? undefined : `HTTP ${response.status}`,
      requestSize,
      responseSize
    );

    return response;
  } catch (error) {
    const responseTime = performance.now() - startTime;

    analyticsCollector?.trackAPICall(
      url,
      method,
      0,
      responseTime,
      false,
      error instanceof Error ? error.message : 'Unknown error',
      requestSize,
      0
    );

    throw error;
  }
}

/**
 * Track image load
 */
export function trackImageLoad(
  factId: string,
  imageUrl: string,
  loadTime: number,
  success: boolean,
  storageProvider?: 'minio' | 'cloudinary'
): void {
  analyticsCollector?.trackImageLoad(factId, imageUrl, loadTime, success, storageProvider);
}
