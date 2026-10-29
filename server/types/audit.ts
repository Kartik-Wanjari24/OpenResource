/**
 * Phase 3: SHA-256 Hash-Chained Audit Ledger Types
 * Immutable audit trail with cryptographic integrity verification
 */

export const AuditEventType = {
  // Booking lifecycle events
  BOOKING_APPROVAL: 'booking_approval',
  BOOKING_REJECTION: 'booking_rejection',
  BOOKING_CANCELLATION: 'booking_cancellation',

  // Check-in/out events
  CHECK_IN: 'check_in',
  CHECK_OUT: 'check_out',

  // Condition and inspection events
  CONDITION_DELTA_DETECTED: 'condition_delta_detected',
  DAMAGE_REPORT_FILED: 'damage_report_filed',
  INCIDENT_RESOLVED: 'incident_resolved',

  // Eligibility and verification events
  ELIGIBILITY_VERIFICATION_SUBMITTED: 'eligibility_verification_submitted',
  ELIGIBILITY_APPROVED: 'eligibility_approved',
  ELIGIBILITY_REJECTED: 'eligibility_rejected',

  // Badge events
  BADGE_GRANTED: 'badge_granted',
  BADGE_REVOKED: 'badge_revoked',
} as const;

export type AuditEventType = (typeof AuditEventType)[keyof typeof AuditEventType];

/**
 * Base audit event structure
 * All events must include these fields for hash chain integrity
 */
export interface AuditEventPayload {
  eventType: AuditEventType;
  timestamp: string; // ISO 8601 format
  actorId: string; // User who triggered the event
  actorRole?: string; // Role of the actor
  resourceId?: string; // Related resource (if applicable)
  bookingId?: string; // Related booking (if applicable)
  userId?: string; // Affected user (if different from actor)
  metadata: Record<string, any>; // Event-specific data
  description: string; // Human-readable event description
}

/**
 * Stored audit event with hash chain links
 */
export interface AuditEvent extends AuditEventPayload {
  id: string; // Unique event ID
  sequenceNumber: number; // Position in chain (1-indexed)
  previousHash: string; // SHA-256 hash of previous event (or genesis value)
  currentHash: string; // SHA-256 hash of this event's canonical form
}

/**
 * Request to append a new event to the audit chain
 */
export interface AppendAuditEventRequest {
  eventType: AuditEventType;
  resourceId?: string;
  bookingId?: string;
  userId?: string;
  metadata?: Record<string, any>;
  description: string;
}

/**
 * Response from appending an event
 */
export interface AppendAuditEventResponse {
  event: AuditEvent;
  verified: boolean; // Whether the chain was verified before append
  chainLength: number; // Total events in chain after append
}

/**
 * Chain integrity verification result
 */
export interface ChainVerificationResult {
  valid: boolean;
  totalEvents: number;
  verifiedEvents: number;
  firstFailureAt?: number; // Sequence number of first invalid event
  errors: ChainVerificationError[];
  verificationTimestamp: string;
}

/**
 * Individual verification error
 */
export interface ChainVerificationError {
  sequenceNumber: number;
  errorType: 'HASH_MISMATCH' | 'BROKEN_LINK' | 'MISSING_EVENT' | 'INVALID_PAYLOAD';
  message: string;
  expected?: string;
  actual?: string;
}

/**
 * Query parameters for audit event retrieval
 */
export interface AuditQueryParams {
  eventType?: AuditEventType;
  actorId?: string;
  resourceId?: string;
  bookingId?: string;
  userId?: string;
  fromSequence?: number;
  toSequence?: number;
  limit?: number;
}
