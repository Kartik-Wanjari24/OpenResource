import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { StorageAdapter } from '../adapters/storage.adapter.js';
import { BookingStatus, CustodyAction } from '../types/booking.js';
import { SchedulerService } from '../services/scheduler.service.js';

describe('Member 2 - Phase 3: Custody Handover, QR/OTP, and No-Show Engine', () => {
  const storage = StorageAdapter.getInstance();
  const scheduler = SchedulerService.getInstance();

  beforeEach(async () => {
    await storage.resetStore();
    await storage.deleteBooking('book_demo_101');
  });

  afterAll(async () => {
    scheduler.stop();
    await StorageAdapter.close();
  });

  // Helper to create an approved booking
  async function createApprovedBooking(
    userId = 'demo_qualified_student',
    resourceId = 'res_laser_epilog',
    startTime = '2026-11-20T10:00:00Z',
    endTime = '2026-11-20T12:00:00Z'
  ): Promise<string> {
    const createRes = await request(app)
      .post('/api/bookings')
      .set('X-Test-User-Id', userId)
      .set('X-Test-User-Role', 'USER')
      .send({
        resourceId,
        startTime,
        endTime,
        intent: 'Custody test booking',
      });

    const bookingId = createRes.body.data.booking.id;

    await request(app)
      .post(`/api/bookings/${bookingId}/transition`)
      .set('X-Test-User-Id', 'demo_lab_owner')
      .set('X-Test-User-Role', 'LAB_OWNER')
      .send({ targetStatus: BookingStatus.APPROVED });

    return bookingId;
  }

  describe('1. QR/OTP Credential Generation & Security', () => {
    it('generates unpredictable 6-digit OTP and QR token for authorized borrower', async () => {
      const bookingId = await createApprovedBooking();

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const cred = res.body.data.credential;
      expect(cred).toBeDefined();
      expect(cred.bookingId).toBe(bookingId);
      expect(cred.action).toBe(CustodyAction.CHECK_IN);
      expect(cred.otpCode).toMatch(/^\d{6}$/); // 6 digits
      expect(cred.qrToken).toBeDefined();
      expect(cred.qrToken.length).toBeGreaterThan(20);
      expect(cred.expiresAt).toBeDefined();
      expect(cred.attemptsRemaining).toBe(3);

      // Verify that raw OTP is NOT stored plain-text in storage adapter
      const storedCred = storage.getCredential(cred.id);
      expect(storedCred).toBeDefined();
      expect((storedCred as any).otpCode).toBeUndefined();
      expect(storedCred!.otpHash).toBeDefined();
      expect(storedCred!.otpHash).not.toBe(cred.otpCode);
    });

    it('rejects credential generation by unauthorized stranger student (403 FORBIDDEN)', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student');

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_resource_hog')
        .set('X-Test-User-Role', 'USER')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects check-in credential generation if booking is not in APPROVED state', async () => {
      // Create fresh booking (REQUESTED state, not yet approved)
      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_resource_hog')
        .send({
          resourceId: 'res_elec_bench',
          startTime: '2026-11-21T10:00:00Z',
          endTime: '2026-11-21T11:00:00Z',
          intent: 'Electronics testing',
        });
      const bookingId = createRes.body.data.booking.id;

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_resource_hog')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });
  });

  describe('2. Check-In Workflow & Verification', () => {
    it('successfully checks in with valid OTP credential', async () => {
      const bookingId = await createApprovedBooking();

      // 1. Generate credential
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const { otpCode } = genRes.body.data.credential;

      // 2. Perform check-in using OTP
      const checkInRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          action: CustodyAction.CHECK_IN,
          otpCode,
        });

      expect(checkInRes.status).toBe(200);
      const booking = checkInRes.body.data.booking;
      expect(booking.status).toBe(BookingStatus.CHECKED_IN);
      expect(booking.checkedInAt).toBeDefined();
      expect(booking.checkedInBy).toBe('demo_qualified_student');

      // Verify history entry recorded
      const history = booking.history;
      const checkInHist = history.find((h: any) => h.toStatus === BookingStatus.CHECKED_IN);
      expect(checkInHist).toBeDefined();
      expect(checkInHist.fromStatus).toBe(BookingStatus.APPROVED);
    });

    it('successfully checks in with valid QR token', async () => {
      const bookingId = await createApprovedBooking();

      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const { qrToken } = genRes.body.data.credential;

      const checkInRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({
          action: CustodyAction.CHECK_IN,
          qrToken,
        });

      expect(checkInRes.status).toBe(200);
      expect(checkInRes.body.data.booking.status).toBe(BookingStatus.CHECKED_IN);
      expect(checkInRes.body.data.booking.checkedInBy).toBe('demo_lab_owner');
    });

    it('rejects check-in with invalid OTP and decrements remaining attempts', async () => {
      const bookingId = await createApprovedBooking();

      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const wrongRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          action: CustodyAction.CHECK_IN,
          otpCode: '000000',
        });

      expect(wrongRes.status).toBe(400);
      expect(wrongRes.body.error.code).toBe('INVALID_CREDENTIAL');
      expect(wrongRes.body.error.message).toContain('2 attempt(s) remaining');
    });

    it('invalidates credential when max verification attempts are exceeded', async () => {
      const bookingId = await createApprovedBooking();

      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      // Attempt 1
      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_IN, otpCode: '111111' });

      // Attempt 2
      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_IN, otpCode: '222222' });

      // Attempt 3: Exhausts attempts
      const exhaustRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_IN, otpCode: '333333' });

      expect(exhaustRes.status).toBe(400);
      expect(exhaustRes.body.error.code).toBe('MAX_ATTEMPTS_EXCEEDED');

      // Attempt 4: Should reject because credential is invalidated
      const fourthRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_IN, otpCode: '123456' });

      expect(fourthRes.status).toBe(400);
      expect(fourthRes.body.error.code).toBe('MAX_ATTEMPTS_EXCEEDED');
    });

    it('rejects check-in with expired credential (EXPIRED_CREDENTIAL)', async () => {
      const bookingId = await createApprovedBooking();

      // Generate credential with negative TTL (already expired)
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          action: CustodyAction.GENERATE_CREDENTIAL,
          ttlMinutes: -5,
        });

      const { otpCode } = genRes.body.data.credential;

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          action: CustodyAction.CHECK_IN,
          otpCode,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EXPIRED_CREDENTIAL');
    });

    it('prevents reuse and replay of credentials after successful verification', async () => {
      const bookingId = await createApprovedBooking();

      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const { otpCode } = genRes.body.data.credential;

      // First check-in: succeeds
      const firstRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_IN, otpCode });
      expect(firstRes.status).toBe(200);

      // Replay attempt: rejected
      const replayRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_IN, otpCode });

      expect(replayRes.status).toBe(400);
      expect(replayRes.body.error.message).toContain('already checked in');
    });

    it('rejects duplicate check-in attempts', async () => {
      const bookingId = await createApprovedBooking();

      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_IN, otpCode: genRes.body.data.credential.otpCode });

      // Try checking in again
      const dupRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_IN, otpCode: '123456' });

      expect(dupRes.status).toBe(400);
      expect(dupRes.body.error.message).toContain('already checked in');
    });

    it('maintains consistent booking status and history after check-in failure', async () => {
      const bookingId = await createApprovedBooking();

      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      // Submit bad OTP
      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_IN, otpCode: '999999' });

      // Check booking in storage: must remain APPROVED and no CHECKED_IN history added
      const booking = storage.getBooking(bookingId);
      expect(booking!.status).toBe(BookingStatus.APPROVED);
      expect(booking!.checkedInAt).toBeUndefined();
      expect(booking!.history!.every((h) => h.toStatus !== BookingStatus.CHECKED_IN)).toBe(true);
    });
  });

  describe('3. Check-Out and Return Workflow', () => {
    it('successfully processes checkout, sets returnedAt and records history', async () => {
      const bookingId = await createApprovedBooking();

      // Check-in first
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_IN, otpCode: genRes.body.data.credential.otpCode });

      // Process check-out
      const checkOutRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          action: CustodyAction.CHECK_OUT,
          conditionNotes: 'All optics cleaned, material waste disposed',
        });

      expect(checkOutRes.status).toBe(200);
      const booking = checkOutRes.body.data.booking;
      expect(booking.status).toBe(BookingStatus.RETURNED);
      expect(booking.returnedAt).toBeDefined();
      expect(booking.returnedBy).toBe('demo_qualified_student');
      expect(booking.conditionNotes).toBe('All optics cleaned, material waste disposed');

      const returnHist = booking.history.find((h: any) => h.toStatus === BookingStatus.RETURNED);
      expect(returnHist).toBeDefined();
      expect(returnHist.fromStatus).toBe(BookingStatus.CHECKED_IN);
    });

    it('rejects checkout before check-in has occurred', async () => {
      const bookingId = await createApprovedBooking();

      // Attempt checkout on an APPROVED but NOT checked-in booking
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({
          action: CustodyAction.CHECK_OUT,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
      expect(res.body.error.message).toContain('Expected status \'CHECKED_IN\'');
    });

    it('rejects duplicate checkout on already returned booking', async () => {
      const bookingId = await createApprovedBooking();

      // Check-in
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_IN, otpCode: genRes.body.data.credential.otpCode });

      // First check-out
      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_OUT });

      // Second check-out
      const dupRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_OUT });

      expect(dupRes.status).toBe(400);
      expect(dupRes.body.error.code).toBe('INVALID_STATE_TRANSITION');
      expect(dupRes.body.error.message).toContain('already been returned');
    });
  });

  describe('4. Fifteen-Minute No-Show Processing & Waitlist Promotion', () => {
    it('does NOT cancel booking before the 15-minute grace period boundary', async () => {
      const startTime = new Date('2026-11-25T10:00:00Z');
      const endTime = new Date('2026-11-25T12:00:00Z');

      const bookingId = await createApprovedBooking(
        'demo_qualified_student',
        'res_3d_bambu',
        startTime.toISOString(),
        endTime.toISOString()
      );

      // At 14 minutes and 59 seconds after start
      const testTime = new Date('2026-11-25T10:14:59Z');
      const result = await scheduler.processNoShows(testTime);

      expect(result.processedCount).toBe(0);
      const booking = storage.getBooking(bookingId);
      expect(booking!.status).toBe(BookingStatus.APPROVED);
    });

    it('cancels booking at and after 15-minute grace period boundary', async () => {
      const startTime = new Date('2026-11-25T10:00:00Z');
      const endTime = new Date('2026-11-25T12:00:00Z');

      const bookingId = await createApprovedBooking(
        'demo_qualified_student',
        'res_3d_bambu',
        startTime.toISOString(),
        endTime.toISOString()
      );

      // At exactly 15 minutes after start
      const testTime = new Date('2026-11-25T10:15:00Z');
      const result = await scheduler.processNoShows(testTime);

      expect(result.processedCount).toBe(1);
      expect(result.processedBookings[0].action).toBe('NO_SHOW_CANCELLED');

      const booking = storage.getBooking(bookingId);
      expect(booking!.status).toBe(BookingStatus.CANCELLED);
      expect(booking!.cancellationReason).toContain('15-minute no-show policy');

      const hist = booking!.history!.find((h) => h.actorId === 'system_scheduler');
      expect(hist).toBeDefined();
      expect(hist!.fromStatus).toBe(BookingStatus.APPROVED);
      expect(hist!.toStatus).toBe(BookingStatus.CANCELLED);
    });

    it('skips already checked-in bookings even after grace period expires', async () => {
      const startTime = new Date('2026-11-25T10:00:00Z');
      const endTime = new Date('2026-11-25T12:00:00Z');

      const bookingId = await createApprovedBooking(
        'demo_qualified_student',
        'res_3d_bambu',
        startTime.toISOString(),
        endTime.toISOString()
      );

      // Check-in early
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.CHECK_IN, otpCode: genRes.body.data.credential.otpCode });

      // Run scheduler at 10:30 (30 min after start)
      const testTime = new Date('2026-11-25T10:30:00Z');
      const result = await scheduler.processNoShows(testTime);

      expect(result.processedCount).toBe(0);
      const booking = storage.getBooking(bookingId);
      expect(booking!.status).toBe(BookingStatus.CHECKED_IN);
    });

    it('repeated scheduler runs are safe, idempotent, and do not duplicate events', async () => {
      const startTime = new Date('2026-11-25T10:00:00Z');
      const endTime = new Date('2026-11-25T12:00:00Z');

      const bookingId = await createApprovedBooking(
        'demo_qualified_student',
        'res_3d_bambu',
        startTime.toISOString(),
        endTime.toISOString()
      );

      const testTime = new Date('2026-11-25T10:20:00Z');

      // First run: processes 1 no-show
      const run1 = await scheduler.processNoShows(testTime);
      expect(run1.processedCount).toBe(1);

      // Second run: processes 0 (idempotent)
      const run2 = await scheduler.processNoShows(testTime);
      expect(run2.processedCount).toBe(0);

      // History should only have 1 cancellation entry
      const booking = storage.getBooking(bookingId);
      const cancelEntries = booking!.history!.filter((h) => h.toStatus === BookingStatus.CANCELLED);
      expect(cancelEntries).toHaveLength(1);
    });

    it('promotes next eligible waitlisted booking when slot is reclaimed', async () => {
      const startTime = '2026-11-26T10:00:00Z';
      const endTime = '2026-11-26T12:00:00Z';

      // 1. Booking A (Approved)
      const bookingA = await createApprovedBooking(
        'demo_qualified_student',
        'res_cnc_tormach',
        startTime,
        endTime
      );

      // 2. Booking B (Waitlisted due to overlapping slot)
      const resB = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_resource_hog')
        .send({
          resourceId: 'res_cnc_tormach',
          startTime,
          endTime,
          intent: 'Waitlisted job',
        });
      const bookingB = resB.body.data.booking.id;
      expect(resB.body.data.booking.status).toBe(BookingStatus.WAITLISTED);

      // 3. Run no-show at 10:20Z (20 min after start)
      const sweepResult = await scheduler.processNoShows(new Date('2026-11-26T10:20:00Z'));

      expect(sweepResult.processedCount).toBe(1);
      expect(sweepResult.promotedCount).toBe(1);

      // Booking A is CANCELLED
      const freshA = storage.getBooking(bookingA);
      expect(freshA!.status).toBe(BookingStatus.CANCELLED);

      // Booking B is PROMOTED to APPROVED!
      const freshB = storage.getBooking(bookingB);
      expect(freshB!.status).toBe(BookingStatus.APPROVED);

      const promoteHist = freshB!.history!.find((h) => h.toStatus === BookingStatus.APPROVED);
      expect(promoteHist).toBeDefined();
      expect(promoteHist!.actorId).toBe('system_scheduler');
    });

    it('POST /api/bookings/process-no-shows rejects unauthorized student requests (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .post('/api/bookings/process-no-shows')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('POST /api/bookings/process-no-shows succeeds for authorized lab owner/admin', async () => {
      const res = await request(app)
        .post('/api/bookings/process-no-shows')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ referenceTime: '2026-11-26T10:20:00Z' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.processedCount).toBeDefined();
      expect(res.body.data.promotedCount).toBeDefined();
    });
  });
});
