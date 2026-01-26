/**
 * Storage Sync API Route
 * Handles batch upload of gallery images with proper hierarchical organization
 */

import { NextRequest, NextResponse } from 'next/server';

const STORAGE_SERVICE_URL = process.env.STORAGE_SERVICE_URL || 'http://localhost:3002';

interface GalleryImageSync {
  url: string;
  thumbnailUrl: string;
  source: string;
  alt: string;
  width: number;
  height: number;
  factId: string;
  date: string;
  category: string;
  title: string;
}

/**
 * POST /api/storage/sync
 * Batch sync gallery images to storage
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { images }: { images: GalleryImageSync[] } = body;

    if (!Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Images array is required' },
        { status: 400 }
      );
    }

    // Validate all images have required fields
    for (const img of images) {
      if (!img.url || !img.factId || !img.date) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields: url, factId, date' },
          { status: 400 }
        );
      }
    }

    // Group images by factId for efficient processing
    const imagesByFact = new Map<string, GalleryImageSync[]>();
    images.forEach((img) => {
      const factImages = imagesByFact.get(img.factId) || [];
      factImages.push(img);
      imagesByFact.set(img.factId, factImages);
    });

    const results = {
      synced: 0,
      failed: 0,
      storageRefs: [] as Array<{
        originalUrl: string;
        storageKey: string;
        storageUrl: string;
        thumbnailUrl?: string;
        provider: 'minio' | 'cloudinary';
      }>,
    };

    // Process each fact's images
    for (const [factId, factImages] of imagesByFact.entries()) {
      for (let i = 0; i < factImages.length; i++) {
        const img = factImages[i];
        
        try {
          // Generate hierarchical storage key
          const storageKey = `facts/${img.date}/${factId}/gallery/${i}-${Date.now()}.jpg`;
          
          // Fetch image
          const imageResponse = await fetch(img.url, {
            headers: {
              'User-Agent': 'DAY-LIGHT/3.0',
            },
          });

          if (!imageResponse.ok) {
            throw new Error(`Failed to fetch image: ${imageResponse.status}`);
          }

          const imageBlob = await imageResponse.blob();

          // Upload to storage service
          const formData = new FormData();
          formData.append('file', imageBlob, `${i}-${factId}.jpg`);
          formData.append('factId', factId);
          formData.append('date', img.date);
          formData.append('type', 'gallery-image');
          formData.append('storageKey', storageKey);
          formData.append('metadata', JSON.stringify({
            source: img.source,
            alt: img.alt,
            width: img.width,
            height: img.height,
            category: img.category,
            title: img.title,
            originalUrl: img.url,
            thumbnailUrl: img.thumbnailUrl,
          }));

          const uploadResponse = await fetch(`${STORAGE_SERVICE_URL}/api/upload`, {
            method: 'POST',
            body: formData,
          });

          if (!uploadResponse.ok) {
            throw new Error(`Upload failed: ${uploadResponse.status}`);
          }

          const uploadResult = await uploadResponse.json();
          
          if (uploadResult.success) {
            results.synced++;
            results.storageRefs.push({
              originalUrl: img.url,
              storageKey: uploadResult.data.key,
              storageUrl: uploadResult.data.url,
              thumbnailUrl: uploadResult.data.thumbnailUrl,
              provider: uploadResult.data.provider,
            });
          } else {
            throw new Error(uploadResult.error || 'Upload failed');
          }
        } catch (error) {
          console.error(`Failed to sync image ${img.url}:`, error);
          results.failed++;
        }
      }
    }

    // Update metadata service with storage references
    if (results.storageRefs.length > 0) {
      try {
        const METADATA_SERVICE_URL = process.env.METADATA_SERVICE_URL || 'http://localhost:3001';
        const factId = images[0].factId;
        
        await fetch(`${METADATA_SERVICE_URL}/api/facts/${factId}/gallery`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            galleryImages: results.storageRefs.map(ref => ({
              storageRef: {
                provider: ref.provider,
                key: ref.storageKey,
                url: ref.storageUrl,
              },
              metadata: {
                source: 'gallery-sync',
                alt: ref.originalUrl,
              },
            })),
          }),
        });
      } catch (error) {
        console.error('Failed to update metadata:', error);
        // Don't fail the entire sync if metadata update fails
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Storage sync error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
