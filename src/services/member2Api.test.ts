import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  member2Api,
  PRECONFIGURED_PERSONAS,
  setActivePersona,
  ApiClientError,
} from './member2Api.ts';
import { BookingStatus, CustodyAction, UserRole } from '../types/member2.ts';
import type { Booking, CustodyCredential, NotificationRecord } from '../types/member2.ts';

describe('Member 2 Frontend API Client (member2Api)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    setActivePersona(PRECONFIGURED_PERSONAS.demo_qualified_student);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('1. GET /api/bookings sends test persona headers in development and unwraps data envelope', async () => {
    const mockBookings: Booking[] = [
      {
        id: 'book_mock_1',
        resourceId: 'res_3d_prusa',
        resourceName: '3D Printer - Prusa MK4',
        userId: 'demo_qualified_student',
        ownerId: 'demo_lab_owner',
        startTime: '2026-11-20T10:00:00Z',
        endTime: '2026-11-20T12:00:00Z',
        intent: 'Test print',
        status: BookingStatus.APPROVED,
        estimatedHours: 2,
        createdAt: '2026-11-19T10:00:00Z',
        updatedAt: '2026-11-19T10:00:00Z',
      },
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { bookings: mockBookings, total: 1 },
        timestamp: new Date().toISOString(),
      }),
    });

    globalThis.fetch = fetchMock;

    const result = await member2Api.getBookings({ status: BookingStatus.APPROVED });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = fetchMock.mock.calls[0];

    expect(calledUrl).toBe('/api/bookings?status=APPROVED');
    expect(calledOptions.headers['X-Test-User-Id']).toBe('demo_qualified_student');
    expect(calledOptions.headers['X-Test-User-Role']).toBe('USER');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('book_mock_1');
    expect(result[0].status).toBe(BookingStatus.APPROVED);
  });

  it('2. Normalizes server error envelopes into typed ApiClientError instances', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          code: 'FORBIDDEN',
          message: 'Only the resource owner or an administrator can approve booking requests',
        },
        timestamp: new Date().toISOString(),
      }),
    });

    globalThis.fetch = fetchMock;

    await expect(
      member2Api.transitionBooking('book_123', { targetStatus: BookingStatus.APPROVED })
    ).rejects.toThrow(ApiClientError);

    try {
      await member2Api.transitionBooking('book_123', { targetStatus: BookingStatus.APPROVED });
    } catch (err: unknown) {
      const apiErr = err as ApiClientError;
      expect(apiErr.statusCode).toBe(403);
      expect(apiErr.code).toBe('FORBIDDEN');
      expect(apiErr.message).toContain('Only the resource owner');
    }
  });

  it('3. Generates short-lived custody credentials via handleCustodyAction', async () => {
    const mockCred: CustodyCredential = {
      id: 'cred_test_1',
      bookingId: 'book_123',
      action: CustodyAction.CHECK_IN,
      otpCode: '852963',
      qrToken: 'test_qr_token_payload',
      expiresAt: '2026-11-20T10:10:00Z',
      attemptsRemaining: 3,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { credential: mockCred },
        timestamp: new Date().toISOString(),
      }),
    });

    globalThis.fetch = fetchMock;

    const res = await member2Api.handleCustodyAction('book_123', {
      action: CustodyAction.GENERATE_CREDENTIAL,
      credentialAction: 'CHECK_IN',
    });

    expect(res.credential).toBeDefined();
    expect(res.credential?.otpCode).toBe('852963');
    expect(res.credential?.attemptsRemaining).toBe(3);
  });

  it('4. Handles check-in submission and returns updated booking', async () => {
    const updatedBooking: Booking = {
      id: 'book_123',
      resourceId: 'res_3d_prusa',
      userId: 'demo_qualified_student',
      ownerId: 'demo_lab_owner',
      startTime: '2026-11-20T10:00:00Z',
      endTime: '2026-11-20T12:00:00Z',
      intent: '3D print session',
      status: BookingStatus.CHECKED_IN,
      checkedInAt: '2026-11-20T10:02:00Z',
      checkedInBy: 'demo_qualified_student',
      estimatedHours: 2,
      createdAt: '2026-11-19T10:00:00Z',
      updatedAt: '2026-11-20T10:02:00Z',
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { booking: updatedBooking },
        timestamp: new Date().toISOString(),
      }),
    });

    globalThis.fetch = fetchMock;

    const res = await member2Api.handleCustodyAction('book_123', {
      action: CustodyAction.CHECK_IN,
      otpCode: '852963',
    });

    expect(res.booking?.status).toBe(BookingStatus.CHECKED_IN);
    expect(res.booking?.checkedInAt).toBe('2026-11-20T10:02:00Z');
  });

  it('5. Handles check-out with incident flag and condition notes', async () => {
    const returnedBooking: Booking = {
      id: 'book_123',
      resourceId: 'res_3d_prusa',
      userId: 'demo_qualified_student',
      ownerId: 'demo_lab_owner',
      startTime: '2026-11-20T10:00:00Z',
      endTime: '2026-11-20T12:00:00Z',
      intent: '3D print session',
      status: BookingStatus.INCIDENT_FLAGGED,
      conditionNotes: 'Filament clogged in extruder during final layer',
      incidentNotes: 'Filament clogged in extruder during final layer',
      estimatedHours: 2,
      createdAt: '2026-11-19T10:00:00Z',
      updatedAt: '2026-11-20T11:45:00Z',
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { booking: returnedBooking },
        timestamp: new Date().toISOString(),
      }),
    });

    globalThis.fetch = fetchMock;

    const res = await member2Api.handleCustodyAction('book_123', {
      action: CustodyAction.CHECK_OUT,
      conditionNotes: 'Filament clogged in extruder during final layer',
      incidentFlag: true,
    });

    expect(res.booking?.status).toBe(BookingStatus.INCIDENT_FLAGGED);
    expect(res.booking?.conditionNotes).toContain('Filament clogged');
  });

  it('6. Loads paginated notifications and marks single item as read', async () => {
    const mockNotifs: NotificationRecord[] = [
      {
        id: 'notif_1',
        recipientUserId: 'demo_qualified_student',
        type: 'BOOKING_APPROVED',
        title: 'Booking Approved',
        message: 'Your 3D printer booking was approved',
        read: false,
        bookingId: 'book_123',
        createdAt: '2026-11-19T11:00:00Z',
      },
    ];

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { notifications: mockNotifs, total: 1, unreadCount: 1, page: 1, limit: 20 },
          timestamp: new Date().toISOString(),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { notification: { ...mockNotifs[0], read: true } },
          timestamp: new Date().toISOString(),
        }),
      });

    globalThis.fetch = fetchMock;

    const listRes = await member2Api.getNotifications({ unreadOnly: true });
    expect(listRes.notifications).toHaveLength(1);
    expect(listRes.unreadCount).toBe(1);

    const readRes = await member2Api.markNotificationAsRead('notif_1');
    expect(readRes.read).toBe(true);
  });

  it('7. Handles marks all notifications as read', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { markedCount: 5 },
        timestamp: new Date().toISOString(),
      }),
    });

    globalThis.fetch = fetchMock;

    const res = await member2Api.markAllNotificationsAsRead();
    expect(res.markedCount).toBe(5);
  });

  it('8. Updates headers when switching active persona', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { bookings: [], total: 0 },
        timestamp: new Date().toISOString(),
      }),
    });

    globalThis.fetch = fetchMock;

    // Switch to Dr. Martinez (Lab Owner)
    setActivePersona(PRECONFIGURED_PERSONAS.demo_lab_owner);
    await member2Api.getBookings();

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['X-Test-User-Id']).toBe('demo_lab_owner');
    expect(options.headers['X-Test-User-Role']).toBe(UserRole.LAB_OWNER);
  });
});
