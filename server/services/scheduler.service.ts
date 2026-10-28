import type {
  BookingHistoryEntry,
} from '../types/booking.js';
import { BookingStatus } from '../types/booking.js';
import { StorageAdapter } from '../adapters/storage.adapter.js';
import type { IStorageAdapter } from '../types/storage.interface.js';
import {
  MinimalNotificationDispatcher,
  BookingEventType,
} from './notification.interface.js';

export interface NoShowSweepResult {
  processedCount: number;
  promotedCount: number;
  processedBookings: Array<{
    bookingId: string;
    resourceId: string;
    action: 'NO_SHOW_CANCELLED' | 'WAITLIST_PROMOTED';
    details?: string;
  }>;
}

export class SchedulerService {
  private static instance: SchedulerService;
  private storage: IStorageAdapter;
  private notificationDispatcher: MinimalNotificationDispatcher;
  private timer: NodeJS.Timeout | null = null;
  public static readonly GRACE_PERIOD_MS = 15 * 60 * 1000; // 15 minutes

  private constructor() {
    this.storage = StorageAdapter.getInstance();
    this.notificationDispatcher = MinimalNotificationDispatcher.getInstance();
  }

  public static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService();
    }
    return SchedulerService.instance;
  }

  /**
   * Helper: Check if two time ranges overlap [startA, endA) and [startB, endB)
   */
  private hasTimeOverlap(
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
   * Execute 15-minute no-show processing and waitlist promotion.
   * Can accept a referenceTime for deterministic testing.
   */
  public async processNoShows(referenceTime?: Date): Promise<NoShowSweepResult> {
    const now = referenceTime ? new Date(referenceTime) : new Date();
    const result: NoShowSweepResult = {
      processedCount: 0,
      promotedCount: 0,
      processedBookings: [],
    };

    const allBookings = await this.storage.getAllBookings();

    // Identify candidate bookings: APPROVED, checkedInAt == null, and now >= startTime + 15 min
    const noShowCandidates = allBookings.filter((b) => {
      if (b.status !== BookingStatus.APPROVED || b.checkedInAt) {
        return false;
      }
      const scheduledStart = new Date(b.startTime).getTime();
      return now.getTime() >= scheduledStart + SchedulerService.GRACE_PERIOD_MS;
    });

    for (const candidate of noShowCandidates) {
      await this.storage.withResourceLock(candidate.resourceId, async () => {
        // Re-verify candidate inside mutex lock
        const fresh = await this.storage.getBooking(candidate.id);
        if (!fresh || fresh.status !== BookingStatus.APPROVED || fresh.checkedInAt) {
          return;
        }

        const nowIso = now.toISOString();

        // 1. Cancel the no-show booking
        fresh.status = BookingStatus.CANCELLED;
        fresh.cancellationReason =
          '15-minute no-show policy exceeded: borrower failed to check in within grace period';

        const cancelHistory: BookingHistoryEntry = {
          id: `hist_${Date.now()}_noshow_${Math.random().toString(36).substring(2, 6)}`,
          bookingId: fresh.id,
          fromStatus: BookingStatus.APPROVED,
          toStatus: BookingStatus.CANCELLED,
          timestamp: nowIso,
          actorId: 'system_scheduler',
          actorRole: 'SYSTEM',
          reason: '15-minute no-show policy exceeded',
          notes: 'Slot automatically reclaimed by system scheduler',
        };

        fresh.history = fresh.history || [];
        fresh.history.push(cancelHistory);

        // Invalidate any generated check-in credentials
        await this.storage.invalidateCredentialsForBooking(fresh.id);
        await this.storage.saveBooking(fresh);

        result.processedCount++;
        result.processedBookings.push({
          bookingId: fresh.id,
          resourceId: fresh.resourceId,
          action: 'NO_SHOW_CANCELLED',
          details: `Reclaimed slot from ${fresh.startTime} to ${fresh.endTime}`,
        });

        // Dispatch no-show event
        this.notificationDispatcher.dispatch({
          type: BookingEventType.NO_SHOW_CANCELLED,
          bookingId: fresh.id,
          recipientUserId: fresh.userId,
          title: 'Booking Cancelled (No-Show)',
          message: `Your booking for ${fresh.resourceName || 'the resource'} was cancelled because check-in was not completed within the 15-minute grace period.`,
          timestamp: nowIso,
        });

        // 2. Waitlist Promotion: Find candidate waitlisted bookings for the same resource
        const activeStatuses: readonly BookingStatus[] = [
          BookingStatus.APPROVED,
          BookingStatus.CHECKED_IN,
        ];

        const currentAllBookings = await this.storage.getAllBookings();
        const waitlistCandidates = currentAllBookings
          .filter((b) => b.resourceId === fresh.resourceId && b.status === BookingStatus.WAITLISTED)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        for (const waitlisted of waitlistCandidates) {
          // Check if this waitlisted booking conflicts with any other confirmed booking
          const hasConflict = currentAllBookings.some(
            (other) =>
              other.id !== waitlisted.id &&
              other.resourceId === waitlisted.resourceId &&
              activeStatuses.includes(other.status) &&
              this.hasTimeOverlap(waitlisted.startTime, waitlisted.endTime, other.startTime, other.endTime)
          );

          if (!hasConflict) {
            // Promote waitlisted booking to APPROVED!
            waitlisted.status = BookingStatus.APPROVED;

            const promoteHistory: BookingHistoryEntry = {
              id: `hist_${Date.now()}_promoted_${Math.random().toString(36).substring(2, 6)}`,
              bookingId: waitlisted.id,
              fromStatus: BookingStatus.WAITLISTED,
              toStatus: BookingStatus.APPROVED,
              timestamp: nowIso,
              actorId: 'system_scheduler',
              actorRole: 'SYSTEM',
              reason: 'Promoted from waitlist after prior booking no-show cancellation',
              notes: 'Slot opened due to 15-minute no-show policy',
            };

            waitlisted.history = waitlisted.history || [];
            waitlisted.history.push(promoteHistory);

            await this.storage.saveBooking(waitlisted);

            result.promotedCount++;
            result.processedBookings.push({
              bookingId: waitlisted.id,
              resourceId: waitlisted.resourceId,
              action: 'WAITLIST_PROMOTED',
              details: `Promoted waitlisted request for ${waitlisted.startTime} to ${waitlisted.endTime}`,
            });

            // Dispatch waitlist promotion event
            this.notificationDispatcher.dispatch({
              type: BookingEventType.WAITLIST_PROMOTED,
              bookingId: waitlisted.id,
              recipientUserId: waitlisted.userId,
              title: 'Promoted from Waitlist!',
              message: `A slot opened up! Your booking for ${waitlisted.resourceName || 'the resource'} is now APPROVED.`,
              timestamp: nowIso,
            });

            // Promote at most one waitlisted booking per reclaimed slot iteration
            break;
          }
        }
      });
    }

    return result;
  }

  /**
   * Start recurring background worker
   */
  public start(intervalMs = 60000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.processNoShows().catch((err) => {
        console.error('Error running no-show scheduler sweep:', err);
      });
    }, intervalMs);
    // Unref timer so Node process does not hang in tests or shutdown
    this.timer.unref();
  }

  /**
   * Stop recurring background worker
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Check if recurring background worker is currently active
   */
  public isRunning(): boolean {
    return this.timer !== null;
  }
}
