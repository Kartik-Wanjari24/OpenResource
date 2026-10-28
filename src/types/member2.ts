// OpenResource - Member 2 Frontend Type Definitions

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

export const BookingEventType = {
  BOOKING_REQUESTED: 'BOOKING_REQUESTED',
  WAITLIST_PLACED: 'WAITLIST_PLACED',
  WAITLIST_PROMOTED: 'WAITLIST_PROMOTED',
  BOOKING_APPROVED: 'BOOKING_APPROVED',
  BOOKING_REJECTED: 'BOOKING_REJECTED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  CHECKED_IN: 'CHECKED_IN',
  RETURNED: 'RETURNED',
  INCIDENT_FLAGGED: 'INCIDENT_FLAGGED',
  NO_SHOW_CANCELLED: 'NO_SHOW_CANCELLED',
} as const;

export type BookingEventType = (typeof BookingEventType)[keyof typeof BookingEventType];

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
  email?: string;
  role: string;
  phone?: string;
  studentId?: string;
  badges?: string[];
  isMasked?: boolean;
}

export interface Booking {
  id: string;
  resourceId: string;
  resourceName?: string;
  userId: string;
  borrower?: BorrowerProfile;
  ownerId: string;
  startTime: string;
  endTime: string;
  intent: string;
  status: BookingStatus;
  requiresSupervision?: boolean;
  estimatedHours: number;
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
  action: CustodyAction;
  otpCode: string;
  qrToken: string;
  expiresAt: string;
  attemptsRemaining: number;
}

export interface NotificationRecord {
  id: string;
  recipientUserId: string;
  type: BookingEventType;
  title: string;
  message: string;
  read: boolean;
  bookingId: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  readAt?: string;
}

export interface PaginatedNotificationsResult {
  notifications: NotificationRecord[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

export interface UserSummaryResult {
  bookings: Booking[];
  weeklyUsage: Record<string, number>;
  weekStartDate: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message: string }>;
  };
  timestamp: string;
}

export interface UserPersona {
  id: string;
  name: string;
  role: UserRole;
  title: string;
  badges?: string[];
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

export interface CustodyActionInput {
  action: CustodyAction;
  credentialAction?: 'CHECK_IN' | 'CHECK_OUT';
  otpCode?: string;
  qrToken?: string;
  conditionNotes?: string;
  incidentFlag?: boolean;
  ttlMinutes?: number;
}
