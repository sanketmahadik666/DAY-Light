/**
 * Validation Middleware
 * Validates analytics event data before processing
 */

import { Request, Response, NextFunction } from 'express';

interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array';
  min?: number;
  max?: number;
  pattern?: RegExp;
}

function validateEvent(event: any, rules: ValidationRule[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const rule of rules) {
    const value = event[rule.field];

    if (rule.required && (value === undefined || value === null)) {
      errors.push(`${rule.field} is required`);
      continue;
    }

    if (value === undefined || value === null) continue;

    if (rule.type) {
      if (rule.type === 'array' && !Array.isArray(value)) {
        errors.push(`${rule.field} must be an array`);
        continue;
      }
      if (rule.type === 'number' && typeof value !== 'number') {
        errors.push(`${rule.field} must be a number`);
        continue;
      }
      if (rule.type === 'string' && typeof value !== 'string') {
        errors.push(`${rule.field} must be a string`);
        continue;
      }
      if (rule.type === 'boolean' && typeof value !== 'boolean') {
        errors.push(`${rule.field} must be a boolean`);
        continue;
      }
    }

    if (rule.type === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        errors.push(`${rule.field} must be >= ${rule.min}`);
      }
      if (rule.max !== undefined && value > rule.max) {
        errors.push(`${rule.field} must be <= ${rule.max}`);
      }
    }

    if (rule.type === 'string' && rule.pattern && !rule.pattern.test(value)) {
      errors.push(`${rule.field} format is invalid`);
    }
  }

  return { valid: errors.length === 0, errors };
}

const factViewRules: ValidationRule[] = [
  { field: 'factId', required: true, type: 'string' },
  { field: 'date', required: true, type: 'string', pattern: /^\d{4}-\d{2}-\d{2}$/ },
  { field: 'category', required: true, type: 'string' },
  { field: 'timestamp', required: true, type: 'number', min: 0 },
  { field: 'viewDuration', type: 'number', min: 0 },
  { field: 'slideIndex', required: true, type: 'number', min: 0 },
  { field: 'sessionId', required: true, type: 'string' },
];

const apiCallRules: ValidationRule[] = [
  { field: 'endpoint', required: true, type: 'string' },
  { field: 'method', required: true, type: 'string' },
  { field: 'statusCode', required: true, type: 'number', min: 0, max: 599 },
  { field: 'responseTime', required: true, type: 'number', min: 0 },
  { field: 'timestamp', required: true, type: 'number', min: 0 },
  { field: 'success', required: true, type: 'boolean' },
  { field: 'sessionId', required: true, type: 'string' },
];

const imageLoadRules: ValidationRule[] = [
  { field: 'factId', required: true, type: 'string' },
  { field: 'imageUrl', required: true, type: 'string' },
  { field: 'loadTime', required: true, type: 'number', min: 0 },
  { field: 'timestamp', required: true, type: 'number', min: 0 },
  { field: 'success', required: true, type: 'boolean' },
  { field: 'sessionId', required: true, type: 'string' },
];

export function validateAnalyticsData(req: Request, res: Response, next: NextFunction): void {
  const { factViews, apiCalls, imageLoads } = req.body;

  const errors: string[] = [];

  // Validate fact views
  if (factViews && Array.isArray(factViews)) {
    factViews.forEach((event: any, index: number) => {
      const validation = validateEvent(event, factViewRules);
      if (!validation.valid) {
        errors.push(`factViews[${index}]: ${validation.errors.join(', ')}`);
      }
    });
  }

  // Validate API calls
  if (apiCalls && Array.isArray(apiCalls)) {
    apiCalls.forEach((event: any, index: number) => {
      const validation = validateEvent(event, apiCallRules);
      if (!validation.valid) {
        errors.push(`apiCalls[${index}]: ${validation.errors.join(', ')}`);
      }
    });
  }

  // Validate image loads
  if (imageLoads && Array.isArray(imageLoads)) {
    imageLoads.forEach((event: any, index: number) => {
      const validation = validateEvent(event, imageLoadRules);
      if (!validation.valid) {
        errors.push(`imageLoads[${index}]: ${validation.errors.join(', ')}`);
      }
    });
  }

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors,
    });
    return;
  }

  next();
}
