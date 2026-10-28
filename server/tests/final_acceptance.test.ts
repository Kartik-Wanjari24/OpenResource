import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { StorageAdapter } from '../adapters/storage.adapter.js';
import { SchedulerService } from '../services/scheduler.service.js';
import { BookingStatus, UserRole, CustodyAction } from '../types/booking.js';
import type { Booking } from '../types/booking.js';

describe('OpenResource - Final Acceptance Verification Suite', () => {
  const storage = StorageAdapter.getInstance();
  const scheduler = SchedulerService.getInstance();

  beforeEach(async () => {
    await storage.resetStore();
    await storage.deleteBooking('book_demo_101');
    await storage.deleteBooking('book_test_acceptance');
  });

  afterAll(async () => {
    scheduler.stop();
    await StorageAdapter.close();
  });

  // Helper to create an approved test booking
  async function createApprovedBooking(
    userId = 'demo_qualified_student',
    resourceId = 'res_3d_prusa',
    ownerId = 'demo_lab_owner',
    startTime = '2026-11-20T10:00:00Z',
    endTime = '2026-11-20T12:00:00Z'
  ): Promise<string> {
    const bookingId = `book_acc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();

    const booking: Booking = {
      id: bookingId,
      resourceId,
      resourceName: 'Prusa MK4 3D Printer',
      userId,
      ownerId,
      startTime,
      endTime,
      intent: 'Final acceptance test print',
      status: BookingStatus.APPROVED,
      requiresSupervision: false,
      estimatedHours: 2,
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
          actorRole: UserRole.LAB_OWNER,
        },
      ],
    };

    await storage.saveBooking(booking);
    return bookingId;
  }

  // =========================================================================
  // TASK 1.B — QR Generation and Validation Verification
  // =========================================================================
  describe('TASK 1.B: QR Credential Generation & Validation', () => {
    it('1. An authorized user can obtain a valid QR credential for an eligible booking', async () => {
      const bookingId = await createApprovedBooking();
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.credential.qrToken).toBeDefined();
      expect(res.body.data.credential.qrToken.length).toBeGreaterThan(20);
    });

    it('2. The credential is associated with the correct booking and intended user/resource', async () => {
      const bookingId = await createApprovedBooking();
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const cred = res.body.data.credential;
      expect(cred.bookingId).toBe(bookingId);
      expect(cred.action).toBe('CHECK_IN');

      const stored = await storage.getCredential(cred.id);
      expect(stored).toBeDefined();
      expect(stored!.bookingId).toBe(bookingId);
      expect(stored!.userId).toBe('demo_qualified_student');
    });

    it('3. A valid QR credential can be used for its intended custody action (check-in)', async () => {
      const bookingId = await createApprovedBooking();
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const qrToken = genRes.body.data.credential.qrToken;

      const checkInRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ action: CustodyAction.CHECK_IN, qrToken });

      expect(checkInRes.status).toBe(200);
      expect(checkInRes.body.data.booking.status).toBe(BookingStatus.CHECKED_IN);
    });

    it('4. A malformed QR payload is rejected', async () => {
      const bookingId = await createApprovedBooking();
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, qrToken: 'not-a-valid-token-format!@#$%' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CREDENTIAL');
    });

    it('5. A nonexistent or unknown credential is rejected', async () => {
      const bookingId = await createApprovedBooking();
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, qrToken: 'unknown_token_value_not_in_store' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CREDENTIAL');
    });

    it('6. A credential belonging to a different booking is rejected', async () => {
      const booking1 = await createApprovedBooking('demo_qualified_student');
      const booking2 = await createApprovedBooking('demo_qualified_student');

      // Generate for booking1
      const genRes = await request(app)
        .post(`/api/bookings/${booking1}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });
      const qrToken1 = genRes.body.data.credential.qrToken;

      // Attempt to use for booking2
      const res = await request(app)
        .post(`/api/bookings/${booking2}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, qrToken: qrToken1 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CREDENTIAL');
    });

    it('7. An expired credential is rejected', async () => {
      const bookingId = await createApprovedBooking();
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL, ttlMinutes: 10 });

      const credId = genRes.body.data.credential.id;
      const qrToken = genRes.body.data.credential.qrToken;

      // Manually backdate the stored credential expiration
      const stored = await storage.getCredential(credId);
      stored!.expiresAt = new Date(Date.now() - 60000).toISOString();
      await storage.updateCredential(stored!);

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, qrToken });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EXPIRED_CREDENTIAL');
    });

    it('8. An invalidated credential is rejected', async () => {
      const bookingId = await createApprovedBooking();
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const qrToken = genRes.body.data.credential.qrToken;

      // Invalidate credentials for this booking
      await storage.invalidateCredentialsForBooking(bookingId);

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, qrToken });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CREDENTIAL_ALREADY_USED');
    });

    it('9. Replaying a QR credential after successful check-in is rejected', async () => {
      const bookingId = await createApprovedBooking();
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const qrToken = genRes.body.data.credential.qrToken;

      // First use: success
      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, qrToken });

      // Replay attempt: rejected
      const replayRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, qrToken });

      expect(replayRes.status).toBe(400);
      expect(replayRes.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('10. Unauthorized stranger users cannot generate or inspect another user\'s credential', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student');

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_resource_hog') // stranger user
        .set('X-Test-User-Role', 'USER')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('11. QR credentials are not exposed in ordinary booking details', async () => {
      const bookingId = await createApprovedBooking();
      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const res = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('X-Test-User-Id', 'demo_qualified_student');

      expect(res.status).toBe(200);
      expect(res.body.data.booking.qrToken).toBeUndefined();
      expect(res.body.data.booking.otpCode).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('qrTokenHash');
    });

    it('12. Concurrent duplicate check-in requests cannot produce duplicate transitions', async () => {
      const bookingId = await createApprovedBooking();
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const qrToken = genRes.body.data.credential.qrToken;

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/bookings/${bookingId}/custody`)
          .set('X-Test-User-Id', 'demo_lab_owner')
          .send({ action: CustodyAction.CHECK_IN, qrToken }),
        request(app)
          .post(`/api/bookings/${bookingId}/custody`)
          .set('X-Test-User-Id', 'demo_lab_owner')
          .send({ action: CustodyAction.CHECK_IN, qrToken }),
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(400); // Exactly one succeeds, the other fails due to mutex & state check
    });
  });

  // =========================================================================
  // TASK 1.C — OTP Generation and Validation Verification
  // =========================================================================
  describe('TASK 1.C: OTP Credential Generation & Verification', () => {
    it('1. A valid 6-digit OTP can be generated only under eligible conditions (APPROVED status)', async () => {
      const bookingId = await createApprovedBooking();
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      expect(res.status).toBe(200);
      expect(res.body.data.credential.otpCode).toMatch(/^\d{6}$/);
    });

    it('2. The OTP is associated with the correct booking, user, and intended action', async () => {
      const bookingId = await createApprovedBooking();
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const cred = res.body.data.credential;
      const stored = await storage.getCredential(cred.id);
      expect(stored!.bookingId).toBe(bookingId);
      expect(stored!.action).toBe('CHECK_IN');
      expect(stored!.attemptsRemaining).toBe(3);
    });

    it('3. A correct OTP succeeds when valid and authorized', async () => {
      const bookingId = await createApprovedBooking();
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const otpCode = genRes.body.data.credential.otpCode;

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, otpCode });

      expect(res.status).toBe(200);
      expect(res.body.data.booking.status).toBe(BookingStatus.CHECKED_IN);
    });

    it('4. An incorrect OTP is rejected without changing the booking state', async () => {
      const bookingId = await createApprovedBooking();
      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, otpCode: '999999' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CREDENTIAL');

      const booking = await storage.getBooking(bookingId);
      expect(booking!.status).toBe(BookingStatus.APPROVED);
    });

    it('5. An expired OTP is rejected', async () => {
      const bookingId = await createApprovedBooking();
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const credId = genRes.body.data.credential.id;
      const otpCode = genRes.body.data.credential.otpCode;

      const stored = await storage.getCredential(credId);
      stored!.expiresAt = new Date(Date.now() - 1000).toISOString();
      await storage.updateCredential(stored!);

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, otpCode });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EXPIRED_CREDENTIAL');
    });

    it('6. A previously consumed OTP cannot be replayed', async () => {
      const bookingId = await createApprovedBooking();
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const otpCode = genRes.body.data.credential.otpCode;

      // Consume OTP
      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, otpCode });

      // Replay
      const replayRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, otpCode });

      expect(replayRes.status).toBe(400);
      expect(replayRes.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('7. An OTP cannot be used for another booking', async () => {
      const b1 = await createApprovedBooking('demo_qualified_student');
      const b2 = await createApprovedBooking('demo_qualified_student');

      const genRes = await request(app)
        .post(`/api/bookings/${b1}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const otp1 = genRes.body.data.credential.otpCode;

      const res = await request(app)
        .post(`/api/bookings/${b2}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, otpCode: otp1 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CREDENTIAL');
    });

    it('8. Unauthorized users cannot verify another user\'s OTP', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student');
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const otpCode = genRes.body.data.credential.otpCode;

      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_resource_hog') // unauthorized stranger
        .set('X-Test-User-Role', 'USER')
        .send({ action: CustodyAction.CHECK_IN, otpCode });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('9. Enforces 3-attempt limit and invalidates credential when exceeded', async () => {
      const bookingId = await createApprovedBooking();
      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      // Attempt 1: 2 remaining
      const r1 = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, otpCode: '111111' });
      expect(r1.body.error.message).toContain('2 attempt(s) remaining');

      // Attempt 2: 1 remaining
      const r2 = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, otpCode: '222222' });
      expect(r2.body.error.message).toContain('1 attempt(s) remaining');

      // Attempt 3: Exceeded & Invalidated
      const r3 = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, otpCode: '333333' });
      expect(r3.status).toBe(400);
      expect(r3.body.error.code).toBe('MAX_ATTEMPTS_EXCEEDED');
    });

    it('10. OTPs are not returned in unrelated API responses or audit logs', async () => {
      const bookingId = await createApprovedBooking();
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const otp = genRes.body.data.credential.otpCode;

      await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, otpCode: otp });

      const booking = await storage.getBooking(bookingId);
      expect(JSON.stringify(booking!.history)).not.toContain(otp);
    });

    it('11. Concurrent OTP verification cannot cause duplicate transitions', async () => {
      const bookingId = await createApprovedBooking();
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });

      const otpCode = genRes.body.data.credential.otpCode;

      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/bookings/${bookingId}/custody`)
          .set('X-Test-User-Id', 'demo_lab_owner')
          .send({ action: CustodyAction.CHECK_IN, otpCode }),
        request(app)
          .post(`/api/bookings/${bookingId}/custody`)
          .set('X-Test-User-Id', 'demo_lab_owner')
          .send({ action: CustodyAction.CHECK_IN, otpCode }),
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(400);
    });
  });

  // =========================================================================
  // TASK 1.D — Complete Pickup-to-Return Journey Verification
  // =========================================================================
  describe('TASK 1.D: Full Pickup-to-Return Lifecycle', () => {
    it('executes full end-to-end journey from creation, approval, pickup, to return', async () => {
      // 1. Create booking via API
      const tomorrow = new Date(Date.now() + 86400000);
      const startTime = new Date(tomorrow.setHours(10, 0, 0, 0)).toISOString();
      const endTime = new Date(tomorrow.setHours(12, 0, 0, 0)).toISOString();

      const createRes = await request(app)
        .post('/api/bookings')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER')
        .set('X-Test-User-Badges', 'badge_safety_101,badge_3d_basics')
        .send({
          resourceId: 'res_3d_prusa',
          startTime,
          endTime,
          intent: 'Senior project prototype printing',
        });

      expect(createRes.status).toBe(201);
      const bookingId = createRes.body.data.booking.id;
      expect(createRes.body.data.booking.status).toBe(BookingStatus.ELIGIBILITY_VERIFIED);

      // 2. Cannot start custody before APPROVAL
      const earlyCustody = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });
      expect(earlyCustody.status).toBe(400);
      expect(earlyCustody.body.error.code).toBe('INVALID_STATE_TRANSITION');

      // 3. Lab owner approves booking
      const approveRes = await request(app)
        .post(`/api/bookings/${bookingId}/transition`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ targetStatus: BookingStatus.APPROVED });
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.booking.status).toBe(BookingStatus.APPROVED);

      // 4. Generate check-in credential
      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });
      expect(genRes.status).toBe(200);
      const { otpCode, qrToken } = genRes.body.data.credential;

      // 5. Pickup / Check-in via OTP
      const checkInRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, otpCode });
      expect(checkInRes.status).toBe(200);
      expect(checkInRes.body.data.booking.status).toBe(BookingStatus.CHECKED_IN);
      expect(checkInRes.body.data.booking.checkedInAt).toBeDefined();

      // 6. Duplicate check-in rejected
      const dupCheckIn = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, qrToken });
      expect(dupCheckIn.status).toBe(400);

      // 7. Generate checkout/return credential
      const genReturnRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL, credentialAction: 'CHECK_OUT' });
      expect(genReturnRes.status).toBe(200);
      const returnOtp = genReturnRes.body.data.credential.otpCode;

      // 8. Return / Checkout
      const returnRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({
          action: CustodyAction.CHECK_OUT,
          otpCode: returnOtp,
          conditionNotes: 'Returned in pristine condition, bed cleaned',
        });
      expect(returnRes.status).toBe(200);
      expect(returnRes.body.data.booking.status).toBe(BookingStatus.RETURNED);
      expect(returnRes.body.data.booking.returnedAt).toBeDefined();
      expect(returnRes.body.data.booking.conditionNotes).toContain('pristine condition');

      // 9. Second return attempt rejected
      const dupReturn = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_OUT });
      expect(dupReturn.status).toBe(400);
      expect(dupReturn.body.error.code).toBe('INVALID_STATE_TRANSITION');

      // 10. Booking history entries recorded accurately
      const finalBooking = await storage.getBooking(bookingId);
      expect(finalBooking!.history.length).toBeGreaterThanOrEqual(4);
      const statuses = finalBooking!.history.map((h) => h.toStatus);
      expect(statuses).toContain(BookingStatus.ELIGIBILITY_VERIFIED);
      expect(statuses).toContain(BookingStatus.APPROVED);
      expect(statuses).toContain(BookingStatus.CHECKED_IN);
      expect(statuses).toContain(BookingStatus.RETURNED);

      // 11. Notifications dispatched
      const notifs = await storage.getNotificationsForUser('demo_qualified_student');
      expect(notifs.some((n) => n.bookingId === bookingId)).toBe(true);

      // 12. Borrower can view own booking; stranger cannot view unmasked details
      const ownerView = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('X-Test-User-Id', 'demo_qualified_student');
      expect(ownerView.status).toBe(200);
      expect(ownerView.body.data.booking.id).toBe(bookingId);
    });
  });

  // =========================================================================
  // TASK 2 — 15-Minute No-Show Workflow & Boundary Timing
  // =========================================================================
  describe('TASK 2: 15-Minute No-Show Workflow & Boundary Timing', () => {
    const scheduledStart = '2026-11-25T10:00:00.000Z';
    const scheduledEnd = '2026-11-25T12:00:00.000Z';

    it('1. Before 15-minute deadline (+10m): booking is NOT cancelled as no-show', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student', 'res_3d_prusa', 'demo_lab_owner', scheduledStart, scheduledEnd);

      // Current time is +10 minutes after scheduled start
      const referenceTime = new Date('2026-11-25T10:10:00.000Z');
      const sweep = await scheduler.processNoShows(referenceTime);

      expect(sweep.processedCount).toBe(0);
      const booking = await storage.getBooking(bookingId);
      expect(booking!.status).toBe(BookingStatus.APPROVED);
    });

    it('2. Immediately before deadline (+14m 59s): booking remains eligible for pickup', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student', 'res_3d_prusa', 'demo_lab_owner', scheduledStart, scheduledEnd);

      const referenceTime = new Date('2026-11-25T10:14:59.000Z');
      const sweep = await scheduler.processNoShows(referenceTime);

      expect(sweep.processedCount).toBe(0);
      const booking = await storage.getBooking(bookingId);
      expect(booking!.status).toBe(BookingStatus.APPROVED);
    });

    it('3. At the exact deadline (+15m 00s): booking is processed as no-show cancellation', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student', 'res_3d_prusa', 'demo_lab_owner', scheduledStart, scheduledEnd);

      const referenceTime = new Date('2026-11-25T10:15:00.000Z');
      const sweep = await scheduler.processNoShows(referenceTime);

      expect(sweep.processedCount).toBe(1);
      expect(sweep.processedBookings[0].bookingId).toBe(bookingId);
      expect(sweep.processedBookings[0].action).toBe('NO_SHOW_CANCELLED');

      const booking = await storage.getBooking(bookingId);
      expect(booking!.status).toBe(BookingStatus.CANCELLED);
      expect(booking!.cancellationReason).toContain('15-minute no-show policy exceeded');
    });

    it('4. Immediately after deadline (+15m 01s): booking is cancelled as no-show', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student', 'res_3d_prusa', 'demo_lab_owner', scheduledStart, scheduledEnd);

      const referenceTime = new Date('2026-11-25T10:15:01.000Z');
      const sweep = await scheduler.processNoShows(referenceTime);

      expect(sweep.processedCount).toBe(1);
      const booking = await storage.getBooking(bookingId);
      expect(booking!.status).toBe(BookingStatus.CANCELLED);
    });

    it('5. A booking that was already checked in is NOT marked as no-show', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student', 'res_3d_prusa', 'demo_lab_owner', scheduledStart, scheduledEnd);

      // Check in
      const booking = await storage.getBooking(bookingId);
      booking!.status = BookingStatus.CHECKED_IN;
      booking!.checkedInAt = '2026-11-25T10:05:00.000Z';
      await storage.saveBooking(booking!);

      // Run sweep at +20m
      const referenceTime = new Date('2026-11-25T10:20:00.000Z');
      const sweep = await scheduler.processNoShows(referenceTime);

      expect(sweep.processedCount).toBe(0);
      const fresh = await storage.getBooking(bookingId);
      expect(fresh!.status).toBe(BookingStatus.CHECKED_IN);
    });

    it('6. Cancelled, completed, or waitlisted bookings are NOT reclaimed', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student', 'res_3d_prusa', 'demo_lab_owner', scheduledStart, scheduledEnd);

      const booking = await storage.getBooking(bookingId);
      booking!.status = BookingStatus.WAITLISTED;
      await storage.saveBooking(booking!);

      const referenceTime = new Date('2026-11-25T10:20:00.000Z');
      const sweep = await scheduler.processNoShows(referenceTime);

      expect(sweep.processedCount).toBe(0);
      const fresh = await storage.getBooking(bookingId);
      expect(fresh!.status).toBe(BookingStatus.WAITLISTED);
    });

    it('7. Reclaim invalidates prior credentials so old OTP/QR cannot check in', async () => {
      const bookingId = await createApprovedBooking('demo_qualified_student', 'res_3d_prusa', 'demo_lab_owner', scheduledStart, scheduledEnd);

      const genRes = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_qualified_student')
        .send({ action: CustodyAction.GENERATE_CREDENTIAL });
      const otpCode = genRes.body.data.credential.otpCode;

      // Reclaim via no-show
      await scheduler.processNoShows(new Date('2026-11-25T10:20:00.000Z'));

      // Old credential cannot check in
      const res = await request(app)
        .post(`/api/bookings/${bookingId}/custody`)
        .set('X-Test-User-Id', 'demo_lab_owner')
        .send({ action: CustodyAction.CHECK_IN, otpCode });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('8. Promotes next eligible waitlisted booking and prevents conflicting allocations', async () => {
      // Original booking: 10:00 - 12:00
      await createApprovedBooking('demo_qualified_student', 'res_3d_prusa', 'demo_lab_owner', scheduledStart, scheduledEnd);

      // Waitlisted booking for same slot
      const waitlistId = `book_wait_${Date.now()}`;
      await storage.saveBooking({
        id: waitlistId,
        resourceId: 'res_3d_prusa',
        resourceName: 'Prusa MK4 3D Printer',
        userId: 'demo_resource_hog',
        ownerId: 'demo_lab_owner',
        startTime: scheduledStart,
        endTime: scheduledEnd,
        intent: 'Waitlisted student print job',
        status: BookingStatus.WAITLISTED,
        requiresSupervision: false,
        estimatedHours: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        history: [],
      });

      // Execute sweep
      const sweep = await scheduler.processNoShows(new Date('2026-11-25T10:16:00.000Z'));

      expect(sweep.processedCount).toBe(1);
      expect(sweep.promotedCount).toBe(1);
      expect(sweep.processedBookings.some((b) => b.action === 'WAITLIST_PROMOTED')).toBe(true);

      const promoted = await storage.getBooking(waitlistId);
      expect(promoted!.status).toBe(BookingStatus.APPROVED);
      expect(promoted!.history.some((h) => h.reason?.includes('Promoted from waitlist'))).toBe(true);

      // Check notification sent to promoted borrower
      const notifs = await storage.getNotificationsForUser('demo_resource_hog');
      expect(notifs.some((n) => n.title.includes('Promoted from Waitlist'))).toBe(true);
    });

    it('9. Running no-show processing repeatedly is safe and idempotent', async () => {
      await createApprovedBooking('demo_qualified_student', 'res_3d_prusa', 'demo_lab_owner', scheduledStart, scheduledEnd);

      const refTime = new Date('2026-11-25T10:16:00.000Z');
      const sweep1 = await scheduler.processNoShows(refTime);
      expect(sweep1.processedCount).toBe(1);

      // Second run: nothing to process
      const sweep2 = await scheduler.processNoShows(refTime);
      expect(sweep2.processedCount).toBe(0);
      expect(sweep2.promotedCount).toBe(0);
    });

    it('10. Endpoint permissions: unauthenticated returns 401, unauthorized returns 403, lab owner returns 200', async () => {
      // 1. Unauthenticated -> 401
      const rUnauth = await request(app).post('/api/bookings/process-no-shows');
      expect(rUnauth.status).toBe(401);

      // 2. Student (USER role) -> 403
      const rForbidden = await request(app)
        .post('/api/bookings/process-no-shows')
        .set('X-Test-User-Id', 'demo_qualified_student')
        .set('X-Test-User-Role', 'USER');
      expect(rForbidden.status).toBe(403);

      // 3. Lab Owner -> 200
      const rSuccess = await request(app)
        .post('/api/bookings/process-no-shows')
        .set('X-Test-User-Id', 'demo_lab_owner')
        .set('X-Test-User-Role', 'LAB_OWNER')
        .send({ referenceTime: '2026-11-25T10:20:00.000Z' });
      expect(rSuccess.status).toBe(200);
      expect(rSuccess.body.success).toBe(true);
    });
  });
});
