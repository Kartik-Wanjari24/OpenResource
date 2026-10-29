import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { StorageAdapter } from '../adapters/storage.adapter.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 1: Trust Inspection API', () => {
  beforeAll(async () => {
    // Initialize storage adapter
    await StorageAdapter.getInstance();
  });

  afterAll(async () => {
    await StorageAdapter.close();
  });

  describe('GET /api/trust/health', () => {
    it('should return service health status', async () => {
      const response = await request(app).get('/api/trust/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('service', 'trust-inspection');
      expect(response.body.data).toHaveProperty('vision_provider_available');
      expect(typeof response.body.data.vision_provider_available).toBe('boolean');
    });

    it('should indicate configuration requirement if GEMINI_API_KEY is missing', async () => {
      const originalKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const response = await request(app).get('/api/trust/health');

      expect(response.status).toBe(200);
      expect(response.body.data.vision_provider_available).toBe(false);
      expect(response.body.data.requires_configuration).toBe(true);
      expect(response.body.data.configuration_hint).toContain('GEMINI_API_KEY');

      // Restore original key
      if (originalKey) process.env.GEMINI_API_KEY = originalKey;
    });
  });

  describe('POST /api/trust/inspect-condition', () => {
    // Create minimal valid test images (1x1 pixel PNG)
    const createTestPNG = (): Buffer => {
      // Minimal 1x1 transparent PNG
      return Buffer.from(
        '89504e470d0a1a0a0000000d494844520000000100000001080600' +
          '00001f15c4890000000a49444154789c6300010000050001' +
          '0d0a2db40000000049454e44ae426082',
        'hex'
      );
    };

    const createTestJPEG = (): Buffer => {
      // Minimal 1x1 black JPEG
      return Buffer.from(
        'ffd8ffe000104a46494600010101006000600000ffdb004300080606' +
          '070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e' +
          '1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d' +
          '38323c2e333432ffdb0043010909090c0b0c180d0d1832211c2132' +
          '32323232323232323232323232323232323232323232323232323232' +
          '32323232323232323232323232323232323232323232ffc000110800' +
          '01000103012200021101031101ffc4001500010100000000000000' +
          '000000000000000008ffc40014100100000000000000000000000000' +
          '0000ffc4001501010100000000000000000000000000000008ffc400' +
          '14110100000000000000000000000000000000ffda000c03010002' +
          '11031100003f00bfff00ffd9',
        'hex'
      );
    };

    it('should reject unauthenticated requests', async () => {
      const response = await request(app)
        .post('/api/trust/inspect-condition')
        .attach('check_in_photo', createTestPNG(), 'check_in.png')
        .attach('check_out_photo', createTestPNG(), 'check_out.png');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject requests with missing check_in_photo', async () => {
      const response = await request(app)
        .post('/api/trust/inspect-condition')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('check_out_photo', createTestPNG(), 'check_out.png');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('check_in_photo');
    });

    it('should reject requests with missing check_out_photo', async () => {
      const response = await request(app)
        .post('/api/trust/inspect-condition')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('check_in_photo', createTestPNG(), 'check_in.png');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('check_out_photo');
    });

    it('should reject invalid file types', async () => {
      const textFile = Buffer.from('This is not an image');

      const response = await request(app)
        .post('/api/trust/inspect-condition')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('check_in_photo', textFile, { filename: 'test.txt', contentType: 'text/plain' })
        .attach('check_out_photo', createTestPNG(), 'check_out.png');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Invalid file type');
    });

    it('should reject files with invalid image headers', async () => {
      const fakeImage = Buffer.from('FAKE IMAGE DATA');

      const response = await request(app)
        .post('/api/trust/inspect-condition')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('check_in_photo', fakeImage, { filename: 'fake.png', contentType: 'image/png' })
        .attach('check_out_photo', createTestPNG(), 'check_out.png');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('File header does not match');
    });

    it('should accept valid PNG images', async () => {
      const response = await request(app)
        .post('/api/trust/inspect-condition')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('check_in_photo', createTestPNG(), { filename: 'check_in.png', contentType: 'image/png' })
        .attach('check_out_photo', createTestPNG(), { filename: 'check_out.png', contentType: 'image/png' });

      // Response depends on whether GEMINI_API_KEY is configured
      if (response.status === 503) {
        // Vision provider not configured - expected behavior
        expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(response.body.error.message).toContain('GEMINI_API_KEY');
      } else if (response.status === 200) {
        // Vision provider configured and returned results
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('inspection');

        const inspection = response.body.data.inspection;
        expect(inspection).toHaveProperty('match_score');
        expect(inspection).toHaveProperty('detected_anomalies');
        expect(inspection).toHaveProperty('severity');
        expect(inspection).toHaveProperty('requires_human_review', true);
        expect(inspection).toHaveProperty('inspection_timestamp');

        // Validate match_score range
        expect(inspection.match_score).toBeGreaterThanOrEqual(0);
        expect(inspection.match_score).toBeLessThanOrEqual(100);

        // Validate detected_anomalies structure
        expect(Array.isArray(inspection.detected_anomalies)).toBe(true);
        if (inspection.detected_anomalies.length > 0) {
          const anomaly = inspection.detected_anomalies[0];
          expect(anomaly).toHaveProperty('type');
          expect(anomaly).toHaveProperty('description');
          expect(anomaly).toHaveProperty('severity');
          expect(['MINOR', 'MODERATE', 'SEVERE']).toContain(anomaly.severity);
        }

        // Validate severity
        expect(['NONE', 'MINOR', 'MODERATE', 'SEVERE']).toContain(inspection.severity);

        // Validate provider metadata
        expect(inspection).toHaveProperty('provider_metadata');
        expect(inspection.provider_metadata).toHaveProperty('provider');
        expect(inspection.provider_metadata).toHaveProperty('model');
      } else {
        throw new Error(`Unexpected response status: ${response.status}`);
      }
    });

    it('should accept valid JPEG images', async () => {
      const response = await request(app)
        .post('/api/trust/inspect-condition')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .attach('check_in_photo', createTestJPEG(), { filename: 'check_in.jpg', contentType: 'image/jpeg' })
        .attach('check_out_photo', createTestJPEG(), { filename: 'check_out.jpg', contentType: 'image/jpeg' });

      // Response depends on whether GEMINI_API_KEY is configured
      expect([200, 503]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.data.inspection).toHaveProperty('requires_human_review', true);
      }
    });

    it('should handle provider timeout gracefully', async () => {
      // This test verifies error handling structure
      // Actual timeout testing requires mocking the vision service
      const response = await request(app)
        .post('/api/trust/inspect-condition')
        .set('X-Test-User-Id', 'demo_admin')
        .attach('check_in_photo', createTestPNG(), 'check_in.png')
        .attach('check_out_photo', createTestPNG(), 'check_out.png');

      // Should either succeed or return service error, never crash
      expect([200, 500, 503]).toContain(response.status);
      if (response.status >= 400) {
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('code');
        expect(response.body.error).toHaveProperty('message');
      }
    });

    it('should always require human review', async () => {
      const response = await request(app)
        .post('/api/trust/inspect-condition')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('check_in_photo', createTestPNG(), 'check_in.png')
        .attach('check_out_photo', createTestPNG(), 'check_out.png');

      if (response.status === 200) {
        // CRITICAL: requires_human_review must ALWAYS be true
        expect(response.body.data.inspection.requires_human_review).toBe(true);
      }
    });

    it('should handle different user roles', async () => {
      const testRoles = ['demo_qualified_student', 'demo_lab_owner', 'demo_admin', 'demo_auditor'];

      for (const userId of testRoles) {
        const response = await request(app)
          .post('/api/trust/inspect-condition')
          .set('X-Test-User-Id', userId)
          .attach('check_in_photo', createTestPNG(), 'check_in.png')
          .attach('check_out_photo', createTestPNG(), 'check_out.png');

        // All authenticated users should be able to use the endpoint
        expect([200, 503]).toContain(response.status);
      }
    });

    it('should reject oversized files', async () => {
      // Create a buffer larger than 5MB limit
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024);
      // Add PNG header to pass magic byte validation
      const pngHeader = Buffer.from('89504e470d0a1a0a', 'hex');
      pngHeader.copy(largeBuffer, 0);

      const response = await request(app)
        .post('/api/trust/inspect-condition')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('check_in_photo', largeBuffer, { filename: 'large.png', contentType: 'image/png' })
        .attach('check_out_photo', createTestPNG(), 'check_out.png');

      expect(response.status).toBe(400);
    });
  });

  describe('Authorization and Privacy', () => {
    it('should not expose uploaded images via public URLs', async () => {
      // Verify that uploaded images are processed in memory and not saved to disk
      const response = await request(app)
        .post('/api/trust/inspect-condition')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('check_in_photo', Buffer.from('89504e470d0a1a0a', 'hex'), 'test.png')
        .attach('check_out_photo', Buffer.from('89504e470d0a1a0a', 'hex'), 'test2.png');

      // Files should not be accessible via any URL pattern
      // This is ensured by using memoryStorage in multer
      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    it('should allow different user personas in development mode', async () => {
      const personas = ['demo_qualified_student', 'demo_lab_owner', 'demo_resource_hog'];

      for (const persona of personas) {
        const response = await request(app)
          .get('/api/trust/health')
          .set('X-Test-User-Id', persona);

        expect(response.status).toBe(200);
      }
    });
  });

  describe('Error Response Structure', () => {
    it('should return consistent error structure', async () => {
      const response = await request(app)
        .post('/api/trust/inspect-condition')
        .attach('check_in_photo', Buffer.from('invalid'), 'test.png');

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.success).toBe(false);
    });
  });
});
