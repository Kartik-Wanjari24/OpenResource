import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { StorageAdapter, type IStorageAdapter } from '../adapters/storage.adapter.js';
import { BookingStatus, UserRole, CustodyAction } from '../types/booking.js';
import type { Booking } from '../types/booking.js';
import { SchedulerService } from '../services/scheduler.service.js';
import { NotificationService } from '../services/notification.service.js';
import { BookingEventType } from '../services/notification.interface.js';

describe('Member 2 - Phase 5: RBAC, Authorization, and Privacy Hardening', () => {
  let storage: IStorageAdapter;
  const scheduler = SchedulerService.getInstance();
  const notificationService = NotificationService.getInstance();

  beforeEach(async () => {
    storage = StorageAdapter.getInstance();
    // Clean up seed or leftover bookings
    await storage.deleteBooking('book_demo_101');
    await storage.deleteBooking('book_test_noshow');

    // Seed a resource owned by an independent owner for cross-owner isolation tests
    await storage.saveResource({
      id: 'res_other_lab_lathe',
      name: 'Precision Metal Lathe',
      ownerId: 'owner_foreign_dept',
      category: 'MACHINE_SHOP',
      weeklyUsageCap: 15,
      requiredBadgeIds: ['badge_safety_101'],
    });

    // Seed the foreign owner user
    await storage.saveUser({
      id: 'owner_foreign_dept',
      name: 'Prof. Donald Vance',
      email: 'd.vance@foreign.demo',
      role: UserRole.LAB_OWNER,
      phone: '555-9988',
      studentId: 'FAC-7700',
      badges: ['badge_safety_101'],
    });
  });

  afterEach(() => {
    scheduler.stop();
  });

  afterAll(async () => {
    scheduler.stop();
    await StorageAdapter.close();
  });

  // Helper: Create an approved booking for testing
  const createApprovedBooking = async (
    userId = 'demo_qualified_student',
    resourceId = 'res_3d_prusa',
    ownerId = 'demo_lab_owner',
    startOffsetHours = 1
  ): Promise<string> => {
    const bookingId = `book_auth_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();
    const futureStart = new Date(Date.now() + startOffsetHours * 3600000).toISOString();
    const futureEnd = new Date(Date.now() + (startOffsetHours + 1) * 3600000).toISOString();

    const booking: Booking = {
      id: bookingId,
      resourceId,
      resourceName: '3D Printer',
      userId,
      ownerId,
      startTime: futureStart,
      endTime: futureEnd,
      intent: 'Security audit test part print',
      status: BookingStatus.APPROVED,
      estimatedHours: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      history: [
        {
          id: `hist_${bookingId}_1`,
          bookingId,
          fromStatus: BookingStatus.REQUESTED,
          toStatus: BookingStatus.APPROVED,
          timestamp: nowIso,
          actorId: ownerId,
          actorRole: 'LAB_OWNER',
        },
      ],
    };

    storage.saveBooking(booking);
    return bookingId;
  };

  // =========================================================================
  // 1. Unauthenticated Requests to Protected Endpoints
  // =========================================================================
  describe('1. Unauthenticated Requests to Protected Endpoints', () => {
    it('rejects POST /api/bookings without auth with 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-11-10T10:00:00Z',
          endTime: '2026-11-10T11:00:00Z',
          intent: 'Test unauth booking',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('Authentication required');
    });

    it('rejects POST /api/bookings/:id/transition without auth with 401 UNAUTHORIZED', async () => {
      const bookingId = await createApprovedBooking();
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .send({ targetStatus: BookingStatus.CANCELLED });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects POST /api/bookings/:id/custody without auth with 401 UNAUTHORIZED', async () => {
      const bookingId = await createApprovedBooking();
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects GET /api/notifications without auth with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/notifications');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects PATCH /api/notifications/:id/read without auth with 401 UNAUTHORIZED', async () => {
      const res = await request(app).patch('/api/notifications/notif_123/read');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects POST /api/notifications/read-all without auth with 401 UNAUTHORIZED', async () => {
      const res = await request(app).post('/api/notifications/read-all');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // =========================================================================
  // 2. Production Environment Header Hardening
  // =========================================================================
  describe('2. Production Mode Security: Rejecting Test Headers', () => {
    it('rejects X-Test-User-Id in production environment with 401 UNAUTHORIZED', async () => {
      const oldEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const res = await request(app)
          .post('/api/bookings')
          .set('X-Test-User-Id', 'demo_qualified_student')
          .set('X-Test-User-Role', 'USER')
          .send({
            resourceId: 'res_3d_prusa',
            startTime: '2026-11-10T10:00:00Z',
            endTime: '2026-11-10T11:00:00Z',
            intent: 'Attempt booking in production with test headers',
          });

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      } finally {
        process.env.NODE_ENV = oldEnv;
      }
    });

    it('rejects test persona Bearer token in production environment without JWT_SECRET', async () => {
      const oldEnv = process.env.NODE_ENV;
      const oldSecret = process.env.JWT_SECRET;
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;

      try {
        const res = await request(app)
          .get('/api/notifications')
          .set('Authorization', 'Bearer demo_lab_owner');

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      } finally {
        process.env.NODE_ENV = oldEnv;
        if (oldSecret) process.env.JWT_SECRET = oldSecret;
      }
    });
  });

  // =========================================================================
  // 3. Conflicting Caller-Supplied Identity & Role Spoofing
  // =========================================================================
  describe('3. Caller Identity & Role Spoofing Prevention', () => {
    it('rejects booking creation when body userId conflicts with authenticated user (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-11-12T10:00:00Z',
          endTime: '2026-11-12T11:00:00Z',
          intent: 'Print parts for project',
          userId: 'demo_resource_hog', // spoofing another user
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Cannot create booking on behalf of another user');
    });

    it('rejects booking creation when body role claims higher privileges (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-11-12T10:00:00Z',
          endTime: '2026-11-12T11:00:00Z',
          intent: 'Print parts for project',
          role: 'ADMIN', // spoofing admin role
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Caller role mismatch');
    });

    it('rejects transition when body actorId conflicts with authenticated identity (403 FORBIDDEN)', async () => {
      const bookingId = await createApprovedBooking();

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          targetStatus: BookingStatus.REJECTED,
          actorId: 'demo_admin', // actor mismatch
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Actor ID mismatch');
    });

    it('rejects custody operation when body userId conflicts with authenticated caller (403 FORBIDDEN)', async () => {
      const bookingId = await createApprovedBooking();

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          action: CustodyAction.GENERATE_CREDENTIAL,
          userId: 'demo_resource_hog', // spoofing other user in body
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Caller user ID mismatch');
    });

    it('rejects notification query when query parameter userId targets another user (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get('/api/notifications?userId=demo_resource_hog')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Cannot access notifications of another user');
    });
  });

  // =========================================================================
  // 4. Resource Ownership Boundaries & Cross-Tenant Isolation
  // =========================================================================
  describe('4. Resource Ownership Enforcement', () => {
    it('prevents lab owner from approving a booking on a resource they do NOT own (403 FORBIDDEN)', async () => {
      // Create a booking for resource owned by owner_foreign_dept
      const foreignBookingId = await createApprovedBooking(
        'demo_qualified_student',
        'res_other_lab_lathe',
        'owner_foreign_dept'
      );
      // Put it in REQUESTED status
      const b = storage.getBooking(foreignBookingId)!;
      b.status = BookingStatus.REQUESTED;
      storage.saveBooking(b);

      // demo_lab_owner (who does NOT own this resource) tries to approve
      const res = await request(app)
        .post(`/api/bookings/${foreignBookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          targetStatus: BookingStatus.APPROVED,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Only the resource owner or an administrator can approve');
    });

    it('prevents lab owner from rejecting a booking on a resource they do NOT own (403 FORBIDDEN)', async () => {
      const foreignBookingId = await createApprovedBooking(
        'demo_qualified_student',
        'res_other_lab_lathe',
        'owner_foreign_dept'
      );

      const res = await request(app)
        .post(`/api/bookings/${foreignBookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          targetStatus: BookingStatus.REJECTED,
          reason: 'I do not want this here',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Only the resource owner or an administrator can reject');
    });

    it('prevents lab owner from generating custody credentials for unowned resource bookings (403 FORBIDDEN)', async () => {
      const foreignBookingId = await createApprovedBooking(
        'demo_qualified_student',
        'res_other_lab_lathe',
        'owner_foreign_dept'
      );

      // demo_lab_owner tries to generate custody credential
      const res = await request(app)
        .post(`/api/bookings/${foreignBookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('permission to generate custody credentials');
    });

    it('allows the actual resource owner to approve their own resource booking (200 SUCCESS)', async () => {
      const foreignBookingId = await createApprovedBooking(
        'demo_qualified_student',
        'res_other_lab_lathe',
        'owner_foreign_dept',
        10
      );
      const b = storage.getBooking(foreignBookingId)!;
      b.status = BookingStatus.REQUESTED;
      storage.saveBooking(b);

      const res = await request(app)
        .post(`/api/bookings/${foreignBookingId}/transition`)
        .set('X-Test-User-Id', 'owner_foreign_dept')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          targetStatus: BookingStatus.APPROVED,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.booking.status).toBe(BookingStatus.APPROVED);
    });
  });

  // =========================================================================
  // 5. Unauthorized State Transitions and Custody Operations
  // =========================================================================
  describe('5. Unauthorized State Transitions & Custody Operations', () => {
    it('prevents stranger student from cancelling another user booking (403 FORBIDDEN)', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student');

      // demo_resource_hog (different student) tries to cancel Alice's booking
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_resource_hog')
        .set('X-Test-User-Role', 'USER')
        .send({
          targetStatus: BookingStatus.CANCELLED,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('do not have permission to cancel');
    });

    it('prevents non-admin from bypassing custody verification via direct transition to CHECKED_IN (403 FORBIDDEN)', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student');

      // Owner tries to directly jump to CHECKED_IN without custody OTP/QR verification
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          targetStatus: BookingStatus.CHECKED_IN,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Direct transition to \'CHECKED_IN\' is prohibited');
    });

    it('prevents stranger student from checking in or checking out another user booking (403 FORBIDDEN)', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student');

      // Generate credential as legitimate borrower Alice
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const otp = genRes.body.data.credential.otpCode;

      // Bob (stranger) tries to check in using Alice's booking
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_resource_hog')
        .set('X-Test-User-Role', 'USER')
        .send({
          action: CustodyAction.CHECK_IN,
          otpCode: otp,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Unauthorized to perform check-in');
    });
  });

  // =========================================================================
  // 6. No-Show Endpoint Access and Production Overrides
  // =========================================================================
  describe('6. No-Show Endpoint Access Control & Scheduler Hardening', () => {
    it('rejects borrower role from triggering no-show sweeps with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/bookings/process-no-shows')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('No-show sweeps require administrator or lab owner permissions');
    });

    it('rejects untrusted referenceTime override in production environment (403 FORBIDDEN)', async () => {
      const oldEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const res = await request(app)
          .post('/api/bookings/process-no-shows')
          .set('X-Test-User-Id', 'demo_lab_owner')
          .set('X-Test-User-Role', 'LAB_OWNER')
          .send({ referenceTime: '2026-11-20T10:30:00Z' });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
        expect(res.body.error.message).toContain('referenceTime override is disabled in production');
      } finally {
        process.env.NODE_ENV = oldEnv;
      }
    });

    it('confirms the automatic scheduler cannot start duplicate timers', () => {
      expect(scheduler.isRunning()).toBe(false);

      scheduler.start(50000);
      expect(scheduler.isRunning()).toBe(true);

      // Call start a second time
      scheduler.start(50000);
      expect(scheduler.isRunning()).toBe(true);

      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });
  });

  // =========================================================================
  // 7. Privacy Hardening & PII Protection
  // =========================================================================
  describe('7. Privacy Hardening & PII Masking', () => {
    it('masks student PII when viewed by unrelated student (name masked, phone/email/badges/history hidden)', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student');

      // Viewed by Bob (unrelated student)
      const res = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('X-Test-User-Id', 'demo_resource_hog')
        .set('X-Test-User-Role', 'USER');

      expect(res.status).toBe(200);
      const b = res.body.data.booking;

      // Borrower profile is masked
      expect(b.borrower).toBeDefined();
      expect(b.borrower.isMasked).toBe(true);
      expect(b.borrower.name).toBe('Alice C.');
      expect(b.borrower.phone).toBeUndefined();
      expect(b.borrower.email).toBeUndefined();
      expect(b.borrower.studentId).toBeUndefined();
      expect(b.borrower.badges).toBeUndefined();

      // Internal audit history and notes are stripped
      expect(b.history).toBeUndefined();
      expect(b.conditionNotes).toBeUndefined();
      expect(b.incidentNotes).toBeUndefined();
    });

    it('partially masks student phone for the resource owner, but exposes name and email', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student');

      // Viewed by Dr. Martinez (resource owner)
      const res = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER');

      expect(res.status).toBe(200);
      const b = res.body.data.booking;

      expect(b.borrower.name).toBe('Alice Chen');
      expect(b.borrower.email).toBe('alice.chen@openresource.demo');
      expect(b.borrower.phone).toBe('***-***-0144'); // masked to last 4 digits
      expect(b.history).toBeDefined();
    });

    it('allows student to see their own unmasked profile', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student');

      // Viewed by Alice (the borrower herself)
      const res = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER');

      expect(res.status).toBe(200);
      const b = res.body.data.booking;

      expect(b.borrower.name).toBe('Alice Chen');
      expect(b.borrower.phone).toBe('555-0144');
      expect(b.borrower.studentId).toBe('STU-9901');
      expect(b.borrower.badges).toBeDefined();
    });

    it('anonymizes email for Auditor role and strips personal phone number', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student');

      const res = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('X-Test-User-Id', 'demo_auditor')
        .set('X-Test-User-Role', 'AUDITOR');

      expect(res.status).toBe(200);
      const b = res.body.data.booking;

      expect(b.borrower.email).toContain('@audit-masked.org');
      expect(b.borrower.phone).toBeUndefined();
      expect(b.borrower.badges).toBeDefined();
    });

    it('prohibits students from accessing another user booking summary (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get('/api/bookings/user/demo_resource_hog')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('permission to view another user\'s booking history');
    });

    it('allows student to view their own booking summary (200 SUCCESS)', async () => {
      const res = await request(app)
        .get('/api/bookings/user/demo_qualified_student')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER');

      expect(res.status).toBe(200);
      expect(res.body.data.bookings).toBeDefined();
      expect(res.body.data.weeklyUsage).toBeDefined();
    });
  });

  // =========================================================================
  // 8. Notification Isolation & Metadata Sanitization
  // =========================================================================
  describe('8. Notification Isolation & Metadata Allowlist', () => {
    it('isolates notification read actions so a user cannot mark another user notification as read', async () => {
      // Create notification for demo_resource_hog
      const notif = notificationService.handleDomainEvent({
        type: BookingEventType.WAITLIST_PLACED,
        bookingId: 'book_isolation_1',
        recipientUserId: 'demo_resource_hog',
        title: 'Waitlist placement',
        message: 'You are waitlisted',
      });

      expect(notif).toBeDefined();

      // Alice tries to mark Bob's notification as read
      const res = await request(app)
        .patch(`/api/notifications/${notif!.id}/read`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('permission to mark another user\'s notification as read');
    });

    it('sanitizes metadata to explicit allowlist, preventing credential leaks', () => {
      const notif = notificationService.handleDomainEvent({
        type: BookingEventType.BOOKING_APPROVED,
        bookingId: 'book_leak_test',
        recipientUserId: 'demo_qualified_student',
        title: 'Booking Approved',
        message: 'Your booking was approved',
        metadata: {
          resourceId: 'res_3d_prusa',
          notes: 'Safe lab notes',
          otpCode: '654321', // Sensitive leaked credential
          qrToken: 'secret_qr_payload', // Sensitive leaked token
          internalHash: 'sha256_hash_value',
        },
      });

      expect(notif).toBeDefined();
      expect(notif!.metadata).toBeDefined();
      expect(notif!.metadata!.resourceId).toBe('res_3d_prusa');
      expect(notif!.metadata!.notes).toBe('Safe lab notes');

      // Verify sensitive keys were stripped
      expect(notif!.metadata!.otpCode).toBeUndefined();
      expect(notif!.metadata!.qrToken).toBeUndefined();
      expect(notif!.metadata!.internalHash).toBeUndefined();
    });
  });

  // =========================================================================
  // 9. Input Validation: Invalid Bodies, Impossible Ranges, and Malformed Dates
  // =========================================================================
  describe('9. Input Validation & Range Integrity', () => {
    it('rejects booking request with missing resourceId (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          startTime: '2026-11-15T10:00:00Z',
          endTime: '2026-11-15T11:00:00Z',
          intent: 'Printing gear mechanism',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('resourceId is required');
    });

    it('rejects booking request with invalid ISO date string (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: 'not-a-valid-date',
          endTime: '2026-11-15T11:00:00Z',
          intent: 'Printing gear mechanism',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Invalid ISO date format');
    });

    it('rejects impossible time range where endTime is before startTime (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-11-15T15:00:00Z',
          endTime: '2026-11-15T10:00:00Z', // backwards in time
          intent: 'Printing gear mechanism',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('endTime must be strictly after startTime');
    });

    it('rejects bookings in the past (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2020-01-01T10:00:00Z',
          endTime: '2020-01-01T11:00:00Z', // in the distant past
          intent: 'Trying to book in the past',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Cannot create bookings for past time slots');
    });

    it('rejects bookings with duration exceeding 24 hours (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-11-15T10:00:00Z',
          endTime: '2026-11-17T10:00:00Z', // 48 hours
          intent: 'Printing very large model',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('cannot exceed 24 hours');
    });

    it('rejects invalid state transition target status (400 VALIDATION_ERROR)', async () => {
      const bookingId = await createApprovedBooking();

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          targetStatus: 'NON_EXISTENT_STATUS',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid custody action (400 VALIDATION_ERROR)', async () => {
      const bookingId = await createApprovedBooking();

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          action: 'INVALID_CUSTODY_ACTION',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
