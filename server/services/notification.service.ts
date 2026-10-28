import type {
  BookingEventPayload,
  NotificationRecord,
} from './notification.interface.js';
import { MinimalNotificationDispatcher } from './notification.interface.js';
import { StorageAdapter } from '../adapters/storage.adapter.js';
import type { IStorageAdapter } from '../types/storage.interface.js';
import { AppError, ErrorCode } from '../utils/errors.js';

export interface GetNotificationsOptions {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export interface PaginatedNotificationsResult {
  notifications: NotificationRecord[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

export class NotificationService {
  private static instance: NotificationService;
  private storage: IStorageAdapter;
  private dispatcher: MinimalNotificationDispatcher;

  // Window-based deduplication cache: dedupKey -> timestamp
  private recentEvents: Map<string, number> = new Map();

  private constructor() {
    this.storage = StorageAdapter.getInstance();
    this.dispatcher = MinimalNotificationDispatcher.getInstance();

    // Subscribe to domain event dispatcher
    this.dispatcher.subscribe((event: BookingEventPayload) => {
      this.handleDomainEvent(event);
    });
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Internal event handler subscribed to domain events.
   * Wrapped in try/catch to ensure notification failures never crash booking operations.
   */
  public handleDomainEvent(event: BookingEventPayload): NotificationRecord | null {
    try {
      // 1. Build deterministic idempotency key
      const idempotencyKey =
        event.idempotencyKey ||
        `idem_${event.bookingId}_${event.type}_${event.recipientUserId}`;

      // 2. Check 30-second rapid deduplication window
      const now = Date.now();
      const lastFired = this.recentEvents.get(idempotencyKey);
      if (lastFired && now - lastFired < 30000) {
        return null; // Suppress duplicate
      }
      this.recentEvents.set(idempotencyKey, now);

      // 3. Sanitize metadata (strictly prevent leaking OTPs, credentials, or private info)
      const safeMetadata: Record<string, unknown> = {};
      if (event.metadata) {
        const allowedKeys = ['resourceId', 'resourceName', 'startTime', 'endTime', 'reason', 'notes'];
        for (const key of allowedKeys) {
          if (event.metadata[key] !== undefined) {
            safeMetadata[key] = event.metadata[key];
          }
        }
      }

      const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const record: NotificationRecord = {
        id: notificationId,
        recipientUserId: event.recipientUserId,
        type: event.type,
        title: event.title,
        message: event.message,
        read: false,
        bookingId: event.bookingId,
        metadata: Object.keys(safeMetadata).length > 0 ? safeMetadata : undefined,
        createdAt: event.timestamp || new Date().toISOString(),
      };

      const saved = this.storage.saveNotification(record, idempotencyKey);
      if (typeof saved === 'boolean' && !saved) {
        return null;
      }
      if (saved && typeof (saved as Promise<boolean>).catch === 'function') {
        (saved as Promise<boolean>).catch((err) => {
          console.error('Failed to asynchronously persist notification to postgres:', err);
        });
      }

      return record;
    } catch (err) {
      console.error('Failed to create notification from domain event:', err);
      return null;
    }
  }

  /**
   * GET /api/notifications - List authenticated user's notifications (newest first, paginated)
   */
  public async getNotificationsForUser(
    userId: string,
    options: GetNotificationsOptions = {}
  ): Promise<PaginatedNotificationsResult> {
    let list = await this.storage.getNotificationsForUser(userId);

    const totalUnread = list.filter((n) => !n.read).length;

    if (options.unreadOnly) {
      list = list.filter((n) => !n.read);
    }

    const total = list.length;
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 20));

    const startIndex = (page - 1) * limit;
    const paginatedItems = list.slice(startIndex, startIndex + limit);

    return {
      notifications: paginatedItems,
      total,
      unreadCount: totalUnread,
      page,
      limit,
    };
  }

  /**
   * PATCH /api/notifications/:id/read - Mark single notification as read
   */
  public async markAsRead(notificationId: string, requestingUserId: string): Promise<NotificationRecord> {
    const notif = await this.storage.getNotification(notificationId);
    if (!notif) {
      throw new AppError(
        404,
        ErrorCode.RESOURCE_NOT_FOUND,
        `Notification with ID '${notificationId}' not found`
      );
    }

    if (notif.recipientUserId !== requestingUserId) {
      throw new AppError(
        403,
        ErrorCode.FORBIDDEN,
        'You do not have permission to mark another user\'s notification as read'
      );
    }

    const updated = await this.storage.markNotificationRead(notificationId, requestingUserId);
    if (!updated) {
      throw new AppError(404, ErrorCode.RESOURCE_NOT_FOUND, 'Notification not found');
    }

    return updated;
  }

  /**
   * POST /api/notifications/read-all - Mark all of user's notifications as read
   */
  public async markAllAsRead(requestingUserId: string): Promise<{ markedCount: number }> {
    const markedCount = await this.storage.markAllNotificationsRead(requestingUserId);
    return { markedCount };
  }
}
