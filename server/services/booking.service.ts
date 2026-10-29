import type {
  Booking,
  BookingHistoryEntry,
  CreateBookingInput,
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

export class BookingService {
  private storage: IStorageAdapter;
  private notificationDispatcher: MinimalNotificationDispatcher;

  constructor() {
    this.storage = StorageAdapter.getInstance();
    this.notificationDispatcher = MinimalNotificationDispatcher.getInstance();
  }

  /**
   * Helper: Check if two time ranges overlap [startA, endA) and [startB, endB)
   */
  public hasTimeOverlap(
    startA: string | Date,
    endA: string | Date,
    startB: string | Date,
    endB: string | Date
  ): boolean {
    const sA = new Date(startA).getTime();
    const eA = new Date(endA).getTime();
    const sB = new Date(startB).getTime();
    const eB = new Date(endB).getTime();

    return sA < eB && sB < eA;
  }

  /**
   * Calculate user's usage for a resource in the current calendar week (Monday 00:00 to now/Sunday)
   */
  public async calculateWeeklyUsage(userId: string, resourceId: string): Promise<number> {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0);

    const countedStatuses: readonly BookingStatus[] = [
      BookingStatus.REQUESTED,
      BookingStatus.ELIGIBILITY_VERIFIED,
      BookingStatus.APPROVED,
      BookingStatus.CHECKED_IN,
      BookingStatus.COMPLETED,
    ];

    const allBookings = await this.storage.getAllBookings();
    const userBookings = allBookings.filter(
      (b) =>
        b.userId === userId &&
        b.resourceId === resourceId &&
        countedStatuses.includes(b.status) &&
        new Date(b.startTime) >= weekStart
    );

    return userBookings.reduce((sum, b) => sum + (b.estimatedHours || 0), 0);
  }

  /**
   * POST /api/bookings - Create a booking request
   */
  public async createBooking(
    input: CreateBookingInput,
    user: AuthenticatedUser
  ): Promise<Booking> {
    const { resourceId, startTime, endTime, intent, requiresSupervision, notes } = input;

    // 1. Required field validation
    if (!resourceId || typeof resourceId !== 'string' || resourceId.trim() === '') {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'resourceId is required', [
        { field: 'resourceId', message: 'Field is required' },
      ]);
    }
    if (!startTime || typeof startTime !== 'string') {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'startTime is required', [
        { field: 'startTime', message: 'Field is required' },
      ]);
    }
    if (!endTime || typeof endTime !== 'string') {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'endTime is required', [
        { field: 'endTime', message: 'Field is required' },
      ]);
    }
    if (!intent || typeof intent !== 'string' || intent.trim().length < 5) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'intent must be a descriptive string of at least 5 characters',
        [{ field: 'intent', message: 'Must be at least 5 characters' }]
      );
    }

    // 2. Timestamp format and range validation
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid ISO date format for startTime or endTime');
    }

    if (startDate >= endDate) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'endTime must be strictly after startTime');
    }

    // Privacy & Hardening: Prevent bookings in the distant past
    if (endDate.getTime() < Date.now() - 5 * 60 * 1000) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Cannot create bookings for past time slots');
    }

    const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
    if (durationHours > 24) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Single booking duration cannot exceed 24 hours');
    }

    // 3. Resource existence verification
    const resource = await this.storage.getResource(resourceId);
    if (!resource) {
      throw new AppError(404, ErrorCode.RESOURCE_NOT_FOUND, `Resource with ID '${resourceId}' not found`);
    }

    // 4. Concurrency-safe slot and quota assessment under resource mutex lock
    return await this.storage.withResourceLock(resourceId, async () => {
      const activeStatuses: readonly BookingStatus[] = [
        BookingStatus.APPROVED,
        BookingStatus.CHECKED_IN,
      ];

      // Check for overlapping confirmed (APPROVED or CHECKED_IN) bookings
      const allBookings = await this.storage.getAllBookings();
      const conflictingBookings = allBookings.filter(
        (b) =>
          b.resourceId === resourceId &&
          activeStatuses.includes(b.status) &&
          this.hasTimeOverlap(startDate, endDate, b.startTime, b.endTime)
      );

      const hasConflict = conflictingBookings.length > 0;

      // Check weekly usage cap
      const currentWeeklyHours = await this.calculateWeeklyUsage(user.id, resourceId);
      const wouldExceedQuota = currentWeeklyHours + durationHours > resource.weeklyUsageCap;

      // Determine initial booking status
      let initialStatus: BookingStatus = BookingStatus.REQUESTED;
      let statusNote = 'Booking request submitted for review';

      if (hasConflict) {
        initialStatus = BookingStatus.WAITLISTED;
        statusNote = 'Placed on waitlist due to slot contention with confirmed booking';
      } else if (wouldExceedQuota) {
        initialStatus = BookingStatus.WAITLISTED;
        statusNote = `Weekly usage cap exceeded (${currentWeeklyHours + durationHours}h / ${resource.weeklyUsageCap}h max). Placed on waitlist.`;
      } else {
        // Eligibility badge verification
        const userBadges = user.badges || [];
        const missingBadges = resource.requiredBadgeIds.filter((b) => !userBadges.includes(b));
        if (missingBadges.length === 0) {
          initialStatus = BookingStatus.ELIGIBILITY_VERIFIED;
          statusNote = 'Safety badge qualification verified';
        } else {
          statusNote = `Safety badge verification pending (missing: ${missingBadges.join(', ')})`;
        }
      }

      const bookingId = `book_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const nowIso = new Date().toISOString();

      const initialHistory: BookingHistoryEntry = {
        id: `hist_${Date.now()}_1`,
        bookingId,
        fromStatus: BookingStatus.REQUESTED,
        toStatus: initialStatus,
        timestamp: nowIso,
        actorId: user.id,
        actorRole: user.role,
        notes: statusNote,
      };

      const newBooking: Booking = {
        id: bookingId,
        resourceId,
        resourceName: resource.name,
        userId: user.id,
        ownerId: resource.ownerId,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        intent: intent.trim(),
        status: initialStatus,
        requiresSupervision: requiresSupervision ?? false,
        estimatedHours: Math.round(durationHours * 10) / 10,
        createdAt: nowIso,
        updatedAt: nowIso,
        history: [initialHistory],
      };

      await this.storage.saveBooking(newBooking);

      // Event hook dispatch for notification subscribers
      this.notificationDispatcher.dispatch({
        type:
          initialStatus === BookingStatus.WAITLISTED
            ? BookingEventType.WAITLIST_PLACED
            : BookingEventType.BOOKING_REQUESTED,
        bookingId,
        recipientUserId: initialStatus === BookingStatus.WAITLISTED ? user.id : resource.ownerId,
        title: initialStatus === BookingStatus.WAITLISTED ? 'Waitlist Placement' : 'New Booking Request',
        message:
          initialStatus === BookingStatus.WAITLISTED
            ? `Your request for ${resource.name} is waitlisted.`
            : `${user.name} submitted a booking request for ${resource.name}.`,
        metadata: { resourceId, startTime, endTime, notes },
        timestamp: nowIso,
      });

      return newBooking;
    });
  }

  /**
   * POST /api/bookings/:id/transition - Validate and execute a state transition
   */
  public async transitionBooking(
    bookingId: string,
    targetStatus: BookingStatus,
    actor: AuthenticatedUser,
    reason?: string,
    notes?: string
  ): Promise<Booking> {
    const booking = await this.storage.getBooking(bookingId);
    if (!booking) {
      throw new AppError(404, ErrorCode.BOOKING_NOT_FOUND, `Booking with ID '${bookingId}' not found`);
    }

    const resource = await this.storage.getResource(booking.resourceId);
    // Explicit ownership: strictly check that the actor owns this specific resource
    const isOwner = resource ? resource.ownerId === actor.id : booking.ownerId === actor.id;
    const isBorrower = booking.userId === actor.id;
    const isAdmin = actor.role === UserRole.ADMIN;

    // Allowed transition map
    const allowedTransitions: Record<BookingStatus, BookingStatus[]> = {
      [BookingStatus.REQUESTED]: [
        BookingStatus.ELIGIBILITY_VERIFIED,
        BookingStatus.APPROVED,
        BookingStatus.REJECTED,
        BookingStatus.WAITLISTED,
        BookingStatus.CANCELLED,
      ],
      [BookingStatus.ELIGIBILITY_VERIFIED]: [
        BookingStatus.APPROVED,
        BookingStatus.REJECTED,
        BookingStatus.WAITLISTED,
        BookingStatus.CANCELLED,
      ],
      [BookingStatus.WAITLISTED]: [
        BookingStatus.REQUESTED,
        BookingStatus.ELIGIBILITY_VERIFIED,
        BookingStatus.APPROVED,
        BookingStatus.CANCELLED,
      ],
      [BookingStatus.APPROVED]: [
        BookingStatus.CHECKED_IN,
        BookingStatus.CANCELLED,
        BookingStatus.REJECTED,
      ],
      [BookingStatus.CHECKED_IN]: [
        BookingStatus.RETURNED,
        BookingStatus.INCIDENT_FLAGGED,
      ],
      [BookingStatus.RETURNED]: [
        BookingStatus.COMPLETED,
        BookingStatus.INCIDENT_FLAGGED,
      ],
      [BookingStatus.INCIDENT_FLAGGED]: [
        BookingStatus.COMPLETED,
        BookingStatus.RETURNED,
      ],
      [BookingStatus.COMPLETED]: [],
      [BookingStatus.CANCELLED]: [],
      [BookingStatus.REJECTED]: [],
    };

    const validTargets = allowedTransitions[booking.status] || [];
    if (!validTargets.includes(targetStatus)) {
      throw new AppError(
        400,
        ErrorCode.INVALID_STATE_TRANSITION,
        `Cannot transition booking from '${booking.status}' to '${targetStatus}'. Allowed: [${validTargets.join(', ')}]`
      );
    }

    // Role-based permission checks: Only the actual owner or admin can approve/reject
    if (targetStatus === BookingStatus.APPROVED) {
      if (!isOwner && !isAdmin) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'Only the resource owner or an administrator can approve booking requests'
        );
      }
    } else if (targetStatus === BookingStatus.REJECTED) {
      if (!isOwner && !isAdmin) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'Only the resource owner or an administrator can reject bookings'
        );
      }
    } else if (targetStatus === BookingStatus.CANCELLED) {
      if (!isBorrower && !isOwner && !isAdmin) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'You do not have permission to cancel this booking'
        );
      }
    } else if (targetStatus === BookingStatus.COMPLETED) {
      if (!isOwner && !isAdmin) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'Only the resource owner or administrator can mark a booking as COMPLETED'
        );
      }
    } else if (targetStatus === BookingStatus.CHECKED_IN || targetStatus === BookingStatus.RETURNED) {
      if (!isAdmin) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          `Direct transition to '${targetStatus}' is prohibited. Custody operations must use the custody verification endpoint.`
        );
      }
    } else if (targetStatus === BookingStatus.ELIGIBILITY_VERIFIED || targetStatus === BookingStatus.WAITLISTED) {
      if (!isOwner && !isAdmin) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          `Only resource owners or administrators can set status to ${targetStatus}`
        );
      }
    }

    // Execute atomic transition under per-resource mutex lock
    return await this.storage.withResourceLock(booking.resourceId, async () => {
      // Re-fetch latest booking state inside lock
      const latestBooking = await this.storage.getBooking(bookingId);
      if (!latestBooking) {
        throw new AppError(404, ErrorCode.BOOKING_NOT_FOUND, 'Booking not found');
      }

      // If transitioning to APPROVED: Strict concurrency conflict check
      if (targetStatus === BookingStatus.APPROVED) {
        const activeStatuses: readonly BookingStatus[] = [
          BookingStatus.APPROVED,
          BookingStatus.CHECKED_IN,
        ];

        const allBookings = await this.storage.getAllBookings();
        const conflictingBookings = allBookings.filter(
          (b) =>
            b.id !== bookingId &&
            b.resourceId === latestBooking.resourceId &&
            activeStatuses.includes(b.status) &&
            this.hasTimeOverlap(latestBooking.startTime, latestBooking.endTime, b.startTime, b.endTime)
        );

        if (conflictingBookings.length > 0) {
          throw new AppError(
            409,
            ErrorCode.CONFLICT,
            `Cannot approve booking: resource is already booked for an overlapping time slot by booking ${conflictingBookings[0].id}`
          );
        }
      }

      const previousStatus = latestBooking.status;
      latestBooking.status = targetStatus;
      if (reason) {
        if (targetStatus === BookingStatus.REJECTED) {
          latestBooking.rejectionReason = reason;
        } else if (targetStatus === BookingStatus.CANCELLED) {
          latestBooking.cancellationReason = reason;
        }
      }

      const historyEntry: BookingHistoryEntry = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        bookingId: latestBooking.id,
        fromStatus: previousStatus,
        toStatus: targetStatus,
        timestamp: new Date().toISOString(),
        actorId: actor.id,
        actorRole: actor.role,
        reason,
        notes,
      };

      latestBooking.history = latestBooking.history || [];
      latestBooking.history.push(historyEntry);

      await this.storage.saveBooking(latestBooking);

      // Dispatch domain event
      let eventType: BookingEventType | null = null;
      if (targetStatus === BookingStatus.APPROVED) eventType = BookingEventType.BOOKING_APPROVED;
      else if (targetStatus === BookingStatus.REJECTED) eventType = BookingEventType.BOOKING_REJECTED;
      else if (targetStatus === BookingStatus.CANCELLED) eventType = BookingEventType.BOOKING_CANCELLED;
      else if (targetStatus === BookingStatus.INCIDENT_FLAGGED) eventType = BookingEventType.INCIDENT_FLAGGED;

      if (eventType) {
        const recipientUserId = isBorrower ? latestBooking.ownerId : latestBooking.userId;
        this.notificationDispatcher.dispatch({
          type: eventType,
          bookingId: latestBooking.id,
          recipientUserId,
          title: `Booking ${targetStatus}`,
          message: `Booking ${latestBooking.id} is now ${targetStatus}. ${reason || ''}`.trim(),
          timestamp: new Date().toISOString(),
        });
      }

      return latestBooking;
    });
  }

  /**
   * GET /api/bookings - List accessible bookings with privacy masking
   */
  public async getBookings(
    filter: {
      resourceId?: string;
      userId?: string;
      status?: BookingStatus;
      startDate?: string;
      endDate?: string;
    },
    requestingUser?: AuthenticatedUser
  ): Promise<Booking[]> {
    let bookings = await this.storage.getAllBookings();

    if (filter.resourceId) {
      bookings = bookings.filter((b) => b.resourceId === filter.resourceId);
    }
    if (filter.userId) {
      bookings = bookings.filter((b) => b.userId === filter.userId);
    }
    if (filter.status) {
      bookings = bookings.filter((b) => b.status === filter.status);
    }
    if (filter.startDate) {
      const s = new Date(filter.startDate).getTime();
      bookings = bookings.filter((b) => new Date(b.endTime).getTime() >= s);
    }
    if (filter.endDate) {
      const e = new Date(filter.endDate).getTime();
      bookings = bookings.filter((b) => new Date(b.startTime).getTime() <= e);
    }

    return await Promise.all(bookings.map((b) => this.applyPrivacyMasking(b, requestingUser)));
  }

  /**
   * GET /api/bookings/:id - Retrieve single booking with privacy masking
   */
  public async getBookingById(bookingId: string, requestingUser?: AuthenticatedUser): Promise<Booking> {
    const booking = await this.storage.getBooking(bookingId);
    if (!booking) {
      throw new AppError(404, ErrorCode.BOOKING_NOT_FOUND, `Booking with ID '${bookingId}' not found`);
    }

    return await this.applyPrivacyMasking(booking, requestingUser);
  }

  /**
   * Apply PII masking rules based on role and relationship to the booking
   */
  public async applyPrivacyMasking(booking: Booking, requestingUser?: AuthenticatedUser): Promise<Booking> {
    const borrowerUser = await this.storage.getUser(booking.userId);
    const cloned: Booking = JSON.parse(JSON.stringify(booking));

    const isSelf = requestingUser && requestingUser.id === booking.userId;
    // Hardening: isOwner is true ONLY if requestingUser is the actual owner of this specific booking's resource
    const isOwner = requestingUser && requestingUser.id === booking.ownerId;
    const isAdmin = requestingUser && requestingUser.role === UserRole.ADMIN;
    const isAuditor = requestingUser && requestingUser.role === UserRole.AUDITOR;

    if (borrowerUser) {
      if (isSelf || isAdmin) {
        cloned.borrower = this.storage.getFullBorrowerProfile(borrowerUser);
      } else if (isOwner) {
        const full = this.storage.getFullBorrowerProfile(borrowerUser);
        cloned.borrower = {
          ...full,
          phone: full.phone ? `***-***-${full.phone.slice(-4)}` : undefined,
        };
      } else if (isAuditor) {
        const full = this.storage.getFullBorrowerProfile(borrowerUser);
        cloned.borrower = {
          id: full.id,
          name: full.name,
          email: `${full.name.toLowerCase().replace(/\s+/g, '.')}@audit-masked.org`,
          role: full.role,
          badges: full.badges,
        };
      } else {
        // Public / other students / owners of unrelated resources: strictly masked
        cloned.borrower = this.storage.maskBorrowerProfile(borrowerUser);
      }
    }

    // Hardening: Restrict internal history, notes, and cancellation reasons to authorized roles
    if (!isSelf && !isOwner && !isAdmin && !isAuditor) {
      cloned.history = undefined;
      cloned.checkedInBy = undefined;
      cloned.returnedBy = undefined;
      cloned.conditionNotes = undefined;
      cloned.incidentNotes = undefined;
      cloned.rejectionReason = undefined;
      cloned.cancellationReason = undefined;
    }

    return cloned;
  }

  /**
   * GET /api/bookings/user/:userId - Member 1 integration point
   */
  public async getUserSummary(
    targetUserId: string,
    requestingUser?: AuthenticatedUser
  ): Promise<{
    bookings: Booking[];
    weeklyUsage: Record<string, number>;
    weekStartDate: string;
  }> {
    // Permission check: Students can only access their own booking summary
    const isSelf = requestingUser && requestingUser.id === targetUserId;
    const isOwnerOrAdmin =
      requestingUser &&
      (requestingUser.role === UserRole.LAB_OWNER ||
        requestingUser.role === UserRole.ADMIN ||
        requestingUser.role === UserRole.AUDITOR);

    if (requestingUser && !isSelf && !isOwnerOrAdmin) {
      throw new AppError(
        403,
        ErrorCode.FORBIDDEN,
        "You do not have permission to view another user's booking history"
      );
    }

    const now = new Date();
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const weekStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0);

    const allBookings = await this.storage.getAllBookings();
    const userBookings = allBookings.filter((b) => b.userId === targetUserId);

    const usageStatuses: readonly BookingStatus[] = [
      BookingStatus.APPROVED,
      BookingStatus.CHECKED_IN,
      BookingStatus.COMPLETED,
    ];

    const weeklyUsage: Record<string, number> = {};
    userBookings.forEach((b) => {
      if (
        new Date(b.startTime) >= weekStartDate &&
        usageStatuses.includes(b.status)
      ) {
        weeklyUsage[b.resourceId] = (weeklyUsage[b.resourceId] || 0) + (b.estimatedHours || 0);
      }
    });

    return {
      bookings: await Promise.all(userBookings.map((b) => this.applyPrivacyMasking(b, requestingUser))),
      weeklyUsage,
      weekStartDate: weekStartDate.toISOString(),
    };
  }
}
