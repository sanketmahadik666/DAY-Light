/**
 * Facts Gallery API Routes
 * Handles gallery image storage references
 */

import { Router, Request, Response } from 'express';
import { Fact } from '../schemas/fact.schema';

const router = Router();

/**
 * PUT /api/facts/:id/gallery
 * Update fact with gallery storage references
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { galleryImages } = req.body;

    if (!Array.isArray(galleryImages)) {
      return res.status(400).json({
        success: false,
        error: 'galleryImages must be an array',
      });
    }

    const fact = await Fact.findOne({ id });

    if (!fact) {
      return res.status(404).json({
        success: false,
        error: 'Fact not found',
      });
    }

    // Update gallery images
    fact.galleryImages = galleryImages.map((img: any) => ({
      storageRef: {
        provider: img.storageRef.provider,
        key: img.storageRef.key,
        url: img.storageRef.url,
      },
      metadata: {
        source: img.metadata?.source || 'gallery-sync',
        alt: img.metadata?.alt || '',
        width: img.metadata?.width,
        height: img.metadata?.height,
      },
    }));

    await fact.save();

    res.json({
      success: true,
      data: fact.toObject(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/facts/:id/gallery
 * Get gallery images for a fact
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const fact = await Fact.findOne({ id }).select('galleryImages').lean();

    if (!fact) {
      return res.status(404).json({
        success: false,
        error: 'Fact not found',
      });
    }

    res.json({
      success: true,
      data: fact.galleryImages || [],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
