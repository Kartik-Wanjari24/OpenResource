// OpenResource - Member 2 Configuration & Environment Validation
import dotenv from 'dotenv';
import { AppError, ErrorCode } from '../utils/errors.js';

dotenv.config();

export interface AppConfig {
  env: string;
  isProduction: boolean;
  isTest: boolean;
  port: number;
  storageMode: 'postgres' | 'memory';
  databaseUrl?: string;
  jwt: {
    secret?: string;
    publicKey?: string;
    issuer: string;
    audience: string;
    algorithms: string[];
  };
  enableDevTestAuth: boolean;
  allowedOrigins: string[];
}

const PLACEHOLDER_STRINGS = [
  'your_password_here',
  'replace_with_a_secure_random_secret',
  'your_jwt_secret',
  'changeme',
];

/**
 * Validates production environment safety without ever printing secrets.
 * Throws AppError or returns validation errors for testability.
 */
export function validateEnvironment(env: NodeJS.ProcessEnv = process.env): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  const storageMode = (env.STORAGE_MODE?.toLowerCase() || 'memory') as 'postgres' | 'memory';
  const databaseUrl = env.DATABASE_URL;

  // 1. Database validation in postgres mode
  if (storageMode === 'postgres') {
    if (!databaseUrl || databaseUrl.trim() === '') {
      errors.push('STORAGE_MODE is set to "postgres" but DATABASE_URL is missing or empty.');
    } else if (isProduction && PLACEHOLDER_STRINGS.some((p) => databaseUrl.includes(p))) {
      errors.push('DATABASE_URL contains an unconfigured placeholder in production.');
    }
  }

  // 2. Authentication & JWT validation in production
  if (isProduction) {
    const jwtSecret = env.JWT_SECRET;
    const jwtPublicKey = env.JWT_PUBLIC_KEY;

    if (!jwtSecret && !jwtPublicKey) {
      errors.push(
        'Production startup failed: JWT_SECRET or JWT_PUBLIC_KEY is required for authentic Bearer authentication.'
      );
    } else if (jwtSecret) {
      if (PLACEHOLDER_STRINGS.some((p) => jwtSecret.toLowerCase().includes(p))) {
        errors.push('JWT_SECRET contains an unconfigured placeholder in production.');
      } else if (jwtSecret.length < 32) {
        errors.push('JWT_SECRET must be at least 32 characters long for production HS256 security.');
      }
    }

    // 3. CORS validation in production
    const allowedOrigins = env.ALLOWED_ORIGINS;
    if (allowedOrigins && allowedOrigins.includes('*')) {
      errors.push('ALLOWED_ORIGINS cannot contain wildcard "*" in production.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Loads and returns the validated configuration.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  const validation = validateEnvironment(env);
  if (!validation.isValid && isProduction) {
    const errorMessage = `Production Configuration Error:\n- ${validation.errors.join('\n- ')}`;
    console.error(errorMessage);
    throw new AppError(500, ErrorCode.INTERNAL_ERROR, errorMessage);
  }

  const defaultJwtSecret = isProduction
    ? undefined
    : env.JWT_SECRET || 'dev_insecure_jwt_secret_for_local_testing_only_32_chars!';

  const parsedPort = parseInt(env.PORT || '3000', 10);
  const port = isNaN(parsedPort) ? 3000 : parsedPort;

  const storageMode: 'postgres' | 'memory' =
    env.STORAGE_MODE?.toLowerCase() === 'postgres' ? 'postgres' : 'memory';

  const defaultOrigins = isProduction ? [] : ['http://localhost:5173', 'http://localhost:3000'];
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : defaultOrigins;

  const enableDevTestAuth = !isProduction && (env.ENABLE_DEV_TEST_AUTH !== 'false' || isTest);

  return {
    env: nodeEnv,
    isProduction,
    isTest,
    port,
    storageMode,
    databaseUrl: env.DATABASE_URL,
    jwt: {
      secret: env.JWT_SECRET || defaultJwtSecret,
      publicKey: env.JWT_PUBLIC_KEY,
      issuer: env.JWT_ISSUER || 'openresource-auth',
      audience: env.JWT_AUDIENCE || 'openresource-api',
      algorithms: env.JWT_ALGORITHMS ? env.JWT_ALGORITHMS.split(',').map((a) => a.trim()) : ['HS256', 'RS256'],
    },
    enableDevTestAuth,
    allowedOrigins,
  };
}
