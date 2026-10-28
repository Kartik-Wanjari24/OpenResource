import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { StorageAdapter } from '../adapters/storage.adapter.js';
import { BookingStatus, CustodyAction } from '../types/booking.js';
import { SchedulerService } from '../services/scheduler.service.js';
import { NotificationService } from '../services/notification.service.js';
import { BookingEventType } from '../services/notification.interface.js';

describe('Member 2 - Phase 4: Notification System', () => {
  const storage = StorageAdapter.getInstance();
  const scheduler = SchedulerService.getInstance();
  // Ensure notification service is initialized and listening
  NotificationService.getInstance();

  beforeEach(async () => {
    await storage.resetStore();
    await storage.deleteBooking('book_demo_101');
  });

  afterAll(async () => {
    scheduler.stop();
    await StorageAdapter.close();
  });

  describe('1. GET /api/notifications - Access Control & User Isolation', () => {
    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/notifications');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns only the authenticated user\'s notifications in newest-first order', async () => {
      // Create a booking for student A
      await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: '2026-12-01T10:00:00Z',
          endTime: '2026-12-01T11:00:00Z',
          intent: 'Testing laser notifications',
        });

      // Student A checks notifications
      const studentRes = await request(app)
        .get('/api/notifications')
        .set('X-Test-User-Id', 'demo_qualified_student');

      expect(studentRes.status).toBe(200);
      expect(studentRes.body.success).toBe(true);
      expect(studentRes.body.data.notifications).toBeDefined();

      // All returned notifications must strictly belong to demo_qualified_student
      for (const notif of studentRes.body.data.notifications) {
        expect(notif.recipientUserId).toBe('demo_qualified_student');
      }

      // Owner checks notifications -> must see the BOOKING_REQUESTED notification
      const ownerRes = await request(app)
        .get('/api/notifications')
        .set('X-Test-User-Id', 'demo_lab_owner');

      expect(ownerRes.status).toBe(200);
      for (const notif of ownerRes.body.data.notifications) {
        expect(notif.recipientUserId).toBe('demo_lab_owner');
      }
      expect(ownerRes.body.data.notifications.some((n: any) => n.type === 'BOOKING_REQUESTED')).toBe(true);
    });

    it('supports pagination with page and limit query parameters', async () => {
      // Generate multiple notifications for demo_qualified_student
      const notifService = NotificationService.getInstance();
      for (let i = 1; i <= 5; i++) {
        notifService.handleDomainEvent({
          type: BookingEventType.BOOKING_APPROVED,
          bookingId: `book_page_test_${i}`,
          recipientUserId: 'demo_qualified_student',
          title: `Test Notification ${i}`,
          message: `Message body ${i}`,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          idempotencyKey: `unique_page_key_${i}`,
        });
      }

      // Fetch page 1 with limit 2
      const page1Res = await request(app)
        .get('/api/notifications?page=1&limit=2')
        .set('X-Test-User-Id', 'demo_qualified_student');

      expect(page1Res.status).toBe(200);
      expect(page1Res.body.data.notifications).toHaveLength(2);
      expect(page1Res.body.data.page).toBe(1);
      expect(page1Res.body.data.limit).toBe(2);
      expect(page1Res.body.data.total).toBeGreaterThanOrEqual(5);

      // Fetch page 2 with limit 2
      const page2Res = await request(app)
        .get('/api/notifications?page=2&limit=2')
        .set('X-Test-User-Id', 'demo_qualified_student');

      expect(page2Res.status).toBe(200);
      expect(page2Res.body.data.notifications).toHaveLength(2);
      expect(page2Res.body.data.page).toBe(2);

      // Verify no overlap between page 1 and page 2 items
      const page1Ids = page1Res.body.data.notifications.map((n: any) => n.id);
      const page2Ids = page2Res.body.data.notifications.map((n: any) => n.id);
      expect(page1Ids.some((id: string) => page2Ids.includes(id))).toBe(false);
    });
  });

  describe('2. Read Status Endpoints', () => {
    it('marks a single notification as read via PATCH /api/notifications/:id/read', async () => {
      const notifService = NotificationService.getInstance();
      const created = notifService.handleDomainEvent({
        type: BookingEventType.BOOKING_APPROVED,
        bookingId: 'book_read_test_1',
        recipientUserId: 'demo_qualified_student',
        title: 'Approval Notice',
        message: 'Your booking has been approved',
        timestamp: new Date().toISOString(),
        idempotencyKey: 'idem_read_single_1',
      });

      expect(created).toBeDefined();

      const readRes = await request(app)
        .patch(`/api/notifications/${created!.id}/read`)
        .set('X-Test-User-Id', 'demo_qualified_student');

      expect(readRes.status).toBe(200);
      expect(readRes.body.data.notification.read).toBe(true);
      expect(readRes.body.data.notification.readAt).toBeDefined();
    });

    it('rejects attempt to mark another user\'s notification as read with 403 FORBIDDEN', async () => {
      const notifService = NotificationService.getInstance();
      const created = notifService.handleDomainEvent({
        type: BookingEventType.BOOKING_APPROVED,
        bookingId: 'book_read_test_2',
        recipientUserId: 'demo_qualified_student',
        title: 'Private Notice',
        message: 'Private message',
        timestamp: new Date().toISOString(),
        idempotencyKey: 'idem_read_other_1',
      });

      // Stranger student tries to mark it as read
      const res = await request(app)
        .patch(`/api/notifications/${created!.id}/read`)
        .set('X-Test-User-Id', 'demo_resource_hog')
        .set('X-Test-User-Role', 'USER');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('returns 404 RESOURCE_NOT_FOUND when notification does not exist', async () => {
      const res = await request(app)
        .patch('/api/notifications/non_existent_notif_999/read')
        .set('X-Test-User-Id', 'demo_qualified_student');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('marks all user notifications as read via POST /api/notifications/read-all', async () => {
      const notifService = NotificationService.getInstance();
      notifService.handleDomainEvent({
        type: BookingEventType.BOOKING_REQUESTED,
        bookingId: 'book_all_1',
        recipientUserId: 'demo_lab_owner',
        title: 'Req 1',
        message: 'Msg 1',
        timestamp: new Date().toISOString(),
        idempotencyKey: 'idem_all_read_1',
      });
      notifService.handleDomainEvent({
        type: BookingEventType.BOOKING_REQUESTED,
        bookingId: 'book_all_2',
        recipientUserId: 'demo_lab_owner',
        title: 'Req 2',
        message: 'Msg 2',
        timestamp: new Date().toISOString(),
        idempotencyKey: 'idem_all_read_2',
      });

      const res = await request(app)
        .post('/api/notifications/read-all')
        .set('X-Test-User-Id', 'demo_lab_owner');

      expect(res.status).toBe(200);
      expect(res.body.data.markedCount).toBeGreaterThanOrEqual(2);

      // Verify all notifications are now marked read
      const checkRes = await request(app)
        .get('/api/notifications?unreadOnly=true')
        .set('X-Test-User-Id', 'demo_lab_owner');

      expect(checkRes.body.data.notifications).toHaveLength(0);
      expect(checkRes.body.data.unreadCount).toBe(0);
    });
  });

  describe('3. Event Integration & Recipient Mapping Across Lifecycle', () => {
    it('dispatches BOOKING_APPROVED to borrower when owner approves', async () => {
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: '2026-12-05T10:00:00Z',
          endTime: '2026-12-05T11:00:00Z',
          intent: 'Laser cutting parts',
        });
      const bookingId = createRes.body.data.booking.id;

      // Owner approves
      await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ targetStatus: BookingStatus.APPROVED });

      // Borrower receives notification
      const borrowerNotifs = await request(app)
        .get('/api/notifications')
        .set('X-Test-User-Id', 'demo_qualified_student');

      const approvedNotif = borrowerNotifs.body.data.notifications.find(
        (n: any) => n.bookingId === bookingId && n.type === 'BOOKING_APPROVED'
      );
      expect(approvedNotif).toBeDefined();
      expect(approvedNotif.title).toMatch(/approved/i);
    });

    it('dispatches BOOKING_REJECTED to borrower when owner rejects', async () => {
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: '2026-12-06T10:00:00Z',
          endTime: '2026-12-06T11:00:00Z',
          intent: 'Laser parts rejection test',
        });
      const bookingId = createRes.body.data.booking.id;

      // Owner rejects
      await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          targetStatus: BookingStatus.REJECTED,
          reason: 'Maintenance scheduled during requested time',
        });

      const borrowerNotifs = await request(app)
        .get('/api/notifications')
        .set('X-Test-User-Id', 'demo_qualified_student');

      const rejectedNotif = borrowerNotifs.body.data.notifications.find(
        (n: any) => n.bookingId === bookingId && n.type === 'BOOKING_REJECTED'
      );
      expect(rejectedNotif).toBeDefined();
      expect(rejectedNotif.message).toContain('Maintenance scheduled');
    });

    it('dispatches WAITLIST_PLACED to borrower when requested slot has contention', async () => {
      // 1. Approved booking A
      await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-12-10T10:00:00Z',
          endTime: '2026-12-10T12:00:00Z',
          intent: 'Active confirmed booking',
        });

      // Approve booking A
      const allBookings = storage.getAllBookings();
      const bA = allBookings.find((b) => b.resourceId === 'res_3d_prusa');
      await request(app)
        .post(`/api/bookings/${bA!.id}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ targetStatus: BookingStatus.APPROVED });

      // 2. Competing booking B (placed on waitlist)
      const resB = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_resource_hog')
        .send({
          resourceId: 'res_3d_prusa',
          startTime: '2026-12-10T11:00:00Z',
          endTime: '2026-12-10T12:00:00Z',
          intent: 'Competing waitlisted booking',
        });

      const bBId = resB.body.data.booking.id;

      // Student B receives WAITLIST_PLACED notification
      const studentBNotifs = await request(app)
        .get('/api/notifications')
        .set('X-Test-User-Id', 'demo_resource_hog');

      const waitlistNotif = studentBNotifs.body.data.notifications.find(
        (n: any) => n.bookingId === bBId && n.type === 'WAITLIST_PLACED'
      );
      expect(waitlistNotif).toBeDefined();
    });

    it('dispatches CHECKED_IN and RETURNED events during custody operations', async () => {
      // Setup approved booking
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_elec_bench',
          startTime: '2026-12-12T10:00:00Z',
          endTime: '2026-12-12T12:00:00Z',
          intent: 'Electronics testing session',
        });
      const bookingId = createRes.body.data.booking.id;

      await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ targetStatus: BookingStatus.APPROVED });

      // Check-in
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_IN, otpCode: genRes.body.data.credential.otpCode });

      // Owner receives CHECKED_IN notification
      const ownerNotifs = await request(app)
        .get('/api/notifications')
        .set('X-Test-User-Id', 'demo_lab_owner');

      const checkInNotif = ownerNotifs.body.data.notifications.find(
        (n: any) => n.bookingId === bookingId && n.type === 'CHECKED_IN'
      );
      expect(checkInNotif).toBeDefined();

      // Check-out
      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_OUT, conditionNotes: 'All good' });

      // Owner receives RETURNED notification
      const ownerNotifsAfter = await request(app)
        .get('/api/notifications')
        .set('X-Test-User-Id', 'demo_lab_owner');

      const returnedNotif = ownerNotifsAfter.body.data.notifications.find(
        (n: any) => n.bookingId === bookingId && n.type === 'RETURNED'
      );
      expect(returnedNotif).toBeDefined();
    });

    it('dispatches INCIDENT_FLAGGED event when return reports an incident', async () => {
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_laser_epilog',
          startTime: '2026-12-14T10:00:00Z',
          endTime: '2026-12-14T12:00:00Z',
          intent: 'Incident test session',
        });
      const bookingId = createRes.body.data.booking.id;

      await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ targetStatus: BookingStatus.APPROVED });

      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_IN, otpCode: genRes.body.data.credential.otpCode });

      // Check out with incidentFlag: true
      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          action: CustodyAction.CHECK_OUT,
          conditionNotes: 'Lens cracked during cutting procedure',
          incidentFlag: true,
        });

      const ownerNotifs = await request(app)
        .get('/api/notifications')
        .set('X-Test-User-Id', 'demo_lab_owner');

      const incidentNotif = ownerNotifs.body.data.notifications.find(
        (n: any) => n.bookingId === bookingId && n.type === 'INCIDENT_FLAGGED'
      );
      expect(incidentNotif).toBeDefined();
      expect(incidentNotif.title).toContain('Flagged');
    });

    it('dispatches NO_SHOW_CANCELLED and WAITLIST_PROMOTED notifications during scheduler sweeps', async () => {
      const startTime = '2026-12-20T10:00:00Z';
      const endTime = '2026-12-20T12:00:00Z';

      // 1. Create booking A and approve
      const resA = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          resourceId: 'res_cnc_tormach',
          startTime,
          endTime,
          intent: 'CNC Job A',
        });
      const bAId = resA.body.data.booking.id;

      await request(app)
        .post(`/api/bookings/${bAId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ targetStatus: BookingStatus.APPROVED });

      // 2. Create waitlisted booking B
      const resB = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_resource_hog')
        .send({
          resourceId: 'res_cnc_tormach',
          startTime,
          endTime,
          intent: 'CNC Job B waitlisted',
        });
      const bBId = resB.body.data.booking.id;

      // 3. Sweep no-shows at 10:20 (after 15-minute grace period)
      await scheduler.processNoShows(new Date('2026-12-20T10:20:00Z'));

      // Check student A receives NO_SHOW_CANCELLED
      const studentANotifs = await request(app)
        .get('/api/notifications')
        .set('X-Test-User-Id', 'demo_qualified_student');

      const noShowNotif = studentANotifs.body.data.notifications.find(
        (n: any) => n.bookingId === bAId && n.type === 'NO_SHOW_CANCELLED'
      );
      expect(noShowNotif).toBeDefined();

      // Check student B receives WAITLIST_PROMOTED
      const studentBNotifs = await request(app)
        .get('/api/notifications')
        .set('X-Test-User-Id', 'demo_resource_hog');

      const promotedNotif = studentBNotifs.body.data.notifications.find(
        (n: any) => n.bookingId === bBId && n.type === 'WAITLIST_PROMOTED'
      );
      expect(promotedNotif).toBeDefined();
    });
  });

  describe('4. Idempotency & Privacy Protection', () => {
    it('suppresses duplicate notifications with the same idempotency key', async () => {
      const notifService = NotificationService.getInstance();
      const payload = {
        type: BookingEventType.BOOKING_APPROVED,
        bookingId: 'book_dedup_test',
        recipientUserId: 'demo_qualified_student',
        title: 'Dedup Title',
        message: 'Dedup Body',
        timestamp: new Date().toISOString(),
        idempotencyKey: 'fixed_idempotency_key_123',
      };

      // First dispatch: saved
      const first = notifService.handleDomainEvent(payload);
      expect(first).not.toBeNull();

      // Second immediate dispatch with identical key: suppressed
      const second = notifService.handleDomainEvent(payload);
      expect(second).toBeNull();
    });

    it('sanitizes metadata and contains zero credentials or secrets', async () => {
      const notifService = NotificationService.getInstance();
      const record = notifService.handleDomainEvent({
        type: BookingEventType.CHECKED_IN,
        bookingId: 'book_secret_test',
        recipientUserId: 'demo_qualified_student',
        title: 'Secret check',
        message: 'No secrets here',
        metadata: {
          resourceId: 'res_laser_epilog',
          otpCode: '123456',        // FORBIDDEN SENSITIVE FIELD
          qrToken: 'super_secret',   // FORBIDDEN SENSITIVE FIELD
          password: 'secret_pass',   // FORBIDDEN SENSITIVE FIELD
          startTime: '2026-12-01T10:00:00Z',
        },
        timestamp: new Date().toISOString(),
        idempotencyKey: 'idem_secret_check',
      });

      expect(record).toBeDefined();
      expect(record!.metadata).toBeDefined();
      expect((record!.metadata as any).otpCode).toBeUndefined();
      expect((record!.metadata as any).qrToken).toBeUndefined();
      expect((record!.metadata as any).password).toBeUndefined();
      expect(record!.metadata!.resourceId).toBe('res_laser_epilog');
      expect(record!.metadata!.startTime).toBe('2026-12-01T10:00:00Z');
    });
  });
});
