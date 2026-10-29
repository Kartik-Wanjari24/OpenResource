import crypto from 'node:crypto';
import type {
  AuditEvent,
  AuditEventPayload,
  AppendAuditEventRequest,
  AppendAuditEventResponse,
  ChainVerificationResult,
  ChainVerificationError,
  AuditQueryParams,
} from '../types/audit.js';
import { AppError, ErrorCode } from '../utils/errors.js';

/**
 * Audit Ledger Service
 * Phase 3: SHA-256 Hash-Chained Audit Trail
 * Phase 5: Singleton pattern to ensure shared instance across controllers
 *
 * CRITICAL DESIGN NOTES:
 * - Each event links to the previous event's hash
 * - Genesis event (first event) has previousHash = "GENESIS"
 * - Hash construction: SHA256(previousHash || canonicalPayload)
 * - Canonical payload is deterministic JSON serialization
 * - Storage is append-only (no updates or deletes)
 * - Verification detects modified payloads, broken links, invalid hashes
 * - Singleton pattern ensures all controllers share the same audit chain
 *
 * SECURITY LIMITATIONS (DOCUMENTED):
 * - Hash chain alone cannot prevent privileged attacker with database write access
 * - Attacker with full database control could rewrite entire chain with valid hashes
 * - Additional security requires external verification (e.g., periodic hash publication)
 * - This implementation provides tamper-evidence, not tamper-proof guarantees
 */
export class AuditService {
  private static instance: AuditService | null = null;

  // In-memory storage for Phase 3
  // Production would use durable database storage
  private events: AuditEvent[] = [];
  private readonly GENESIS_HASH = 'GENESIS';

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance of AuditService
   * Ensures all controllers share the same audit chain
   */
  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  /**
   * Append a new event to the audit chain
   *
   * SECURITY: Server-controlled event construction
   * - Never trusts client-supplied hashes, sequence numbers, or chain links
   * - Automatically calculates correct previousHash from chain state
   * - Generates canonical hash from payload
   * - Verifies chain integrity before append (optional, for safety)
   */
  public async appendEvent(
    request: AppendAuditEventRequest,
    actorId: string,
    actorRole?: string
  ): Promise<AppendAuditEventResponse> {
    // Construct payload with server-controlled fields
    const timestamp = new Date().toISOString();
    const sequenceNumber = this.events.length + 1;

    const payload: AuditEventPayload = {
      eventType: request.eventType,
      timestamp,
      actorId,
      actorRole,
      resourceId: request.resourceId,
      bookingId: request.bookingId,
      userId: request.userId,
      metadata: request.metadata || {},
      description: request.description,
    };

    // Determine previous hash
    const previousHash = this.events.length === 0
      ? this.GENESIS_HASH
      : this.events[this.events.length - 1].currentHash;

    // Calculate current hash from canonical form
    const currentHash = this.calculateHash(previousHash, payload);

    // Create event with hash chain links
    const event: AuditEvent = {
      id: this.generateEventId(),
      sequenceNumber,
      previousHash,
      currentHash,
      ...payload,
    };

    // Verify chain integrity before append (safety check)
    const verificationResult = await this.verifyChain();
    if (!verificationResult.valid) {
      throw new AppError(
        500,
        ErrorCode.INTERNAL_ERROR,
        'Cannot append event: audit chain integrity compromised',
        [{ message: `Chain invalid at sequence ${verificationResult.firstFailureAt}` }]
      );
    }

    // Append to chain
    this.events.push(event);

    return {
      event,
      verified: verificationResult.valid,
      chainLength: this.events.length,
    };
  }

  /**
   * Verify the integrity of the entire audit chain
   *
   * Checks:
   * 1. Genesis event has previousHash = "GENESIS"
   * 2. Each subsequent event's previousHash matches previous event's currentHash
   * 3. Each event's currentHash is correctly calculated from its payload
   * 4. Sequence numbers are continuous (1, 2, 3, ...)
   */
  public async verifyChain(): Promise<ChainVerificationResult> {
    const errors: ChainVerificationError[] = [];
    let verifiedEvents = 0;

    if (this.events.length === 0) {
      return {
        valid: true,
        totalEvents: 0,
        verifiedEvents: 0,
        errors: [],
        verificationTimestamp: new Date().toISOString(),
      };
    }

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];
      const expectedSequence = i + 1;

      // Check sequence number
      if (event.sequenceNumber !== expectedSequence) {
        errors.push({
          sequenceNumber: event.sequenceNumber,
          errorType: 'INVALID_PAYLOAD',
          message: `Sequence number mismatch: expected ${expectedSequence}, got ${event.sequenceNumber}`,
          expected: expectedSequence.toString(),
          actual: event.sequenceNumber.toString(),
        });
      }

      // Check genesis event
      if (i === 0) {
        if (event.previousHash !== this.GENESIS_HASH) {
          errors.push({
            sequenceNumber: event.sequenceNumber,
            errorType: 'BROKEN_LINK',
            message: 'Genesis event must have previousHash = "GENESIS"',
            expected: this.GENESIS_HASH,
            actual: event.previousHash,
          });
        }
      } else {
        // Check link to previous event
        const previousEvent = this.events[i - 1];
        if (event.previousHash !== previousEvent.currentHash) {
          errors.push({
            sequenceNumber: event.sequenceNumber,
            errorType: 'BROKEN_LINK',
            message: `Previous hash does not match previous event's current hash`,
            expected: previousEvent.currentHash,
            actual: event.previousHash,
          });
        }
      }

      // Verify current hash is correctly calculated
      const payload: AuditEventPayload = {
        eventType: event.eventType,
        timestamp: event.timestamp,
        actorId: event.actorId,
        actorRole: event.actorRole,
        resourceId: event.resourceId,
        bookingId: event.bookingId,
        userId: event.userId,
        metadata: event.metadata,
        description: event.description,
      };

      const expectedHash = this.calculateHash(event.previousHash, payload);
      if (event.currentHash !== expectedHash) {
        errors.push({
          sequenceNumber: event.sequenceNumber,
          errorType: 'HASH_MISMATCH',
          message: 'Event hash does not match calculated hash - payload may be modified',
          expected: expectedHash,
          actual: event.currentHash,
        });
      }

      if (errors.filter((e) => e.sequenceNumber === event.sequenceNumber).length === 0) {
        verifiedEvents++;
      }
    }

    const firstFailure = errors.length > 0 ? Math.min(...errors.map((e) => e.sequenceNumber)) : undefined;

    return {
      valid: errors.length === 0,
      totalEvents: this.events.length,
      verifiedEvents,
      firstFailureAt: firstFailure,
      errors,
      verificationTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Calculate SHA-256 hash of an event
   *
   * Formula: H_n = SHA256(H_(n-1) || CanonicalPayload)
   *
   * Canonical payload is deterministic JSON serialization:
   * - Keys sorted alphabetically
   * - No whitespace
   * - Consistent timestamp format (ISO 8601)
   * - Null values represented as null
   * - Empty objects/arrays included
   */
  private calculateHash(previousHash: string, payload: AuditEventPayload): string {
    // Create canonical representation
    const canonical = this.canonicalizePayload(payload);

    // Concatenate previous hash and canonical payload
    const input = previousHash + canonical;

    // Calculate SHA-256 hash
    return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  }

  /**
   * Canonicalize payload for deterministic hashing
   *
   * Rules:
   * - Sort object keys alphabetically
   * - No extra whitespace
   * - Consistent null/undefined handling (both → null)
   * - Consistent empty array/object handling
   */
  private canonicalizePayload(payload: AuditEventPayload): string {
    // Create object with sorted keys
    const canonical = {
      actorId: payload.actorId,
      actorRole: payload.actorRole ?? null,
      bookingId: payload.bookingId ?? null,
      description: payload.description,
      eventType: payload.eventType,
      metadata: this.sortObjectKeys(payload.metadata),
      resourceId: payload.resourceId ?? null,
      timestamp: payload.timestamp,
      userId: payload.userId ?? null,
    };

    // Serialize to JSON with no whitespace
    return JSON.stringify(canonical);
  }

  /**
   * Recursively sort object keys for deterministic serialization
   */
  private sortObjectKeys(obj: any): any {
    if (obj === null || obj === undefined) {
      return null;
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObjectKeys(item));
    }

    const sorted: Record<string, any> = {};
    const keys = Object.keys(obj).sort();

    for (const key of keys) {
      sorted[key] = this.sortObjectKeys(obj[key]);
    }

    return sorted;
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `audit_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Get audit events with optional filtering
   */
  public async getEvents(query: AuditQueryParams = {}): Promise<AuditEvent[]> {
    let filtered = [...this.events];

    // Apply filters
    if (query.eventType) {
      filtered = filtered.filter((e) => e.eventType === query.eventType);
    }

    if (query.actorId) {
      filtered = filtered.filter((e) => e.actorId === query.actorId);
    }

    if (query.resourceId) {
      filtered = filtered.filter((e) => e.resourceId === query.resourceId);
    }

    if (query.bookingId) {
      filtered = filtered.filter((e) => e.bookingId === query.bookingId);
    }

    if (query.userId) {
      filtered = filtered.filter((e) => e.userId === query.userId);
    }

    if (query.fromSequence !== undefined) {
      filtered = filtered.filter((e) => e.sequenceNumber >= query.fromSequence!);
    }

    if (query.toSequence !== undefined) {
      filtered = filtered.filter((e) => e.sequenceNumber <= query.toSequence!);
    }

    // Apply limit
    if (query.limit !== undefined && query.limit > 0) {
      filtered = filtered.slice(0, query.limit);
    }

    return filtered;
  }

  /**
   * Get total count of events
   */
  public getEventCount(): number {
    return this.events.length;
  }

  /**
   * Get specific event by sequence number
   */
  public getEventBySequence(sequenceNumber: number): AuditEvent | null {
    return this.events.find((e) => e.sequenceNumber === sequenceNumber) || null;
  }
}
