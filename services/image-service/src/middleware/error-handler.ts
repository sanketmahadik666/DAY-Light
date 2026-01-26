/**
 * Error Handler Middleware
 */

import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class OperationalError extends Error implements AppError {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational || false;

  if (!isOperational) {
    console.error('[Image Service Error]', {
      message: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      statusCode,
    });
  }

  res.status(statusCode).json({
    success: false,
    error: isOperational ? error.message : 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
      details: error,
    }),
  });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
