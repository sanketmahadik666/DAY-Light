/**
 * MongoDB Schema for Slides
 * Represents composed slides with multiple facts and assets
 */

import { Schema, model, Model, Document } from 'mongoose';

export interface ISlide extends Document {
  slideId: string;
  factId: string; // Reference to fact
  date: string; // YYYY-MM-DD
  
  // Slide composition
  layout: 'fullscreen' | 'masonry' | 'grid';
  assets: {
    backgroundImage?: {
      provider: 'minio' | 'cloudinary';
      key: string;
      url: string;
    };
    overlay?: {
      text: string;
      position: 'top' | 'center' | 'bottom';
    };
  };
  
  // Rendering metadata
  renderedAt?: Date;
  renderVersion: number;
  
  // Storage references
  storageRefs: {
    provider: 'minio' | 'cloudinary';
    bucket?: string;
    baseKey: string; // Base path for slide assets
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const SlideSchema = new Schema<ISlide>(
  {
    slideId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    factId: {
      type: String,
      required: true,
      index: true,
      ref: 'Fact',
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    
    // Slide composition
    layout: {
      type: String,
      enum: ['fullscreen', 'masonry', 'grid'],
      default: 'fullscreen',
    },
    assets: {
      backgroundImage: {
        provider: {
          type: String,
          enum: ['minio', 'cloudinary'],
        },
        key: String,
        url: String,
      },
      overlay: {
        text: String,
        position: {
          type: String,
          enum: ['top', 'center', 'bottom'],
        },
      },
    },
    
    // Rendering metadata
    renderedAt: Date,
    renderVersion: {
      type: Number,
      default: 1,
    },
    
    // Storage references
    storageRefs: {
      provider: {
        type: String,
        enum: ['minio', 'cloudinary'],
        required: true,
      },
      bucket: String,
      baseKey: {
        type: String,
        required: true,
      },
    },
  },
  {
    timestamps: true,
    collection: 'slides',
  }
);

// Compound indexes
SlideSchema.index({ date: 1, factId: 1 });
SlideSchema.index({ factId: 1, renderVersion: -1 });
SlideSchema.index({ createdAt: -1 });

export const Slide: Model<ISlide> = model<ISlide>('Slide', SlideSchema);
