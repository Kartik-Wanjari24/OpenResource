import pg from 'pg';
import type {
  Booking,
  StoredResource,
  BorrowerProfile,
  MaskedBorrowerProfile,
  CustodyCredential,
  CustodyAction,
  BookingHistoryEntry,
} from '../types/booking.js';
import type { NotificationRecord } from '../services/notification.interface.js';
import type { AuthenticatedUser } from '../middleware/auth.js';
import { KNOWN_PERSONAS } from '../middleware/auth.js';
import type { IStorageAdapter } from '../types/storage.interface.js';
import { AppError, ErrorCode } from '../utils/errors.js';

export interface PostgresStorageConfig {
  connectionString: string;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export class PostgresStorageAdapter implements IStorageAdapter {
  private static instance: PostgresStorageAdapter | null = null;
  private pool: pg.Pool;

  constructor(config: PostgresStorageConfig) {
    this.pool = new pg.Pool({
      connectionString: config.connectionString,
      max: config.maxConnections || 10,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 5000,
    });

    this.pool.on('error', (err) => {
      console.error('[PostgresStorage] Unexpected error on idle database client:', err.message);
    });
  }

  public static getInstance(config?: PostgresStorageConfig): PostgresStorageAdapter {
    if (!PostgresStorageAdapter.instance) {
      const connStr = config?.connectionString || process.env.DATABASE_URL;
      if (!connStr) {
        throw new AppError(
          500,
          ErrorCode.INTERNAL_ERROR,
          'Cannot initialize PostgresStorageAdapter: DATABASE_URL environment variable is not defined.'
        );
      }
      PostgresStorageAdapter.instance = new PostgresStorageAdapter({
        connectionString: connStr,
        ...config,
      });
    }
    return PostgresStorageAdapter.instance;
  }

  public static setInstance(adapter: PostgresStorageAdapter | null): void {
    PostgresStorageAdapter.instance = adapter;
  }

  public async close(): Promise<void> {
    await this.pool.end();
    PostgresStorageAdapter.instance = null;
  }

  /**
   * Health check verifying actual connection to database
   */
  public async testConnection(): Promise<boolean> {
    try {
      const res = await this.pool.query('SELECT 1 as alive');
      return res.rows[0]?.alive === 1;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError(
        500,
        ErrorCode.INTERNAL_ERROR,
        `PostgreSQL connection verification failed: ${msg}`
      );
    }
  }

  /**
   * Generates a 32-bit signed integer hash from string for pg_advisory_lock
   */
  private hashKey(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }

  // --- Mutex Locking via PostgreSQL Advisory Locks ---
  public async withResourceLock<T>(resourceId: string, fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const lockKey = this.hashKey(`res_lock_${resourceId}`);
    try {
      await client.query('SELECT pg_advisory_lock($1)', [lockKey]);
      try {
        return await fn();
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
      }
    } finally {
      client.release();
    }
  }

  // --- Resource Operations ---
  public async getResource(id: string): Promise<StoredResource | undefined> {
    const res = await this.pool.query(
      `SELECT id, name, owner_id, category, weekly_usage_cap, required_badge_ids
       FROM resources WHERE id = $1`,
      [id]
    );
    if (res.rows.length === 0) return undefined;
    const row = res.rows[0];
    return {
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      category: row.category,
      weeklyUsageCap: parseFloat(row.weekly_usage_cap),
      requiredBadgeIds: row.required_badge_ids || [],
    };
  }

  public async getAllResources(): Promise<StoredResource[]> {
    const res = await this.pool.query(
      `SELECT id, name, owner_id, category, weekly_usage_cap, required_badge_ids
       FROM resources ORDER BY name ASC`
    );
    return res.rows.map((row) => ({
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      category: row.category,
      weeklyUsageCap: parseFloat(row.weekly_usage_cap),
      requiredBadgeIds: row.required_badge_ids || [],
    }));
  }

  public async saveResource(resource: StoredResource): Promise<void> {
    await this.pool.query(
      `INSERT INTO resources (id, name, owner_id, category, weekly_usage_cap, required_badge_ids)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         owner_id = EXCLUDED.owner_id,
         category = EXCLUDED.category,
         weekly_usage_cap = EXCLUDED.weekly_usage_cap,
         required_badge_ids = EXCLUDED.required_badge_ids`,
      [
        resource.id,
        resource.name,
        resource.ownerId,
        resource.category,
        resource.weeklyUsageCap,
        resource.requiredBadgeIds,
      ]
    );
  }

  // --- User Operations ---
  public async getUser(id: string): Promise<AuthenticatedUser | undefined> {
    const res = await this.pool.query(
      `SELECT id, name, email, role, phone, student_id, badges
       FROM users WHERE id = $1`,
      [id]
    );
    if (res.rows.length === 0) return undefined;
    const row = res.rows[0];
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      phone: row.phone || undefined,
      studentId: row.student_id || undefined,
      badges: row.badges || [],
    };
  }

  public async saveUser(user: AuthenticatedUser): Promise<void> {
    await this.pool.query(
      `INSERT INTO users (id, name, email, role, phone, student_id, badges)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         role = EXCLUDED.role,
         phone = EXCLUDED.phone,
         student_id = EXCLUDED.student_id,
         badges = EXCLUDED.badges`,
      [
        user.id,
        user.name,
        user.email,
        user.role,
        user.phone || null,
        user.studentId || null,
        user.badges || [],
      ]
    );
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
  public async getBooking(id: string): Promise<Booking | undefined> {
    const bRes = await this.pool.query(
      `SELECT b.*, u.name as borrower_name, u.email as borrower_email, u.phone as borrower_phone,
              u.student_id as borrower_student_id, u.badges as borrower_badges, u.role as borrower_role
       FROM bookings b
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.id = $1`,
      [id]
    );
    if (bRes.rows.length === 0) return undefined;
    const row = bRes.rows[0];

    const hRes = await this.pool.query(
      `SELECT id, booking_id, from_status, to_status, timestamp, actor_id, actor_role, reason, notes
       FROM booking_history
       WHERE booking_id = $1 ORDER BY timestamp ASC`,
      [id]
    );

    return this.mapBookingRow(row, hRes.rows);
  }

  public async getAllBookings(): Promise<Booking[]> {
    const bRes = await this.pool.query(
      `SELECT b.*, u.name as borrower_name, u.email as borrower_email, u.phone as borrower_phone,
              u.student_id as borrower_student_id, u.badges as borrower_badges, u.role as borrower_role
       FROM bookings b
       LEFT JOIN users u ON b.user_id = u.id
       ORDER BY b.start_time ASC`
    );

    if (bRes.rows.length === 0) return [];

    const hRes = await this.pool.query(
      `SELECT id, booking_id, from_status, to_status, timestamp, actor_id, actor_role, reason, notes
       FROM booking_history ORDER BY timestamp ASC`
    );

    const historyByBookingId = new Map<string, BookingHistoryEntry[]>();
    for (const hRow of hRes.rows) {
      const list = historyByBookingId.get(hRow.booking_id) || [];
      list.push({
        id: hRow.id,
        bookingId: hRow.booking_id,
        fromStatus: hRow.from_status,
        toStatus: hRow.to_status,
        timestamp: new Date(hRow.timestamp).toISOString(),
        actorId: hRow.actor_id,
        actorRole: hRow.actor_role,
        reason: hRow.reason || undefined,
        notes: hRow.notes || undefined,
      });
      historyByBookingId.set(hRow.booking_id, list);
    }

    return bRes.rows.map((row) => this.mapBookingRow(row, historyByBookingId.get(row.id) || []));
  }

  public async saveBooking(booking: Booking): Promise<Booking> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const nowIso = new Date().toISOString();
      await client.query(
        `INSERT INTO bookings (
          id, resource_id, resource_name, user_id, owner_id,
          start_time, end_time, intent, status, requires_supervision,
          estimated_hours, rejection_reason, cancellation_reason,
          checked_in_at, checked_in_by, returned_at, returned_by,
          condition_notes, incident_notes, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13,
          $14, $15, $16, $17,
          $18, $19, $20, $21
        ) ON CONFLICT (id) DO UPDATE SET
          resource_id = EXCLUDED.resource_id,
          resource_name = EXCLUDED.resource_name,
          user_id = EXCLUDED.user_id,
          owner_id = EXCLUDED.owner_id,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          intent = EXCLUDED.intent,
          status = EXCLUDED.status,
          requires_supervision = EXCLUDED.requires_supervision,
          estimated_hours = EXCLUDED.estimated_hours,
          rejection_reason = EXCLUDED.rejection_reason,
          cancellation_reason = EXCLUDED.cancellation_reason,
          checked_in_at = EXCLUDED.checked_in_at,
          checked_in_by = EXCLUDED.checked_in_by,
          returned_at = EXCLUDED.returned_at,
          returned_by = EXCLUDED.returned_by,
          condition_notes = EXCLUDED.condition_notes,
          incident_notes = EXCLUDED.incident_notes,
          updated_at = EXCLUDED.updated_at`,
        [
          booking.id,
          booking.resourceId,
          booking.resourceName || null,
          booking.userId,
          booking.ownerId,
          booking.startTime,
          booking.endTime,
          booking.intent,
          booking.status,
          booking.requiresSupervision || false,
          booking.estimatedHours,
          booking.rejectionReason || null,
          booking.cancellationReason || null,
          booking.checkedInAt || null,
          booking.checkedInBy || null,
          booking.returnedAt || null,
          booking.returnedBy || null,
          booking.conditionNotes || null,
          booking.incidentNotes || null,
          booking.createdAt || nowIso,
          nowIso,
        ]
      );

      // Save History Entries
      if (booking.history && booking.history.length > 0) {
        for (const h of booking.history) {
          await client.query(
            `INSERT INTO booking_history (
              id, booking_id, from_status, to_status, timestamp,
              actor_id, actor_role, reason, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO NOTHING`,
            [
              h.id,
              booking.id,
              h.fromStatus,
              h.toStatus,
              h.timestamp,
              h.actorId,
              h.actorRole,
              h.reason || null,
              h.notes || null,
            ]
          );
        }
      }

      await client.query('COMMIT');
      return { ...booking, updatedAt: nowIso };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async deleteBooking(id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM bookings WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  // --- Custody Credential Operations ---
  public async saveCredential(credential: CustodyCredential): Promise<void> {
    await this.pool.query(
      `INSERT INTO custody_credentials (
        id, booking_id, user_id, action, otp_hash, qr_token_hash,
        expires_at, attempts_remaining, is_used, used_at, used_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        attempts_remaining = EXCLUDED.attempts_remaining,
        is_used = EXCLUDED.is_used,
        used_at = EXCLUDED.used_at,
        used_by = EXCLUDED.used_by`,
      [
        credential.id,
        credential.bookingId,
        credential.userId,
        credential.action,
        credential.otpHash,
        credential.qrTokenHash,
        credential.expiresAt,
        credential.attemptsRemaining,
        credential.isUsed,
        credential.usedAt || null,
        credential.usedBy || null,
        credential.createdAt,
      ]
    );
  }

  public async getCredential(id: string): Promise<CustodyCredential | undefined> {
    const res = await this.pool.query(
      `SELECT * FROM custody_credentials WHERE id = $1`,
      [id]
    );
    if (res.rows.length === 0) return undefined;
    return this.mapCredentialRow(res.rows[0]);
  }

  public async getLatestCredentialForBooking(
    bookingId: string,
    action: CustodyAction
  ): Promise<CustodyCredential | undefined> {
    const res = await this.pool.query(
      `SELECT * FROM custody_credentials
       WHERE booking_id = $1 AND action = $2
       ORDER BY created_at DESC LIMIT 1`,
      [bookingId, action]
    );
    if (res.rows.length === 0) return undefined;
    return this.mapCredentialRow(res.rows[0]);
  }

  public async updateCredential(credential: CustodyCredential): Promise<void> {
    await this.saveCredential(credential);
  }

  public async invalidateCredentialsForBooking(bookingId: string, action?: CustodyAction): Promise<void> {
    if (action) {
      await this.pool.query(
        `UPDATE custody_credentials SET is_used = TRUE WHERE booking_id = $1 AND action = $2`,
        [bookingId, action]
      );
    } else {
      await this.pool.query(
        `UPDATE custody_credentials SET is_used = TRUE WHERE booking_id = $1`,
        [bookingId]
      );
    }
  }

  // --- Notification Operations ---
  public async saveNotification(notification: NotificationRecord, idempotencyKey?: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      if (idempotencyKey) {
        const idempRes = await client.query(
          `INSERT INTO idempotency_keys (key) VALUES ($1) ON CONFLICT (key) DO NOTHING`,
          [idempotencyKey]
        );
        if ((idempRes.rowCount ?? 0) === 0) {
          await client.query('COMMIT');
          return false; // Idempotent suppression
        }
      }

      await client.query(
        `INSERT INTO notifications (
          id, recipient_user_id, type, title, message, read, read_at, booking_id, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          read = EXCLUDED.read,
          read_at = EXCLUDED.read_at`,
        [
          notification.id,
          notification.recipientUserId,
          notification.type,
          notification.title,
          notification.message,
          notification.read,
          notification.readAt || null,
          notification.bookingId || null,
          JSON.stringify(notification.metadata || {}),
          notification.createdAt,
        ]
      );

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async getNotification(id: string): Promise<NotificationRecord | undefined> {
    const res = await this.pool.query(
      `SELECT * FROM notifications WHERE id = $1`,
      [id]
    );
    if (res.rows.length === 0) return undefined;
    return this.mapNotificationRow(res.rows[0]);
  }

  public async getNotificationsForUser(userId: string): Promise<NotificationRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM notifications WHERE recipient_user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows.map((row) => this.mapNotificationRow(row));
  }

  public async markNotificationRead(id: string, userId: string): Promise<NotificationRecord | null> {
    const res = await this.pool.query(
      `UPDATE notifications
       SET read = TRUE, read_at = NOW()
       WHERE id = $1 AND recipient_user_id = $2
       RETURNING *`,
      [id, userId]
    );
    if (res.rows.length === 0) return null;
    return this.mapNotificationRow(res.rows[0]);
  }

  public async markAllNotificationsRead(userId: string): Promise<number> {
    const res = await this.pool.query(
      `UPDATE notifications
       SET read = TRUE, read_at = NOW()
       WHERE recipient_user_id = $1 AND read = FALSE`,
      [userId]
    );
    return res.rowCount ?? 0;
  }

  // --- Reset Store (For automated tests) ---
  public async resetStore(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Use DELETE instead of TRUNCATE to avoid AccessExclusiveLock deadlocks with concurrent transactions
      await client.query('DELETE FROM notifications');
      await client.query('DELETE FROM custody_credentials');
      await client.query('DELETE FROM booking_history');
      await client.query('DELETE FROM bookings');
      await client.query('DELETE FROM idempotency_keys');
      
      // Seed users & resources
      for (const u of Object.values(KNOWN_PERSONAS)) {
        await client.query(
          `INSERT INTO users (id, name, email, role, phone, student_id, badges)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [u.id, u.name, u.email, u.role, u.phone || null, u.studentId || null, u.badges || []]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // --- Private Row Mappers ---
  private mapBookingRow(row: any, historyRows: any[]): Booking {
    return {
      id: row.id,
      resourceId: row.resource_id,
      resourceName: row.resource_name || undefined,
      userId: row.user_id,
      ownerId: row.owner_id,
      startTime: new Date(row.start_time).toISOString(),
      endTime: new Date(row.end_time).toISOString(),
      intent: row.intent,
      status: row.status,
      requiresSupervision: row.requires_supervision,
      estimatedHours: parseFloat(row.estimated_hours),
      rejectionReason: row.rejection_reason || undefined,
      cancellationReason: row.cancellation_reason || undefined,
      checkedInAt: row.checked_in_at ? new Date(row.checked_in_at).toISOString() : undefined,
      checkedInBy: row.checked_in_by || undefined,
      returnedAt: row.returned_at ? new Date(row.returned_at).toISOString() : undefined,
      returnedBy: row.returned_by || undefined,
      conditionNotes: row.condition_notes || undefined,
      incidentNotes: row.incident_notes || undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      borrower: row.borrower_name
        ? {
            id: row.user_id,
            name: row.borrower_name,
            email: row.borrower_email,
            role: row.borrower_role || row.role || 'USER',
            phone: row.borrower_phone || undefined,
            studentId: row.borrower_student_id || undefined,
            badges: row.borrower_badges || [],
          }
        : undefined,
      history: historyRows.map((h) => ({
        id: h.id,
        bookingId: h.booking_id,
        fromStatus: h.from_status,
        toStatus: h.to_status,
        timestamp: new Date(h.timestamp).toISOString(),
        actorId: h.actor_id,
        actorRole: h.actor_role,
        reason: h.reason || undefined,
        notes: h.notes || undefined,
      })),
    };
  }

  private mapCredentialRow(row: any): CustodyCredential {
    return {
      id: row.id,
      bookingId: row.booking_id,
      userId: row.user_id,
      action: row.action,
      otpHash: row.otp_hash,
      qrTokenHash: row.qr_token_hash,
      expiresAt: new Date(row.expires_at).toISOString(),
      attemptsRemaining: row.attempts_remaining,
      isUsed: row.is_used,
      usedAt: row.used_at ? new Date(row.used_at).toISOString() : undefined,
      usedBy: row.used_by || undefined,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private mapNotificationRow(row: any): NotificationRecord {
    return {
      id: row.id,
      recipientUserId: row.recipient_user_id,
      type: row.type,
      title: row.title,
      message: row.message,
      read: row.read,
      readAt: row.read_at ? new Date(row.read_at).toISOString() : undefined,
      bookingId: row.booking_id || undefined,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
