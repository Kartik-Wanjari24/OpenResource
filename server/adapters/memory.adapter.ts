import type {
  Booking,
  StoredResource,
  BorrowerProfile,
  MaskedBorrowerProfile,
  CustodyCredential,
  CustodyAction,
} from '../types/booking.js';
import { BookingStatus } from '../types/booking.js';
import type { NotificationRecord } from '../services/notification.interface.js';
import { BookingEventType } from '../services/notification.interface.js';
import type { AuthenticatedUser } from '../middleware/auth.js';
import { KNOWN_PERSONAS } from '../middleware/auth.js';
import type { IStorageAdapter } from '../types/storage.interface.js';

/**
 * InMemoryStorageAdapter
 *
 * Isolated in-memory data store with atomic per-resource mutex locking.
 * Used for fast unit testing and zero-dependency local development fallback.
 */
export class InMemoryStorageAdapter implements IStorageAdapter {
  private static instance: InMemoryStorageAdapter;

  private bookings: Map<string, Booking> = new Map();
  private resources: Map<string, StoredResource> = new Map();
  private users: Map<string, AuthenticatedUser> = new Map();
  private credentials: Map<string, CustodyCredential> = new Map();
  private notifications: Map<string, NotificationRecord> = new Map();
  private idempotencyKeys: Set<string> = new Set();

  // Resource-level mutex queues
  private resourceLocks: Map<string, Promise<void>> = new Map();

  constructor() {
    this.seedInitialData();
  }

  public static getInstance(): InMemoryStorageAdapter {
    if (!InMemoryStorageAdapter.instance) {
      InMemoryStorageAdapter.instance = new InMemoryStorageAdapter();
    }
    return InMemoryStorageAdapter.instance;
  }

  public resetStore(): void {
    this.bookings.clear();
    this.resources.clear();
    this.users.clear();
    this.credentials.clear();
    this.notifications.clear();
    this.idempotencyKeys.clear();
    this.resourceLocks.clear();
    this.seedInitialData();
  }

  private seedInitialData(): void {
    // Seed users from canonical personas
    Object.values(KNOWN_PERSONAS).forEach((user) => {
      this.users.set(user.id, { ...user });
    });

    // Seed canonical resources matching team contract
    const defaultResources: StoredResource[] = [
      {
        id: 'res_3d_prusa',
        name: '3D Printer - Prusa MK4',
        ownerId: 'demo_lab_owner',
        category: 'THREE_D_PRINTING',
        weeklyUsageCap: 10,
        requiredBadgeIds: ['badge_safety_101', 'badge_3d_basics'],
      },
      {
        id: 'res_laser_epilog',
        name: 'Laser Cutter - Epilog Fusion Pro',
        ownerId: 'demo_lab_owner',
        category: 'LASER_CUTTING',
        weeklyUsageCap: 5,
        requiredBadgeIds: ['badge_safety_101', 'badge_laser_cert'],
      },
      {
        id: 'res_cnc_tormach',
        name: 'CNC Mill - Tormach 1100',
        ownerId: 'demo_lab_owner',
        category: 'CNC_MACHINING',
        weeklyUsageCap: 8,
        requiredBadgeIds: ['badge_safety_101', 'badge_cnc_basics'],
      },
      {
        id: 'res_3d_bambu',
        name: '3D Printer - Bambu Lab X1',
        ownerId: 'demo_lab_owner',
        category: 'THREE_D_PRINTING',
        weeklyUsageCap: 15,
        requiredBadgeIds: ['badge_safety_101', 'badge_3d_basics'],
      },
      {
        id: 'res_elec_bench',
        name: 'Electronics Lab Bench',
        ownerId: 'demo_lab_owner',
        category: 'ELECTRONICS_LAB',
        weeklyUsageCap: 20,
        requiredBadgeIds: ['badge_safety_101'],
      },
    ];

    defaultResources.forEach((res) => this.resources.set(res.id, res));

    // Seed sample booking for independent verification
    const now = new Date();
    const futureStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 10, 0, 0);
    const futureEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 12, 0, 0);

    const seedBooking1: Booking = {
      id: 'book_demo_101',
      resourceId: 'res_3d_prusa',
      resourceName: '3D Printer - Prusa MK4',
      userId: 'demo_qualified_student',
      ownerId: 'demo_lab_owner',
      startTime: futureStart.toISOString(),
      endTime: futureEnd.toISOString(),
      intent: 'Robotics capstone gear prototype 3D print',
      status: BookingStatus.APPROVED,
      estimatedHours: 2,
      createdAt: new Date(now.getTime() - 86400000).toISOString(),
      updatedAt: new Date(now.getTime() - 43200000).toISOString(),
      history: [
        {
          id: 'hist_seed_1',
          bookingId: 'book_demo_101',
          fromStatus: BookingStatus.REQUESTED,
          toStatus: BookingStatus.ELIGIBILITY_VERIFIED,
          timestamp: new Date(now.getTime() - 80000000).toISOString(),
          actorId: 'system',
          actorRole: 'SYSTEM',
          notes: 'Eligibility checked',
        },
        {
          id: 'hist_seed_2',
          bookingId: 'book_demo_101',
          fromStatus: BookingStatus.ELIGIBILITY_VERIFIED,
          toStatus: BookingStatus.APPROVED,
          timestamp: new Date(now.getTime() - 43200000).toISOString(),
          actorId: 'demo_lab_owner',
          actorRole: 'LAB_OWNER',
          reason: 'Approved for capstone project',
        },
      ],
    };

    this.bookings.set(seedBooking1.id, seedBooking1);

    // Seed sample notifications
    const seedNotif1: NotificationRecord = {
      id: 'notif_seed_1',
      recipientUserId: 'demo_lab_owner',
      bookingId: 'book_demo_101',
      type: BookingEventType.BOOKING_REQUESTED,
      title: 'New Booking Request',
      message: 'Alice Chen submitted a booking request for 3D Printer - Prusa MK4.',
      read: false,
      metadata: { resourceId: 'res_3d_prusa' },
      createdAt: new Date(now.getTime() - 86400000).toISOString(),
    };

    const seedNotif2: NotificationRecord = {
      id: 'notif_seed_2',
      recipientUserId: 'demo_qualified_student',
      bookingId: 'book_demo_101',
      type: BookingEventType.BOOKING_APPROVED,
      title: 'Booking Approved',
      message: 'Your booking for 3D Printer - Prusa MK4 has been approved by Dr. Sarah Martinez.',
      read: false,
      metadata: { resourceId: 'res_3d_prusa' },
      createdAt: new Date(now.getTime() - 43200000).toISOString(),
    };

    this.notifications.set(seedNotif1.id, seedNotif1);
    this.notifications.set(seedNotif2.id, seedNotif2);
  }

  // --- Mutex Locking ---
  public async withResourceLock<T>(resourceId: string, fn: () => Promise<T>): Promise<T> {
    const currentLock = this.resourceLocks.get(resourceId) || Promise.resolve();

    let releaseLock: () => void = () => {};
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    this.resourceLocks.set(
      resourceId,
      currentLock.then(() => nextLock, () => nextLock)
    );

    try {
      await currentLock;
      return await fn();
    } finally {
      releaseLock();
    }
  }

  // --- Resource Operations ---
  public getResource(id: string): StoredResource | undefined {
    return this.resources.get(id);
  }

  public getAllResources(): StoredResource[] {
    return Array.from(this.resources.values());
  }

  public saveResource(resource: StoredResource): void {
    this.resources.set(resource.id, { ...resource });
  }

  // --- User Operations & Masking ---
  public getUser(id: string): AuthenticatedUser | undefined {
    return this.users.get(id);
  }

  public saveUser(user: AuthenticatedUser): void {
    this.users.set(user.id, { ...user });
  }

  public maskBorrowerProfile(user: AuthenticatedUser): MaskedBorrowerProfile {
    const names = user.name.split(' ');
    const maskedName = names.length > 1 ? `${names[0]} ${names[1][0]}.` : names[0];
    return {
      id: user.id,
      name: maskedName,
      role: user.role,
      isMasked: true,
    };
  }

  public getFullBorrowerProfile(user: AuthenticatedUser): BorrowerProfile {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      studentId: user.studentId,
      badges: user.badges,
    };
  }

  // --- Booking Operations ---
  public getBooking(id: string): Booking | undefined {
    const b = this.bookings.get(id);
    if (!b) return undefined;
    return JSON.parse(JSON.stringify(b));
  }

  public getAllBookings(): Booking[] {
    return Array.from(this.bookings.values()).map((b) => JSON.parse(JSON.stringify(b)));
  }

  public saveBooking(booking: Booking): Booking {
    const clone: Booking = JSON.parse(JSON.stringify(booking));
    clone.updatedAt = new Date().toISOString();
    this.bookings.set(clone.id, clone);
    return clone;
  }

  public deleteBooking(id: string): boolean {
    return this.bookings.delete(id);
  }

  // --- Custody Credential Operations ---
  public saveCredential(credential: CustodyCredential): void {
    this.credentials.set(credential.id, { ...credential });
  }

  public getCredential(id: string): CustodyCredential | undefined {
    const cred = this.credentials.get(id);
    if (!cred) return undefined;
    return { ...cred };
  }

  public getLatestCredentialForBooking(
    bookingId: string,
    action: CustodyAction
  ): CustodyCredential | undefined {
    let latest: CustodyCredential | undefined;
    for (const cred of this.credentials.values()) {
      if (cred.bookingId === bookingId && cred.action === action) {
        if (!latest || new Date(cred.createdAt).getTime() > new Date(latest.createdAt).getTime()) {
          latest = { ...cred };
        }
      }
    }
    return latest;
  }

  public updateCredential(credential: CustodyCredential): void {
    this.credentials.set(credential.id, { ...credential });
  }

  public invalidateCredentialsForBooking(bookingId: string, action?: CustodyAction): void {
    for (const [id, cred] of this.credentials.entries()) {
      if (cred.bookingId === bookingId && (!action || cred.action === action)) {
        cred.isUsed = true;
        this.credentials.set(id, cred);
      }
    }
  }

  // --- Notification Operations ---
  public saveNotification(notification: NotificationRecord, idempotencyKey?: string): boolean {
    if (idempotencyKey) {
      if (this.idempotencyKeys.has(idempotencyKey)) {
        return false;
      }
      this.idempotencyKeys.add(idempotencyKey);
    }

    this.notifications.set(notification.id, { ...notification });
    return true;
  }

  public getNotification(id: string): NotificationRecord | undefined {
    const notif = this.notifications.get(id);
    return notif ? { ...notif } : undefined;
  }

  public getNotificationsForUser(userId: string): NotificationRecord[] {
    const results: NotificationRecord[] = [];
    for (const notif of this.notifications.values()) {
      if (notif.recipientUserId === userId) {
        results.push({ ...notif });
      }
    }
    return results.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public markNotificationRead(id: string, userId: string): NotificationRecord | null {
    const notif = this.notifications.get(id);
    if (!notif) return null;
    if (notif.recipientUserId !== userId) return null;

    notif.read = true;
    notif.readAt = new Date().toISOString();
    this.notifications.set(id, notif);
    return { ...notif };
  }

  public markAllNotificationsRead(userId: string): number {
    let count = 0;
    const nowIso = new Date().toISOString();
    for (const notif of this.notifications.values()) {
      if (notif.recipientUserId === userId && !notif.read) {
        notif.read = true;
        notif.readAt = nowIso;
        count++;
      }
    }
    return count;
  }
}
