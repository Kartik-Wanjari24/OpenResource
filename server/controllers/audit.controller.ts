import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { AuditService } from '../services/audit.service.js';
import { AppError, ErrorCode, successResponse } from '../utils/errors.js';
import type { AppendAuditEventRequest, AuditQueryParams } from '../types/audit.js';

const auditService = AuditService.getInstance();

export class AuditController {
  /**
   * POST /api/audit/append
   * Append a new event to the audit chain
   *
   * SECURITY:
   * - Requires authentication
   * - Actor ID and role taken from authenticated user (not client request)
   * - Never trusts client-supplied hashes, sequence numbers, or verification status
   * - Server controls all cryptographic operations
   */
  public static async appendEvent(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Require authentication
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }

      // Validate request body
      const request = req.body as AppendAuditEventRequest;

      if (!request.eventType || typeof request.eventType !== 'string') {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'Missing or invalid eventType',
          [{ field: 'eventType', message: 'Must be a valid audit event type string' }]
        );
      }

      if (!request.description || typeof request.description !== 'string' || request.description.trim() === '') {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'Missing or invalid description',
          [{ field: 'description', message: 'Must be a non-empty string' }]
        );
      }

      // Validate optional IDs if provided
      if (request.resourceId !== undefined && typeof request.resourceId !== 'string') {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'Invalid resourceId',
          [{ field: 'resourceId', message: 'Must be a string if provided' }]
        );
      }

      if (request.bookingId !== undefined && typeof request.bookingId !== 'string') {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'Invalid bookingId',
          [{ field: 'bookingId', message: 'Must be a string if provided' }]
        );
      }

      if (request.userId !== undefined && typeof request.userId !== 'string') {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'Invalid userId',
          [{ field: 'userId', message: 'Must be a string if provided' }]
        );
      }

      if (request.metadata !== undefined && typeof request.metadata !== 'object') {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'Invalid metadata',
          [{ field: 'metadata', message: 'Must be an object if provided' }]
        );
      }

      // SECURITY: Use server-controlled actor ID and role from authentication
      // Never trust client-supplied actor identity
      const result = await auditService.appendEvent(
        request,
        req.user.id,
        req.user.role
      );

      res.status(201).json(
        successResponse({
          event: result.event,
          chainIntegrity: {
            verified: result.verified,
            chainLength: result.chainLength,
          },
        })
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/audit/verify
   * Verify the integrity of the audit chain
   *
   * SECURITY:
   * - Read-only operation
   * - May be restricted to admin/auditor roles in production
   * - Returns cryptographic verification result
   * - Detects modified payloads, broken links, invalid hashes
   */
  public static async verifyChain(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Authentication check (optional for verification, but recommended)
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }

      // Perform chain verification
      const result = await auditService.verifyChain();

      // Return verification result with appropriate status
      const status = result.valid ? 200 : 200; // Always 200, client checks 'valid' field

      res.status(status).json(
        successResponse({
          integrity: result,
          summary: {
            status: result.valid ? 'VALID' : 'COMPROMISED',
            totalEvents: result.totalEvents,
            verifiedEvents: result.verifiedEvents,
            failedEvents: result.totalEvents - result.verifiedEvents,
            firstFailureAt: result.firstFailureAt,
          },
        })
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/audit/events
   * Retrieve audit events with optional filtering
   *
   * SECURITY:
   * - Requires authentication
   * - May be restricted to admin/auditor roles in production
   * - Never exposes sensitive metadata without authorization
   * - Supports filtering to limit exposed data
   */
  public static async getEvents(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Require authentication
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }

      // Parse query parameters
      const query: AuditQueryParams = {
        eventType: req.query.eventType as string | undefined,
        actorId: req.query.actorId as string | undefined,
        resourceId: req.query.resourceId as string | undefined,
        bookingId: req.query.bookingId as string | undefined,
        userId: req.query.userId as string | undefined,
        fromSequence: req.query.fromSequence ? parseInt(req.query.fromSequence as string, 10) : undefined,
        toSequence: req.query.toSequence ? parseInt(req.query.toSequence as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
      };

      // Validate numeric parameters
      if (query.fromSequence !== undefined && isNaN(query.fromSequence)) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'Invalid fromSequence parameter',
          [{ field: 'fromSequence', message: 'Must be a valid integer' }]
        );
      }

      if (query.toSequence !== undefined && isNaN(query.toSequence)) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'Invalid toSequence parameter',
          [{ field: 'toSequence', message: 'Must be a valid integer' }]
        );
      }

      if (query.limit !== undefined && (isNaN(query.limit) || query.limit < 1 || query.limit > 1000)) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'Invalid limit parameter',
          [{ field: 'limit', message: 'Must be an integer between 1 and 1000' }]
        );
      }

      // Retrieve events
      const events = await auditService.getEvents(query);
      const totalCount = auditService.getEventCount();

      res.status(200).json(
        successResponse({
          events,
          pagination: {
            returned: events.length,
            totalEvents: totalCount,
          },
          filters: query,
        })
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/audit/status
   * Get audit chain status summary
   *
   * Public endpoint for monitoring chain health
   */
  public static async getStatus(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const totalEvents = auditService.getEventCount();
      const verification = await auditService.verifyChain();

      res.status(200).json(
        successResponse({
          chainLength: totalEvents,
          integrity: verification.valid ? 'VALID' : 'COMPROMISED',
          lastVerification: verification.verificationTimestamp,
          firstEvent: totalEvents > 0 ? auditService.getEventBySequence(1) : null,
          latestEvent: totalEvents > 0 ? auditService.getEventBySequence(totalEvents) : null,
        })
      );
    } catch (err) {
      next(err);
    }
  }
}
