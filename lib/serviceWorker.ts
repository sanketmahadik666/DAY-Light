/**
 * Service Worker registration and management
 */

// Service Worker will be served from public directory
const SW_PATH = process.env.NODE_ENV === 'production' ? '/sw.js' : '/sw.js';
const SW_SCOPE = '/';

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_PATH, {
      scope: SW_SCOPE,
    });

    // Check for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New SW available, but not yet active
            console.log('New service worker available');
          }
        });
      }
    });

    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}

export async function unregisterServiceWorker(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    if (registration) {
      await registration.unregister();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Service Worker unregistration failed:', error);
    return false;
  }
}

/**
 * Send message to Service Worker
 */
export async function sendMessageToSW(message: any): Promise<any> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    return new Promise((resolve, reject) => {
      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = (event) => {
        if (event.data.success) {
          resolve(event.data);
        } else {
          reject(new Error(event.data.error));
        }
      };

      registration.active?.postMessage(message, [messageChannel.port2]);
      
      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('SW message timeout')), 5000);
    });
  } catch (error) {
    console.error('Error sending message to SW:', error);
    return null;
  }
}

/**
 * Request image cache pruning
 */
export async function pruneImageCache(): Promise<boolean> {
  try {
    await sendMessageToSW({ type: 'PRUNE_IMAGES' });
    return true;
  } catch (error) {
    console.error('Error pruning image cache:', error);
    return false;
  }
}

