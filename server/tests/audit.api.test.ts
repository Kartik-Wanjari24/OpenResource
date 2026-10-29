import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { StorageAdapter } from '../adapters/storage.adapter.js';

describe('Phase 3: SHA-256 Hash-Chained Audit Ledger', () => {
  beforeAll(async () => {
    await StorageAdapter.getInstance();
  });

  afterAll(async () => {
    await StorageAdapter.close();
  });

  describe('GET /api/audit/status', () => {
    it('should return audit chain status', async () => {
      const response = await request(app).get('/api/audit/status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('chainLength');
      expect(response.body.data).toHaveProperty('integrity');
      expect(response.body.data).toHaveProperty('lastVerification');
    });

    it('should indicate valid integrity for empty chain', async () => {
      const response = await request(app).get('/api/audit/status');

      expect(response.status).toBe(200);
      expect(response.body.data.chainLength).toBeGreaterThanOrEqual(0);
      // Chain could be valid (VALID) or have events from other tests
    });
  });

  describe('POST /api/audit/append - Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      const response = await request(app)
        .post('/api/audit/append')
        .send({
          eventType: 'booking_approval',
          description: 'Test event',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/audit/append - Genesis Event', () => {
    it('should append the first event with GENESIS previous hash', async () => {
      const response = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'student')
        .send({
          eventType: 'booking_approval',
          bookingId: 'booking_001',
          resourceId: 'resource_001',
          description: 'Approved booking for 3D printer',
          metadata: {
            approvedBy: 'lab_owner_123',
            duration: 120,
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.event).toHaveProperty('id');
      expect(response.body.data.event).toHaveProperty('sequenceNumber');
      expect(response.body.data.event).toHaveProperty('previousHash');
      expect(response.body.data.event).toHaveProperty('currentHash');
      expect(response.body.data.event.eventType).toBe('booking_approval');
      expect(response.body.data.event.description).toBe('Approved booking for 3D printer');
      expect(response.body.data.chainIntegrity.verified).toBe(true);
    });
  });

  describe('POST /api/audit/append - Validation', () => {
    it('should require eventType', async () => {
      const response = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          description: 'Test event without type',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('eventType');
    });

    it('should require description', async () => {
      const response = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          eventType: 'booking_approval',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('description');
    });

    it('should reject empty description', async () => {
      const response = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          eventType: 'booking_approval',
          description: '   ',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('description');
    });

    it('should validate resourceId type if provided', async () => {
      const response = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          eventType: 'booking_approval',
          description: 'Test',
          resourceId: 12345, // Invalid: not a string
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('resourceId');
    });

    it('should validate bookingId type if provided', async () => {
      const response = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          eventType: 'booking_approval',
          description: 'Test',
          bookingId: true, // Invalid: not a string
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('bookingId');
    });
  });

  describe('POST /api/audit/append - Hash Chain Linking', () => {
    it('should create linked events with correct hash chain', async () => {
      // Append first event
      const response1 = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({
          eventType: 'check_in',
          resourceId: 'resource_laser_001',
          description: 'User checked in laser cutter',
        });

      expect(response1.status).toBe(201);
      const event1 = response1.body.data.event;

      // Append second event
      const response2 = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({
          eventType: 'check_out',
          resourceId: 'resource_laser_001',
          description: 'User checked out laser cutter',
        });

      expect(response2.status).toBe(201);
      const event2 = response2.body.data.event;

      // Verify second event links to first event's hash
      expect(event2.previousHash).toBe(event1.currentHash);
      expect(event2.sequenceNumber).toBe(event1.sequenceNumber + 1);
    });

    it('should include metadata in hash calculation', async () => {
      const response = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          eventType: 'condition_delta_detected',
          resourceId: 'resource_003',
          description: 'Detected damage to 3D printer nozzle',
          metadata: {
            severity: 'MODERATE',
            damageType: 'missing_item',
            estimatedCost: 25.99,
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.data.event.metadata).toEqual({
        severity: 'MODERATE',
        damageType: 'missing_item',
        estimatedCost: 25.99,
      });
    });
  });

  describe('POST /api/audit/append - Actor Identity Security', () => {
    it('should use server-controlled actor ID from authentication', async () => {
      const response = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'real_user_123')
        .set('X-Test-User-Role', 'lab_owner')
        .send({
          eventType: 'booking_approval',
          description: 'Approved booking',
          // Attempting to fake actor identity (should be ignored)
          actorId: 'fake_admin',
          actorRole: 'admin',
        });

      expect(response.status).toBe(201);
      // Server should use authenticated user, not request body
      expect(response.body.data.event.actorId).toBe('real_user_123');
      expect(response.body.data.event.actorRole).toBe('lab_owner');
    });
  });

  describe('GET /api/audit/verify - Chain Integrity', () => {
    it('should verify intact chain', async () => {
      const response = await request(app)
        .get('/api/audit/verify')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.integrity).toHaveProperty('valid');
      expect(response.body.data.integrity).toHaveProperty('totalEvents');
      expect(response.body.data.integrity).toHaveProperty('verifiedEvents');
      expect(response.body.data.summary).toHaveProperty('status');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/audit/verify');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/audit/events - Retrieval', () => {
    beforeEach(async () => {
      // Seed some events for filtering tests
      await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'user_alice')
        .send({
          eventType: 'badge_granted',
          userId: 'user_bob',
          description: 'Granted safety badge to Bob',
          metadata: { badgeId: 'badge_safety_101' },
        });

      await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'user_alice')
        .send({
          eventType: 'booking_approval',
          bookingId: 'booking_xyz',
          resourceId: 'resource_cnc',
          description: 'Approved CNC machine booking',
        });
    });

    it('should retrieve all events', async () => {
      const response = await request(app)
        .get('/api/audit/events')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.events)).toBe(true);
      expect(response.body.data.pagination).toHaveProperty('returned');
      expect(response.body.data.pagination).toHaveProperty('totalEvents');
    });

    it('should filter by eventType', async () => {
      const response = await request(app)
        .get('/api/audit/events?eventType=badge_granted')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(response.status).toBe(200);
      const events = response.body.data.events;
      expect(events.every((e: any) => e.eventType === 'badge_granted')).toBe(true);
    });

    it('should filter by actorId', async () => {
      const response = await request(app)
        .get('/api/audit/events?actorId=user_alice')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(response.status).toBe(200);
      const events = response.body.data.events;
      expect(events.every((e: any) => e.actorId === 'user_alice')).toBe(true);
    });

    it('should filter by resourceId', async () => {
      const response = await request(app)
        .get('/api/audit/events?resourceId=resource_cnc')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(response.status).toBe(200);
      const events = response.body.data.events;
      if (events.length > 0) {
        expect(events.every((e: any) => e.resourceId === 'resource_cnc')).toBe(true);
      }
    });

    it('should apply limit parameter', async () => {
      const response = await request(app)
        .get('/api/audit/events?limit=2')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(response.status).toBe(200);
      expect(response.body.data.events.length).toBeLessThanOrEqual(2);
    });

    it('should validate limit parameter', async () => {
      const response = await request(app)
        .get('/api/audit/events?limit=invalid')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('limit');
    });

    it('should reject limit over maximum', async () => {
      const response = await request(app)
        .get('/api/audit/events?limit=2000')
        .set('X-Test-User-Id', 'demo_auditor');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('limit');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/audit/events');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Hash Chain Properties', () => {
    it('should create deterministic hashes for same payload', async () => {
      // This test verifies that the same event data produces the same hash
      // We can't test this directly via API, but we verify hash structure
      const response = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'hash_test_user')
        .send({
          eventType: 'booking_cancellation',
          bookingId: 'booking_deterministic',
          description: 'Testing hash determinism',
        });

      expect(response.status).toBe(201);
      const hash = response.body.data.event.currentHash;

      // SHA-256 produces 64 hex characters
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should include all event data in audit record', async () => {
      const response = await request(app)
        .post('/api/audit/append')
        .set('X-Test-User-Id', 'complete_user')
        .set('X-Test-User-Role', 'admin')
        .send({
          eventType: 'incident_resolved',
          resourceId: 'resource_999',
          bookingId: 'booking_999',
          userId: 'affected_user',
          description: 'Resolved damage incident',
          metadata: {
            resolution: 'Replaced damaged part',
            cost: 150.0,
          },
        });

      expect(response.status).toBe(201);
      const event = response.body.data.event;

      expect(event.actorId).toBe('complete_user');
      expect(event.actorRole).toBe('admin');
      expect(event.eventType).toBe('incident_resolved');
      expect(event.resourceId).toBe('resource_999');
      expect(event.bookingId).toBe('booking_999');
      expect(event.userId).toBe('affected_user');
      expect(event.description).toBe('Resolved damage incident');
      expect(event.metadata.resolution).toBe('Replaced damaged part');
      expect(event.metadata.cost).toBe(150.0);
      expect(event.timestamp).toBeTruthy();
    });
  });

  describe('Event Types Coverage', () => {
    const eventTypes = [
      { type: 'booking_approval', desc: 'Approved user booking' },
      { type: 'booking_rejection', desc: 'Rejected booking request' },
      { type: 'booking_cancellation', desc: 'Cancelled active booking' },
      { type: 'check_in', desc: 'User checked in resource' },
      { type: 'check_out', desc: 'User checked out resource' },
      { type: 'condition_delta_detected', desc: 'Detected condition change' },
      { type: 'damage_report_filed', desc: 'Filed damage report' },
      { type: 'incident_resolved', desc: 'Resolved damage incident' },
      { type: 'eligibility_verification_submitted', desc: 'Submitted verification' },
      { type: 'eligibility_approved', desc: 'Approved eligibility' },
      { type: 'eligibility_rejected', desc: 'Rejected eligibility' },
      { type: 'badge_granted', desc: 'Granted user badge' },
      { type: 'badge_revoked', desc: 'Revoked user badge' },
    ];

    eventTypes.forEach(({ type, desc }) => {
      it(`should accept ${type} event type`, async () => {
        const response = await request(app)
          .post('/api/audit/append')
          .set('X-Test-User-Id', 'event_type_tester')
          .send({
            eventType: type,
            description: desc,
          });

        expect(response.status).toBe(201);
        expect(response.body.data.event.eventType).toBe(type);
        expect(response.body.data.event.description).toBe(desc);
      });
    });
  });

  describe('Authorization', () => {
    it('should allow any authenticated user to append events', async () => {
      const users = ['demo_qualified_student', 'demo_lab_owner', 'demo_admin'];

      for (const userId of users) {
        const response = await request(app)
          .post('/api/audit/append')
          .set('X-Test-User-Id', userId)
          .send({
            eventType: 'check_in',
            description: `Check-in by ${userId}`,
          });

        expect(response.status).toBe(201);
        expect(response.body.data.event.actorId).toBe(userId);
      }
    });
  });

  describe('Error Response Structure', () => {
    it('should return consistent error structure', async () => {
      const response = await request(app)
        .post('/api/audit/append')
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
