// OpenResource - Member 2 Typed API Client
import type {
  Booking,
  BookingStatus,
  CustodyCredential,
  NotificationRecord,
  PaginatedNotificationsResult,
  UserSummaryResult,
  CreateBookingInput,
  TransitionBookingInput,
  CustodyActionInput,
  ApiResponse,
  ApiError,
  UserPersona,
} from '../types/member2.ts';
import { UserRole } from '../types/member2.ts';

// Canonical development personas matching API contracts
export const PRECONFIGURED_PERSONAS: Record<string, UserPersona> = {
  demo_qualified_student: {
    id: 'demo_qualified_student',
    name: 'Alice Chen',
    role: UserRole.USER,
    title: 'Certified Student Borrower',
    badges: ['badge_safety_101', 'badge_3d_basics', 'badge_laser_cert', 'badge_cnc_basics'],
  },
  demo_resource_hog: {
    id: 'demo_resource_hog',
    name: 'Bob Wilson',
    role: UserRole.USER,
    title: 'Student (Quota Constrained)',
    badges: ['badge_safety_101', 'badge_3d_basics'],
  },
  demo_lab_owner: {
    id: 'demo_lab_owner',
    name: 'Dr. Sarah Martinez',
    role: UserRole.LAB_OWNER,
    title: 'Digital Fabrication Lab Owner',
    badges: ['badge_safety_101', 'badge_admin'],
  },
  demo_auditor: {
    id: 'demo_auditor',
    name: 'Auditor Vance',
    role: UserRole.AUDITOR,
    title: 'Campus Compliance Auditor',
    badges: [],
  },
  demo_admin: {
    id: 'demo_admin',
    name: 'System Administrator',
    role: UserRole.ADMIN,
    title: 'OpenResource Administrator',
    badges: ['badge_safety_101', 'badge_admin', 'badge_3d_basics', 'badge_laser_cert', 'badge_cnc_basics'],
  },
};

// Default persona for dev evaluation
let activePersona: UserPersona = PRECONFIGURED_PERSONAS.demo_qualified_student;
const personaListeners: Array<(persona: UserPersona) => void> = [];

export function getActivePersona(): UserPersona {
  return activePersona;
}

export function setActivePersona(persona: UserPersona): void {
  activePersona = persona;
  personaListeners.forEach((listener) => listener(activePersona));
}

export function onPersonaChange(listener: (persona: UserPersona) => void): () => void {
  personaListeners.push(listener);
  return () => {
    const index = personaListeners.indexOf(listener);
    if (index !== -1) personaListeners.splice(index, 1);
  };
}

export class ApiClientError extends Error {
  public code: string;
  public statusCode: number;
  public details?: Array<{ field?: string; message: string }>;

  constructor(statusCode: number, code: string, message: string, details?: Array<{ field?: string; message: string }>) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Builds request headers.
 * In development, test persona headers are attached.
 * In production builds, development persona headers are completely omitted.
 */
function buildHeaders(persona?: UserPersona): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // Only attach test headers if not in production mode
  const isProd = Boolean(import.meta.env?.PROD);
  if (!isProd) {
    const user = persona || activePersona;
    if (user) {
      headers['X-Test-User-Id'] = user.id;
      headers['X-Test-User-Role'] = user.role;
      if (user.badges && user.badges.length > 0) {
        headers['X-Test-User-Badges'] = user.badges.join(',');
      }
      headers['X-Test-User-Name'] = user.name;
    }
  }

  return headers;
}

/**
 * Internal request executor with envelope unwrapping and error normalization
 */
async function apiFetch<T>(path: string, options: RequestInit = {}, persona?: UserPersona): Promise<T> {
  const url = path.startsWith('/') ? path : `/${path}`;
  const headers = {
    ...buildHeaders(persona),
    ...(options.headers as Record<string, string> | undefined),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const json = await response.json();

    if (!response.ok) {
      const errorPayload = json as ApiError;
      throw new ApiClientError(
        response.status,
        errorPayload.error?.code || 'UNKNOWN_ERROR',
        errorPayload.error?.message || `Request failed with status ${response.status}`,
        errorPayload.error?.details
      );
    }

    const successPayload = json as ApiResponse<T>;
    return successPayload.data;
  } catch (err) {
    if (err instanceof ApiClientError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Network error or unreachable backend';
    throw new ApiClientError(0, 'NETWORK_ERROR', message);
  }
}

// =============================================================================
// Member 2 Public API Client Methods
// =============================================================================

export const member2Api = {
  /**
   * GET /api/bookings - List accessible bookings
   */
  async getBookings(
    filter?: {
      resourceId?: string;
      userId?: string;
      status?: BookingStatus;
      startDate?: string;
      endDate?: string;
    },
    persona?: UserPersona
  ): Promise<Booking[]> {
    const params = new URLSearchParams();
    if (filter?.resourceId) params.append('resourceId', filter.resourceId);
    if (filter?.userId) params.append('userId', filter.userId);
    if (filter?.status) params.append('status', filter.status);
    if (filter?.startDate) params.append('startDate', filter.startDate);
    if (filter?.endDate) params.append('endDate', filter.endDate);

    const queryString = params.toString();
    const path = `/api/bookings${queryString ? `?${queryString}` : ''}`;
    const data = await apiFetch<{ bookings: Booking[]; total: number }>(path, { method: 'GET' }, persona);
    return data.bookings;
  },

  /**
   * GET /api/bookings/:id - Retrieve single booking with privacy masking
   */
  async getBookingById(bookingId: string, persona?: UserPersona): Promise<Booking> {
    const data = await apiFetch<{ booking: Booking }>(`/api/bookings/${bookingId}`, { method: 'GET' }, persona);
    return data.booking;
  },

  /**
   * POST /api/bookings - Request a new resource booking
   */
  async createBooking(input: CreateBookingInput, persona?: UserPersona): Promise<Booking> {
    const data = await apiFetch<{ booking: Booking }>(
      '/api/bookings',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      persona
    );
    return data.booking;
  },

  /**
   * POST /api/bookings/:id/transition - Execute lifecycle state transition
   */
  async transitionBooking(
    bookingId: string,
    input: TransitionBookingInput,
    persona?: UserPersona
  ): Promise<Booking> {
    const data = await apiFetch<{ booking: Booking }>(
      `/api/bookings/${bookingId}/transition`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      persona
    );
    return data.booking;
  },

  /**
   * POST /api/bookings/:id/custody - Perform custody actions (GENERATE_CREDENTIAL, CHECK_IN, CHECK_OUT)
   */
  async handleCustodyAction(
    bookingId: string,
    input: CustodyActionInput,
    persona?: UserPersona
  ): Promise<{ booking?: Booking; credential?: CustodyCredential }> {
    return await apiFetch<{ booking?: Booking; credential?: CustodyCredential }>(
      `/api/bookings/${bookingId}/custody`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      persona
    );
  },

  /**
   * GET /api/bookings/user/:userId - Member 1 user summary and quota breakdown
   */
  async getUserSummary(userId: string, persona?: UserPersona): Promise<UserSummaryResult> {
    return await apiFetch<UserSummaryResult>(`/api/bookings/user/${userId}`, { method: 'GET' }, persona);
  },

  /**
   * POST /api/bookings/process-no-shows - Trigger on-demand no-show sweep
   */
  async processNoShows(
    referenceTime?: string,
    persona?: UserPersona
  ): Promise<{ processedCount: number; promotedCount: number }> {
    return await apiFetch<{ processedCount: number; promotedCount: number }>(
      '/api/bookings/process-no-shows',
      {
        method: 'POST',
        body: referenceTime ? JSON.stringify({ referenceTime }) : undefined,
      },
      persona
    );
  },

  /**
   * GET /api/notifications - List authenticated user's notifications
   */
  async getNotifications(
    options?: { page?: number; limit?: number; unreadOnly?: boolean },
    persona?: UserPersona
  ): Promise<PaginatedNotificationsResult> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.unreadOnly) params.append('unreadOnly', 'true');

    const queryString = params.toString();
    const path = `/api/notifications${queryString ? `?${queryString}` : ''}`;
    return await apiFetch<PaginatedNotificationsResult>(path, { method: 'GET' }, persona);
  },

  /**
   * PATCH /api/notifications/:id/read - Mark single notification as read
   */
  async markNotificationAsRead(notificationId: string, persona?: UserPersona): Promise<NotificationRecord> {
    const data = await apiFetch<{ notification: NotificationRecord }>(
      `/api/notifications/${notificationId}/read`,
      { method: 'PATCH' },
      persona
    );
    return data.notification;
  },

  /**
   * POST /api/notifications/read-all - Mark all user's notifications as read
   */
  async markAllNotificationsAsRead(persona?: UserPersona): Promise<{ markedCount: number }> {
    return await apiFetch<{ markedCount: number }>(
      '/api/notifications/read-all',
      { method: 'POST' },
      persona
    );
  },
};
