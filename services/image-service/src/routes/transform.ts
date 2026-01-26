/**
 * Image Transform API Routes
 */

import { Router, Request, Response } from 'express';
import { imageProcessor, ImageTransformOptions } from '../image-processor';
import { asyncHandler, OperationalError } from '../middleware/error-handler';

const router = Router();

/**
 * POST /api/transform
 * Transform image with options
 */
router.post(
  '/transform',
  asyncHandler(async (req: Request, res: Response) => {
    const { imageUrl, options } = req.body;

    if (!imageUrl) {
      throw new OperationalError('imageUrl is required', 400);
    }

    // Fetch image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new OperationalError(`Failed to fetch image: ${imageResponse.statusText}`, 400);
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    // Process image
    const transformOptions: ImageTransformOptions = {
      width: options?.width,
      height: options?.height,
      quality: options?.quality || 85,
      format: options?.format || 'webp',
      fit: options?.fit || 'cover',
      position: options?.position || 'center',
      blur: options?.blur,
      sharpen: options?.sharpen,
      grayscale: options?.grayscale,
      rotate: options?.rotate,
      flip: options?.flip,
      flop: options?.flop,
    };

    const result = await imageProcessor.processImage(imageBuffer, transformOptions);

    // Set headers
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', result.size.toString());
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    // Send image
    res.send(result.buffer);
  })
);

/**
 * POST /api/optimize
 * Optimize image (reduce size)
 */
router.post(
  '/optimize',
  asyncHandler(async (req: Request, res: Response) => {
    const { imageUrl, maxWidth, maxHeight, format } = req.body;

    if (!imageUrl) {
      throw new OperationalError('imageUrl is required', 400);
    }

    // Fetch image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new OperationalError(`Failed to fetch image: ${imageResponse.statusText}`, 400);
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    // Optimize
    const result = await imageProcessor.optimizeImage(
      imageBuffer,
      maxWidth,
      maxHeight,
      format || 'webp'
    );

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', result.size.toString());
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    res.send(result.buffer);
  })
);

/**
 * POST /api/thumbnail
 * Generate thumbnail
 */
router.post(
  '/thumbnail',
  asyncHandler(async (req: Request, res: Response) => {
    const { imageUrl, width = 400, height = 300 } = req.body;

    if (!imageUrl) {
      throw new OperationalError('imageUrl is required', 400);
    }

    // Fetch image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new OperationalError(`Failed to fetch image: ${imageResponse.statusText}`, 400);
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    // Generate thumbnail
    const result = await imageProcessor.generateThumbnail(imageBuffer, width, height);

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', result.size.toString());
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    res.send(result.buffer);
  })
);

/**
 * GET /api/metadata?url=...
 * Get image metadata
 */
router.get(
  '/metadata',
  asyncHandler(async (req: Request, res: Response) => {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      throw new OperationalError('url query parameter is required', 400);
    }

    // Fetch image
    const imageResponse = await fetch(url);
    if (!imageResponse.ok) {
      throw new OperationalError(`Failed to fetch image: ${imageResponse.statusText}`, 400);
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    // Get metadata
    const metadata = await imageProcessor.getMetadata(imageBuffer);

    res.json({
      success: true,
      data: {
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
        channels: metadata.channels,
        hasAlpha: metadata.hasAlpha,
        hasProfile: metadata.hasProfile,
        size: imageBuffer.length,
        density: metadata.density,
        orientation: metadata.orientation,
        space: metadata.space,
      },
    });
  })
);

export default router;
