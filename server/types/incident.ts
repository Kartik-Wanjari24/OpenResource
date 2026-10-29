/**
 * Phase 4: Incident & Human-in-the-Loop Dispute Console Types
 * Manages damage reports and human review/resolution workflow
 */

import type { DetectedAnomaly } from './trust.js';

export const IncidentStatus = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  CONFIRMED: 'CONFIRMED',
  OVERRIDDEN: 'OVERRIDDEN',
  DISMISSED: 'DISMISSED',
} as const;

export type IncidentStatus = (typeof IncidentStatus)[keyof typeof IncidentStatus];

export const IncidentSource = {
  AI_INSPECTION: 'AI_INSPECTION',
  MANUAL_REPORT: 'MANUAL_REPORT',
} as const;

export type IncidentSource = (typeof IncidentSource)[keyof typeof IncidentSource];

/**
 * Incident record representing a damage report or AI-flagged anomaly
 */
export interface Incident {
  id: string;
  bookingId: string;
  resourceId: string;
  userId: string; // User responsible for the booking
  source: IncidentSource;
  status: IncidentStatus;

  // AI-detected anomalies (if source is AI_INSPECTION)
  detectedAnomalies?: DetectedAnomaly[];
  aiSeverity?: 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE';
  matchScore?: number;

  // Manual report details (if source is MANUAL_REPORT)
  reportedBy?: string;
  reportDescription?: string;

  // Proposed penalty (can be suggested by AI or manual reporter)
  proposedPenalty?: {
    amount: number;
    currency: string;
    description: string;
  };

  // Human review/resolution
  reviewedBy?: string;
  reviewedAt?: string;
  reviewDecision?: 'CONFIRM' | 'OVERRIDE' | 'DISMISS';
  reviewReason: string; // Required for all decisions
  finalPenalty?: {
    amount: number;
    currency: string;
    description: string;
  };

  // Metadata
  createdAt: string;
  updatedAt: string;
}

/**
 * Request to create an incident from AI inspection
 */
export interface CreateIncidentFromInspectionRequest {
  bookingId: string;
  resourceId: string;
  userId: string;
  detectedAnomalies: DetectedAnomaly[];
  aiSeverity: 'MINOR' | 'MODERATE' | 'SEVERE';
  matchScore: number;
  proposedPenalty?: {
    amount: number;
    currency: string;
    description: string;
  };
}

/**
 * Request to create a manual incident report
 */
export interface CreateManualIncidentRequest {
  bookingId: string;
  resourceId: string;
  userId: string;
  reportDescription: string;
  proposedPenalty?: {
    amount: number;
    currency: string;
    description: string;
  };
}

/**
 * Request to resolve an incident (human review)
 */
export interface ResolveIncidentRequest {
  decision: 'CONFIRM' | 'OVERRIDE' | 'DISMISS';
  reason: string; // Required explanation for decision
  finalPenalty?: {
    amount: number;
    currency: string;
    description: string;
  };
}

/**
 * Query parameters for incident retrieval
 */
export interface IncidentQueryParams {
  status?: IncidentStatus;
  source?: IncidentSource;
  bookingId?: string;
  resourceId?: string;
  userId?: string;
  reviewedBy?: string;
  limit?: number;
}
