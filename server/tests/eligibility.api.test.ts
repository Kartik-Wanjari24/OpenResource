import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { StorageAdapter } from '../adapters/storage.adapter.js';

describe('Phase 2: Eligibility Verification API', () => {
  beforeAll(async () => {
    await StorageAdapter.getInstance();
  });

  afterAll(async () => {
    await StorageAdapter.close();
  });

  // Helper: Create minimal test certificate (1x1 PNG)
  const createTestPNG = (): Buffer => {
    return Buffer.from(
      '89504e470d0a1a0a0000000d494844520000000100000001080600' +
        '00001f15c4890000000a49444154789c6300010000050001' +
        '0d0a2db40000000049454e44ae426082',
      'hex'
    );
  };

  // Helper: Create test PDF certificate
  const createTestPDF = (): Buffer => {
    return Buffer.from('%PDF-1.4\n%Test Certificate\n%%EOF\n');
  };

  describe('GET /api/trust/eligibility/config', () => {
    it('should return configuration status', async () => {
      const response = await request(app).get('/api/trust/eligibility/config');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('certificate_verification_enabled');
      expect(response.body.data).toHaveProperty('safety_assessment_enabled');
      expect(response.body.data).toHaveProperty('configuration_complete');
      expect(response.body.data).toHaveProperty('missing_configuration');
    });

    it('should indicate missing configuration by default', async () => {
      const response = await request(app).get('/api/trust/eligibility/config');

      expect(response.status).toBe(200);
      expect(response.body.data.configuration_complete).toBe(false);
      expect(Array.isArray(response.body.data.missing_configuration)).toBe(true);
      expect(response.body.data.missing_configuration.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/trust/eligibility/questions', () => {
    it('should return available assessment questions', async () => {
      const response = await request(app).get('/api/trust/eligibility/questions');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('questions');
      expect(response.body.data).toHaveProperty('available');
      expect(Array.isArray(response.body.data.questions)).toBe(true);
    });

    it('should not include correct answers in questions', async () => {
      const response = await request(app).get('/api/trust/eligibility/questions');

      expect(response.status).toBe(200);
      if (response.body.data.questions.length > 0) {
        const question = response.body.data.questions[0];
        expect(question).toHaveProperty('id');
        expect(question).toHaveProperty('question');
        expect(question).not.toHaveProperty('correctAnswer');
      }
    });
  });

  describe('POST /api/trust/verify-eligibility - Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .send({ answers: [] });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/trust/verify-eligibility - Certificate Upload', () => {
    it('should accept PNG certificate uploads', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('certificate', createTestPNG(), {
          filename: 'certificate.png',
          contentType: 'image/png',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.verification).toHaveProperty('verification_status');
      expect(response.body.data.verification).toHaveProperty('verification_method');
      expect(response.body.data.verification.verification_method).toBe('certificate_upload');
    });

    it('should accept PDF certificate uploads', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('certificate', createTestPDF(), {
          filename: 'certificate.pdf',
          contentType: 'application/pdf',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.verification.verification_method).toBe('certificate_upload');
    });

    it('should return PENDING_MANUAL_REVIEW for certificates', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('certificate', createTestPNG(), 'certificate.png');

      expect(response.status).toBe(200);
      expect(response.body.data.verification.verification_status).toBe('PENDING_MANUAL_REVIEW');
      expect(response.body.data.verification.eligible).toBe(false);
      expect(response.body.data.verification.eligibility_badge).toBe(null);
      expect(response.body.data.verification.requires_human_review).toBe(true);
    });

    it('should include certificate metadata', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('certificate', createTestPNG(), 'test-cert.png');

      expect(response.status).toBe(200);
      expect(response.body.data.verification).toHaveProperty('certificate_metadata');
      expect(response.body.data.verification.certificate_metadata).toHaveProperty('originalFilename');
      expect(response.body.data.verification.certificate_metadata).toHaveProperty('mimeType');
      expect(response.body.data.verification.certificate_metadata).toHaveProperty('fileSize');
      expect(response.body.data.verification.certificate_metadata).toHaveProperty('uploadedAt');
    });

    it('should indicate missing configuration', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('certificate', createTestPNG(), 'certificate.png');

      expect(response.status).toBe(200);
      expect(response.body.data.verification).toHaveProperty('configuration_missing');
      expect(Array.isArray(response.body.data.verification.configuration_missing)).toBe(true);
    });

    it('should reject invalid certificate file types', async () => {
      const textFile = Buffer.from('This is not a certificate');

      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('certificate', textFile, {
          filename: 'not-a-cert.txt',
          contentType: 'text/plain',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Invalid certificate file type');
    });

    it('should reject oversized certificates', async () => {
      const largeCert = Buffer.alloc(6 * 1024 * 1024); // 6MB
      const pngHeader = Buffer.from('89504e470d0a1a0a', 'hex');
      pngHeader.copy(largeCert, 0);

      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('certificate', largeCert, {
          filename: 'large-cert.png',
          contentType: 'image/png',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/trust/verify-eligibility - Safety Assessment', () => {
    it('should accept assessment submissions', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('Content-Type', 'application/json')
        .send({
          answers: [
            { questionId: 'q1', answer: 'test answer 1' },
            { questionId: 'q2', answer: 'test answer 2' },
            { questionId: 'q3', answer: 'test answer 3' },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.verification.verification_method).toBe('safety_assessment');
    });

    it('should return CONFIGURATION_REQUIRED when questions not configured', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          answers: [{ questionId: 'q1', answer: 'answer1' }],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.verification.verification_status).toBe('CONFIGURATION_REQUIRED');
      expect(response.body.data.verification.eligible).toBe(false);
      expect(response.body.data.verification.eligibility_badge).toBe(null);
    });

    it('should require answers array', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('certificate file or assessment answers');
    });

    it('should validate answers array structure', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          answers: 'not an array',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('must be an array');
    });

    it('should validate answer object structure', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          answers: [
            { questionId: 'q1' }, // Missing answer field
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('missing or invalid answer');
    });

    it('should include assessment details in response', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          answers: [
            { questionId: 'q1', answer: 'a1' },
            { questionId: 'q2', answer: 'a2' },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.verification).toHaveProperty('assessment_details');
      expect(response.body.data.verification.assessment_details).toHaveProperty('total_questions');
      expect(response.body.data.verification.assessment_details).toHaveProperty(
        'answered_questions'
      );
    });

    it('should always require human review', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          answers: [{ questionId: 'q1', answer: 'answer' }],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.verification.requires_human_review).toBe(true);
    });
  });

  describe('POST /api/trust/verify-eligibility - Validation', () => {
    it('should reject both certificate and assessment in same request', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .field('answers', JSON.stringify([{ questionId: 'q1', answer: 'a1' }]))
        .attach('certificate', createTestPNG(), 'cert.png');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Cannot submit both');
    });

    it('should reject empty assessment submission', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          answers: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('must include answers');
    });
  });

  describe('POST /api/trust/verify-eligibility - Authorization', () => {
    it('should allow different authenticated users', async () => {
      const users = ['demo_qualified_student', 'demo_lab_owner', 'demo_resource_hog'];

      for (const userId of users) {
        const response = await request(app)
          .post('/api/trust/verify-eligibility')
          .set('X-Test-User-Id', userId)
          .attach('certificate', createTestPNG(), 'cert.png');

        expect(response.status).toBe(200);
      }
    });
  });

  describe('Security: Badge Issuance Prevention', () => {
    it('should never automatically grant badges via certificate upload', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('certificate', createTestPNG(), 'cert.png');

      expect(response.status).toBe(200);
      expect(response.body.data.verification.eligible).toBe(false);
      expect(response.body.data.verification.eligibility_badge).toBe(null);
      expect(response.body.data.verification.verification_status).toBe('PENDING_MANUAL_REVIEW');
    });

    it('should not trust client-supplied badge identifiers', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          answers: [{ questionId: 'q1', answer: 'a1' }],
          requestedBadge: 'badge_admin', // Attempt to request admin badge
          eligibilityScore: 100, // Attempt to fake score
        });

      expect(response.status).toBe(200);
      // Should use server-controlled evaluation, not client values
      expect(response.body.data.verification.eligible).toBe(false);
    });
  });

  describe('Error Response Structure', () => {
    it('should return consistent error structure', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .send({ invalid: 'data' });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
