import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError, ErrorCode } from '../utils/errors.js';

const prisma = new PrismaClient();

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

const fallbackUser = {
  id: 'seed-user-student',
  email: 'student@openresource.local',
  role: 'STUDENT',
};

const getHeaderValue = (req: Request, ...keys: string[]) => {
  for (const key of keys) {
    const value = req.headers[key.toLowerCase()];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value) && value[0]?.trim()) {
      return value[0].trim();
    }
  }
  return undefined;
};

const resolveDevUser = async (req: Request) => {
  const testUserId = getHeaderValue(req, 'x-test-user-id', 'x-user-id');
  const testUserRole = getHeaderValue(req, 'x-test-user-role', 'x-user-role') || 'STUDENT';

  if (testUserId) {
    const existingUser = await prisma.user.findUnique({ where: { id: testUserId } }).catch(() => null);
    if (existingUser) {
      return {
        id: existingUser.id,
        email: existingUser.email,
        role: existingUser.role || testUserRole,
      };
    }

    return {
      id: testUserId,
      email: `${testUserId}@openresource.local`,
      role: testUserRole,
    };
  }

  const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }).catch(() => null);
  if (firstUser) {
    return {
      id: firstUser.id,
      email: firstUser.email,
      role: firstUser.role || 'STUDENT',
    };
  }

  return fallbackUser;
};

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (process.env.NODE_ENV !== 'production') {
      req.user = await resolveDevUser(req);
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
    }

    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication system not yet implemented');
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid authentication token'));
  }
};

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

