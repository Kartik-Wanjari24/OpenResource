import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { NotificationService } from '../services/notification.service.js';
import { UserRole } from '../types/booking.js';
import { AppError, ErrorCode, successResponse } from '../utils/errors.js';

const notificationService = NotificationService.getInstance();

export class NotificationController {
  /**
   * GET /api/notifications - List authenticated user's notifications
   */
  public static async getNotifications(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required to access notifications');
      }

      // Hardening: Reject attempts to query notifications of another user
      if (req.query.userId && req.query.userId !== req.user.id && req.user.role !== UserRole.ADMIN) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'Cannot access notifications of another user'
        );
      }
      if (req.query.recipientUserId && req.query.recipientUserId !== req.user.id && req.user.role !== UserRole.ADMIN) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'Cannot access notifications of another user'
        );
      }

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const unreadOnly = req.query.unreadOnly === 'true';

      const result = await notificationService.getNotificationsForUser(req.user.id, {
        page: isNaN(page) ? 1 : page,
        limit: isNaN(limit) ? 20 : limit,
        unreadOnly,
      });

      res.status(200).json(successResponse(result));
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/notifications/:id/read - Mark single notification as read
   */
  public static async markAsRead(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }

      // Hardening: Reject caller-supplied override parameters
      if (req.body?.recipientUserId && req.body.recipientUserId !== req.user.id && req.user.role !== UserRole.ADMIN) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'Recipient user ID mismatch with authenticated identity'
        );
      }
      if (req.body?.userId && req.body.userId !== req.user.id && req.user.role !== UserRole.ADMIN) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'Caller user ID mismatch with authenticated identity'
        );
      }

      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;

      const updated = await notificationService.markAsRead(id, req.user.id);
      res.status(200).json(successResponse({ notification: updated }));
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/notifications/read-all - Mark all user's notifications as read
   */
  public static async markAllAsRead(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }

      // Hardening: Reject caller-supplied override parameters
      if (req.body?.recipientUserId && req.body.recipientUserId !== req.user.id && req.user.role !== UserRole.ADMIN) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'Recipient user ID mismatch with authenticated identity'
        );
      }
      if (req.body?.userId && req.body.userId !== req.user.id && req.user.role !== UserRole.ADMIN) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'Caller user ID mismatch with authenticated identity'
        );
      }

      const result = await notificationService.markAllAsRead(req.user.id);
      res.status(200).json(successResponse(result));
    } catch (err) {
      next(err);
    }
  }
}
