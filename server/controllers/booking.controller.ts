import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { BookingService } from '../services/booking.service.js';
import { BookingStatus } from '../types/booking.js';
import { AppError, ErrorCode, successResponse } from '../utils/errors.js';

const bookingService = new BookingService();

export class BookingController {
  /**
   * POST /api/bookings - Create booking request
   */
  public static async createBooking(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required to create a booking');
      }

      // Hardening: Reject requests where client body attempts to override user identity
      if (req.body.userId && req.body.userId !== req.user.id) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'Cannot create booking on behalf of another user'
        );
      }
      if (req.body.role && req.body.role !== req.user.role) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'Caller role mismatch with authenticated identity'
        );
      }

      const booking = await bookingService.createBooking(req.body, req.user);
      res.status(201).json(successResponse({ booking }));
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/bookings - List accessible bookings
   */
  public static async getBookings(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { resourceId, userId, status, startDate, endDate } = req.query;

      const bookings = await bookingService.getBookings(
        {
          resourceId: resourceId as string,
          userId: userId as string,
          status: status as BookingStatus,
          startDate: startDate as string,
          endDate: endDate as string,
        },
        req.user
      );

      res.status(200).json(
        successResponse({
          bookings,
          total: bookings.length,
        })
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/bookings/:id - Retrieve single booking with privacy masking
   */
  public static async getBookingById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const booking = await bookingService.getBookingById(id, req.user);
      res.status(200).json(successResponse({ booking }));
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/bookings/user/:userId - Member 1 integration endpoint
   */
  public static async getUserBookings(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const rawUserId = req.params.userId;
      const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
      const summary = await bookingService.getUserSummary(userId, req.user);
      res.status(200).json(successResponse(summary));
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/bookings/:id/transition - Validate and execute state transition
   */
  public static async transitionBooking(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }

      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const { targetStatus, reason, notes } = req.body;

      if (!targetStatus || !Object.values(BookingStatus).includes(targetStatus)) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          `Invalid or missing targetStatus. Allowed values: [${Object.values(BookingStatus).join(', ')}]`,
          [{ field: 'targetStatus', message: 'Valid BookingStatus value is required' }]
        );
      }

      // Hardening: Reject requests where client body attempts to override actor identity
      if (req.body.actorId && req.body.actorId !== req.user.id) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'Actor ID mismatch with authenticated identity'
        );
      }

      const booking = await bookingService.transitionBooking(
        id,
        targetStatus as BookingStatus,
        req.user,
        reason,
        notes
      );

      res.status(200).json(successResponse({ booking }));
    } catch (err) {
      next(err);
    }
  }
}
