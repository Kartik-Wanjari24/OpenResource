// OpenResource - Member 2 JWT Authentication Utilities
import jwt from 'jsonwebtoken';
import type { Algorithm } from 'jsonwebtoken';
import type { AuthenticatedUser } from '../middleware/auth.js';
import { UserRole } from '../types/booking.js';
import { AppError, ErrorCode } from './errors.js';
import { loadConfig } from '../config/env.js';

export interface JwtUserClaims {
  sub: string;
  name?: string;
  email?: string;
  role?: string;
  phone?: string;
  studentId?: string;
  badges?: string[];
  iss?: string;
  aud?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
}

/**
 * Verifies a JWT token and extracts authenticated user identity.
 * Validates issuer, audience, algorithm, and expiration.
 * Never logs raw tokens or secrets.
 */
export function verifyJwt(token: string): AuthenticatedUser {
  const config = loadConfig();

  // Fail-closed in production if no secret/key is configured
  const key = config.jwt.publicKey || config.jwt.secret;
  if (!key) {
    throw new AppError(
      401,
      ErrorCode.UNAUTHORIZED,
      'Authentication failed: Identity provider secret or public key is not configured.'
    );
  }

  try {
    const verified = jwt.verify(token, key, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      algorithms: config.jwt.algorithms as Algorithm[],
    }) as JwtUserClaims;

    if (!verified.sub) {
      throw new AppError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Invalid authentication token: missing subject claim (sub).'
      );
    }

    // Role validation: map to recognized UserRole or fallback to USER
    let validatedRole: UserRole | string = UserRole.USER;
    if (verified.role && Object.values(UserRole).includes(verified.role as UserRole)) {
      validatedRole = verified.role as UserRole;
    }

    return {
      id: verified.sub,
      name: verified.name || `User ${verified.sub}`,
      email: verified.email || `${verified.sub}@openresource.demo`,
      role: validatedRole,
      phone: verified.phone,
      studentId: verified.studentId,
      badges: Array.isArray(verified.badges) ? verified.badges : [],
    };
  } catch (err: any) {
    if (err instanceof AppError) {
      throw err;
    }

    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Authentication token has expired. Please obtain a fresh token.'
      );
    }

    if (err instanceof jwt.NotBeforeError) {
      throw new AppError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Authentication token is not yet active.'
      );
    }

    // Sanitize any other JWT verification errors to avoid exposing internal crypto/key details
    throw new AppError(
      401,
      ErrorCode.UNAUTHORIZED,
      'Authentication token verification failed: invalid signature or claims.'
    );
  }
}

/**
 * Test & Development helper: Signs a valid JWT token.
 * Used for automated test suites and dev integration.
 */
export function createTestJwt(
  claims: Partial<JwtUserClaims> & { sub: string },
  secretOverride?: string,
  options?: jwt.SignOptions
): string {
  const config = loadConfig();
  const secret = secretOverride || config.jwt.secret || 'test_secret_for_signing_tokens_minimum_32_characters';

  const defaultPayload = {
    name: claims.name || `Test User ${claims.sub}`,
    email: claims.email || `${claims.sub}@openresource.demo`,
    role: claims.role || UserRole.USER,
    badges: claims.badges || [],
    ...claims,
  };

  const signOptions: jwt.SignOptions = {
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    algorithm: 'HS256',
    expiresIn: '1h',
    ...options,
  };

  return jwt.sign(defaultPayload, secret, signOptions);
}
