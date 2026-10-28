import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { StorageAdapter } from '../adapters/storage.adapter.js';
import { BookingStatus } from '../types/booking.js';

describe('Member 2 - Booking API & State Machine', () => {
  const storage = StorageAdapter.getInstance();

  beforeEach(async () => {
    await storage.resetStore();
  });

  afterAll(async () => {
    await StorageAdapter.close();
  });

  describe('1. Health Check Endpoint', () => {
    it('GET /health returns 200 with module info', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.module).toContain('Member 2');
    });
  });

  describe('2. POST /api/bookings - Creation & Validation', () => {
    it('creates a valid booking in ELIGIBILITY_VERIFIED status when user has required badges', async () => {
      const tomorrow = new Date(Date.now() + 86400000);
      const startTime = new Date(tomorrow.setHours(10, 0, 0, 0)).toISOString();
      const endTime = new Date(tomorrow.setHours(12, 0, 0, 0)).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_3d_prusa',
          startTime,
          endTime,
          intent: 'Robotics chassis rapid prototype for senior capstone',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.booking).toBeDefined();
      expect(res.body.data.booking.resourceId).toBe('res_3d_prusa');
      expect(res.body.data.booking.userId).toBe('demo_qualified_student');
      expect(res.body.data.booking.status).toBe(BookingStatus.ELIGIBILITY_VERIFIED);
      expect(res.body.data.booking.estimatedHours).toBe(2);
      expect(res.body.data.booking.history).toHaveLength(1);
    });

    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-11-01T10:00:00Z',
          endTime: '2026-11-01T12:00:00Z',
          intent: 'Valid intent string',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 400 VALIDATION_ERROR when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          // missing resourceId
          startTime: '2026-11-01T10:00:00Z',
          endTime: '2026-11-01T12:00:00Z',
          intent: 'Valid intent',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR when endTime is before startTime', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-11-01T14:00:00Z',
          endTime: '2026-11-01T12:00:00Z',
          intent: 'Valid intent description',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('endTime must be strictly after startTime');
    });

    it('returns 400 VALIDATION_ERROR when duration exceeds 24 hours', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-11-01T10:00:00Z',
          endTime: '2026-11-02T12:00:00Z', // 26 hours
          intent: 'Long duration print',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('duration cannot exceed 24 hours');
    });

    it('returns 404 RESOURCE_NOT_FOUND when resource does not exist', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'non_existent_resource_999',
          startTime: '2026-11-01T10:00:00Z',
          endTime: '2026-11-01T12:00:00Z',
          intent: 'Valid intent description',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('assigns WAITLISTED status when slot overlaps with an existing APPROVED booking', async () => {
      // res_3d_prusa has a seed booking (book_demo_101) for 2 days from now, 10:00 to 12:00
      const seedBooking = storage.getBooking('book_demo_101');
      expect(seedBooking).toBeDefined();

      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_resource_hog')
        .send({
          resourceId: seedBooking!.resourceId,
          startTime: seedBooking!.startTime,
          endTime: seedBooking!.endTime,
          intent: 'Competing slot request',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.booking.status).toBe(BookingStatus.WAITLISTED);
    });
  });

  describe('3. POST /api/bookings/:id/transition - State Transitions & Permissions', () => {
    it('allows resource owner to approve a pending booking', async () => {
      // Create fresh requested booking
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: '2026-11-05T10:00:00Z',
          endTime: '2026-11-05T11:00:00Z',
          intent: 'Laser cut test parts',
        });

      const bookingId = createRes.body.data.booking.id;

      // Owner approves
      const transRes = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          targetStatus: BookingStatus.APPROVED,
          notes: 'Approved for lab session',
        });

      expect(transRes.status).toBe(200);
      expect(transRes.body.data.booking.status).toBe(BookingStatus.APPROVED);
      expect(transRes.body.data.booking.history).toHaveLength(2);
      expect(transRes.body.data.booking.history[1].toStatus).toBe(BookingStatus.APPROVED);
    });

    it('prevents student from approving their own booking (403 FORBIDDEN)', async () => {
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: '2026-11-06T10:00:00Z',
          endTime: '2026-11-06T11:00:00Z',
          intent: 'Laser cut test parts',
        });

      const bookingId = createRes.body.data.booking.id;

      // Student tries to approve
      const transRes = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          targetStatus: BookingStatus.APPROVED,
        });

      expect(transRes.status).toBe(403);
      expect(transRes.body.error.code).toBe('FORBIDDEN');
      expect(transRes.body.error.message).toContain('Only the resource owner or an administrator can approve');
    });

    it('allows borrower to cancel their own booking', async () => {
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: '2026-11-07T10:00:00Z',
          endTime: '2026-11-07T11:00:00Z',
          intent: 'Laser cut parts to cancel',
        });

      const bookingId = createRes.body.data.booking.id;

      const cancelRes = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          targetStatus: BookingStatus.CANCELLED,
          reason: 'Schedule conflict on my end',
        });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.booking.status).toBe(BookingStatus.CANCELLED);
      expect(cancelRes.body.data.booking.cancellationReason).toBe('Schedule conflict on my end');
    });

    it('rejects invalid state transitions with 400 INVALID_STATE_TRANSITION', async () => {
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: '2026-11-08T10:00:00Z',
          endTime: '2026-11-08T11:00:00Z',
          intent: 'Direct completion test',
        });

      const bookingId = createRes.body.data.booking.id;

      // Try transition directly from REQUESTED / ELIGIBILITY_VERIFIED to COMPLETED
      const invalidRes = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          targetStatus: BookingStatus.COMPLETED,
        });

      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });
  });

  describe('4. Concurrency Protection & Overlapping Approvals', () => {
    it('prevents sequential approval of overlapping bookings (409 CONFLICT)', async () => {
      // 1. Create booking A
      const resA = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_cnc_tormach',
          startTime: '2026-11-10T10:00:00Z',
          endTime: '2026-11-10T12:00:00Z',
          intent: 'CNC job A',
        });
      const idA = resA.body.data.booking.id;

      // 2. Create booking B overlapping with A
      const resB = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_resource_hog')
        .send({
          resourceId: 'res_cnc_tormach',
          startTime: '2026-11-10T11:00:00Z',
          endTime: '2026-11-10T13:00:00Z',
          intent: 'CNC job B overlapping',
        });
      const idB = resB.body.data.booking.id;

      // 3. Approve A
      const approveA = await request(app)
        .post(`/api/bookings/${idA}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ targetStatus: BookingStatus.APPROVED });
      expect(approveA.status).toBe(200);

      // 4. Attempt to approve B -> MUST return 409 CONFLICT
      const approveB = await request(app)
        .post(`/api/bookings/${idB}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ targetStatus: BookingStatus.APPROVED });

      expect(approveB.status).toBe(409);
      expect(approveB.body.error.code).toBe('CONFLICT');
      expect(approveB.body.error.message).toContain('resource is already booked for an overlapping time slot');
    });

    it('handles simultaneous concurrent approval requests: exactly ONE succeeds and the other receives 409 CONFLICT', async () => {
      const res1 = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_3d_bambu',
          startTime: '2026-11-12T14:00:00Z',
          endTime: '2026-11-12T16:00:00Z',
          intent: 'Concurrent test 1',
        });
      const id1 = res1.body.data.booking.id;

      const res2 = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_resource_hog')
        .send({
          resourceId: 'res_3d_bambu',
          startTime: '2026-11-12T14:30:00Z',
          endTime: '2026-11-12T15:30:00Z', // Fully inside slot 1
          intent: 'Concurrent test 2',
        });
      const id2 = res2.body.data.booking.id;

      // Fire both approvals concurrently using Promise.all
      const [resApprove1, resApprove2] = await Promise.all([
        request(app)
          .post(`/api/bookings/${id1}/transition`)
          .set('X-Test-User-Id', 'demo_lab_owner')
          .set('X-Test-User-Role', 'LAB_OWNER')
          .send({ targetStatus: BookingStatus.APPROVED }),
        request(app)
          .post(`/api/bookings/${id2}/transition`)
          .set('X-Test-User-Id', 'demo_lab_owner')
          .set('X-Test-User-Role', 'LAB_OWNER')
          .send({ targetStatus: BookingStatus.APPROVED }),
      ]);

      const statuses = [resApprove1.status, resApprove2.status].sort();
      // Exactly one 200 (Success) and one 409 (Conflict)
      expect(statuses).toEqual([200, 409]);
    });
  });

  describe('5. GET /api/bookings and Privacy Masking', () => {
    it('masks borrower personal phone and institutional ID on public / unauthorized queries', async () => {
      const res = await request(app).get('/api/bookings');
      expect(res.status).toBe(200);
      expect(res.body.data.bookings.length).toBeGreaterThan(0);

      const booking = res.body.data.bookings[0];
      expect(booking.borrower).toBeDefined();
      expect(booking.borrower.isMasked).toBe(true);
      expect(booking.borrower.phone).toBeUndefined();
      expect(booking.borrower.studentId).toBeUndefined();
    });

    it('returns unmasked profile when accessed by borrower themselves', async () => {
      const res = await request(app)
        .get('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student');

      expect(res.status).toBe(200);
      const studentBooking = res.body.data.bookings.find(
        (b: any) => b.userId === 'demo_qualified_student'
      );

      expect(studentBooking).toBeDefined();
      expect(studentBooking.borrower.isMasked).toBeUndefined();
      expect(studentBooking.borrower.phone).toBe('555-0144');
      expect(studentBooking.borrower.studentId).toBe('STU-9901');
    });

    it('sanitizes contact info when accessed by an AUDITOR', async () => {
      const res = await request(app)
        .get('/api/bookings')
        .set('X-Test-User-Id', 'demo_auditor')
        .set('X-Test-User-Role', 'AUDITOR');

      expect(res.status).toBe(200);
      const booking = res.body.data.bookings[0];
      expect(booking.borrower).toBeDefined();
      expect(booking.borrower.phone).toBeUndefined();
      expect(booking.borrower.studentId).toBeUndefined();
      expect(booking.borrower.email).toContain('@audit-masked.org');
    });
  });

  describe('6. GET /api/bookings/user/:userId - Member 1 Integration Endpoint', () => {
    it('returns user bookings, weekly usage breakdown, and weekStartDate', async () => {
      const res = await request(app)
        .get('/api/bookings/user/demo_qualified_student')
        .set('X-Test-User-Id', 'demo_qualified_student');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bookings).toBeDefined();
      expect(res.body.data.weeklyUsage).toBeDefined();
      expect(res.body.data.weekStartDate).toBeDefined();
    });

    it('prevents student A from reading student B summary (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get('/api/bookings/user/demo_resource_hog')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
