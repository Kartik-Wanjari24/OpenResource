import crypto from 'node:crypto';
import type {
  Booking,
  CustodyCredential,
  CustodyAction,
  BookingHistoryEntry,
} from '../types/booking.js';
import { BookingStatus, UserRole } from '../types/booking.js';
import { StorageAdapter } from '../adapters/storage.adapter.js';
import type { IStorageAdapter } from '../types/storage.interface.js';
import { AppError, ErrorCode } from '../utils/errors.js';
import type { AuthenticatedUser } from '../middleware/auth.js';
import {
  MinimalNotificationDispatcher,
  BookingEventType,
} from './notification.interface.js';

export interface GeneratedCredentialResult {
  id: string;
  bookingId: string;
  action: CustodyAction;
  otpCode: string;
  qrToken: string;
  expiresAt: string;
  attemptsRemaining: number;
}

export class CustodyService {
  private storage: IStorageAdapter;
  private notificationDispatcher: MinimalNotificationDispatcher;

  constructor() {
    this.storage = StorageAdapter.getInstance();
    this.notificationDispatcher = MinimalNotificationDispatcher.getInstance();
  }

  /**
   * Compute a secure SHA-256 hash of a code/token
   */
  private hashSecret(secret: string): string {
    return crypto.createHash('sha256').update(secret.trim()).digest('hex');
  }

  /**
   * Constant-time comparison between two hex hashes to prevent timing attacks
   */
  private verifyHash(submittedSecret: string, storedHash: string): boolean {
    const submittedHash = this.hashSecret(submittedSecret);
    const bufA = Buffer.from(submittedHash, 'hex');
    const bufB = Buffer.from(storedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Action: GENERATE_CREDENTIAL
   * Generates short-lived, unpredictable 6-digit OTP and opaque QR token.
   * Only the hash is stored; raw secrets are returned only to the authorized caller.
   */
  public async generateCredential(
    bookingId: string,
    action: CustodyAction,
    user: AuthenticatedUser,
    ttlMinutes = 10
  ): Promise<GeneratedCredentialResult> {
    const booking = await this.storage.getBooking(bookingId);
    if (!booking) {
      throw new AppError(404, ErrorCode.BOOKING_NOT_FOUND, `Booking with ID '${bookingId}' not found`);
    }

    const isBorrower = booking.userId === user.id;
    const resource = await this.storage.getResource(booking.resourceId);
    const isOwner = resource ? resource.ownerId === user.id : booking.ownerId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isBorrower && !isOwner && !isAdmin) {
      throw new AppError(
        403,
        ErrorCode.FORBIDDEN,
        'You do not have permission to generate custody credentials for this booking'
      );
    }

    // Verify booking state matches intended custody action
    if (action === 'CHECK_IN' && booking.status !== BookingStatus.APPROVED) {
      throw new AppError(
        400,
        ErrorCode.INVALID_STATE_TRANSITION,
        `Cannot generate check-in credential for booking in status '${booking.status}'. Expected status 'APPROVED'.`
      );
    }

    if (action === 'CHECK_OUT' && booking.status !== BookingStatus.CHECKED_IN) {
      throw new AppError(
        400,
        ErrorCode.INVALID_STATE_TRANSITION,
        `Cannot generate check-out credential for booking in status '${booking.status}'. Expected status 'CHECKED_IN'.`
      );
    }

    // Invalidate any previously active credentials for this action
    await this.storage.invalidateCredentialsForBooking(bookingId, action);

    // Cryptographically secure 6-digit OTP and opaque QR verification token
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const qrToken = crypto.randomBytes(24).toString('base64url');

    const otpHash = this.hashSecret(otpCode);
    const qrTokenHash = this.hashSecret(qrToken);

    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
    const credentialId = `cred_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const credential: CustodyCredential = {
      id: credentialId,
      bookingId,
      userId: booking.userId,
      action,
      otpHash,
      qrTokenHash,
      expiresAt,
      attemptsRemaining: 3,
      isUsed: false,
      createdAt: new Date().toISOString(),
    };

    await this.storage.saveCredential(credential);

    return {
      id: credentialId,
      bookingId,
      action,
      otpCode,
      qrToken,
      expiresAt,
      attemptsRemaining: credential.attemptsRemaining,
    };
  }

  /**
   * Action: CHECK_IN
   * Validates OTP or QR token and performs atomic transition to CHECKED_IN.
   */
  public async checkIn(
    bookingId: string,
    input: { otpCode?: string; qrToken?: string },
    user: AuthenticatedUser
  ): Promise<Booking> {
    const booking = await this.storage.getBooking(bookingId);
    if (!booking) {
      throw new AppError(404, ErrorCode.BOOKING_NOT_FOUND, `Booking with ID '${bookingId}' not found`);
    }

    const isBorrower = booking.userId === user.id;
    const resource = await this.storage.getResource(booking.resourceId);
    const isOwner = resource ? resource.ownerId === user.id : booking.ownerId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isBorrower && !isOwner && !isAdmin) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Unauthorized to perform check-in on this booking');
    }

    if (booking.status === BookingStatus.CHECKED_IN) {
      throw new AppError(400, ErrorCode.INVALID_STATE_TRANSITION, 'Booking is already checked in');
    }

    if (booking.status !== BookingStatus.APPROVED) {
      throw new AppError(
        400,
        ErrorCode.INVALID_STATE_TRANSITION,
        `Cannot check in booking in status '${booking.status}'. Expected status 'APPROVED'.`
      );
    }

    if (!input.otpCode && !input.qrToken) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Either otpCode or qrToken is required for check-in verification'
      );
    }

    return await this.storage.withResourceLock(booking.resourceId, async () => {
      // Re-fetch inside resource lock
      const latestBooking = await this.storage.getBooking(bookingId);
      if (!latestBooking || latestBooking.status !== BookingStatus.APPROVED) {
        throw new AppError(
          400,
          ErrorCode.INVALID_STATE_TRANSITION,
          `Booking is not in APPROVED status (current: ${latestBooking?.status})`
        );
      }

      const activeCred = await this.storage.getLatestCredentialForBooking(bookingId, 'CHECK_IN');
      if (!activeCred) {
        throw new AppError(
          400,
          ErrorCode.INVALID_CREDENTIAL,
          'No active check-in credential found for this booking. Please generate a new one.'
        );
      }

      // Check max attempts
      if (activeCred.attemptsRemaining <= 0) {
        throw new AppError(
          400,
          ErrorCode.MAX_ATTEMPTS_EXCEEDED,
          'Maximum verification attempts exceeded. Credential has been invalidated.'
        );
      }

      // Check reuse
      if (activeCred.isUsed) {
        throw new AppError(400, ErrorCode.CREDENTIAL_ALREADY_USED, 'Credential has already been used');
      }

      // Check expiration
      if (new Date(activeCred.expiresAt).getTime() < Date.now()) {
        throw new AppError(
          400,
          ErrorCode.EXPIRED_CREDENTIAL,
          'Verification credential has expired. Please generate a new one.'
        );
      }

      // Match OTP or QR token
      let matched = false;
      if (input.otpCode && this.verifyHash(input.otpCode, activeCred.otpHash)) {
        matched = true;
      } else if (input.qrToken && this.verifyHash(input.qrToken, activeCred.qrTokenHash)) {
        matched = true;
      }

      if (!matched) {
        activeCred.attemptsRemaining -= 1;
        await this.storage.updateCredential(activeCred);

        if (activeCred.attemptsRemaining <= 0) {
          throw new AppError(
            400,
            ErrorCode.MAX_ATTEMPTS_EXCEEDED,
            'Invalid verification credential. Maximum attempts exceeded. Credential invalidated.'
          );
        }

        throw new AppError(
          400,
          ErrorCode.INVALID_CREDENTIAL,
          `Invalid verification credential. ${activeCred.attemptsRemaining} attempt(s) remaining.`
        );
      }

      // Mark credential used
      const nowIso = new Date().toISOString();
      activeCred.isUsed = true;
      activeCred.usedAt = nowIso;
      activeCred.usedBy = user.id;
      await this.storage.updateCredential(activeCred);

      // Transition booking
      const previousStatus = latestBooking.status;
      latestBooking.status = BookingStatus.CHECKED_IN;
      latestBooking.checkedInAt = nowIso;
      latestBooking.checkedInBy = user.id;

      const historyEntry: BookingHistoryEntry = {
        id: `hist_${Date.now()}_custody_in`,
        bookingId: latestBooking.id,
        fromStatus: previousStatus,
        toStatus: BookingStatus.CHECKED_IN,
        timestamp: nowIso,
        actorId: user.id,
        actorRole: user.role,
        notes: 'Custody check-in verified successfully via one-time credential',
      };

      latestBooking.history = latestBooking.history || [];
      latestBooking.history.push(historyEntry);

      await this.storage.saveBooking(latestBooking);

      // Dispatch event
      this.notificationDispatcher.dispatch({
        type: BookingEventType.CHECKED_IN,
        bookingId: latestBooking.id,
        recipientUserId: isBorrower ? latestBooking.ownerId : latestBooking.userId,
        title: 'Resource Checked In',
        message: `${user.name} checked in ${latestBooking.resourceName || 'the resource'}.`,
        timestamp: nowIso,
      });

      return latestBooking;
    });
  }

  /**
   * Action: CHECK_OUT
   * Validates return condition and transitions booking to RETURNED.
   */
  public async checkOut(
    bookingId: string,
    input: { otpCode?: string; qrToken?: string; conditionNotes?: string; incidentFlag?: boolean },
    user: AuthenticatedUser
  ): Promise<Booking> {
    const booking = await this.storage.getBooking(bookingId);
    if (!booking) {
      throw new AppError(404, ErrorCode.BOOKING_NOT_FOUND, `Booking with ID '${bookingId}' not found`);
    }

    const isBorrower = booking.userId === user.id;
    const resource = await this.storage.getResource(booking.resourceId);
    const isOwner = resource ? resource.ownerId === user.id : booking.ownerId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isBorrower && !isOwner && !isAdmin) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Unauthorized to perform check-out on this booking');
    }

    if (booking.status === BookingStatus.RETURNED || booking.status === BookingStatus.COMPLETED) {
      throw new AppError(400, ErrorCode.INVALID_STATE_TRANSITION, 'Booking has already been returned');
    }

    if (booking.status !== BookingStatus.CHECKED_IN) {
      throw new AppError(
        400,
        ErrorCode.INVALID_STATE_TRANSITION,
        `Cannot return booking in status '${booking.status}'. Expected status 'CHECKED_IN'.`
      );
    }

    return await this.storage.withResourceLock(booking.resourceId, async () => {
      const latestBooking = await this.storage.getBooking(bookingId);
      if (!latestBooking || latestBooking.status !== BookingStatus.CHECKED_IN) {
        throw new AppError(
          400,
          ErrorCode.INVALID_STATE_TRANSITION,
          `Booking is not in CHECKED_IN status (current: ${latestBooking?.status})`
        );
      }

      // If a credential was supplied or generated for checkout, verify it
      const activeCred = await this.storage.getLatestCredentialForBooking(bookingId, 'CHECK_OUT');
      if (activeCred && (input.otpCode || input.qrToken)) {
        if (new Date(activeCred.expiresAt).getTime() < Date.now()) {
          throw new AppError(
            400,
            ErrorCode.EXPIRED_CREDENTIAL,
            'Check-out credential has expired. Please generate a new one.'
          );
        }

        let matched = false;
        if (input.otpCode && this.verifyHash(input.otpCode, activeCred.otpHash)) matched = true;
        if (input.qrToken && this.verifyHash(input.qrToken, activeCred.qrTokenHash)) matched = true;

        if (!matched) {
          activeCred.attemptsRemaining -= 1;
          await this.storage.updateCredential(activeCred);
          throw new AppError(
            400,
            ErrorCode.INVALID_CREDENTIAL,
            `Invalid check-out credential. ${Math.max(0, activeCred.attemptsRemaining)} attempt(s) remaining.`
          );
        }

        activeCred.isUsed = true;
        activeCred.usedAt = new Date().toISOString();
        activeCred.usedBy = user.id;
        await this.storage.updateCredential(activeCred);
      }

      // Invalidate any remaining credentials for this booking
      await this.storage.invalidateCredentialsForBooking(bookingId);

      const nowIso = new Date().toISOString();
      const previousStatus = latestBooking.status;
      const targetStatus = input.incidentFlag
        ? BookingStatus.INCIDENT_FLAGGED
        : BookingStatus.RETURNED;

      latestBooking.status = targetStatus;
      latestBooking.returnedAt = nowIso;
      latestBooking.returnedBy = user.id;
      if (input.conditionNotes) {
        latestBooking.conditionNotes = input.conditionNotes;
        if (input.incidentFlag) {
          latestBooking.incidentNotes = input.conditionNotes;
        }
      }

      const historyEntry: BookingHistoryEntry = {
        id: `hist_${Date.now()}_custody_out`,
        bookingId: latestBooking.id,
        fromStatus: previousStatus,
        toStatus: targetStatus,
        timestamp: nowIso,
        actorId: user.id,
        actorRole: user.role,
        notes: input.conditionNotes || 'Custody return completed',
      };

      latestBooking.history = latestBooking.history || [];
      latestBooking.history.push(historyEntry);

      await this.storage.saveBooking(latestBooking);

      // Dispatch event
      this.notificationDispatcher.dispatch({
        type: input.incidentFlag ? BookingEventType.INCIDENT_FLAGGED : BookingEventType.RETURNED,
        bookingId: latestBooking.id,
        recipientUserId: isBorrower ? latestBooking.ownerId : latestBooking.userId,
        title: input.incidentFlag ? 'Resource Return Flagged' : 'Resource Returned',
        message: `${user.name} processed return for ${latestBooking.resourceName || 'the resource'}.`,
        timestamp: nowIso,
      });

      return latestBooking;
    });
  }
}
