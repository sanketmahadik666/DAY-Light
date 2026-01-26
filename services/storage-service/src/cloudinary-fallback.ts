/**
 * Cloudinary Fallback Client
 * Used when MinIO is unavailable or for edge delivery
 */

import { v2 as cloudinary, UploadApiResponse, UploadApiOptions } from 'cloudinary';
import { Readable } from 'stream';

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  secure?: boolean;
}

export class CloudinaryFallback {
  private config: CloudinaryConfig;

  constructor(config: CloudinaryConfig) {
    this.config = config;
    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
      secure: config.secure !== false,
    });
  }

  /**
   * Upload file to Cloudinary
   */
  async uploadFile(
    file: Buffer | Readable | string,
    options: {
      publicId?: string;
      folder?: string;
      transformation?: any;
      resourceType?: 'image' | 'video' | 'raw' | 'auto';
    } = {}
  ): Promise<{
    publicId: string;
    url: string;
    secureUrl: string;
    format: string;
    width?: number;
    height?: number;
    bytes: number;
  }> {
    try {
      const uploadOptions: UploadApiOptions = {
        folder: options.folder || 'daylight',
        resource_type: options.resourceType || 'auto',
        ...options.transformation,
      };

      if (options.publicId) {
        uploadOptions.public_id = options.publicId;
      }

      let uploadResult: UploadApiResponse;

      if (typeof file === 'string') {
        // URL upload
        uploadResult = await cloudinary.uploader.upload(file, uploadOptions);
      } else {
        // Buffer or stream upload
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) throw error;
            if (!result) throw new Error('Upload failed');
          }
        );

        if (Buffer.isBuffer(file)) {
          uploadStream.end(file);
        } else {
          file.pipe(uploadStream);
        }

        uploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
          uploadStream.on('finish', (result) => {
            if (result) resolve(result);
            else reject(new Error('Upload failed'));
          });
          uploadStream.on('error', reject);
        });
      }

      return {
        publicId: uploadResult.public_id,
        url: uploadResult.url,
        secureUrl: uploadResult.secure_url,
        format: uploadResult.format,
        width: uploadResult.width,
        height: uploadResult.height,
        bytes: uploadResult.bytes,
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw error;
    }
  }

  /**
   * Generate optimized URL with transformations
   */
  generateUrl(
    publicId: string,
    options: {
      width?: number;
      height?: number;
      quality?: number | 'auto';
      format?: string;
      crop?: string;
    } = {}
  ): string {
    return cloudinary.url(publicId, {
      width: options.width,
      height: options.height,
      quality: options.quality || 'auto',
      format: options.format,
      crop: options.crop || 'limit',
      secure: true,
    });
  }

  /**
   * Delete file from Cloudinary
   */
  async deleteFile(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(publicId: string): Promise<boolean> {
    try {
      const result = await cloudinary.api.resource(publicId);
      return !!result;
    } catch (error: any) {
      if (error.http_code === 404) {
        return false;
      }
      throw error;
    }
  }
}
