import type { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

import { AppError, ErrorCode } from '../utils/errors.js';
import { UserRole } from '../types/booking.js';
import { verifyJwt } from '../utils/jwt.js';

const prisma = new PrismaClient();

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole | string;
  phone?: string;
  studentId?: string;
  badges?: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export const KNOWN_PERSONAS: Record<string, AuthenticatedUser> = {
  demo_lab_owner: {
    id: 'demo_lab_owner',
    name: 'Dr. Sarah Martinez',
    email: 'lab.owner@openresource.demo',
    role: UserRole.LAB_OWNER,
    phone: '555-0192',
    studentId: 'FAC-8821',
    badges: ['badge_safety_101', 'badge_admin'],
  },
  demo_qualified_student: {
    id: 'demo_qualified_student',
    name: 'Alice Chen',
    email: 'alice.chen@openresource.demo',
    role: UserRole.USER,
    phone: '555-0144',
    studentId: 'STU-9901',
    badges: ['badge_safety_101', 'badge_3d_basics', 'badge_laser_cert', 'badge_cnc_basics'],
  },
  demo_resource_hog: {
    id: 'demo_resource_hog',
    name: 'Bob Wilson',
    email: 'bob.quota@openresource.demo',
    role: UserRole.USER,
    phone: '555-0177',
    studentId: 'STU-9902',
    badges: ['badge_safety_101', 'badge_3d_basics'],
  },
  demo_auditor: {
    id: 'demo_auditor',
    name: 'Auditor Vance',
    email: 'auditor@openresource.demo',
    role: UserRole.AUDITOR,
    phone: '555-0100',
    studentId: 'AUD-7700',
    badges: [],
  },
  demo_admin: {
    id: 'demo_admin',
    name: 'System Administrator',
    email: 'admin@openresource.demo',
    role: UserRole.ADMIN,
    phone: '555-0199',
    studentId: 'ADM-0001',
    badges: ['badge_safety_101', 'badge_admin', 'badge_3d_basics', 'badge_laser_cert', 'badge_cnc_basics'],
  },
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

export function resolveUserFromRequest(req: Request): AuthenticatedUser | null {
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';
  const allowDevTestAuth = !isProduction && (process.env.ENABLE_DEV_TEST_AUTH !== 'false' || isTest);

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();

    if (token.includes('.')) {
      return verifyJwt(token);
    }

    if (allowDevTestAuth && KNOWN_PERSONAS[token]) {
      return KNOWN_PERSONAS[token];
    }

    if (isProduction) {
      throw new AppError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Invalid authentication token format. A verified JSON Web Token (JWT) is required.'
      );
    }

    return null;
  }

  if (allowDevTestAuth) {
    const testUserId = getHeaderValue(req, 'x-test-user-id', 'x-user-id');
    const testUserRole = getHeaderValue(req, 'x-test-user-role', 'x-user-role');
    const testBadgesHeader = getHeaderValue(req, 'x-test-user-badges');

    if (testUserId) {
      if (KNOWN_PERSONAS[testUserId]) {
        const known = KNOWN_PERSONAS[testUserId];
        return {
          ...known,
          role: testUserRole ? (testUserRole as UserRole) : known.role,
          badges: testBadgesHeader ? testBadgesHeader.split(',').map((b) => b.trim()) : known.badges,
        };
      }

      return {
        id: testUserId,
        name: getHeaderValue(req, 'x-test-user-name') || `User ${testUserId}`,
        email: getHeaderValue(req, 'x-test-user-email') || `${testUserId}@openresource.demo`,
        role: (testUserRole as UserRole) || UserRole.USER,
        phone: getHeaderValue(req, 'x-test-user-phone'),
        studentId: getHeaderValue(req, 'x-test-user-studentid'),
        badges: testBadgesHeader ? testBadgesHeader.split(',').map((b) => b.trim()) : [],
      };
    }
  }

  return null;
}

const fallbackUser: AuthenticatedUser = {
  id: 'seed-user-student',
  name: 'Seed Demo Student',
  email: 'student@openresource.local',
  role: UserRole.STUDENT,
};

const resolveDevUser = async (req: Request): Promise<AuthenticatedUser> => {
  const testUserId = getHeaderValue(req, 'x-test-user-id', 'x-user-id');
  const testUserRole = getHeaderValue(req, 'x-test-user-role', 'x-user-role') || UserRole.STUDENT;

  if (testUserId) {
    const existingUser = await prisma.user.findUnique({ where: { id: testUserId } }).catch(() => null);
    if (existingUser) {
      return {
        id: existingUser.id,
        name: existingUser.name || existingUser.email,
        email: existingUser.email,
        role: existingUser.role || testUserRole,
      };
    }

    return {
      id: testUserId,
      name: getHeaderValue(req, 'x-test-user-name') || `User ${testUserId}`,
      email: getHeaderValue(req, 'x-test-user-email') || `${testUserId}@openresource.local`,
      role: testUserRole,
      phone: getHeaderValue(req, 'x-test-user-phone'),
      studentId: getHeaderValue(req, 'x-test-user-studentid'),
      badges: getHeaderValue(req, 'x-test-user-badges')?.split(',').map((b) => b.trim()) || [],
    };
  }

  return {
    ...KNOWN_PERSONAS.demo_qualified_student,
    role: testUserRole,
  };
};

export const optionalAuthenticate = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const user = resolveUserFromRequest(req);
    if (user) {
      req.user = user;
      return next();
    }

    if (process.env.NODE_ENV !== 'production') {
      req.user = {
        ...fallbackUser,
        ...KNOWN_PERSONAS.demo_qualified_student,
      };
      return next();
    }

    return next();
  } catch (err) {
    return next(err);
  }
};

export const authenticate = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const user = resolveUserFromRequest(req);
    if (user) {
      req.user = user;
      return next();
    }

    if (process.env.NODE_ENV !== 'production') {
      req.user = await resolveDevUser(req);
      return next();
    }

    return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required to access this resource'));
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid authentication token'));
  }
};

export const authorize = (...allowedRoles: (UserRole | string)[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required'));
    }

    const userRole = req.user.role;
    const isAllowed = allowedRoles.includes(userRole) || userRole === UserRole.ADMIN;

    if (!isAllowed) {
      return next(
        new AppError(
          403,
          ErrorCode.FORBIDDEN,
          `Forbidden: Role '${userRole}' does not have permission for this action`
        )
      );
    }

    return next();
  };
};

export const checkResourceOwnership = (resourceOwnerId: string) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required'));
    }

    const userRole = req.user.role;
    const matchesOwner = req.user.id === resourceOwnerId;
    const isAllowed = matchesOwner || userRole === UserRole.ADMIN || userRole === UserRole.LAB_OWNER;

    if (!isAllowed) {
      return next(new AppError(403, ErrorCode.FORBIDDEN, 'Forbidden: You do not own this resource'));
    }

    return next();
  };
};
