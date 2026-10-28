// OpenResource - Member 2 Notification Interface & Event Contracts (Phase 4)

export const BookingEventType = {
  BOOKING_REQUESTED: 'BOOKING_REQUESTED',
  BOOKING_APPROVED: 'BOOKING_APPROVED',
  BOOKING_REJECTED: 'BOOKING_REJECTED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  WAITLIST_PLACED: 'WAITLIST_PLACED',
  CHECKED_IN: 'CHECKED_IN',
  RETURNED: 'RETURNED',
  INCIDENT_FLAGGED: 'INCIDENT_FLAGGED',
  NO_SHOW_CANCELLED: 'NO_SHOW_CANCELLED',
  WAITLIST_PROMOTED: 'WAITLIST_PROMOTED',
} as const;

export type BookingEventType = (typeof BookingEventType)[keyof typeof BookingEventType];

export interface BookingEventPayload {
  type: BookingEventType;
  bookingId: string;
  recipientUserId: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  idempotencyKey?: string;
}

export interface NotificationRecord {
  id: string;
  recipientUserId: string;
  type: BookingEventType;
  title: string;
  message: string;
  read: boolean;
  readAt?: string;
  bookingId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationDispatcher {
  dispatch(event: BookingEventPayload): void;
}

/**
 * In-memory notification event dispatcher with subscriber hooks
 */
export class MinimalNotificationDispatcher implements NotificationDispatcher {
  private static instance: MinimalNotificationDispatcher;
  private listeners: Array<(event: BookingEventPayload) => void> = [];

  public static getInstance(): MinimalNotificationDispatcher {
    if (!MinimalNotificationDispatcher.instance) {
      MinimalNotificationDispatcher.instance = new MinimalNotificationDispatcher();
    }
    return MinimalNotificationDispatcher.instance;
  }

  public subscribe(listener: (event: BookingEventPayload) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public dispatch(event: BookingEventPayload): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Notification dispatch listener error:', err);
      }
    }
  }
}
