import type { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../utils/errors.js';
import { UserRole } from '../types/booking.js';
import { verifyJwt } from '../utils/jwt.js';

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

// Canonical demo personas matching team contract (API_CONTRACTS.md)
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

/**
 * Resolves user identity from request.
 * Strict rules:
 * 1. Bearer JWT tokens are verified using industry-standard jsonwebtoken.
 * 2. In production (NODE_ENV === 'production'):
 *    - Test headers (X-Test-User-Id, X-Test-User-Role, etc.) are strictly ignored/rejected.
 *    - Persona names in Bearer tokens are strictly rejected.
 * 3. In non-production environments:
 *    - Test headers are only enabled if ENABLE_DEV_TEST_AUTH is not explicitly 'false'.
 */
export function resolveUserFromRequest(req: Request): AuthenticatedUser | null {
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';
  const allowDevTestAuth = !isProduction && (process.env.ENABLE_DEV_TEST_AUTH !== 'false' || isTest);

  // 1. Check Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();

    // Check if token looks like a JWT (contains dots separating header.payload.signature)
    if (token.includes('.')) {
      // Decode and verify cryptographic signature and standard claims
      return verifyJwt(token);
    }

    // In non-production development/test only, map test persona tokens
    if (allowDevTestAuth && KNOWN_PERSONAS[token]) {
      return KNOWN_PERSONAS[token];
    }

    // Unrecognized or invalid Bearer token
    if (isProduction) {
      throw new AppError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Invalid authentication token format. A verified JSON Web Token (JWT) is required.'
      );
    }

    return null;
  }

  // 2. In development and test environments only, check test headers
  if (allowDevTestAuth) {
    const testUserId = req.headers['x-test-user-id'] as string | undefined;
    const testUserRole = req.headers['x-test-user-role'] as string | undefined;
    const testBadgesHeader = req.headers['x-test-user-badges'] as string | undefined;

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
        name: (req.headers['x-test-user-name'] as string) || `User ${testUserId}`,
        email: (req.headers['x-test-user-email'] as string) || `${testUserId}@openresource.demo`,
        role: (testUserRole as UserRole) || UserRole.USER,
        phone: req.headers['x-test-user-phone'] as string | undefined,
        studentId: req.headers['x-test-user-studentid'] as string | undefined,
        badges: testBadgesHeader ? testBadgesHeader.split(',').map((b) => b.trim()) : [],
      };
    }
  }

  return null;
}

/**
 * Enforces mandatory authentication
 */
export const authenticate = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const user = resolveUserFromRequest(req);
    if (!user) {
      return next(
        new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required to access this resource')
      );
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Optional authentication: attaches user if valid token/auth present, but permits anonymous access if absent.
 * If an invalid or expired token is presented, returns 401 UNAUTHORIZED.
 */
export const optionalAuthenticate = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    req.user = resolveUserFromRequest(req) || undefined;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Role-based authorization middleware
 */
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

    next();
  };
};
