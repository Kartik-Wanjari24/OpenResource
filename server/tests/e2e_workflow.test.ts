import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { StorageAdapter } from '../adapters/storage.adapter.js';
import { BookingStatus, CustodyAction } from '../types/booking.js';
import { SchedulerService } from '../services/scheduler.service.js';
import { NotificationService } from '../services/notification.service.js';

describe('Member 2 - Phase 8: End-to-End Integration & Workflow Verification', () => {
  const storage = StorageAdapter.getInstance();
  const scheduler = SchedulerService.getInstance();
  NotificationService.getInstance();

  beforeEach(async () => {
    await storage.resetStore();
    await storage.deleteBooking('book_demo_101');
  });

  afterAll(async () => {
    scheduler.stop();
    await StorageAdapter.close();
  });

  // =========================================================================
  // Workflow 1: Borrower creates a booking request
  // =========================================================================
  describe('Workflow 1: Borrower creates a booking request', () => {
    it('successfully creates a booking with eligibility verification and dispatches notification to lab owner', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .set('X-Test-User-Badges', 'badge_safety_101,badge_laser_cert')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: '2026-12-01T10:00:00Z',
          endTime: '2026-12-01T12:00:00Z',
          intent: 'Fabricate acrylic gears for senior capstone project',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.booking).toBeDefined();

      const booking = res.body.data.booking;
      expect(booking.userId).toBe('demo_qualified_student');
      expect(booking.resourceId).toBe('res_laser_epilog');
      expect(booking.status).toBe(BookingStatus.ELIGIBILITY_VERIFIED);
      expect(booking.estimatedHours).toBe(2);
      expect(booking.history).toHaveLength(1);
      expect(booking.history[0].toStatus).toBe(BookingStatus.ELIGIBILITY_VERIFIED);

      // Lab owner should receive a notification
      const notifRes = await request(app)
        .get('/api/notifications')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER');

      expect(notifRes.status).toBe(200);
      const ownerNotifs = notifRes.body.data.notifications;
      const relevantNotif = ownerNotifs.find((n: any) => n.bookingId === booking.id);
      expect(relevantNotif).toBeDefined();
      expect(relevantNotif.title).toContain('New Booking Request');
    });

    it('rejects booking request with invalid time window (endTime <= startTime)', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: '2026-12-01T14:00:00Z',
          endTime: '2026-12-01T13:00:00Z',
          intent: 'Invalid time request',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // Workflow 2: Owner approves or rejects it
  // =========================================================================
  describe('Workflow 2: Owner approves or rejects booking requests', () => {
    it('allows lab owner to approve a booking, transitioning status to APPROVED', async () => {
      // Create initial booking
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: '2026-12-02T10:00:00Z',
          endTime: '2026-12-02T12:00:00Z',
          intent: 'Laser cut chassis',
        });

      const bookingId = createRes.body.data.booking.id;

      // Lab owner approves
      const approveRes = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          targetStatus: BookingStatus.APPROVED,
          notes: 'Laser safety orientation completed on file',
        });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.booking.status).toBe(BookingStatus.APPROVED);

      // Student receives approval notification
      const studentNotifRes = await request(app)
        .get('/api/notifications')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER');

      const studentNotifs = studentNotifRes.body.data.notifications;
      const approvalNotif = studentNotifs.find((n: any) => n.bookingId === bookingId);
      expect(approvalNotif).toBeDefined();
      expect(approvalNotif.title).toMatch(/approved/i);
    });

    it('allows lab owner to reject a booking with a required rejection reason', async () => {
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: '2026-12-03T10:00:00Z',
          endTime: '2026-12-03T12:00:00Z',
          intent: 'Prototype optics mount',
        });

      const bookingId = createRes.body.data.booking.id;

      // Lab owner rejects
      const rejectRes = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          targetStatus: BookingStatus.REJECTED,
          reason: 'Laser cutter scheduled for optics alignment maintenance during this slot',
        });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.booking.status).toBe(BookingStatus.REJECTED);
      expect(rejectRes.body.data.booking.rejectionReason).toContain('optics alignment maintenance');
    });
  });

  // =========================================================================
  // Workflow 3: Authorized operator performs check-in
  // =========================================================================
  describe('Workflow 3: Authorized operator performs check-in', () => {
    it('generates a one-time OTP credential and verifies check-in successfully', async () => {
      // 1. Create and approve booking
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-12-04T10:00:00Z',
          endTime: '2026-12-04T12:00:00Z',
          intent: 'Rapid 3D enclosure print',
        });

      const bookingId = createRes.body.data.booking.id;

      await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ targetStatus: BookingStatus.APPROVED });

      // 2. Borrower generates check-in pass
      const credRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      expect(credRes.status).toBe(200);
      const { otpCode, qrToken } = credRes.body.data.credential;
      expect(otpCode).toMatch(/^\d{6}$/);
      expect(qrToken).toBeDefined();

      // 3. Perform check-in using OTP
      const checkInRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          action: CustodyAction.CHECK_IN,
          otpCode,
        });

      expect(checkInRes.status).toBe(200);
      expect(checkInRes.body.data.booking.status).toBe(BookingStatus.CHECKED_IN);
      expect(checkInRes.body.data.booking.checkedInAt).toBeDefined();
      expect(checkInRes.body.data.booking.checkedInBy).toBe('demo_qualified_student');

      // 4. Verify replay prevention (credential cannot be used again)
      const replayRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          action: CustodyAction.CHECK_IN,
          otpCode,
        });

      expect(replayRes.status).toBe(400);
    });

    it('enforces 3-attempt maximum rate-limiting on invalid OTP entries', async () => {
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-12-05T10:00:00Z',
          endTime: '2026-12-05T12:00:00Z',
          intent: 'Test brute force safeguard',
        });

      const bookingId = createRes.body.data.booking.id;

      await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ targetStatus: BookingStatus.APPROVED });

      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      // Attempt 1: wrong code
      const try1 = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({ action: CustodyAction.CHECK_IN, otpCode: '000000' });
      expect(try1.status).toBe(400);
      expect(try1.body.error.message).toMatch(/2 attempt\(s\) remaining/i);

      // Attempt 2: wrong code
      const try2 = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({ action: CustodyAction.CHECK_IN, otpCode: '000000' });
      expect(try2.status).toBe(400);
      expect(try2.body.error.message).toMatch(/1 attempt\(s\) remaining/i);

      // Attempt 3: wrong code -> locks out
      const try3 = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({ action: CustodyAction.CHECK_IN, otpCode: '000000' });
      expect(try3.status).toBe(400);
      expect(try3.body.error.message).toContain('exceeded');
    });
  });

  // =========================================================================
  // Workflow 4: Authorized operator performs checkout & condition details
  // =========================================================================
  describe('Workflow 4: Authorized operator performs checkout and records condition/incident details', () => {
    it('executes clean checkout with condition notes, transitioning to RETURNED then owner COMPLETED', async () => {
      // 1. Setup checked-in booking
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-12-06T10:00:00Z',
          endTime: '2026-12-06T12:00:00Z',
          intent: 'Full lifecycle checkout test',
        });
      const bookingId = createRes.body.data.booking.id;

      await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ targetStatus: BookingStatus.APPROVED });

      const credRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({ action: CustodyAction.CHECK_IN, otpCode: credRes.body.data.credential.otpCode });

      // 2. Perform safe return (CHECK_OUT)
      const checkOutRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          action: CustodyAction.CHECK_OUT,
          conditionNotes: 'Print bed cleaned with IPA. Filament unloaded cleanly.',
          incidentFlag: false,
        });

      expect(checkOutRes.status).toBe(200);
      expect(checkOutRes.body.data.booking.status).toBe(BookingStatus.RETURNED);
      expect(checkOutRes.body.data.booking.conditionNotes).toContain('Print bed cleaned');
      expect(checkOutRes.body.data.booking.returnedAt).toBeDefined();

      // 3. Owner performs final sign-off to COMPLETED
      const completeRes = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          targetStatus: BookingStatus.COMPLETED,
          notes: 'Lab staff verified item condition. Session closed.',
        });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.booking.status).toBe(BookingStatus.COMPLETED);
    });

    it('records an incident flag during checkout and allows lab owner to resolve and complete it', async () => {
      // 1. Setup checked-in booking
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-12-07T10:00:00Z',
          endTime: '2026-12-07T12:00:00Z',
          intent: 'Incident checkout test',
        });
      const bookingId = createRes.body.data.booking.id;

      await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ targetStatus: BookingStatus.APPROVED });

      const credRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({ action: CustodyAction.CHECK_IN, otpCode: credRes.body.data.credential.otpCode });

      // 2. Perform checkout with incident flag
      const checkOutRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          action: CustodyAction.CHECK_OUT,
          conditionNotes: 'Nozzle temperature sensor error tripped. Extruder clogged.',
          incidentFlag: true,
        });

      expect(checkOutRes.status).toBe(200);
      expect(checkOutRes.body.data.booking.status).toBe(BookingStatus.INCIDENT_FLAGGED);

      // Lab owner receives incident alert notification
      const ownerNotifs = await request(app)
        .get('/api/notifications')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER');

      const incidentNotif = ownerNotifs.body.data.notifications.find((n: any) => n.bookingId === bookingId);
      expect(incidentNotif).toBeDefined();
      expect(incidentNotif.title).toContain('Return Flagged');

      // 3. Lab owner inspects and resolves incident to COMPLETED
      const completeRes = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          targetStatus: BookingStatus.COMPLETED,
          notes: 'Nozzle replaced and re-calibrated. Incident logged and resolved.',
        });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.booking.status).toBe(BookingStatus.COMPLETED);
    });
  });

  // =========================================================================
  // Workflow 5: Cancellation and no-show paths
  // =========================================================================
  describe('Workflow 5: Cancellation and no-show paths behave correctly', () => {
    it('allows borrower to cancel an upcoming booking and releases the slot', async () => {
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-12-08T10:00:00Z',
          endTime: '2026-12-08T12:00:00Z',
          intent: 'To be cancelled',
        });
      const bookingId = createRes.body.data.booking.id;

      const cancelRes = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          targetStatus: BookingStatus.CANCELLED,
          reason: 'Schedule conflict with exam',
        });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.booking.status).toBe(BookingStatus.CANCELLED);
      expect(cancelRes.body.data.booking.cancellationReason).toContain('Schedule conflict');
    });

    it('processes no-shows after 15-minute grace period and auto-promotes waitlisted booking', async () => {
      const slotStart = '2026-12-09T10:00:00Z';
      const slotEnd = '2026-12-09T12:00:00Z';

      // 1. Alice books the slot and gets approved
      const aliceRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: slotStart,
          endTime: slotEnd,
          intent: 'Alice slot',
        });
      const aliceId = aliceRes.body.data.booking.id;

      await request(app)
        .post(`/api/bookings/${aliceId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ targetStatus: BookingStatus.APPROVED });

      // 2. Bob requests overlapping slot and is WAITLISTED
      const bobRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_resource_hog')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: slotStart,
          endTime: slotEnd,
          intent: 'Bob waitlisted slot',
        });
      const bobId = bobRes.body.data.booking.id;
      expect(bobRes.body.data.booking.status).toBe(BookingStatus.WAITLISTED);

      // 3. Scheduler sweeps at 10:16 (16 minutes after slot start > 15m grace period)
      const sweepResult = await scheduler.processNoShows('2026-12-09T10:16:00Z');
      expect(sweepResult.processedCount).toBeGreaterThanOrEqual(1);
      expect(sweepResult.promotedCount).toBeGreaterThanOrEqual(1);

      // Alice's booking should be CANCELLED as a no-show
      const updatedAlice = storage.getBooking(aliceId);
      expect(updatedAlice?.status).toBe(BookingStatus.CANCELLED);
      expect(updatedAlice?.cancellationReason).toContain('15-minute no-show policy exceeded');

      // Bob's booking should be promoted to APPROVED
      const updatedBob = storage.getBooking(bobId);
      expect(updatedBob?.status).toBe(BookingStatus.APPROVED);
    });
  });

  // =========================================================================
  // Workflow 6: Notifications are isolated by recipient and can be marked read
  // =========================================================================
  describe('Workflow 6: Notifications isolated by recipient and can be marked read', () => {
    it('isolates notifications by user and updates unread counts accurately upon marking read', async () => {
      // Alice creates a booking
      const res = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: '2026-12-10T10:00:00Z',
          endTime: '2026-12-10T12:00:00Z',
          intent: 'Isolation test',
        });
      const bookingId = res.body.data.booking.id;

      // Check Bob's notifications (must NOT see Alice's notifications)
      const bobNotifRes = await request(app)
        .get('/api/notifications')
        .set('X-Test-User-Id', 'demo_resource_hog')
        .set('X-Test-User-Role', 'USER');

      const bobBookingNotif = bobNotifRes.body.data.notifications.find((n: any) => n.bookingId === bookingId);
      expect(bobBookingNotif).toBeUndefined();

      // Check Lab Owner's notifications (must see booking request)
      const ownerNotifRes = await request(app)
        .get('/api/notifications')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER');

      const ownerBookingNotif = ownerNotifRes.body.data.notifications.find((n: any) => n.bookingId === bookingId);
      expect(ownerBookingNotif).toBeDefined();
      expect(ownerBookingNotif.read).toBe(false);

      // Lab Owner marks single notification as read
      const markRes = await request(app)
        .patch(`/api/notifications/${ownerBookingNotif.id}/read`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER');

      expect(markRes.status).toBe(200);
      expect(markRes.body.data.notification.read).toBe(true);

      // Lab Owner marks all as read
      const markAllRes = await request(app)
        .post('/api/notifications/read-all')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER');

      expect(markAllRes.status).toBe(200);

      const refreshedOwner = await request(app)
        .get('/api/notifications')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER');

      expect(refreshedOwner.body.data.unreadCount).toBe(0);
    });
  });

  // =========================================================================
  // Workflow 7: Unauthorized operations are rejected by the backend
  // =========================================================================
  describe('Workflow 7: Unauthorized operations are rejected by the backend', () => {
    it('returns 401 UNAUTHORIZED when no credentials or identity headers are provided on authenticated endpoints', async () => {
      const res = await request(app).post('/api/bookings').send({
        resourceId: 'res_laser_epilog',
        startTime: '2026-12-01T10:00:00Z',
        endTime: '2026-12-01T12:00:00Z',
        intent: 'Unauthenticated attempt',
      });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');

      const notifRes = await request(app).get('/api/notifications');
      expect(notifRes.status).toBe(401);
      expect(notifRes.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN when unprivileged student attempts to approve a booking', async () => {
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: '2026-12-11T10:00:00Z',
          endTime: '2026-12-11T12:00:00Z',
          intent: 'Auth test',
        });
      const bookingId = createRes.body.data.booking.id;

      const badApproveRes = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_resource_hog')
        .set('X-Test-User-Role', 'USER')
        .send({ targetStatus: BookingStatus.APPROVED });

      expect(badApproveRes.status).toBe(403);
      expect(badApproveRes.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 FORBIDDEN when a student attempts to check in to another student\'s booking', async () => {
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: '2026-12-12T10:00:00Z',
          endTime: '2026-12-12T12:00:00Z',
          intent: 'Auth test',
        });
      const bookingId = createRes.body.data.booking.id;

      await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ targetStatus: BookingStatus.APPROVED });

      const badCheckInRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_resource_hog')
        .set('X-Test-User-Role', 'USER')
        .send({
          action: CustodyAction.CHECK_IN,
          otpCode: '123456',
        });

      expect(badCheckInRes.status).toBe(403);
      expect(badCheckInRes.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 403 FORBIDDEN on direct manual state transition to CHECKED_IN bypassing custody', async () => {
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: '2026-12-13T10:00:00Z',
          endTime: '2026-12-13T12:00:00Z',
          intent: 'Direct transition test',
        });
      const bookingId = createRes.body.data.booking.id;

      await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ targetStatus: BookingStatus.APPROVED });

      const directRes = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({ targetStatus: BookingStatus.CHECKED_IN });

      expect(directRes.status).toBe(403);
      expect(directRes.body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // Workflow 8: Credential secrets are not persisted or logged
  // =========================================================================
  describe('Workflow 8: Credential secrets are not persisted or logged', () => {
    it('stores only cryptographic SHA-256 hashes for OTP and QR tokens, never plaintext', async () => {
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-12-14T10:00:00Z',
          endTime: '2026-12-14T12:00:00Z',
          intent: 'Credential storage security test',
        });
      const bookingId = createRes.body.data.booking.id;

      await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ targetStatus: BookingStatus.APPROVED });

      const credRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const { otpCode, qrToken } = credRes.body.data.credential;

      // Inspect backend storage directly
      const storedCred = storage.getLatestCredentialForBooking(bookingId, CustodyAction.CHECK_IN);
      expect(storedCred).toBeDefined();

      // Ensure plaintext OTP and QR token are NEVER stored in the persistence model
      expect((storedCred as any).otpCode).toBeUndefined();
      expect((storedCred as any).qrToken).toBeUndefined();

      // Ensure stored hashes are valid 64-char hex strings (SHA-256)
      expect(storedCred?.otpHash).toMatch(/^[a-f0-9]{64}$/);
      expect(storedCred?.qrTokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(storedCred?.otpHash).not.toBe(otpCode);
      expect(storedCred?.qrTokenHash).not.toBe(qrToken);

      // Verify the booking object itself does not leak credentials
      const bookingRes = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER');

      expect(JSON.stringify(bookingRes.body)).not.toContain(otpCode);
      expect(JSON.stringify(bookingRes.body)).not.toContain(qrToken);
    });
  });
});
