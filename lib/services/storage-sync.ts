/**
 * Storage Sync Service
 * Handles batch upload of gallery images to backend storage with proper hierarchical organization
 */

interface GalleryImageForSync {
  url: string;
  thumbnailUrl: string;
  source: string;
  alt: string;
  width: number;
  height: number;
  factId: string;
  date: string; // YYYY-MM-DD
  category: string;
  title: string;
}

interface SyncResult {
  synced: number;
  failed: number;
  storageRefs: Array<{
    originalUrl: string;
    storageKey: string;
    storageUrl: string;
    thumbnailUrl?: string;
    provider: 'minio' | 'cloudinary';
  }>;
}

interface SyncProgress {
  current: number;
  total: number;
  percentage: number;
}

const STORAGE_SYNC_API = '/api/storage/sync'; // Use Next.js API route
const BATCH_SIZE = 5; // Upload 5 images at a time to avoid overwhelming the server

/**
 * Generate hierarchical storage key
 * Format: facts/{date}/{factId}/gallery/{imageIndex}-{hash}.{ext}
 */
function generateStorageKey(
  factId: string,
  date: string,
  imageIndex: number,
  url: string
): string {
  // Extract file extension
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;
  const ext = pathname.split('.').pop()?.toLowerCase() || 'jpg';
  
  // Generate short hash from URL for uniqueness
  const hash = url.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0).toString(36).slice(0, 8);
  
  // Format: facts/2024-01-15/fact-123/gallery/0-abc123.jpg
  return `facts/${date}/${factId}/gallery/${imageIndex}-${hash}.${ext}`;
}

/**
 * Fetch image as blob for upload
 */
async function fetchImageAsBlob(url: string): Promise<Blob> {
  try {
    const response = await fetch(url, {
      mode: 'cors',
      cache: 'no-cache',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    return await response.blob();
  } catch (error) {
    throw new Error(`Error fetching image ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Upload single image to storage service via Next.js API
 */
async function uploadImageToStorage(
  image: GalleryImageForSync,
  imageIndex: number,
  onProgress?: (progress: SyncProgress) => void
): Promise<{
  originalUrl: string;
  storageKey: string;
  storageUrl: string;
  thumbnailUrl?: string;
  provider: 'minio' | 'cloudinary';
}> {
  try {
    // Generate storage key with hierarchical structure
    const storageKey = generateStorageKey(image.factId, image.date, imageIndex, image.url);
    
    // Fetch image as blob
    const blob = await fetchImageAsBlob(image.url);
    
    // Create FormData for upload
    const formData = new FormData();
    formData.append('file', blob, `${imageIndex}-${image.factId}.jpg`);
    formData.append('factId', image.factId);
    formData.append('date', image.date);
    formData.append('type', 'gallery-image');
    formData.append('storageKey', storageKey);
    formData.append('metadata', JSON.stringify({
      source: image.source,
      alt: image.alt,
      width: image.width,
      height: image.height,
      category: image.category,
      title: image.title,
      originalUrl: image.url,
      thumbnailUrl: image.thumbnailUrl,
    }));

    // Upload via Next.js API route (which handles storage service)
    const STORAGE_SERVICE_URL = process.env.NEXT_PUBLIC_STORAGE_SERVICE_URL || 'http://localhost:3002';
    const response = await fetch(`${STORAGE_SERVICE_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    return {
      originalUrl: image.url,
      storageKey: result.data.key,
      storageUrl: result.data.url,
      thumbnailUrl: result.data.thumbnailUrl,
      provider: result.data.provider,
    };
  } catch (error) {
    console.error(`Failed to upload image ${image.url}:`, error);
    throw error;
  }
}

/**
 * Sync gallery images to storage in batches
 */
export async function syncGalleryImagesToStorage(
  images: GalleryImageForSync[],
  onProgress?: (percentage: number) => void
): Promise<SyncResult> {
  if (images.length === 0) {
    return { synced: 0, failed: 0, storageRefs: [] };
  }

  const storageRefs: SyncResult['storageRefs'] = [];
  let synced = 0;
  let failed = 0;

  // Process in batches to avoid overwhelming the server
  for (let i = 0; i < images.length; i += BATCH_SIZE) {
    const batch = images.slice(i, i + BATCH_SIZE);
    
    // Upload batch in parallel
    const batchPromises = batch.map((image, batchIndex) => {
      const imageIndex = i + batchIndex;
      return uploadImageToStorage(image, imageIndex, (progress) => {
        // Calculate overall progress
        const overallProgress = ((i + progress.current) / images.length) * 100;
        onProgress?.(overallProgress);
      }).catch((error) => {
        console.error(`Batch upload failed for image ${imageIndex}:`, error);
        return null;
      });
    });

    const batchResults = await Promise.allSettled(batchPromises);
    
    batchResults.forEach((result, batchIndex) => {
      if (result.status === 'fulfilled' && result.value) {
        storageRefs.push(result.value);
        synced++;
      } else {
        failed++;
      }
      
      // Update progress
      const currentProgress = ((i + batchIndex + 1) / images.length) * 100;
      onProgress?.(currentProgress);
    });

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < images.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Update metadata service with storage references (async, don't block)
  if (storageRefs.length > 0 && images.length > 0) {
    updateFactWithGalleryRefs(images[0].factId, storageRefs).catch((error) => {
      console.error('Failed to update fact metadata:', error);
      // Don't fail the entire sync if metadata update fails
    });
  }

  return { synced, failed, storageRefs };
}

/**
 * Update fact document with gallery storage references
 */
async function updateFactWithGalleryRefs(
  factId: string,
  storageRefs: SyncResult['storageRefs']
): Promise<void> {
  const METADATA_SERVICE_URL = process.env.NEXT_PUBLIC_METADATA_SERVICE_URL || 'http://localhost:3001';
  
  try {
    const response = await fetch(`${METADATA_SERVICE_URL}/api/facts/${factId}/gallery`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        galleryImages: storageRefs.map(ref => ({
          storageRef: {
            provider: ref.provider,
            key: ref.storageKey,
            url: ref.storageUrl,
          },
          metadata: {
            source: 'gallery-sync',
            alt: ref.originalUrl,
            width: undefined, // Will be populated from original metadata
            height: undefined,
          },
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update fact metadata: ${response.status}`);
    }
  } catch (error) {
    console.error('Error updating fact metadata:', error);
    throw error;
  }
}
