// OpenResource - Member 2 Booking Types and Interfaces

export const BookingStatus = {
  REQUESTED: 'REQUESTED',
  ELIGIBILITY_VERIFIED: 'ELIGIBILITY_VERIFIED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  WAITLISTED: 'WAITLISTED',
  CHECKED_IN: 'CHECKED_IN',
  RETURNED: 'RETURNED',
  INCIDENT_FLAGGED: 'INCIDENT_FLAGGED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const UserRole = {
  USER: 'USER',
  STUDENT: 'STUDENT',
  LAB_OWNER: 'LAB_OWNER',
  AUDITOR: 'AUDITOR',
  ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const CustodyAction = {
  GENERATE_CREDENTIAL: 'GENERATE_CREDENTIAL',
  CHECK_IN: 'CHECK_IN',
  CHECK_OUT: 'CHECK_OUT',
} as const;

export type CustodyAction = (typeof CustodyAction)[keyof typeof CustodyAction];

export interface BookingHistoryEntry {
  id: string;
  bookingId: string;
  fromStatus: BookingStatus;
  toStatus: BookingStatus;
  timestamp: string;
  actorId: string;
  actorRole: string;
  reason?: string;
  notes?: string;
}

export interface BorrowerProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  studentId?: string;
  badges?: string[];
}

export interface MaskedBorrowerProfile {
  id: string;
  name: string;
  role: string;
  isMasked: true;
}

export interface Booking {
  id: string;
  resourceId: string;
  resourceName?: string;
  userId: string;
  borrower?: BorrowerProfile | MaskedBorrowerProfile;
  ownerId: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  intent: string;
  status: BookingStatus;
  
  // Quota & supervision
  requiresSupervision?: boolean;
  estimatedHours: number;

  // Timestamps & Custody Tracking
  rejectionReason?: string;
  cancellationReason?: string;
  checkedInAt?: string;
  checkedInBy?: string;
  returnedAt?: string;
  returnedBy?: string;
  conditionNotes?: string;
  incidentNotes?: string;
  createdAt: string;
  updatedAt: string;
  history?: BookingHistoryEntry[];
}

export interface CustodyCredential {
  id: string;
  bookingId: string;
  userId: string;
  action: CustodyAction;
  otpHash: string;       // SHA-256 hash of 6-digit OTP
  qrTokenHash: string;   // SHA-256 hash of opaque QR token
  expiresAt: string;     // ISO 8601
  attemptsRemaining: number;
  isUsed: boolean;
  usedAt?: string;
  usedBy?: string;
  createdAt: string;
}

export interface CustodyActionInput {
  action: CustodyAction;
  otpCode?: string;
  qrToken?: string;
  conditionNotes?: string;
  incidentFlag?: boolean;
}

export interface CreateBookingInput {
  resourceId: string;
  startTime: string;
  endTime: string;
  intent: string;
  requiresSupervision?: boolean;
  notes?: string;
}

export interface TransitionBookingInput {
  targetStatus: BookingStatus;
  reason?: string;
  notes?: string;
}

export interface StoredResource {
  id: string;
  name: string;
  ownerId: string;
  category: string;
  weeklyUsageCap: number;
  requiredBadgeIds: string[];
}
