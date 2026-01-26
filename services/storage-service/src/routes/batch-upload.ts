/**
 * Batch Upload API Routes
 * Handles batch uploads with proper hierarchical storage organization
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

export function createBatchUploadRouter(storageService: StorageService): Router {
  const router = Router();

  /**
   * POST /api/upload/batch
   * Batch upload multiple files with hierarchical organization
   */
  router.post('/batch', upload.array('files', 20), async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      const { factId, date, basePath } = req.body;

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files provided',
        });
      }

      if (!factId || !date) {
        return res.status(400).json({
          success: false,
          error: 'factId and date are required',
        });
      }

      const results = [];
      const errors = [];

      // Process files in parallel (with concurrency limit)
      const BATCH_SIZE = 5;
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        
        const batchPromises = batch.map(async (file, batchIndex) => {
          try {
            const fileIndex = i + batchIndex;
            
            // Generate hierarchical storage key
            // Format: facts/{date}/{factId}/gallery/{index}-{timestamp}.{ext}
            const ext = file.originalname.split('.').pop() || 'jpg';
            const storageKey = basePath 
              ? `${basePath}/${fileIndex}-${Date.now()}.${ext}`
              : `facts/${date}/${factId}/gallery/${fileIndex}-${Date.now()}.${ext}`;

            // Get image dimensions if image
            let width: number | undefined;
            let height: number | undefined;

            if (file.mimetype.startsWith('image/')) {
              try {
                const sharp = require('sharp');
                const metadata = await sharp(file.buffer).metadata();
                width = metadata.width;
                height = metadata.height;
              } catch (error) {
                // Ignore if sharp not available
              }
            }

            // Upload to storage
            const result = await storageService.uploadFile(
              storageKey,
              file.buffer,
              {
                contentType: file.mimetype,
                size: file.size,
                width,
                height,
                generateThumbnail: file.mimetype.startsWith('image/'),
              }
            );

            return {
              success: true,
              originalName: file.originalname,
              storageKey: result.key,
              url: result.url,
              thumbnailUrl: result.thumbnailUrl,
              provider: result.provider,
              metadata: result.metadata,
            };
          } catch (error: any) {
            return {
              success: false,
              originalName: file.originalname,
              error: error.message,
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        
        batchResults.forEach((result) => {
          if (result.success) {
            results.push(result);
          } else {
            errors.push(result);
          }
        });

        // Small delay between batches
        if (i + BATCH_SIZE < files.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      res.json({
        success: true,
        data: {
          total: files.length,
          successful: results.length,
          failed: errors.length,
          results,
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    } catch (error: any) {
      console.error('Batch upload error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/upload
   * Single file upload with hierarchical key support
   */
  router.post('/', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file provided',
        });
      }

      const { factId, date, type = 'image', storageKey } = req.body;

      // Generate storage key if not provided
      let finalStorageKey = storageKey;
      if (!finalStorageKey) {
        if (factId && date) {
          const ext = req.file.originalname.split('.').pop() || 'jpg';
          finalStorageKey = `facts/${date}/${factId}/${type}-${Date.now()}.${ext}`;
        } else {
          finalStorageKey = `uploads/${Date.now()}-${req.file.originalname}`;
        }
      }

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
        finalStorageKey,
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

  return router;
}
