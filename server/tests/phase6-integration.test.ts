import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { StorageAdapter } from '../adapters/storage.adapter.js';

/**
 * Phase 6: Final End-to-End Integration Testing
 *
 * Tests complete workflows across all phases:
 * 1. Condition inspection (Phase 1)
 * 2. Eligibility verification (Phase 2)
 * 3. Audit event appending and verification (Phase 3)
 * 4. Incident management and resolution (Phase 4)
 * 5. Audit explorer visibility (Phase 5)
 * 6. Cross-phase integration (incident → audit)
 */
describe('Phase 6: End-to-End Integration', () => {
  beforeAll(async () => {
    await StorageAdapter.getInstance();
  });

  afterAll(async () => {
    await StorageAdapter.close();
  });

  describe('Workflow 1: Condition Inspection', () => {
    // Helper: Create minimal valid 1x1 PNG
    const createTestPNG = (): Buffer => {
      return Buffer.from(
        '89504e470d0a1a0a0000000d494844520000000100000001080600' +
          '00001f15c4890000000a49444154789c6300010000050001' +
          '0d0a2db40000000049454e44ae426082',
        'hex'
      );
    };

    it('should accept valid inspection input and return anomaly detection', async () => {
      const checkInBuffer = createTestPNG();
      const checkOutBuffer = createTestPNG();

      const response = await request(app)
        .post('/api/trust/inspect-condition')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('check_in_photo', checkInBuffer, 'checkin.png')
        .attach('check_out_photo', checkOutBuffer, 'checkout.png');

      // Response depends on whether GEMINI_API_KEY is configured
      if (response.status === 503) {
        // Vision provider not configured - expected in test environment
        expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
      } else {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.inspection).toHaveProperty('severity');
        expect(response.body.data.inspection).toHaveProperty('match_score');
        expect(response.body.data.inspection).toHaveProperty('detected_anomalies');
        expect(response.body.data.inspection).toHaveProperty('requires_human_review');
      }
    });

    it('should require authentication', async () => {
      const checkInBuffer = createTestPNG();
      const checkOutBuffer = createTestPNG();

      const response = await request(app)
        .post('/api/trust/inspect-condition')
        .attach('check_in_photo', checkInBuffer, 'checkin.png')
        .attach('check_out_photo', checkOutBuffer, 'checkout.png');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Workflow 2: Eligibility Verification', () => {
    // Helper: Create test PDF certificate
    const createTestPDF = (): Buffer => {
      return Buffer.from('%PDF-1.4\n%Test Certificate\n%%EOF\n');
    };

    it('should handle certificate upload and return pending review', async () => {
      const pdfBuffer = createTestPDF();

      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .attach('certificate', pdfBuffer, 'cert.pdf');

      expect(response.status).toBe(200);
      expect(response.body.data.verification.verification_method).toBe('certificate_upload');
      expect(response.body.data.verification.verification_status).toBe('PENDING_MANUAL_REVIEW');
    });

    it('should handle safety assessment with missing configuration', async () => {
      const response = await request(app)
        .post('/api/trust/verify-eligibility')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          answers: ['answer1', 'answer2', 'answer3'],
        });

      // Without ELIGIBILITY_CONFIG, endpoint returns 400 validation error
      // because it cannot validate answers without configuration
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Workflow 3: Audit Event Chain', () => {
    it('should append events and maintain hash chain', async () => {
      // Get initial chain state
      const statusBefore = await request(app)
        .get('/api/audit/status');

      const initialLength = statusBefore.body.data.chainLength;

      // Append first event
      const event1 = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          eventType: 'booking_approval',
          bookingId: 'booking_integration_001',
          description: 'Integration test booking approval',
        });

      expect(event1.status).toBe(201);
      expect(event1.body.data.event.sequenceNumber).toBe(initialLength + 1);
      expect(event1.body.data.chainIntegrity.verified).toBe(true);

      // Append second event
      const event2 = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          eventType: 'check_in',
          resourceId: 'resource_integration_001',
          description: 'Integration test check-in',
        });

      expect(event2.status).toBe(201);
      expect(event2.body.data.event.sequenceNumber).toBe(initialLength + 2);
      expect(event2.body.data.event.previousHash).toBe(event1.body.data.event.currentHash);

      // Verify chain
      const verification = await request(app)
        .get('/api/audit/verify')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(verification.status).toBe(200);
      expect(verification.body.data.integrity.valid).toBe(true);
      expect(verification.body.data.summary.status).toBe('VALID');
    });

    it('should preserve actor identity from authentication', async () => {
      const response = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_admin')
        .set('X-Test-User-Role', 'ADMIN')
        .send({
          eventType: 'badge_granted',
          userId: 'some_user',
          description: 'Actor identity test',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.event.actorId).toBe('demo_admin');
      expect(response.body.data.event.actorRole).toBe('ADMIN');
    });
  });

  describe('Workflow 4: Incident Management', () => {
    it('should create and resolve incident with audit trail', async () => {
      // Create incident from inspection
      const createResponse = await request(app)
        .post('/api/incidents/from-inspection')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          bookingId: 'booking_phase6_001',
          resourceId: 'resource_phase6_001',
          userId: 'user_phase6_001',
          detectedAnomalies: [
            { type: 'scratch', description: 'Surface scratch detected', severity: 'MINOR' }
          ],
          aiSeverity: 'MINOR',
          matchScore: 85,
          proposedPenalty: {
            amount: 10,
            currency: 'USD',
            description: 'Minor damage penalty',
          },
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.data.incident.status).toBe('PENDING_REVIEW');

      const incidentId = createResponse.body.data.incident.id;

      // Resolve incident (requires authorization)
      const resolveResponse = await request(app)
        .post(`/api/incidents/${incidentId}/resolve`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          decision: 'DISMISS',
          reason: 'False positive - normal wear and tear',
        });

      expect(resolveResponse.status).toBe(200);
      expect(resolveResponse.body.data.incident.status).toBe('DISMISSED');
      expect(resolveResponse.body.data.incident.reviewDecision).toBe('DISMISS');
      expect(resolveResponse.body.data.incident.reviewReason).toBe('False positive - normal wear and tear');
    });

    it('should enforce authorization on incident resolution', async () => {
      // Create incident
      const createResponse = await request(app)
        .post('/api/incidents/from-inspection')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          bookingId: 'booking_auth_test',
          resourceId: 'resource_auth_test',
          userId: 'user_auth_test',
          detectedAnomalies: [{ type: 'test', description: 'test', severity: 'MINOR' }],
          aiSeverity: 'MINOR',
          matchScore: 80,
        });

      const incidentId = createResponse.body.data.incident.id;

      // Try to resolve as student (should fail)
      const unauthorizedResponse = await request(app)
        .post(`/api/incidents/${incidentId}/resolve`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'STUDENT')
        .send({
          decision: 'DISMISS',
          reason: 'Unauthorized attempt',
        });

      expect(unauthorizedResponse.status).toBe(403);
      expect(unauthorizedResponse.body.error.code).toBe('FORBIDDEN');
    });

    it('should validate mandatory reason field', async () => {
      const createResponse = await request(app)
        .post('/api/incidents/from-inspection')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          bookingId: 'booking_validation_test',
          resourceId: 'resource_validation_test',
          userId: 'user_validation_test',
          detectedAnomalies: [{ type: 'test', description: 'test', severity: 'MINOR' }],
          aiSeverity: 'MINOR',
          matchScore: 80,
        });

      const incidentId = createResponse.body.data.incident.id;

      // Try to resolve without reason
      const noReasonResponse = await request(app)
        .post(`/api/incidents/${incidentId}/resolve`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({
          decision: 'DISMISS',
        });

      expect(noReasonResponse.status).toBe(400);
      expect(noReasonResponse.body.error.message).toContain('reason');

      // Try with too short reason
      const shortReasonResponse = await request(app)
        .post(`/api/incidents/${incidentId}/resolve`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({
          decision: 'DISMISS',
          reason: 'short',
        });

      expect(shortReasonResponse.status).toBe(400);
    });
  });

  describe('Workflow 5: Audit Explorer Visibility', () => {
    it('should display all event types in timeline', async () => {
      const response = await request(app)
        .get('/api/audit/events?limit=100')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('events');
      expect(response.body.data).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data.events)).toBe(true);

      // Verify event structure
      if (response.body.data.events.length > 0) {
        const event = response.body.data.events[0];
        expect(event).toHaveProperty('id');
        expect(event).toHaveProperty('sequenceNumber');
        expect(event).toHaveProperty('previousHash');
        expect(event).toHaveProperty('currentHash');
        expect(event).toHaveProperty('eventType');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('actorId');
        expect(event).toHaveProperty('description');
        expect(event).toHaveProperty('metadata');
      }
    });

    it('should allow all authenticated users to view timeline', async () => {
      const users = [
        'demo_qualified_student',
        'demo_lab_owner',
        'demo_admin',
        'demo_auditor',
      ];

      for (const userId of users) {
        const response = await request(app)
          .get('/api/audit/events?limit=10')
          .set('X-Test-User-Id', userId);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });

    it('should return real verification results from backend', async () => {
      const response = await request(app)
        .get('/api/audit/verify')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(response.status).toBe(200);
      expect(response.body.data.integrity).toHaveProperty('valid');
      expect(typeof response.body.data.integrity.valid).toBe('boolean');
      expect(response.body.data.integrity).toHaveProperty('totalEvents');
      expect(response.body.data.integrity).toHaveProperty('verifiedEvents');
      expect(response.body.data.integrity).toHaveProperty('errors');
      expect(response.body.data.integrity).toHaveProperty('verificationTimestamp');
    });
  });

  describe('Workflow 6: Cross-Phase Integration (Incident → Audit)', () => {
    it('should record damage report in audit ledger when incident created', async () => {
      // Get event count before
      const beforeResponse = await request(app)
        .get('/api/audit/events?eventType=damage_report_filed&limit=1000')
        .set('X-Test-User-Id', 'demo_auditor');

      const eventCountBefore = beforeResponse.body.data.events.length;

      // Create incident
      const incidentResponse = await request(app)
        .post('/api/incidents/from-inspection')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          bookingId: 'booking_audit_integration_001',
          resourceId: 'resource_audit_integration_001',
          userId: 'user_audit_integration_001',
          detectedAnomalies: [{ type: 'damage', description: 'Test damage', severity: 'MODERATE' }],
          aiSeverity: 'MODERATE',
          matchScore: 75,
        });

      expect(incidentResponse.status).toBe(201);

      // Verify damage_report_filed event was created
      const afterResponse = await request(app)
        .get('/api/audit/events?eventType=damage_report_filed&limit=1000')
        .set('X-Test-User-Id', 'demo_auditor');

      const eventCountAfter = afterResponse.body.data.events.length;
      expect(eventCountAfter).toBe(eventCountBefore + 1);

      // Find the new event
      const newEvent = afterResponse.body.data.events.find(
        (e: any) => e.bookingId === 'booking_audit_integration_001'
      );

      expect(newEvent).toBeDefined();
      expect(newEvent.eventType).toBe('damage_report_filed');
      expect(newEvent.metadata).toHaveProperty('incidentId');
      expect(newEvent.metadata.source).toBe('AI_INSPECTION');
    });

    it('should record incident resolution in audit ledger', async () => {
      // Create incident
      const createResponse = await request(app)
        .post('/api/incidents/from-inspection')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          bookingId: 'booking_resolution_audit_001',
          resourceId: 'resource_resolution_audit_001',
          userId: 'user_resolution_audit_001',
          detectedAnomalies: [{ type: 'test', description: 'test', severity: 'MINOR' }],
          aiSeverity: 'MINOR',
          matchScore: 80,
        });

      const incidentId = createResponse.body.data.incident.id;

      // Get event count before resolution
      const beforeResponse = await request(app)
        .get('/api/audit/events?eventType=incident_resolved&limit=1000')
        .set('X-Test-User-Id', 'demo_auditor');

      const eventCountBefore = beforeResponse.body.data.events.length;

      // Resolve incident
      await request(app)
        .post(`/api/incidents/${incidentId}/resolve`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({
          decision: 'CONFIRM',
          reason: 'Damage confirmed after manual inspection',
        });

      // Verify incident_resolved event was created
      const afterResponse = await request(app)
        .get('/api/audit/events?eventType=incident_resolved&limit=1000')
        .set('X-Test-User-Id', 'demo_auditor');

      const eventCountAfter = afterResponse.body.data.events.length;
      expect(eventCountAfter).toBe(eventCountBefore + 1);

      // Find the new event
      const resolutionEvent = afterResponse.body.data.events.find(
        (e: any) => e.bookingId === 'booking_resolution_audit_001'
      );

      expect(resolutionEvent).toBeDefined();
      expect(resolutionEvent.eventType).toBe('incident_resolved');
      expect(resolutionEvent.metadata.decision).toBe('CONFIRM');
      expect(resolutionEvent.metadata.reason).toBe('Damage confirmed after manual inspection');
    });

    it('should maintain hash chain integrity across mixed event types', async () => {
      // Record sequence of different event types
      await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          eventType: 'check_in',
          resourceId: 'resource_mixed_001',
          description: 'Check-in event',
        });

      await request(app)
        .post('/api/incidents/from-inspection')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          bookingId: 'booking_mixed_001',
          resourceId: 'resource_mixed_001',
          userId: 'user_mixed_001',
          detectedAnomalies: [{ type: 'test', description: 'test', severity: 'MINOR' }],
          aiSeverity: 'MINOR',
          matchScore: 80,
        });

      await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({
          eventType: 'booking_approval',
          bookingId: 'booking_mixed_002',
          description: 'Booking approval',
        });

      // Verify chain remains valid
      const verification = await request(app)
        .get('/api/audit/verify')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(verification.status).toBe(200);
      expect(verification.body.data.integrity.valid).toBe(true);
      expect(verification.body.data.summary.status).toBe('VALID');
    });
  });

  describe('Security: Input Validation and Authorization', () => {
    it('should prevent actor identity forgery via request body', async () => {
      const response = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          eventType: 'booking_approval',
          actorId: 'forged_admin_id', // Attempt to forge actor
          actorRole: 'ADMIN',
          description: 'Forgery attempt',
        });

      expect(response.status).toBe(201);
      // Server should use authenticated user, not request body
      expect(response.body.data.event.actorId).toBe('demo_qualified_student');
      expect(response.body.data.event.actorId).not.toBe('forged_admin_id');
    });

    it('should prevent hash forgery', async () => {
      const response = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          eventType: 'check_in',
          previousHash: 'forged_hash_123456789',
          currentHash: 'forged_hash_987654321',
          description: 'Hash forgery attempt',
        });

      expect(response.status).toBe(201);
      // Server should calculate hashes, not trust client
      expect(response.body.data.event.currentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(response.body.data.event.currentHash).not.toBe('forged_hash_987654321');
    });

    it('should validate required fields across endpoints', async () => {
      // Test audit append validation
      const auditResponse = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          // Missing eventType and description
        });

      expect(auditResponse.status).toBe(400);
      expect(auditResponse.body.error.code).toBe('VALIDATION_ERROR');

      // Test incident creation validation
      const incidentResponse = await request(app)
        .post('/api/incidents/from-inspection')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          // Missing required fields
        });

      expect(incidentResponse.status).toBe(400);
    });
  });

  describe('Error Handling Consistency', () => {
    it('should return consistent error format across endpoints', async () => {
      // Unauthorized error
      const authError = await request(app)
        .get('/api/audit/events');

      expect(authError.status).toBe(401);
      expect(authError.body).toHaveProperty('success', false);
      expect(authError.body).toHaveProperty('error');
      expect(authError.body.error).toHaveProperty('code');
      expect(authError.body.error).toHaveProperty('message');

      // Validation error
      const validationError = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({});

      expect(validationError.status).toBe(400);
      expect(validationError.body.error.code).toBe('VALIDATION_ERROR');

      // Not found error
      const notFoundError = await request(app)
        .post('/api/incidents/nonexistent_id/resolve')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({
          decision: 'DISMISS',
          reason: 'Test reason for validation',
        });

      expect(notFoundError.status).toBe(404);
      // Accept either NOT_FOUND or RESOURCE_NOT_FOUND
      expect(['NOT_FOUND', 'RESOURCE_NOT_FOUND']).toContain(notFoundError.body.error.code);
    });
  });
});
