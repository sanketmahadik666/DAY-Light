/**
 * MongoDB Schema for Facts
 * Optimized for queries by date, category, and search
 */

import { Schema, model, Model, Document } from 'mongoose';

export interface IFact extends Document {
  id: string;
  title: string;
  description?: string;
  name?: string;
  date: string; // YYYY-MM-DD
  category: string;
  year?: number;
  source?: string;
  sourceUrl?: string;
  
  // Storage references
  imageStorageRef?: {
    provider: 'minio' | 'cloudinary';
    bucket?: string;
    key: string;
    url: string;
    thumbnailUrl?: string;
  };
  
  // Image metadata
  imageMetadata?: {
    url: string;
    thumbnailUrl?: string;
    source: string;
    width?: number;
    height?: number;
    aspectRatio?: number;
    license?: string;
    alt?: string;
    mimeType?: string;
    size?: number;
  };
  
  // Gallery images
  galleryImages?: Array<{
    storageRef: {
      provider: 'minio' | 'cloudinary';
      key: string;
      url: string;
    };
    metadata: {
      source: string;
      alt?: string;
      width?: number;
      height?: number;
    };
  }>;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  cachedAt?: Date;
  
  // Search optimization
  searchText?: string; // Full-text search field
  keywords?: string[]; // Extracted keywords
}

const FactSchema = new Schema<IFact>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      index: true,
    },
    description: {
      type: String,
      index: 'text', // Text index for search
    },
    name: {
      type: String,
      index: true,
    },
    date: {
      type: String,
      required: true,
      index: true, // Index for date queries
    },
    category: {
      type: String,
      required: true,
      index: true, // Index for category filtering
      enum: [
        'Birthdays',
        'Historical',
        'Science',
        'Finance',
        'Sports',
        'Festivals',
        'Space',
        'PopCulture',
        'Awards',
        'Technology',
      ],
    },
    year: {
      type: Number,
      index: true,
    },
    source: String,
    sourceUrl: String,
    
    // Storage references
    imageStorageRef: {
      provider: {
        type: String,
        enum: ['minio', 'cloudinary'],
      },
      bucket: String,
      key: String,
      url: String,
      thumbnailUrl: String,
    },
    
    // Image metadata
    imageMetadata: {
      url: String,
      thumbnailUrl: String,
      source: String,
      width: Number,
      height: Number,
      aspectRatio: Number,
      license: String,
      alt: String,
      mimeType: String,
      size: Number,
    },
    
    // Gallery images
    galleryImages: [
      {
        storageRef: {
          provider: {
            type: String,
            enum: ['minio', 'cloudinary'],
          },
          key: String,
          url: String,
        },
        metadata: {
          source: String,
          alt: String,
          width: Number,
          height: Number,
        },
      },
    ],
    
    // Search optimization
    searchText: {
      type: String,
      index: 'text', // Full-text search
    },
    keywords: [String],
    
    cachedAt: Date,
  },
  {
    timestamps: true,
    collection: 'facts',
  }
);

// Compound indexes for common queries
FactSchema.index({ date: 1, category: 1 }); // Date + category queries
FactSchema.index({ date: 1, year: 1 }); // Date range queries
FactSchema.index({ category: 1, year: 1 }); // Category + year queries
FactSchema.index({ createdAt: -1 }); // Recent facts
FactSchema.index({ 'imageStorageRef.provider': 1, 'imageStorageRef.key': 1 }); // Storage lookup

// Text index for search
FactSchema.index({ title: 'text', description: 'text', searchText: 'text' });

// Virtual for formatted date
FactSchema.virtual('formattedDate').get(function () {
  return this.date;
});

export const Fact: Model<IFact> = model<IFact>('Fact', FactSchema);
