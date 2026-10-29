import type { Request, Response, NextFunction } from 'express';

// Standard error response format matching team contract
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

// Standard success response format matching team contract
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
}

// Standardized error codes (erasableSyntaxOnly compatible)
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  INVALID_CREDENTIAL: 'INVALID_CREDENTIAL',
  EXPIRED_CREDENTIAL: 'EXPIRED_CREDENTIAL',
  CREDENTIAL_ALREADY_USED: 'CREDENTIAL_ALREADY_USED',
  MAX_ATTEMPTS_EXCEEDED: 'MAX_ATTEMPTS_EXCEEDED',
  TIMING_VIOLATION: 'TIMING_VIOLATION',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// Custom application error
export class AppError extends Error {
  public statusCode: number;
  public code: ErrorCode | string;
  public details?: Array<{ field?: string; message: string }>;

  constructor(
    statusCode: number,
    code: ErrorCode | string,
    message: string,
    details?: Array<{ field?: string; message: string }>
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// Global Express error handler middleware
export const errorHandler = (
  err: Error | AppError | any,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
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

  // Handle body-parser payload size limit errors as 413 PAYLOAD_TOO_LARGE
  if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
    const response: ErrorResponse = {
      error: {
        code: ErrorCode.PAYLOAD_TOO_LARGE,
        message: 'Request payload exceeds maximum allowed size (100kb)',
      },
      timestamp: new Date().toISOString(),
    };
    return res.status(413).json(response);
  }

  // Handle body-parser JSON syntax errors gracefully as 400 VALIDATION_ERROR
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
    const response: ErrorResponse = {
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid JSON payload in request body',
      },
      timestamp: new Date().toISOString(),
    };
    return res.status(400).json(response);
  }

  console.error('Unhandled Server Error:', err);
  const response: ErrorResponse = {
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected internal error occurred',
    },
    timestamp: new Date().toISOString(),
  };
  return res.status(500).json(response);
};

// Success response helper
export const successResponse = <T>(data: T): SuccessResponse<T> => ({
  success: true,
  data,
  timestamp: new Date().toISOString(),
});
