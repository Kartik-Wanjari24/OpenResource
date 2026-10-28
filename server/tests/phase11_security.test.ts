import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { StorageAdapter } from '../adapters/storage.adapter.js';
import { SchedulerService } from '../services/scheduler.service.js';
import { UserRole, BookingStatus } from '../types/booking.js';
import { createTestJwt } from '../utils/jwt.js';
import { validateEnvironment } from '../config/env.js';

describe('Member 2 - Phase 11: Production Authentication, Security Hardening & Deployment Readiness', () => {
  const storage = StorageAdapter.getInstance();
  const scheduler = SchedulerService.getInstance();

  beforeEach(async () => {
    await storage.resetStore();
    await storage.deleteBooking('book_demo_101');
  });

  afterAll(async () => {
    scheduler.stop();
    await StorageAdapter.close();
  });

  // =========================================================================
  // 1. Mandatory Authentication on Protected Routes
  // =========================================================================
  describe('1. Mandatory Authentication on Protected Endpoints', () => {
    it('rejects POST /api/bookings without any credentials with 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-11-20T10:00:00Z',
          endTime: '2026-11-20T12:00:00Z',
          intent: 'Anonymous booking attempt',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('Authentication required');
    });

    it('rejects POST /api/bookings/:id/transition without any credentials with 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .post('/api/bookings/book_test_123/transition')
        .send({ targetStatus: BookingStatus.APPROVED });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects POST /api/bookings/process-no-shows without credentials with 401 UNAUTHORIZED', async () => {
      const res = await request(app).post('/api/bookings/process-no-shows');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('Authentication required');
    });

    it('rejects GET /api/notifications without credentials with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/notifications');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // =========================================================================
  // 2. JWT Signature, Claims & Expiration Verification
  // =========================================================================
  describe('2. JWT Verification & Cryptographic Security', () => {
    it('successfully authenticates a valid signed Bearer JWT token', async () => {
      const validToken = createTestJwt({
        sub: 'demo_qualified_student',
        role: UserRole.USER,
        name: 'Alice Chen',
        badges: ['badge_safety_101', 'badge_3d_basics'],
      });

      const tomorrow = new Date(Date.now() + 86400000);
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          resourceId: 'res_3d_prusa',
          startTime: new Date(tomorrow.setHours(10, 0, 0, 0)).toISOString(),
          endTime: new Date(tomorrow.setHours(12, 0, 0, 0)).toISOString(),
          intent: 'Valid JWT booking',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.booking.userId).toBe('demo_qualified_student');
    });

    it('rejects an expired JWT token with 401 UNAUTHORIZED', async () => {
      const expiredToken = createTestJwt(
        { sub: 'demo_qualified_student', role: UserRole.USER },
        undefined,
        { expiresIn: '-10s' }
      );

      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('expired');
    });

    it('rejects a JWT token signed with an invalid/untrusted secret with 401 UNAUTHORIZED', async () => {
      const forgedToken = createTestJwt(
        { sub: 'demo_qualified_student', role: UserRole.ADMIN },
        'untrusted_attacker_secret_key_32chars_long!'
      );

      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('verification failed');
    });

    it('rejects a tampered JWT token with modified signature with 401 UNAUTHORIZED', async () => {
      const validToken = createTestJwt({ sub: 'demo_qualified_student', role: UserRole.USER });
      const tamperedToken = validToken.slice(0, -6) + 'abcdef';

      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a JWT token with missing subject claim (sub)', async () => {
      const tokenWithoutSub = createTestJwt({ sub: '' as any, role: UserRole.USER });

      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${tokenWithoutSub}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('missing subject claim');
    });
  });

  // =========================================================================
  // 3. Role Privilege Escalation Prevention
  // =========================================================================
  describe('3. Role Privilege Escalation Prevention', () => {
    it('strictly derives role from verified token claims, ignoring client X-Test-User-Role header', async () => {
      // User is verified as student USER in token
      const studentToken = createTestJwt({
        sub: 'demo_qualified_student',
        role: UserRole.USER,
      });

      // Client attempts to escalate role to ADMIN via header
      const res = await request(app)
        .post('/api/bookings/process-no-shows')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('X-Test-User-Role', 'ADMIN');

      // Must be rejected as FORBIDDEN because token claim role is USER
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows no-show processing for token verified with LAB_OWNER role', async () => {
      const ownerToken = createTestJwt({
        sub: 'demo_lab_owner',
        role: UserRole.LAB_OWNER,
      });

      const res = await request(app)
        .post('/api/bookings/process-no-shows')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ referenceTime: '2026-11-26T10:20:00Z' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // =========================================================================
  // 4. Production Mode Test Header Impersonation Prevention
  // =========================================================================
  describe('4. Production Mode Hardening against Test Headers', () => {
    it('strictly rejects X-Test-User-* headers when NODE_ENV is production (401 UNAUTHORIZED)', async () => {
      const oldEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const res = await request(app)
          .post('/api/bookings')
          .set('X-Test-User-Id', 'demo_qualified_student')
          .set('X-Test-User-Role', 'USER')
          .send({
            resourceId: 'res_3d_prusa',
            startTime: '2026-11-20T10:00:00Z',
            endTime: '2026-11-20T12:00:00Z',
            intent: 'Production impersonation attempt',
          });

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      } finally {
        process.env.NODE_ENV = oldEnv;
      }
    });

    it('strictly rejects persona string tokens in Bearer header when NODE_ENV is production (401 UNAUTHORIZED)', async () => {
      const oldEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const res = await request(app)
          .get('/api/notifications')
          .set('Authorization', 'Bearer demo_lab_owner');

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      } finally {
        process.env.NODE_ENV = oldEnv;
      }
    });

    it('rejects test headers when ENABLE_DEV_TEST_AUTH is set to "false" in non-production (401 UNAUTHORIZED)', async () => {
      const oldFlag = process.env.ENABLE_DEV_TEST_AUTH;
      const oldEnv = process.env.NODE_ENV;
      process.env.ENABLE_DEV_TEST_AUTH = 'false';
      process.env.NODE_ENV = 'development';

      try {
        const res = await request(app)
          .get('/api/notifications')
          .set('X-Test-User-Id', 'demo_qualified_student')
          .set('X-Test-User-Role', 'USER');

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      } finally {
        process.env.ENABLE_DEV_TEST_AUTH = oldFlag;
        process.env.NODE_ENV = oldEnv;
      }
    });
  });

  // =========================================================================
  // 5. Security Headers, Payload Limits & Public Health Check
  // =========================================================================
  describe('5. Security Headers, Payload Safety & Public Health Monitoring', () => {
    it('sets standard security headers on HTTP responses (X-Content-Type-Options, X-Frame-Options)', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-xss-protection']).toBe('0');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('returns sanitized health metadata without exposing secrets, credentials, or internal paths', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.storageMode).toBeDefined();
      expect(res.body.password).toBeUndefined();
      expect(res.body.databaseUrl).toBeUndefined();
      expect(res.body.jwtSecret).toBeUndefined();
    });

    it('rejects payload exceeding request size limit', async () => {
      // Send payload greater than 100kb limit
      const oversizedPayload = {
        data: 'x'.repeat(120 * 1024),
      };

      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send(oversizedPayload);

      // Body-parser returns 413 Payload Too Large
      expect(res.status).toBe(413);
    });

    it('sanitizes error responses and never exposes stack traces or sensitive internal paths', async () => {
      const res = await request(app).get('/api/non_existent_route_404');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.stack).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('node_modules');
    });
  });

  // =========================================================================
  // 6. Environment Validation & Production Safety Checks
  // =========================================================================
  describe('6. Production Environment Safety Validation', () => {
    it('detects missing JWT_SECRET in production mode', () => {
      const testEnv = {
        NODE_ENV: 'production',
        STORAGE_MODE: 'memory',
      };

      const result = validateEnvironment(testEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('JWT_SECRET'))).toBe(true);
    });

    it('detects short/insecure JWT_SECRET (< 32 characters) in production mode', () => {
      const testEnv = {
        NODE_ENV: 'production',
        STORAGE_MODE: 'memory',
        JWT_SECRET: 'short_secret_under_32_chars',
      };

      const result = validateEnvironment(testEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('at least 32 characters long'))).toBe(true);
    });

    it('detects unconfigured placeholder JWT_SECRET in production mode', () => {
      const testEnv = {
        NODE_ENV: 'production',
        STORAGE_MODE: 'memory',
        JWT_SECRET: 'replace_with_a_secure_random_secret_at_least_32_characters_long',
      };

      const result = validateEnvironment(testEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('placeholder'))).toBe(true);
    });

    it('detects wildcard ALLOWED_ORIGINS in production mode', () => {
      const testEnv = {
        NODE_ENV: 'production',
        STORAGE_MODE: 'memory',
        JWT_SECRET: 'a_very_secure_random_production_secret_key_32chars!',
        ALLOWED_ORIGINS: '*',
      };

      const result = validateEnvironment(testEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('wildcard "*"'))).toBe(true);
    });

    it('detects missing DATABASE_URL when STORAGE_MODE is postgres', () => {
      const testEnv = {
        NODE_ENV: 'production',
        STORAGE_MODE: 'postgres',
        JWT_SECRET: 'a_very_secure_random_production_secret_key_32chars!',
      };

      const result = validateEnvironment(testEnv);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('DATABASE_URL is missing'))).toBe(true);
    });

    it('passes validation when production configuration is strong and complete', () => {
      const testEnv = {
        NODE_ENV: 'production',
        STORAGE_MODE: 'postgres',
        DATABASE_URL: 'postgresql://postgres:real_prod_password@db.prod.internal:5432/openresource_prod',
        JWT_SECRET: 'a_very_secure_random_production_secret_key_32chars!',
        ALLOWED_ORIGINS: 'https://app.openresource.org',
      };

      const result = validateEnvironment(testEnv);
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });
});
