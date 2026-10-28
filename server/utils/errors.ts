import { Request, Response, NextFunction } from 'express';

// Standard error response format
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Array<{
      field?: string;
      message: string;
    }>;
  };
  timestamp: string;
}

// Standard success response format
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
}

// Error codes
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// Custom error class
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: ErrorCode,
    message: string,
    public details?: Array<{ field?: string; message: string }>
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// Error handler middleware
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', err);

  if (err instanceof AppError) {
    const response: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
      timestamp: new Date().toISOString(),
    };
    return res.status(err.statusCode).json(response);
  }

  // Default error response
  const response: ErrorResponse = {
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    },
    timestamp: new Date().toISOString(),
  };
  res.status(500).json(response);
};

// Success response helper
export const successResponse = <T>(data: T): SuccessResponse<T> => ({
  success: true,
  data,
  timestamp: new Date().toISOString(),
});
