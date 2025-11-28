/**
 * Service Worker for DAY-LIGHT v3.0-final
 * Caches remote images, applies LRU pruning, serves offline assets
 * Must never intercept Next.js internal routes
 */

const CACHE_VERSION = 'v1';
const CACHES = {
  static: `dl-static-${CACHE_VERSION}`,
  json: `dl-json-${CACHE_VERSION}`,
  images: `dl-images-${CACHE_VERSION}`,
};

const MAX_IMAGES = 120;
const PRECACHED_ICONS = [
  '/fallback/person_silhouette.svg',
  '/fallback/landmark_icon.svg',
  '/fallback/atom_or_rocket_icon.svg',
  '/fallback/currency_icon.svg',
  '/fallback/stadium_or_ball_icon.svg',
  '/fallback/colorful_event_icon.svg',
  '/fallback/galaxy_placeholder.svg',
  '/fallback/music_or_movie_icon.svg',
  '/fallback/trophy_icon.svg',
  '/fallback/chip_or_circuit_icon.svg',
  '/fallback/default-placeholder.png',
];

// Allowed hosts for caching
const ALLOWED_HOSTS = [
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'images-assets.nasa.gov',
  'apod.nasa.gov',
  'static.photos',
  'api.openverse.engineering',
];

// Never cache these paths
const BLOCKED_PATHS = [
  '/_next/',
  '/api/',
  '/_webpack/',
];

/**
 * Check if URL should be cached
 */
function shouldCache(url) {
  // Never cache Next.js internal routes
  if (BLOCKED_PATHS.some(path => url.pathname.startsWith(path))) {
    return false;
  }

  // Only cache from allowed hosts
  if (ALLOWED_HOSTS.some(host => url.hostname.includes(host))) {
    return true;
  }

  // Cache static JSON files
  if (url.pathname.startsWith('/static-data/') && url.pathname.endsWith('.json')) {
    return true;
  }

  // Cache fallback icons
  if (url.pathname.startsWith('/fallback/')) {
    return true;
  }

  return false;
}

/**
 * Determine which cache to use
 */
function getCacheName(url) {
  if (url.pathname.startsWith('/static-data/') || url.pathname.startsWith('/fallback/')) {
    return CACHES.static;
  }
  if (url.pathname.endsWith('.json')) {
    return CACHES.json;
  }
  // Images
  return CACHES.images;
}

/**
 * LRU pruning for images cache
 */
async function pruneImagesCache() {
  try {
    const cache = await caches.open(CACHES.images);
    const keys = await cache.keys();
    
    if (keys.length <= MAX_IMAGES) return;

    // Get all requests with their response metadata
    const entries = await Promise.all(
      keys.map(async (request) => {
        const response = await cache.match(request);
        const dateHeader = response?.headers.get('date') || response?.headers.get('sw-cache-date');
        return {
          request,
          date: dateHeader ? new Date(dateHeader).getTime() : Date.now(),
        };
      })
    );

    // Sort by date (oldest first)
    entries.sort((a, b) => a.date - b.date);

    // Delete oldest entries
    const toDelete = entries.slice(0, entries.length - MAX_IMAGES);
    await Promise.all(toDelete.map(entry => cache.delete(entry.request)));
  } catch (error) {
    console.error('Error pruning images cache:', error);
  }
}

/**
 * Install: Precache fallback icons
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHES.static);
      await cache.addAll(PRECACHED_ICONS);
      self.skipWaiting(); // Activate immediately
    })()
  );
});

/**
 * Activate: Clean up old caches, prune images
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(name => name.startsWith('dl-') && !Object.values(CACHES).includes(name))
          .map(name => caches.delete(name))
      );

      // Prune images cache
      await pruneImagesCache();

      await self.clients.claim();
    })()
  );
});

/**
 * Fetch: Cache-first strategy for images, network-first for JSON
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle image requests
  if (request.destination !== 'image') {
    return;
  }

  // Never intercept Next.js internal routes
  if (BLOCKED_PATHS.some(path => url.pathname.startsWith(path))) {
    return; // Let browser handle it
  }

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Check if we should cache this
  if (!shouldCache(url)) {
    return;
  }

  const cacheName = getCacheName(url);

  event.respondWith(
    (async () => {
      try {
        // For images: Cache-first strategy
        if (cacheName === CACHES.images) {
          const cache = await caches.open(cacheName);
          const cached = await cache.match(request);
          
          if (cached) {
            return cached;
          }

          // Fetch from network
          try {
            const response = await fetch(request);
            if (response.ok) {
              // CRITICAL: Validate MIME type before caching
              // NEVER cache HTML or JSON in image cache
              const contentType = response.headers.get('content-type');
              if (!contentType || !contentType.startsWith('image/')) {
                // Not an image, don't cache
                console.warn('SW: Rejecting non-image content-type:', contentType);
                return response; // Return but don't cache
              }
              
              // Validate it's a supported image type
              const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
              if (!validImageTypes.some(type => contentType.includes(type))) {
                console.warn('SW: Rejecting unsupported image type:', contentType);
                return response; // Return but don't cache
              }
              
              // Check size (if available in headers)
              const contentLength = response.headers.get('content-length');
              if (contentLength) {
                const size = parseInt(contentLength, 10);
                if (size > 2 * 1024 * 1024) {
                  // > 2MB, reject
                  console.warn('SW: Rejecting image > 2MB');
                  return response; // Return but don't cache
                }
              }
              
              // Clone response before caching
              const responseToCache = response.clone();
              
              // Add cache date header
              const headers = new Headers(responseToCache.headers);
              headers.set('sw-cache-date', new Date().toISOString());
              
              const modifiedResponse = new Response(responseToCache.body, {
                status: responseToCache.status,
                statusText: responseToCache.statusText,
                headers,
              });

              await cache.put(request, modifiedResponse);
              
              // Prune if needed
              await pruneImagesCache();
              
              return response;
            }
          } catch (error) {
            // Network failed, return cached if available
            const cached = await cache.match(request);
            if (cached) return cached;
            throw error;
          }
        }

        // For JSON: Network-first, fallback to cache
        if (cacheName === CACHES.json) {
          try {
            const response = await fetch(request);
            if (response.ok) {
              const cache = await caches.open(cacheName);
              await cache.put(request, response.clone());
            }
            return response;
          } catch (error) {
            const cache = await caches.open(cacheName);
            const cached = await cache.match(request);
            if (cached) return cached;
            throw error;
          }
        }

        // For static: Cache-first
        const cache = await caches.open(cacheName);
        const cached = await cache.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        console.error('SW fetch error:', error);
        throw error;
      }
    })()
  );
});

/**
 * Message handler for cache management
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PRUNE_IMAGES') {
    pruneImagesCache().then(() => {
      event.ports[0].postMessage({ success: true });
    }).catch((error) => {
      event.ports[0].postMessage({ success: false, error: error.message });
    });
  }
});

