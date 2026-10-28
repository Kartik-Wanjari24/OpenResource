import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../utils/errors.js';

// Extended Request type with user information
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Authentication middleware (stub for Phase 2)
 *
 * This is a placeholder that will be replaced when the shared authentication
 * system is implemented by the team. For Phase 2, this allows development
 * and testing without blocking on auth implementation.
 *
 * Integration points:
 * - Expects JWT token in Authorization header
 * - Should decode token and attach user info to req.user
 * - Should throw 401 for missing/invalid tokens
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // TODO: Replace with actual JWT verification when auth system is ready
    // For now, check if we're in development mode
    if (process.env.NODE_ENV === 'development') {
      // In development, allow requests with a test user
      // This can be overridden by setting X-Test-User-Id header
      const testUserId = req.headers['x-test-user-id'] as string;
      const testUserRole = req.headers['x-test-user-role'] as string || 'LAB_OWNER';

      req.user = {
        id: testUserId || 'test-user-id',
        email: 'test@example.com',
        role: testUserRole,
      };
      return next();
    }

    // In production, require proper authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
    }

    // TODO: Implement JWT verification here
    // const token = authHeader.substring(7);
    // const decoded = await verifyJWT(token);
    // req.user = decoded;

    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication system not yet implemented');
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid authentication token'));
  }
};

/**
 * Authorization middleware - check if user has required role
 */
export const authorize = (...allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError(403, ErrorCode.FORBIDDEN, 'Insufficient permissions'));
    }

    next();
  };
};

/**
 * Check if user owns the resource or is an admin
 */
export const checkResourceOwnership = (resourceOwnerId: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required'));
    }

    const isOwner = req.user.id === resourceOwnerId;
    const isAdmin = req.user.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      return next(new AppError(403, ErrorCode.FORBIDDEN, 'You do not have permission to modify this resource'));
    }

    next();
  };
};
