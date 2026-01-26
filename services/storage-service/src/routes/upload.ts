/**
 * Upload API Routes
 * Handles file uploads with MinIO and Cloudinary fallback
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { StorageService } from '../storage-service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

export function createUploadRouter(storageService: StorageService): Router {
  const router = Router();

  /**
   * POST /api/upload
   * Upload file to storage
   */
  router.post('/', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file provided',
        });
      }

      const { factId, date, type = 'image' } = req.body;

      // Generate object key
      const objectKey = factId
        ? `facts/${date}/${factId}/${type}-${Date.now()}.${getFileExtension(req.file.originalname)}`
        : `uploads/${Date.now()}-${req.file.originalname}`;

      // Get image dimensions if image
      let width: number | undefined;
      let height: number | undefined;

      if (type === 'image' && req.file.mimetype.startsWith('image/')) {
        try {
          const sharp = require('sharp');
          const metadata = await sharp(req.file.buffer).metadata();
          width = metadata.width;
          height = metadata.height;
        } catch (error) {
          // Ignore if sharp not available
        }
      }

      // Upload to storage
      const result = await storageService.uploadFile(
        objectKey,
        req.file.buffer,
        {
          contentType: req.file.mimetype,
          size: req.file.size,
          width,
          height,
          generateThumbnail: type === 'image',
        }
      );

      res.json({
        success: true,
        data: {
          key: result.key,
          url: result.url,
          thumbnailUrl: result.thumbnailUrl,
          provider: result.provider,
          metadata: result.metadata,
        },
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/files/:key
   * Get file URL (presigned or CDN)
   */
  router.get('/:key', async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const { provider } = req.query;

      const url = await storageService.getFileUrl(
        key,
        provider as 'minio' | 'cloudinary' | undefined
      );

      res.json({
        success: true,
        data: {
          key,
          url,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * DELETE /api/files/:key
   * Delete file from storage
   */
  router.delete('/:key', async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const { provider } = req.query;

      await storageService.deleteFile(key, provider as 'minio' | 'cloudinary' | undefined);

      res.json({
        success: true,
        message: 'File deleted',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/files/:key/exists
   * Check if file exists
   */
  router.get('/:key/exists', async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const { provider } = req.query;

      const exists = await storageService.fileExists(
        key,
        provider as 'minio' | 'cloudinary' | undefined
      );

      res.json({
        success: true,
        data: {
          key,
          exists,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  return router;
}

/**
 * Helper: Get file extension
 */
function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : 'bin';
}
