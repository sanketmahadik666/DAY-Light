/**
 * Image Processing Service
 * Handles image optimization, resizing, format conversion using Sharp
 */

import sharp from 'sharp';
import { Readable } from 'stream';

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number; // 1-100
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  position?: 'top' | 'right top' | 'right' | 'right bottom' | 'bottom' | 'left bottom' | 'left' | 'left top' | 'center';
  blur?: number; // 0.3-1000
  sharpen?: boolean;
  grayscale?: boolean;
  rotate?: number;
  flip?: boolean;
  flop?: boolean;
}

export interface ProcessedImageResult {
  buffer: Buffer;
  format: string;
  width: number;
  height: number;
  size: number;
  mimeType: string;
}

export class ImageProcessor {
  /**
   * Process image from buffer
   */
  async processImage(
    input: Buffer | Readable,
    options: ImageTransformOptions = {}
  ): Promise<ProcessedImageResult> {
    const {
      width,
      height,
      quality = 85,
      format = 'webp',
      fit = 'cover',
      position = 'center',
      blur,
      sharpen = false,
      grayscale = false,
      rotate,
      flip = false,
      flop = false,
    } = options;

    let pipeline = sharp(input);

    // Get metadata first
    const metadata = await pipeline.metadata();

    // Apply transformations
    if (width || height) {
      pipeline = pipeline.resize(width, height, {
        fit,
        position,
        withoutEnlargement: true, // Don't upscale
      });
    }

    if (rotate) {
      pipeline = pipeline.rotate(rotate);
    }

    if (flip) {
      pipeline = pipeline.flip();
    }

    if (flop) {
      pipeline = pipeline.flop();
    }

    if (grayscale) {
      pipeline = pipeline.grayscale();
    }

    if (blur && blur > 0) {
      pipeline = pipeline.blur(blur);
    }

    if (sharpen) {
      pipeline = pipeline.sharpen();
    }

    // Format conversion and quality
    switch (format) {
      case 'webp':
        pipeline = pipeline.webp({ quality, effort: 4 });
        break;
      case 'avif':
        pipeline = pipeline.avif({ quality, effort: 4 });
        break;
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality, mozjpeg: true });
        break;
      case 'png':
        pipeline = pipeline.png({ quality, compressionLevel: 9 });
        break;
    }

    const buffer = await pipeline.toBuffer();
    const processedMetadata = await sharp(buffer).metadata();

    return {
      buffer,
      format: processedMetadata.format || format,
      width: processedMetadata.width || metadata.width || 0,
      height: processedMetadata.height || metadata.height || 0,
      size: buffer.length,
      mimeType: `image/${format}`,
    };
  }

  /**
   * Generate thumbnail
   */
  async generateThumbnail(
    input: Buffer | Readable,
    width: number = 400,
    height: number = 300
  ): Promise<ProcessedImageResult> {
    return this.processImage(input, {
      width,
      height,
      fit: 'cover',
      format: 'webp',
      quality: 80,
    });
  }

  /**
   * Optimize image (reduce size while maintaining quality)
   */
  async optimizeImage(
    input: Buffer | Readable,
    maxWidth?: number,
    maxHeight?: number,
    targetFormat: 'webp' | 'avif' = 'webp'
  ): Promise<ProcessedImageResult> {
    const metadata = await sharp(input).metadata();

    let width = metadata.width;
    let height = metadata.height;

    // Calculate optimal dimensions
    if (maxWidth && width && width > maxWidth) {
      const ratio = maxWidth / width;
      width = maxWidth;
      height = height ? Math.round(height * ratio) : undefined;
    }

    if (maxHeight && height && height > maxHeight) {
      const ratio = maxHeight / height;
      height = maxHeight;
      width = width ? Math.round(width * ratio) : undefined;
    }

    return this.processImage(input, {
      width,
      height,
      fit: 'inside', // Maintain aspect ratio
      format: targetFormat,
      quality: 85,
      sharpen: true,
    });
  }

  /**
   * Get image metadata
   */
  async getMetadata(input: Buffer | Readable): Promise<sharp.Metadata> {
    return sharp(input).metadata();
  }

  /**
   * Convert format
   */
  async convertFormat(
    input: Buffer | Readable,
    targetFormat: 'jpeg' | 'png' | 'webp' | 'avif',
    quality: number = 85
  ): Promise<ProcessedImageResult> {
    return this.processImage(input, {
      format: targetFormat,
      quality,
    });
  }

  /**
   * Create responsive image set (multiple sizes)
   */
  async createResponsiveSet(
    input: Buffer | Readable,
    sizes: Array<{ width: number; height?: number }>
  ): Promise<Array<ProcessedImageResult & { size: string }>> {
    const results = await Promise.all(
      sizes.map(async (size) => {
        const result = await this.processImage(input, {
          width: size.width,
          height: size.height,
          fit: 'inside',
          format: 'webp',
          quality: 85,
        });

        return {
          ...result,
          size: `${size.width}w`,
        };
      })
    );

    return results;
  }
}

export const imageProcessor = new ImageProcessor();
