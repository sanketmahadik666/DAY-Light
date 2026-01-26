/**
 * Storage Service
 * Handles object storage with MinIO primary and Cloudinary fallback
 */

import { MinIOClient, MinIOConfig } from './minio-client';
import { CloudinaryFallback, CloudinaryConfig } from './cloudinary-fallback';
import { Readable } from 'stream';

export interface StorageServiceConfig {
  minio: MinIOConfig;
  cloudinary?: CloudinaryConfig;
  fallbackEnabled: boolean;
  primaryProvider: 'minio' | 'cloudinary';
}

export interface UploadResult {
  provider: 'minio' | 'cloudinary';
  key: string;
  url: string;
  thumbnailUrl?: string;
  metadata: {
    size: number;
    contentType: string;
    width?: number;
    height?: number;
  };
}

export class StorageService {
  private minio: MinIOClient;
  private cloudinary?: CloudinaryFallback;
  private config: StorageServiceConfig;

  constructor(config: StorageServiceConfig) {
    this.config = config;
    this.minio = new MinIOClient(config.minio);

    if (config.cloudinary && config.fallbackEnabled) {
      this.cloudinary = new CloudinaryFallback(config.cloudinary);
    }
  }

  /**
   * Upload file with automatic fallback
   */
  async uploadFile(
    objectKey: string,
    data: Buffer | Readable,
    metadata: {
      contentType: string;
      size?: number;
      width?: number;
      height?: number;
      generateThumbnail?: boolean;
    }
  ): Promise<UploadResult> {
    // Try primary provider first
    try {
      if (this.config.primaryProvider === 'minio') {
        return await this.uploadToMinIO(objectKey, data, metadata);
      } else if (this.cloudinary) {
        return await this.uploadToCloudinary(objectKey, data, metadata);
      }
    } catch (error) {
      console.warn('Primary storage failed, attempting fallback:', error);
      
      // Fallback to secondary provider
      if (this.config.fallbackEnabled && this.cloudinary) {
        if (this.config.primaryProvider === 'minio') {
          return await this.uploadToCloudinary(objectKey, data, metadata);
        } else {
          return await this.uploadToMinIO(objectKey, data, metadata);
        }
      }
      
      throw error;
    }

    throw new Error('No storage provider available');
  }

  /**
   * Upload to MinIO
   */
  private async uploadToMinIO(
    objectKey: string,
    data: Buffer | Readable,
    metadata: {
      contentType: string;
      size?: number;
      width?: number;
      height?: number;
      generateThumbnail?: boolean;
    }
  ): Promise<UploadResult> {
    const result = await this.minio.uploadFile(objectKey, data, {
      contentType: metadata.contentType,
      size: metadata.size,
      width: metadata.width,
      height: metadata.height,
    });

    // Generate thumbnail if requested
    let thumbnailUrl: string | undefined;
    if (metadata.generateThumbnail && metadata.width && metadata.height) {
      // For MinIO, we'd need to process the image first
      // This is a placeholder - actual implementation would use sharp or similar
      thumbnailUrl = result.url; // Placeholder
    }

    return {
      provider: 'minio',
      key: result.key,
      url: result.url,
      thumbnailUrl,
      metadata: {
        size: metadata.size || 0,
        contentType: metadata.contentType,
        width: metadata.width,
        height: metadata.height,
      },
    };
  }

  /**
   * Upload to Cloudinary
   */
  private async uploadToCloudinary(
    objectKey: string,
    data: Buffer | Readable,
    metadata: {
      contentType: string;
      size?: number;
      width?: number;
      height?: number;
      generateThumbnail?: boolean;
    }
  ): Promise<UploadResult> {
    if (!this.cloudinary) {
      throw new Error('Cloudinary not configured');
    }

    // Convert Buffer to stream if needed
    let fileData: Buffer | Readable = data;
    if (Buffer.isBuffer(data)) {
      // Cloudinary can handle buffers directly in some cases
      fileData = data;
    }

    const publicId = objectKey.replace(/\//g, '_').replace(/\./g, '_');
    
    const result = await this.cloudinary.uploadFile(fileData, {
      publicId,
      folder: 'daylight',
      resourceType: 'image',
      transformation: metadata.generateThumbnail
        ? {
            width: 400,
            height: 300,
            crop: 'limit',
            quality: 'auto',
          }
        : undefined,
    });

    // Generate thumbnail URL
    const thumbnailUrl = metadata.generateThumbnail
      ? this.cloudinary.generateUrl(result.publicId, {
          width: 400,
          height: 300,
          quality: 'auto',
          crop: 'limit',
        })
      : undefined;

    return {
      provider: 'cloudinary',
      key: publicId,
      url: result.secureUrl,
      thumbnailUrl: thumbnailUrl || result.secureUrl,
      metadata: {
        size: result.bytes,
        contentType: `image/${result.format}`,
        width: result.width,
        height: result.height,
      },
    };
  }

  /**
   * Get file URL (with fallback)
   */
  async getFileUrl(
    objectKey: string,
    provider?: 'minio' | 'cloudinary'
  ): Promise<string> {
    // Try specified provider or primary
    const targetProvider = provider || this.config.primaryProvider;

    try {
      if (targetProvider === 'minio') {
        return await this.minio.getPresignedUrl(objectKey, 3600);
      } else if (this.cloudinary) {
        return this.cloudinary.generateUrl(objectKey);
      }
    } catch (error) {
      // Fallback to alternative
      if (this.config.fallbackEnabled) {
        if (targetProvider === 'minio' && this.cloudinary) {
          return this.cloudinary.generateUrl(objectKey);
        } else {
          return await this.minio.getPresignedUrl(objectKey, 3600);
        }
      }
      throw error;
    }

    throw new Error('No storage provider available');
  }

  /**
   * Delete file from both providers
   */
  async deleteFile(objectKey: string, provider?: 'minio' | 'cloudinary'): Promise<void> {
    const targetProvider = provider || this.config.primaryProvider;

    try {
      if (targetProvider === 'minio') {
        await this.minio.deleteFile(objectKey);
      } else if (this.cloudinary) {
        await this.cloudinary.deleteFile(objectKey);
      }
    } catch (error) {
      console.error('Delete error:', error);
      // Continue to delete from fallback if configured
    }

    // Also delete from fallback if enabled
    if (this.config.fallbackEnabled) {
      try {
        if (targetProvider === 'minio' && this.cloudinary) {
          await this.cloudinary.deleteFile(objectKey);
        } else if (targetProvider === 'cloudinary') {
          await this.minio.deleteFile(objectKey);
        }
      } catch (error) {
        console.warn('Fallback delete failed:', error);
      }
    }
  }

  /**
   * Check file existence
   */
  async fileExists(
    objectKey: string,
    provider?: 'minio' | 'cloudinary'
  ): Promise<boolean> {
    const targetProvider = provider || this.config.primaryProvider;

    try {
      if (targetProvider === 'minio') {
        return await this.minio.fileExists(objectKey);
      } else if (this.cloudinary) {
        return await this.cloudinary.fileExists(objectKey);
      }
    } catch (error) {
      // Try fallback
      if (this.config.fallbackEnabled) {
        if (targetProvider === 'minio' && this.cloudinary) {
          return await this.cloudinary.fileExists(objectKey);
        } else if (targetProvider === 'cloudinary') {
          return await this.minio.fileExists(objectKey);
        }
      }
      return false;
    }

    return false;
  }
}
