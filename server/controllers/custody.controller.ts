import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { CustodyService } from '../services/custody.service.js';
import { SchedulerService } from '../services/scheduler.service.js';
import { CustodyAction, UserRole } from '../types/booking.js';
import { AppError, ErrorCode, successResponse } from '../utils/errors.js';

const custodyService = new CustodyService();
const schedulerService = SchedulerService.getInstance();

export class CustodyController {
  /**
   * POST /api/bookings/:id/custody - Handle custody actions
   */
  public static async handleCustodyAction(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }

      if (req.body.userId && req.body.userId !== req.user.id && req.user.role !== UserRole.ADMIN) {
        throw new AppError(403, ErrorCode.FORBIDDEN, 'Caller user ID mismatch with authenticated identity');
      }
      if (req.body.actorId && req.body.actorId !== req.user.id && req.user.role !== UserRole.ADMIN) {
        throw new AppError(403, ErrorCode.FORBIDDEN, 'Caller actor ID mismatch with authenticated identity');
      }
      if (req.body.role && req.body.role !== req.user.role) {
        throw new AppError(403, ErrorCode.FORBIDDEN, 'Caller role mismatch with authenticated identity');
      }

      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const { action, otpCode, qrToken, conditionNotes, incidentFlag, ttlMinutes } = req.body;

      if (!action || !Object.values(CustodyAction).includes(action)) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          `Invalid or missing action. Allowed values: [${Object.values(CustodyAction).join(', ')}]`,
          [{ field: 'action', message: 'Valid CustodyAction is required' }]
        );
      }

      if (action === CustodyAction.GENERATE_CREDENTIAL) {
        // Default intended credential action is CHECK_IN unless explicitly requested as CHECK_OUT
        const intendedAction: CustodyAction =
          req.body.credentialAction === 'CHECK_OUT' ? CustodyAction.CHECK_OUT : CustodyAction.CHECK_IN;

        const result = await custodyService.generateCredential(
          id,
          intendedAction,
          req.user,
          typeof ttlMinutes === 'number' ? ttlMinutes : 10
        );

        res.status(200).json(successResponse({ credential: result }));
        return;
      }

      if (action === CustodyAction.CHECK_IN) {
        const updatedBooking = await custodyService.checkIn(id, { otpCode, qrToken }, req.user);
        res.status(200).json(successResponse({ booking: updatedBooking }));
        return;
      }

      if (action === CustodyAction.CHECK_OUT) {
        const updatedBooking = await custodyService.checkOut(
          id,
          { otpCode, qrToken, conditionNotes, incidentFlag },
          req.user
        );
        res.status(200).json(successResponse({ booking: updatedBooking }));
        return;
      }
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/bookings/process-no-shows - On-demand worker/admin no-show processor
   */
  public static async processNoShows(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (req.body && req.body.referenceTime) {
        if (process.env.NODE_ENV === 'production') {
          throw new AppError(
            403,
            ErrorCode.FORBIDDEN,
            'referenceTime override is disabled in production environment'
          );
        }
      }

      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required to run no-show processing');
      }

      const isAuthorizedRole = req.user.role === UserRole.ADMIN || req.user.role === UserRole.LAB_OWNER;
      if (!isAuthorizedRole) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'Unauthorized: No-show sweeps require administrator or lab owner permissions'
        );
      }

      let referenceTime: Date | undefined;
      if (req.body && req.body.referenceTime) {
        referenceTime = new Date(req.body.referenceTime);
        if (isNaN(referenceTime.getTime())) {
          throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid referenceTime ISO format');
        }
      }

      const result = await schedulerService.processNoShows(referenceTime);
      res.status(200).json(successResponse(result));
    } catch (err) {
      next(err);
    }
  }
}
