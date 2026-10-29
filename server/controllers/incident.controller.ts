import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { IncidentService } from '../services/incident.service.js';
import { AuditService } from '../services/audit.service.js';
import { AppError, ErrorCode, successResponse } from '../utils/errors.js';
import { UserRole } from '../types/booking.js';
import type {
  CreateIncidentFromInspectionRequest,
  CreateManualIncidentRequest,
  ResolveIncidentRequest,
  IncidentQueryParams,
} from '../types/incident.js';

const incidentService = new IncidentService();
const auditService = AuditService.getInstance();

export class IncidentController {
  /**
   * POST /api/incidents/from-inspection
   * Create incident from AI condition inspection results
   *
   * Authorization: Authenticated users
   * Used by system after check-out inspection detects anomalies
   */
  public static async createFromInspection(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }

      const request = req.body as CreateIncidentFromInspectionRequest;

      // Validate required fields
      if (!request.bookingId || !request.resourceId || !request.userId) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'Missing required fields: bookingId, resourceId, userId'
        );
      }

      if (!request.detectedAnomalies || !Array.isArray(request.detectedAnomalies)) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'detectedAnomalies must be a non-empty array'
        );
      }

      if (!request.aiSeverity || !['MINOR', 'MODERATE', 'SEVERE'].includes(request.aiSeverity)) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'aiSeverity must be MINOR, MODERATE, or SEVERE'
        );
      }

      // Create incident
      const incident = await incidentService.createIncidentFromInspection(request);

      // Record in audit ledger
      await auditService.appendEvent(
        {
          eventType: 'damage_report_filed',
          bookingId: incident.bookingId,
          resourceId: incident.resourceId,
          userId: incident.userId,
          description: `AI inspection detected ${incident.aiSeverity} condition anomalies`,
          metadata: {
            incidentId: incident.id,
            source: 'AI_INSPECTION',
            detectedAnomalies: incident.detectedAnomalies,
            matchScore: incident.matchScore,
            proposedPenalty: incident.proposedPenalty,
          },
        },
        req.user.id,
        req.user.role
      );

      res.status(201).json(successResponse({ incident }));
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/incidents/manual
   * Create manual incident report
   *
   * Authorization: LAB_OWNER, ADMIN
   * Used by staff to manually report damage
   */
  public static async createManualReport(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }

      // Authorization: Only LAB_OWNER, ADMIN can create manual reports
      if (req.user.role !== UserRole.LAB_OWNER && req.user.role !== UserRole.ADMIN) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'Only lab owners and administrators can file manual damage reports'
        );
      }

      const request = req.body as CreateManualIncidentRequest;

      // Validate required fields
      if (!request.bookingId || !request.resourceId || !request.userId) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'Missing required fields: bookingId, resourceId, userId'
        );
      }

      if (!request.reportDescription || request.reportDescription.trim().length < 10) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'reportDescription must be at least 10 characters'
        );
      }

      // Create incident
      const incident = await incidentService.createManualIncident(request, req.user.id);

      // Record in audit ledger
      await auditService.appendEvent(
        {
          eventType: 'damage_report_filed',
          bookingId: incident.bookingId,
          resourceId: incident.resourceId,
          userId: incident.userId,
          description: `Manual damage report filed by ${req.user.name}`,
          metadata: {
            incidentId: incident.id,
            source: 'MANUAL_REPORT',
            reportDescription: incident.reportDescription,
            proposedPenalty: incident.proposedPenalty,
          },
        },
        req.user.id,
        req.user.role
      );

      res.status(201).json(successResponse({ incident }));
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/incidents/:id/resolve
   * Resolve incident with human review decision
   *
   * Authorization: LAB_OWNER, ADMIN, AUDITOR
   * Critical: Reason is required for all decisions
   */
  public static async resolveIncident(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }

      // Authorization: Only LAB_OWNER, ADMIN, AUDITOR can resolve incidents
      const authorizedRoles = [UserRole.LAB_OWNER, UserRole.ADMIN, UserRole.AUDITOR];
      if (!authorizedRoles.includes(req.user.role as UserRole)) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'Only lab owners, administrators, and auditors can resolve incidents'
        );
      }

      const incidentId = req.params.id;
      const request = req.body as ResolveIncidentRequest;

      // Validate decision
      if (!request.decision || !['CONFIRM', 'OVERRIDE', 'DISMISS'].includes(request.decision)) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'decision must be CONFIRM, OVERRIDE, or DISMISS'
        );
      }

      // Resolve incident (service validates reason requirement)
      const resolvedIncident = await incidentService.resolveIncident(
        incidentId,
        request,
        req.user.id
      );

      // Record resolution in audit ledger
      await auditService.appendEvent(
        {
          eventType: 'incident_resolved',
          bookingId: resolvedIncident.bookingId,
          resourceId: resolvedIncident.resourceId,
          userId: resolvedIncident.userId,
          description: `Incident ${resolvedIncident.reviewDecision?.toLowerCase()}ed by ${req.user.name}: ${resolvedIncident.reviewReason}`,
          metadata: {
            incidentId: resolvedIncident.id,
            decision: resolvedIncident.reviewDecision,
            reason: resolvedIncident.reviewReason,
            finalPenalty: resolvedIncident.finalPenalty,
            finalStatus: resolvedIncident.status,
          },
        },
        req.user.id,
        req.user.role
      );

      res.status(200).json(successResponse({ incident: resolvedIncident }));
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/incidents/:id
   * Get incident by ID
   *
   * Authorization: Authenticated users
   */
  public static async getIncident(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }

      const incidentId = req.params.id;
      const incident = await incidentService.getIncident(incidentId);

      if (!incident) {
        throw new AppError(
          404,
          ErrorCode.RESOURCE_NOT_FOUND,
          `Incident ${incidentId} not found`
        );
      }

      res.status(200).json(successResponse({ incident }));
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/incidents
   * Query incidents with filtering
   *
   * Authorization: Authenticated users
   * Query params: status, source, bookingId, resourceId, userId, reviewedBy, limit
   */
  public static async queryIncidents(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }

      const query: IncidentQueryParams = {
        status: req.query.status as any,
        source: req.query.source as any,
        bookingId: req.query.bookingId as string,
        resourceId: req.query.resourceId as string,
        userId: req.query.userId as string,
        reviewedBy: req.query.reviewedBy as string,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      };

      // Validate limit
      if (query.limit !== undefined && (isNaN(query.limit) || query.limit < 1 || query.limit > 500)) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'limit must be between 1 and 500'
        );
      }

      const incidents = await incidentService.queryIncidents(query);

      res.status(200).json(
        successResponse({
          incidents,
          count: incidents.length,
          filters: query,
        })
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/incidents/pending
   * Get all pending incidents (review queue)
   *
   * Authorization: LAB_OWNER, ADMIN, AUDITOR
   */
  public static async getPendingIncidents(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }

      // Authorization: Only reviewers can see pending queue
      const authorizedRoles = [UserRole.LAB_OWNER, UserRole.ADMIN, UserRole.AUDITOR];
      if (!authorizedRoles.includes(req.user.role as UserRole)) {
        throw new AppError(
          403,
          ErrorCode.FORBIDDEN,
          'Only lab owners, administrators, and auditors can view pending incidents'
        );
      }

      const incidents = await incidentService.getPendingIncidents();

      res.status(200).json(
        successResponse({
          incidents,
          count: incidents.length,
        })
      );
    } catch (err) {
      next(err);
    }
  }
}
