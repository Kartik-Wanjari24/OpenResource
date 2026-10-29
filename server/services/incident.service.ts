import type {
  Incident,
  IncidentStatus,
  CreateIncidentFromInspectionRequest,
  CreateManualIncidentRequest,
  ResolveIncidentRequest,
  IncidentQueryParams,
} from '../types/incident.js';
import { AppError, ErrorCode } from '../utils/errors.js';

/**
 * Incident Management Service
 * Phase 4: Human-in-the-Loop Dispute Console
 *
 * CRITICAL DESIGN NOTES:
 * - All incident resolutions require human review
 * - AI-flagged anomalies never automatically impose penalties
 * - Human reviewers can confirm, override, or dismiss incidents
 * - All decisions must include a reason for audit trail
 * - Authorization checks enforced: only LAB_OWNER, ADMIN, AUDITOR can resolve
 * - Incidents are immutable after resolution (no updates allowed)
 */
export class IncidentService {
  // In-memory storage for Phase 4
  // Production would use durable database storage
  private incidents: Map<string, Incident> = new Map();

  /**
   * Create incident from AI condition inspection
   */
  public async createIncidentFromInspection(
    request: CreateIncidentFromInspectionRequest
  ): Promise<Incident> {
    const incident: Incident = {
      id: this.generateIncidentId(),
      bookingId: request.bookingId,
      resourceId: request.resourceId,
      userId: request.userId,
      source: 'AI_INSPECTION',
      status: 'PENDING_REVIEW',
      detectedAnomalies: request.detectedAnomalies,
      aiSeverity: request.aiSeverity,
      matchScore: request.matchScore,
      proposedPenalty: request.proposedPenalty,
      reviewReason: '', // Will be set on resolution
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.incidents.set(incident.id, incident);
    return incident;
  }

  /**
   * Create manual incident report
   */
  public async createManualIncident(
    request: CreateManualIncidentRequest,
    reportedBy: string
  ): Promise<Incident> {
    const incident: Incident = {
      id: this.generateIncidentId(),
      bookingId: request.bookingId,
      resourceId: request.resourceId,
      userId: request.userId,
      source: 'MANUAL_REPORT',
      status: 'PENDING_REVIEW',
      reportedBy,
      reportDescription: request.reportDescription,
      proposedPenalty: request.proposedPenalty,
      reviewReason: '', // Will be set on resolution
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.incidents.set(incident.id, incident);
    return incident;
  }

  /**
   * Resolve incident (human review decision)
   *
   * SECURITY: Authorization must be checked by caller
   * Only LAB_OWNER, ADMIN, or AUDITOR roles should be allowed
   *
   * CRITICAL: Reason is required for all decisions
   * This ensures audit trail explains why decision was made
   */
  public async resolveIncident(
    incidentId: string,
    request: ResolveIncidentRequest,
    reviewerId: string
  ): Promise<Incident> {
    const incident = this.incidents.get(incidentId);

    if (!incident) {
      throw new AppError(
        404,
        ErrorCode.RESOURCE_NOT_FOUND,
        `Incident ${incidentId} not found`
      );
    }

    // Prevent resolving already-resolved incidents
    if (incident.status !== 'PENDING_REVIEW') {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        `Incident is already ${incident.status} and cannot be modified`,
        [{ message: 'Incidents are immutable after resolution' }]
      );
    }

    // Validate reason is provided
    if (!request.reason || request.reason.trim().length === 0) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Resolution reason is required',
        [{ field: 'reason', message: 'Must provide explanation for decision' }]
      );
    }

    // Validate reason length (meaningful explanation)
    if (request.reason.trim().length < 10) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Resolution reason must be at least 10 characters',
        [{ field: 'reason', message: 'Provide meaningful explanation for audit trail' }]
      );
    }

    // Determine final status based on decision
    let finalStatus: IncidentStatus;
    switch (request.decision) {
      case 'CONFIRM':
        finalStatus = 'CONFIRMED';
        break;
      case 'OVERRIDE':
        finalStatus = 'OVERRIDDEN';
        break;
      case 'DISMISS':
        finalStatus = 'DISMISSED';
        break;
      default:
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          `Invalid decision: ${request.decision}`
        );
    }

    // For OVERRIDE decision, finalPenalty must be provided
    if (request.decision === 'OVERRIDE' && !request.finalPenalty) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Final penalty is required when overriding proposed penalty',
        [{ field: 'finalPenalty', message: 'Specify the new penalty amount and description' }]
      );
    }

    // For CONFIRM decision, use proposed penalty as final
    // For OVERRIDE decision, use provided final penalty
    // For DISMISS decision, no penalty
    const finalPenalty =
      request.decision === 'CONFIRM'
        ? incident.proposedPenalty
        : request.decision === 'OVERRIDE'
          ? request.finalPenalty
          : undefined;

    // Update incident with resolution
    const resolvedIncident: Incident = {
      ...incident,
      status: finalStatus,
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
      reviewDecision: request.decision,
      reviewReason: request.reason.trim(),
      finalPenalty,
      updatedAt: new Date().toISOString(),
    };

    this.incidents.set(incidentId, resolvedIncident);
    return resolvedIncident;
  }

  /**
   * Get incident by ID
   */
  public async getIncident(incidentId: string): Promise<Incident | null> {
    return this.incidents.get(incidentId) || null;
  }

  /**
   * Query incidents with filtering
   */
  public async queryIncidents(query: IncidentQueryParams = {}): Promise<Incident[]> {
    let results = Array.from(this.incidents.values());

    // Apply filters
    if (query.status) {
      results = results.filter((i) => i.status === query.status);
    }

    if (query.source) {
      results = results.filter((i) => i.source === query.source);
    }

    if (query.bookingId) {
      results = results.filter((i) => i.bookingId === query.bookingId);
    }

    if (query.resourceId) {
      results = results.filter((i) => i.resourceId === query.resourceId);
    }

    if (query.userId) {
      results = results.filter((i) => i.userId === query.userId);
    }

    if (query.reviewedBy) {
      results = results.filter((i) => i.reviewedBy === query.reviewedBy);
    }

    // Sort by creation date (newest first)
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply limit
    if (query.limit !== undefined && query.limit > 0) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Get all pending incidents (for review queue)
   */
  public async getPendingIncidents(): Promise<Incident[]> {
    return this.queryIncidents({ status: 'PENDING_REVIEW' });
  }

  /**
   * Generate unique incident ID
   */
  private generateIncidentId(): string {
    return `incident_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }
}
