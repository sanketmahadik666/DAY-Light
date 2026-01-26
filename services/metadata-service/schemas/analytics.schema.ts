/**
 * MongoDB Schemas for Analytics Data
 */

import { Schema, model, Model, Document } from 'mongoose';

// Fact View Event
export interface IFactViewEvent extends Document {
  factId: string;
  date: string; // YYYY-MM-DD
  category: string;
  timestamp: number;
  viewDuration?: number;
  slideIndex: number;
  userId?: string;
  sessionId?: string;
}

const FactViewEventSchema = new Schema<IFactViewEvent>(
  {
    factId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    timestamp: { type: Number, required: true, index: true },
    viewDuration: Number,
    slideIndex: Number,
    userId: String,
    sessionId: String,
  },
  {
    timestamps: true,
    collection: 'analytics_fact_views',
  }
);

FactViewEventSchema.index({ date: 1, category: 1 });
FactViewEventSchema.index({ timestamp: -1 });
FactViewEventSchema.index({ factId: 1, timestamp: -1 });

export const FactViewEvent: Model<IFactViewEvent> = model<IFactViewEvent>(
  'FactViewEvent',
  FactViewEventSchema
);

// API Call Event
export interface IAPICallEvent extends Document {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  timestamp: number;
  success: boolean;
  error?: string;
  userId?: string;
  sessionId?: string;
}

const APICallEventSchema = new Schema<IAPICallEvent>(
  {
    endpoint: { type: String, required: true, index: true },
    method: { type: String, required: true },
    statusCode: { type: Number, required: true, index: true },
    responseTime: { type: Number, required: true },
    timestamp: { type: Number, required: true, index: true },
    success: { type: Boolean, required: true, index: true },
    error: String,
    userId: String,
    sessionId: String,
  },
  {
    timestamps: true,
    collection: 'analytics_api_calls',
  }
);

APICallEventSchema.index({ endpoint: 1, timestamp: -1 });
APICallEventSchema.index({ timestamp: -1 });
APICallEventSchema.index({ success: 1, timestamp: -1 });

export const APICallEvent: Model<IAPICallEvent> = model<IAPICallEvent>(
  'APICallEvent',
  APICallEventSchema
);

// Category Preference Aggregation
export interface ICategoryPreference extends Document {
  category: string;
  viewCount: number;
  totalDuration: number;
  avgDuration: number;
  lastViewed: number;
  date: string; // Aggregation date
}

const CategoryPreferenceSchema = new Schema<ICategoryPreference>(
  {
    category: { type: String, required: true, unique: true, index: true },
    viewCount: { type: Number, default: 0 },
    totalDuration: { type: Number, default: 0 },
    avgDuration: { type: Number, default: 0 },
    lastViewed: { type: Number, default: Date.now },
    date: { type: String, required: true, index: true },
  },
  {
    timestamps: true,
    collection: 'analytics_category_preferences',
  }
);

export const CategoryPreference: Model<ICategoryPreference> = model<ICategoryPreference>(
  'CategoryPreference',
  CategoryPreferenceSchema
);
