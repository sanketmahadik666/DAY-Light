/**
 * Analytics Data Collector (Client-Side)
 * ONLY collects raw events - NO computation/aggregation
 * All processing happens on backend
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

class AnalyticsCollector {
  private factViews: RawFactViewEvent[] = [];
  private apiCalls: RawAPICallEvent[] = [];
  private imageLoads: RawImageLoadEvent[] = [];
  private readonly BATCH_SIZE = 50;
  private readonly FLUSH_INTERVAL = 30000; // 30 seconds
  private flushTimer: NodeJS.Timeout | null = null;
  private sessionId: string;

  constructor() {
    // Generate session ID
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (typeof window !== 'undefined') {
      this.startAutoFlush();
      window.addEventListener('beforeunload', () => this.flush());
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
      this.flush();
    }, this.FLUSH_INTERVAL);
  }

  /**
   * Flush raw events to backend (NO processing)
   */
  async flush(): Promise<void> {
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

    // Clear buffers
    this.factViews = [];
    this.apiCalls = [];
    this.imageLoads = [];

    try {
      const response = await fetch('/api/analytics/collect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to sync analytics: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to flush analytics:', error);
      // Re-add data to buffers on failure (simple retry)
      this.factViews.unshift(...payload.factViews);
      this.apiCalls.unshift(...payload.apiCalls);
      this.imageLoads.unshift(...payload.imageLoads);
    }
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
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
 * API call wrapper with performance tracking
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
    }

    // Clone response to read body for size if needed
    const clonedResponse = response.clone();
    const blob = await clonedResponse.blob();
    if (!responseSize) {
      responseSize = blob.size;
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
