/**
 * MongoDB Schemas for Analytics Data
 * Raw events stored as-is, aggregated reports generated server-side
 */

import { Schema, model, Model, Document } from 'mongoose';

// Raw Fact View Event (from client)
export interface IRawFactViewEvent extends Document {
  factId: string;
  date: string; // YYYY-MM-DD
  category: string;
  timestamp: number;
  viewDuration?: number;
  slideIndex: number;
  sessionId: string;
  userId?: string;
}

const RawFactViewEventSchema = new Schema<IRawFactViewEvent>(
  {
    factId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    timestamp: { type: Number, required: true, index: true },
    viewDuration: Number,
    slideIndex: Number,
    sessionId: { type: String, required: true, index: true },
    userId: String,
  },
  {
    timestamps: true,
    collection: 'analytics_raw_fact_views',
  }
);

RawFactViewEventSchema.index({ date: 1, category: 1 });
RawFactViewEventSchema.index({ timestamp: -1 });
RawFactViewEventSchema.index({ factId: 1, timestamp: -1 });
RawFactViewEventSchema.index({ sessionId: 1, timestamp: -1 });

export const RawFactViewEvent: Model<IRawFactViewEvent> = model<IRawFactViewEvent>(
  'RawFactViewEvent',
  RawFactViewEventSchema
);

// Raw API Call Event (from client)
export interface IRawAPICallEvent extends Document {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  timestamp: number;
  success: boolean;
  error?: string;
  requestSize?: number;
  responseSize?: number;
  sessionId: string;
  userId?: string;
}

const RawAPICallEventSchema = new Schema<IRawAPICallEvent>(
  {
    endpoint: { type: String, required: true, index: true },
    method: { type: String, required: true },
    statusCode: { type: Number, required: true, index: true },
    responseTime: { type: Number, required: true },
    timestamp: { type: Number, required: true, index: true },
    success: { type: Boolean, required: true, index: true },
    error: String,
    requestSize: Number,
    responseSize: Number,
    sessionId: { type: String, required: true, index: true },
    userId: String,
  },
  {
    timestamps: true,
    collection: 'analytics_raw_api_calls',
  }
);

RawAPICallEventSchema.index({ endpoint: 1, timestamp: -1 });
RawAPICallEventSchema.index({ timestamp: -1 });
RawAPICallEventSchema.index({ success: 1, timestamp: -1 });
RawAPICallEventSchema.index({ sessionId: 1, timestamp: -1 });

export const RawAPICallEvent: Model<IRawAPICallEvent> = model<IRawAPICallEvent>(
  'RawAPICallEvent',
  RawAPICallEventSchema
);

// Raw Image Load Event (from client)
export interface IRawImageLoadEvent extends Document {
  factId: string;
  imageUrl: string;
  storageProvider?: 'minio' | 'cloudinary';
  loadTime: number;
  timestamp: number;
  success: boolean;
  sessionId: string;
  userId?: string;
}

const RawImageLoadEventSchema = new Schema<IRawImageLoadEvent>(
  {
    factId: { type: String, required: true, index: true },
    imageUrl: { type: String, required: true },
    storageProvider: { type: String, enum: ['minio', 'cloudinary'] },
    loadTime: { type: Number, required: true },
    timestamp: { type: Number, required: true, index: true },
    success: { type: Boolean, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    userId: String,
  },
  {
    timestamps: true,
    collection: 'analytics_raw_image_loads',
  }
);

RawImageLoadEventSchema.index({ factId: 1, timestamp: -1 });
RawImageLoadEventSchema.index({ storageProvider: 1, timestamp: -1 });
RawImageLoadEventSchema.index({ timestamp: -1 });
RawImageLoadEventSchema.index({ sessionId: 1, timestamp: -1 });

export const RawImageLoadEvent: Model<IRawImageLoadEvent> = model<IRawImageLoadEvent>(
  'RawImageLoadEvent',
  RawImageLoadEventSchema
);

// Aggregated Report: Fact Availability (generated server-side)
export interface IFactAvailabilityReport extends Document {
  date: string; // YYYY-MM-DD
  factCount: number;
  uniqueFacts: number;
  totalViews: number;
  avgViewDuration: number;
  categories: Array<{
    category: string;
    count: number;
  }>;
  reportDate: string; // When report was generated
  lastUpdated: number;
}

const FactAvailabilityReportSchema = new Schema<IFactAvailabilityReport>(
  {
    date: { type: String, required: true, unique: true, index: true },
    factCount: { type: Number, default: 0 },
    uniqueFacts: { type: Number, default: 0 },
    totalViews: { type: Number, default: 0 },
    avgViewDuration: { type: Number, default: 0 },
    categories: [
      {
        category: String,
        count: Number,
      },
    ],
    reportDate: { type: String, required: true },
    lastUpdated: { type: Number, default: Date.now },
  },
  {
    timestamps: true,
    collection: 'analytics_reports_fact_availability',
  }
);

export const FactAvailabilityReport: Model<IFactAvailabilityReport> = model<IFactAvailabilityReport>(
  'FactAvailabilityReport',
  FactAvailabilityReportSchema
);

// Aggregated Report: Category Preferences (generated server-side)
export interface ICategoryPreferenceReport extends Document {
  category: string;
  totalViews: number;
  uniqueFacts: number;
  totalDuration: number;
  avgDuration: number;
  lastViewed: number;
  factIds: string[]; // Top viewed facts
  reportDate: string;
  lastUpdated: number;
}

const CategoryPreferenceReportSchema = new Schema<ICategoryPreferenceReport>(
  {
    category: { type: String, required: true, unique: true, index: true },
    totalViews: { type: Number, default: 0 },
    uniqueFacts: { type: Number, default: 0 },
    totalDuration: { type: Number, default: 0 },
    avgDuration: { type: Number, default: 0 },
    lastViewed: { type: Number, default: Date.now },
    factIds: [String],
    reportDate: { type: String, required: true },
    lastUpdated: { type: Number, default: Date.now },
  },
  {
    timestamps: true,
    collection: 'analytics_reports_category_preferences',
  }
);

export const CategoryPreferenceReport: Model<ICategoryPreferenceReport> = model<ICategoryPreferenceReport>(
  'CategoryPreferenceReport',
  CategoryPreferenceReportSchema
);

// Aggregated Report: API Performance (generated server-side)
export interface IAPIPerformanceReport extends Document {
  endpoint: string;
  method: string;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  totalRequestSize: number;
  totalResponseSize: number;
  avgRequestSize: number;
  avgResponseSize: number;
  reportDate: string;
  lastUpdated: number;
}

const APIPerformanceReportSchema = new Schema<IAPIPerformanceReport>(
  {
    endpoint: { type: String, required: true, index: true },
    method: { type: String, required: true },
    totalCalls: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    avgResponseTime: { type: Number, default: 0 },
    minResponseTime: { type: Number, default: 0 },
    maxResponseTime: { type: Number, default: 0 },
    p50ResponseTime: { type: Number, default: 0 },
    p95ResponseTime: { type: Number, default: 0 },
    p99ResponseTime: { type: Number, default: 0 },
    totalRequestSize: { type: Number, default: 0 },
    totalResponseSize: { type: Number, default: 0 },
    avgRequestSize: { type: Number, default: 0 },
    avgResponseSize: { type: Number, default: 0 },
    reportDate: { type: String, required: true },
    lastUpdated: { type: Number, default: Date.now },
  },
  {
    timestamps: true,
    collection: 'analytics_reports_api_performance',
  }
);

APIPerformanceReportSchema.index({ endpoint: 1, method: 1 }, { unique: true });
APIPerformanceReportSchema.index({ reportDate: 1 });
APIPerformanceReportSchema.index({ avgResponseTime: -1 });

export const APIPerformanceReport: Model<IAPIPerformanceReport> = model<IAPIPerformanceReport>(
  'APIPerformanceReport',
  APIPerformanceReportSchema
);

// Aggregated Report: Image Load Performance (generated server-side)
export interface IImageLoadPerformanceReport extends Document {
  storageProvider: 'minio' | 'cloudinary' | 'external';
  totalLoads: number;
  successCount: number;
  errorCount: number;
  avgLoadTime: number;
  minLoadTime: number;
  maxLoadTime: number;
  p95LoadTime: number;
  factIds: string[]; // Facts with images from this provider
  reportDate: string;
  lastUpdated: number;
}

const ImageLoadPerformanceReportSchema = new Schema<IImageLoadPerformanceReport>(
  {
    storageProvider: { type: String, required: true, index: true },
    totalLoads: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    avgLoadTime: { type: Number, default: 0 },
    minLoadTime: { type: Number, default: 0 },
    maxLoadTime: { type: Number, default: 0 },
    p95LoadTime: { type: Number, default: 0 },
    factIds: [String],
    reportDate: { type: String, required: true },
    lastUpdated: { type: Number, default: Date.now },
  },
  {
    timestamps: true,
    collection: 'analytics_reports_image_loads',
  }
);

ImageLoadPerformanceReportSchema.index({ storageProvider: 1, reportDate: 1 }, { unique: true });

export const ImageLoadPerformanceReport: Model<IImageLoadPerformanceReport> = model<IImageLoadPerformanceReport>(
  'ImageLoadPerformanceReport',
  ImageLoadPerformanceReportSchema
);
