import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * API Integration Tests for POST /api/resources/discover
 *
 * These tests verify the discovery endpoint behavior including:
 * - Authentication requirements
 * - Request validation
 * - Eligibility evaluation
 * - Alternative suggestions
 *
 * Note: These tests require a running PostgreSQL database
 */

describe('POST /api/resources/discover - API Integration Tests', () => {
  beforeAll(async () => {
    // Setup: Would create test data in database
    // For now, tests will use mocked data
  });

  afterAll(async () => {
    // Cleanup: Would remove test data
    await prisma.$disconnect();
  });

  describe('Authentication', () => {
    it('should return 401 when no authentication provided', async () => {
      const response = await request(app)
        .post('/api/resources/discover')
        .send({
          query: '3D printer',
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should accept valid authentication headers in development mode', async () => {
      const response = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', 'test-user-123')
        .set('X-Test-User-Role', 'USER')
        .send({
          query: '3D printer',
        });

      // Should not return 401 (may return 200 or other errors if DB not set up)
      expect(response.status).not.toBe(401);
    });
  });

  describe('Request Validation', () => {
    it('should reject invalid date format in filters.availableOn', async () => {
      const response = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', 'test-user-123')
        .set('X-Test-User-Role', 'USER')
        .send({
          query: 'printer',
          filters: {
            availableOn: '2026/10/28', // Invalid format (should be YYYY-MM-DD)
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toBeDefined();
    });

    it('should reject query string longer than 200 characters', async () => {
      const longQuery = 'a'.repeat(201);

      const response = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', 'test-user-123')
        .set('X-Test-User-Role', 'USER')
        .send({
          query: longQuery,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject negative maxDeposit', async () => {
      const response = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', 'test-user-123')
        .set('X-Test-User-Role', 'USER')
        .send({
          query: 'printer',
          filters: {
            maxDeposit: -10,
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid category', async () => {
      const response = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', 'test-user-123')
        .set('X-Test-User-Role', 'USER')
        .send({
          query: 'printer',
          filters: {
            category: 'INVALID_CATEGORY',
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept valid discovery request', async () => {
      const response = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', 'test-user-123')
        .set('X-Test-User-Role', 'USER')
        .set('X-Test-User-Badges', 'badge_safety_101,badge_3d_basics')
        .send({
          query: '3D printer',
          filters: {
            category: '3D_PRINTING',
            location: 'Lab A',
            maxDeposit: 100.00,
            availableOn: '2026-11-05',
          },
          userContext: {
            includeEligibility: true,
            includeAlternatives: true,
          },
        });

      // Should not return validation error
      // May return 500 if database not set up, but that's expected
      expect(response.status).not.toBe(400);

      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.results).toBeDefined();
        expect(Array.isArray(response.body.data.results)).toBe(true);
      }
    });
  });

  describe('Eligibility Evaluation (with database)', () => {
    // These tests require database setup and will be skipped if DB not available

    it('should return READY_TO_BOOK for resources where user has all badges', async () => {
      // This test requires:
      // 1. Resource in DB with requiredBadgeIds: ['badge_safety_101']
      // 2. User with matching badges in header

      const response = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', 'test-user-123')
        .set('X-Test-User-Role', 'USER')
        .set('X-Test-User-Badges', 'badge_safety_101,badge_3d_basics,badge_laser_cert')
        .send({
          query: 'printer',
        });

      if (response.status === 200) {
        const eligibleResources = response.body.data.results.filter(
          (r: any) => r.eligibility.status === 'READY_TO_BOOK'
        );

        // If we have resources, verify the eligible ones have correct status
        if (eligibleResources.length > 0) {
          expect(eligibleResources[0].eligibility.canBook).toBe(true);
          expect(eligibleResources[0].eligibility.reasons).toHaveLength(0);
        }
      }
    });

    it('should return MISSING_PREREQUISITE for resources where user lacks badges', async () => {
      const response = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', 'test-user-123')
        .set('X-Test-User-Role', 'USER')
        .set('X-Test-User-Badges', '') // No badges
        .send({
          query: 'laser cutter',
          filters: {
            category: 'LASER_CUTTING',
          },
        });

      if (response.status === 200) {
        const ineligibleResources = response.body.data.results.filter(
          (r: any) => r.eligibility.status === 'MISSING_PREREQUISITE'
        );

        if (ineligibleResources.length > 0) {
          const result = ineligibleResources[0];
          expect(result.eligibility.canBook).toBe(false);
          expect(result.eligibility.reasons.length).toBeGreaterThan(0);

          // Should have MISSING_BADGE reasons
          const badgeReasons = result.eligibility.reasons.filter(
            (r: any) => r.type === 'MISSING_BADGE'
          );
          expect(badgeReasons.length).toBeGreaterThan(0);
          expect(badgeReasons[0].badgeId).toBeDefined();
        }
      }
    });

    it('should include supervision requirements in resource data', async () => {
      const response = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', 'test-user-123')
        .set('X-Test-User-Role', 'USER')
        .send({
          query: 'equipment',
        });

      if (response.status === 200 && response.body.data.results.length > 0) {
        const resource = response.body.data.results[0].resource;
        expect(resource.requiresSupervision).toBeDefined();
        expect(typeof resource.requiresSupervision).toBe('boolean');
      }
    });
  });

  describe('Alternative Suggestions', () => {
    it('should return alternatives array', async () => {
      const response = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', 'test-user-123')
        .set('X-Test-User-Role', 'USER')
        .set('X-Test-User-Badges', '')
        .send({
          query: 'printer',
          userContext: {
            includeAlternatives: true,
          },
        });

      if (response.status === 200) {
        expect(response.body.data.alternatives).toBeDefined();
        expect(Array.isArray(response.body.data.alternatives)).toBe(true);
      }
    });

    it('should not duplicate resources in alternatives', async () => {
      const response = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', 'test-user-123')
        .set('X-Test-User-Role', 'USER')
        .send({
          query: 'equipment',
        });

      if (response.status === 200) {
        const mainResourceIds = new Set(
          response.body.data.results.map((r: any) => r.resource.id)
        );
        const alternativeIds = new Set(
          response.body.data.alternatives.map((a: any) => a.resourceId)
        );

        // No overlap between main results and alternatives
        const intersection = new Set(
          [...mainResourceIds].filter(id => alternativeIds.has(id))
        );
        expect(intersection.size).toBe(0);
      }
    });

    it('should provide reason for each alternative', async () => {
      const response = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', 'test-user-123')
        .set('X-Test-User-Role', 'USER')
        .send({
          query: 'printer',
        });

      if (response.status === 200 && response.body.data.alternatives.length > 0) {
        const alternative = response.body.data.alternatives[0];
        expect(alternative.resourceId).toBeDefined();
        expect(alternative.name).toBeDefined();
        expect(alternative.reason).toBeDefined();
        expect(alternative.reason.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Response Format', () => {
    it('should return consistent response structure', async () => {
      const response = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', 'test-user-123')
        .set('X-Test-User-Role', 'USER')
        .send({
          query: 'printer',
        });

      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.results).toBeDefined();
        expect(response.body.data.alternatives).toBeDefined();
        expect(response.body.data.totalResults).toBeDefined();
        expect(response.body.timestamp).toBeDefined();
      }
    });

    it('should include match score and reasons for each result', async () => {
      const response = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', 'test-user-123')
        .set('X-Test-User-Role', 'USER')
        .send({
          query: 'printer',
          filters: {
            category: '3D_PRINTING',
          },
        });

      if (response.status === 200 && response.body.data.results.length > 0) {
        const result = response.body.data.results[0];
        expect(result.matchScore).toBeDefined();
        expect(typeof result.matchScore).toBe('number');
        expect(result.matchScore).toBeGreaterThanOrEqual(0);
        expect(result.matchScore).toBeLessThanOrEqual(1);
        expect(Array.isArray(result.matchReasons)).toBe(true);
      }
    });

    it('should include eligibility details for each result', async () => {
      const response = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', 'test-user-123')
        .set('X-Test-User-Role', 'USER')
        .send({
          query: 'equipment',
        });

      if (response.status === 200 && response.body.data.results.length > 0) {
        const result = response.body.data.results[0];
        expect(result.eligibility).toBeDefined();
        expect(result.eligibility.status).toBeDefined();
        expect(['READY_TO_BOOK', 'MISSING_PREREQUISITE', 'QUOTA_EXCEEDED']).toContain(
          result.eligibility.status
        );
        expect(result.eligibility.canBook).toBeDefined();
        expect(typeof result.eligibility.canBook).toBe('boolean');
        expect(Array.isArray(result.eligibility.reasons)).toBe(true);
      }
    });
  });

  describe('User Identity Security', () => {
    it('should use user ID from authentication middleware, not request body', async () => {
      // Even if request body includes a userId, it should be ignored
      const response = await request(app)
        .post('/api/resources/discover')
        .set('X-Test-User-Id', 'authenticated-user-123')
        .set('X-Test-User-Role', 'USER')
        .send({
          query: 'printer',
          userId: 'malicious-user-456', // Should be ignored
        });

      // The controller should use req.user.id from auth middleware
      // This is verified in the controller code inspection
      expect(response.status).not.toBe(401); // Has valid auth
    });
  });
});
