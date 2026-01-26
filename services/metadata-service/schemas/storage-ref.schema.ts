/**
 * MongoDB Schema for Storage References
 * Tracks object storage locations (MinIO/Cloudinary) for redundancy
 */

import { Schema, model, Model, Document } from 'mongoose';

export interface IStorageRef extends Document {
  objectKey: string; // Unique identifier
  factId?: string;
  slideId?: string;
  
  // Primary storage (MinIO)
  minio: {
    bucket: string;
    key: string;
    url: string;
    etag?: string;
    size: number;
    contentType: string;
    uploadedAt: Date;
  };
  
  // Fallback storage (Cloudinary)
  cloudinary?: {
    publicId: string;
    url: string;
    secureUrl: string;
    format: string;
    width?: number;
    height?: number;
    bytes: number;
    uploadedAt: Date;
  };
  
  // Metadata
  metadata: {
    originalFilename?: string;
    mimeType: string;
    width?: number;
    height?: number;
    aspectRatio?: number;
  };
  
  // Status
  status: 'active' | 'migrating' | 'failed';
  primaryProvider: 'minio' | 'cloudinary';
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const StorageRefSchema = new Schema<IStorageRef>(
  {
    objectKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    factId: {
      type: String,
      index: true,
    },
    slideId: {
      type: String,
      index: true,
    },
    
    // Primary storage (MinIO)
    minio: {
      bucket: {
        type: String,
        required: true,
      },
      key: {
        type: String,
        required: true,
      },
      url: {
        type: String,
        required: true,
      },
      etag: String,
      size: {
        type: Number,
        required: true,
      },
      contentType: {
        type: String,
        required: true,
      },
      uploadedAt: {
        type: Date,
        required: true,
      },
    },
    
    // Fallback storage (Cloudinary)
    cloudinary: {
      publicId: String,
      url: String,
      secureUrl: String,
      format: String,
      width: Number,
      height: Number,
      bytes: Number,
      uploadedAt: Date,
    },
    
    // Metadata
    metadata: {
      originalFilename: String,
      mimeType: {
        type: String,
        required: true,
      },
      width: Number,
      height: Number,
      aspectRatio: Number,
    },
    
    // Status
    status: {
      type: String,
      enum: ['active', 'migrating', 'failed'],
      default: 'active',
    },
    primaryProvider: {
      type: String,
      enum: ['minio', 'cloudinary'],
      default: 'minio',
    },
  },
  {
    timestamps: true,
    collection: 'storage_refs',
  }
);

// Indexes
StorageRefSchema.index({ factId: 1, status: 1 });
StorageRefSchema.index({ slideId: 1, status: 1 });
StorageRefSchema.index({ 'minio.bucket': 1, 'minio.key': 1 });
StorageRefSchema.index({ primaryProvider: 1, status: 1 });

export const StorageRef: Model<IStorageRef> = model<IStorageRef>('StorageRef', StorageRefSchema);
