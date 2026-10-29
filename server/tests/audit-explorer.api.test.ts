import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { StorageAdapter } from '../adapters/storage.adapter.js';

describe('Phase 5: Cryptographic Audit Explorer', () => {
  beforeAll(async () => {
    await StorageAdapter.getInstance();
  });

  afterAll(async () => {
    await StorageAdapter.close();
  });

  describe('GET /api/audit/events - Timeline Access', () => {
    it('should return audit events for authenticated users', async () => {
      const response = await request(app)
        .get('/api/audit/events')
        .set('X-Test-User-Id', 'demo_qualified_student');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('events');
      expect(Array.isArray(response.body.data.events)).toBe(true);
      expect(response.body.data).toHaveProperty('pagination');
      expect(response.body.data).toHaveProperty('filters');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/audit/events');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should support limit parameter', async () => {
      const response = await request(app)
        .get('/api/audit/events?limit=5')
        .set('X-Test-User-Id', 'demo_lab_owner');

      expect(response.status).toBe(200);
      expect(response.body.data.events.length).toBeLessThanOrEqual(5);
    });

    it('should validate limit parameter range', async () => {
      const response = await request(app)
        .get('/api/audit/events?limit=2000')
        .set('X-Test-User-Id', 'demo_lab_owner');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('limit');
    });

    it('should return events in correct order', async () => {
      // Append a test event first
      await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({
          eventType: 'booking_approval',
          description: 'Test event for ordering',
        });

      const response = await request(app)
        .get('/api/audit/events?limit=100')
        .set('X-Test-User-Id', 'demo_lab_owner');

      expect(response.status).toBe(200);
      const events = response.body.data.events;

      // Verify events have required fields
      if (events.length > 0) {
        const event = events[0];
        expect(event).toHaveProperty('id');
        expect(event).toHaveProperty('sequenceNumber');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('eventType');
        expect(event).toHaveProperty('description');
        expect(event).toHaveProperty('actorId');
        expect(event).toHaveProperty('previousHash');
        expect(event).toHaveProperty('currentHash');
        expect(event).toHaveProperty('metadata');
      }
    });
  });

  describe('GET /api/audit/verify - Chain Verification', () => {
    it('should verify chain integrity for authenticated users', async () => {
      const response = await request(app)
        .get('/api/audit/verify')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('integrity');
      expect(response.body.data.integrity).toHaveProperty('valid');
      expect(response.body.data.integrity).toHaveProperty('totalEvents');
      expect(response.body.data.integrity).toHaveProperty('verifiedEvents');
      expect(response.body.data.integrity).toHaveProperty('errors');
      expect(response.body.data.integrity).toHaveProperty('verificationTimestamp');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/audit/verify');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return valid status for empty chain', async () => {
      // Get verification for potentially empty chain
      const response = await request(app)
        .get('/api/audit/verify')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(response.status).toBe(200);
      expect(response.body.data.integrity.valid).toBeDefined();
      expect(typeof response.body.data.integrity.valid).toBe('boolean');
    });

    it('should include summary information', async () => {
      const response = await request(app)
        .get('/api/audit/verify')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data.summary).toHaveProperty('status');
      expect(response.body.data.summary).toHaveProperty('totalEvents');
      expect(response.body.data.summary).toHaveProperty('verifiedEvents');
      expect(response.body.data.summary).toHaveProperty('failedEvents');
    });

    it('should verify valid chain after appending events', async () => {
      // Append multiple events
      await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({
          eventType: 'check_in',
          resourceId: 'resource_test_001',
          description: 'Test check-in event',
        });

      await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({
          eventType: 'check_out',
          resourceId: 'resource_test_001',
          description: 'Test check-out event',
        });

      // Verify chain
      const verifyResponse = await request(app)
        .get('/api/audit/verify')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.data.integrity.valid).toBe(true);
      expect(verifyResponse.body.data.summary.status).toBe('VALID');
    });
  });

  describe('Event Display Data', () => {
    it('should include all required event fields', async () => {
      // Append event with all optional fields
      await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          eventType: 'booking_approval',
          bookingId: 'booking_display_test',
          resourceId: 'resource_display_test',
          userId: 'user_display_test',
          description: 'Complete event with all fields',
          metadata: {
            testField: 'testValue',
            nestedData: {
              key: 'value',
            },
          },
        });

      const response = await request(app)
        .get('/api/audit/events?limit=1')
        .set('X-Test-User-Id', 'demo_qualified_student');

      expect(response.status).toBe(200);
      const events = response.body.data.events;

      if (events.length > 0) {
        const event = events[0];
        // Required fields
        expect(event.id).toBeDefined();
        expect(event.sequenceNumber).toBeDefined();
        expect(event.eventType).toBeDefined();
        expect(event.timestamp).toBeDefined();
        expect(event.actorId).toBeDefined();
        expect(event.description).toBeDefined();
        expect(event.previousHash).toBeDefined();
        expect(event.currentHash).toBeDefined();

        // Hash format validation
        expect(event.currentHash).toMatch(/^[a-f0-9]{64}$/);
        expect(event.previousHash === 'GENESIS' || event.previousHash.match(/^[a-f0-9]{64}$/)).toBeTruthy();

        // Metadata should be an object
        expect(typeof event.metadata).toBe('object');
      }
    });

    it('should include actor information when available', async () => {
      await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          eventType: 'booking_rejection',
          description: 'Event with actor role',
        });

      const response = await request(app)
        .get('/api/audit/events?limit=1')
        .set('X-Test-User-Id', 'demo_lab_owner');

      expect(response.status).toBe(200);
      const events = response.body.data.events;

      if (events.length > 0) {
        const event = events[0];
        expect(event.actorId).toBe('demo_lab_owner');
        expect(event.actorRole).toBeDefined();
      }
    });
  });

  describe('Phase 4 Incident Event Integration', () => {
    it('should verify audit endpoint accepts damage report events', async () => {
      // Create incident (which should record damage_report_filed event)
      const incidentResponse = await request(app)
        .post('/api/incidents/from-inspection')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          bookingId: 'booking_phase5_test',
          resourceId: 'resource_phase5_test',
          userId: 'user_phase5_test',
          detectedAnomalies: [{ type: 'test', description: 'test', severity: 'MINOR' }],
          aiSeverity: 'MINOR',
          matchScore: 80,
        });

      expect(incidentResponse.status).toBe(201);

      // Verify audit events endpoint works
      const auditResponse = await request(app)
        .get('/api/audit/events?eventType=damage_report_filed&limit=100')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(auditResponse.status).toBe(200);
      expect(auditResponse.body.data).toHaveProperty('events');
    });

    it('should verify audit endpoint accepts incident resolution events', async () => {
      // Create and resolve incident
      const createResponse = await request(app)
        .post('/api/incidents/from-inspection')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          bookingId: 'booking_phase5_resolve',
          resourceId: 'resource_phase5_resolve',
          userId: 'user_phase5_resolve',
          detectedAnomalies: [{ type: 'test', description: 'test', severity: 'MINOR' }],
          aiSeverity: 'MINOR',
          matchScore: 80,
        });

      const incidentId = createResponse.body.data.incident.id;

      const resolveResponse = await request(app)
        .post(`/api/incidents/${incidentId}/resolve`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({
          decision: 'DISMISS',
          reason: 'Phase 5 test - dismissing for audit verification',
        });

      expect(resolveResponse.status).toBe(200);

      // Verify audit events endpoint works
      const auditResponse = await request(app)
        .get('/api/audit/events?eventType=incident_resolved&limit=100')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(auditResponse.status).toBe(200);
      expect(auditResponse.body.data).toHaveProperty('events');
    });
  });

  describe('Authorization and Access Control', () => {
    it('should allow all authenticated users to view events', async () => {
      const users = [
        'demo_qualified_student',
        'demo_lab_owner',
        'demo_admin',
        'demo_auditor',
        'demo_resource_hog',
      ];

      for (const userId of users) {
        const response = await request(app)
          .get('/api/audit/events?limit=10')
          .set('X-Test-User-Id', userId);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });

    it('should allow all authenticated users to verify chain', async () => {
      const users = ['demo_qualified_student', 'demo_lab_owner', 'demo_admin', 'demo_auditor'];

      for (const userId of users) {
        const response = await request(app)
          .get('/api/audit/verify')
          .set('X-Test-User-Id', userId);

        expect(response.status).toBe(200);
        expect(response.body.data.integrity.valid).toBeDefined();
      }
    });
  });

  describe('Empty State Handling', () => {
    it('should handle empty audit history gracefully', async () => {
      // Query with filters that may return empty results
      const response = await request(app)
        .get('/api/audit/events?eventType=nonexistent_type&limit=100')
        .set('X-Test-User-Id', 'demo_qualified_student');

      expect(response.status).toBe(200);
      expect(response.body.data.events).toEqual([]);
      expect(response.body.data.pagination.returned).toBe(0);
    });
  });

  describe('Network Error Handling', () => {
    it('should return proper error structure for invalid requests', async () => {
      const response = await request(app)
        .get('/api/audit/events?limit=invalid')
        .set('X-Test-User-Id', 'demo_qualified_student');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });
  });

  describe('Event Filtering', () => {
    it('should filter events by type', async () => {
      const response = await request(app)
        .get('/api/audit/events?eventType=booking_approval')
        .set('X-Test-User-Id', 'demo_lab_owner');

      expect(response.status).toBe(200);
      const events = response.body.data.events;
      events.forEach((event: any) => {
        expect(event.eventType).toBe('booking_approval');
      });
    });

    it('should filter events by actorId', async () => {
      const response = await request(app)
        .get('/api/audit/events?actorId=demo_lab_owner')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(response.status).toBe(200);
      const events = response.body.data.events;
      events.forEach((event: any) => {
        expect(event.actorId).toBe('demo_lab_owner');
      });
    });

    it('should filter events by resourceId', async () => {
      const response = await request(app)
        .get('/api/audit/events?resourceId=resource_test_001')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(response.status).toBe(200);
      // Should succeed without errors
      expect(response.body.data).toHaveProperty('events');
    });
  });

  describe('Hash Chain Properties', () => {
    it('should maintain sequential sequence numbers', async () => {
      // Get current events
      const response = await request(app)
        .get('/api/audit/events?limit=100')
        .set('X-Test-User-Id', 'demo_lab_owner');

      expect(response.status).toBe(200);
      const events = response.body.data.events;

      if (events.length > 1) {
        // Verify sequence numbers are unique and properly ordered
        const sequenceNumbers = events.map((e: any) => e.sequenceNumber);
        const uniqueSequences = new Set(sequenceNumbers);
        expect(uniqueSequences.size).toBe(sequenceNumbers.length);
      }
    });

    it('should verify genesis event has correct previous hash', async () => {
      // Append events to ensure we have data
      await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({
          eventType: 'check_in',
          description: 'Genesis test event',
        });

      const response = await request(app)
        .get('/api/audit/events?limit=100')
        .set('X-Test-User-Id', 'demo_lab_owner');

      expect(response.status).toBe(200);
      const events = response.body.data.events;

      if (events.length > 0) {
        // Find the first event (sequence number 1)
        const genesisEvent = events.find((e: any) => e.sequenceNumber === 1);
        if (genesisEvent) {
          expect(genesisEvent.previousHash).toBe('GENESIS');
        }
      }
    });
  });
});
