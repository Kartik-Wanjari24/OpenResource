// OpenResource - Member 2 Storage Interface
import type {
  Booking,
  StoredResource,
  BorrowerProfile,
  MaskedBorrowerProfile,
  CustodyCredential,
  CustodyAction,
} from '../types/booking.js';
import type { NotificationRecord } from '../services/notification.interface.js';
import type { AuthenticatedUser } from '../middleware/auth.js';

export interface IStorageAdapter {
  // Concurrency & Mutex
  withResourceLock<T>(resourceId: string, fn: () => Promise<T>): Promise<T>;

  // Resources
  getResource(id: string): Promise<StoredResource | undefined> | StoredResource | undefined;
  getAllResources(): Promise<StoredResource[]> | StoredResource[];
  saveResource(resource: StoredResource): Promise<void> | void;

  // Users
  getUser(id: string): Promise<AuthenticatedUser | undefined> | AuthenticatedUser | undefined;
  saveUser(user: AuthenticatedUser): Promise<void> | void;
  maskBorrowerProfile(user: AuthenticatedUser): MaskedBorrowerProfile;
  getFullBorrowerProfile(user: AuthenticatedUser): BorrowerProfile;

  // Bookings
  getBooking(id: string): Promise<Booking | undefined> | Booking | undefined;
  getAllBookings(): Promise<Booking[]> | Booking[];
  saveBooking(booking: Booking): Promise<Booking> | Booking;
  deleteBooking(id: string): Promise<boolean> | boolean;

  // Custody Credentials
  saveCredential(credential: CustodyCredential): Promise<void> | void;
  getCredential(id: string): Promise<CustodyCredential | undefined> | CustodyCredential | undefined;
  getLatestCredentialForBooking(
    bookingId: string,
    action: CustodyAction
  ): Promise<CustodyCredential | undefined> | CustodyCredential | undefined;
  updateCredential(credential: CustodyCredential): Promise<void> | void;
  invalidateCredentialsForBooking(bookingId: string, action?: CustodyAction): Promise<void> | void;

  // Notifications
  saveNotification(notification: NotificationRecord, idempotencyKey?: string): Promise<boolean> | boolean;
  getNotification(id: string): Promise<NotificationRecord | undefined> | NotificationRecord | undefined;
  getNotificationsForUser(userId: string): Promise<NotificationRecord[]> | NotificationRecord[];
  markNotificationRead(id: string, userId: string): Promise<NotificationRecord | null> | NotificationRecord | null;
  markAllNotificationsRead(userId: string): Promise<number> | number;

  // State Management
  resetStore(): Promise<void> | void;
  close?(): Promise<void>;
}
