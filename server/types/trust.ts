/**
 * Trust & Inspection Types
 * Phase 1: Before & After Condition Inspection API
 */

export interface DetectedAnomaly {
  type: string;
  description: string;
  severity: 'MINOR' | 'MODERATE' | 'SEVERE';
  confidence?: number;
}

export interface ConditionInspectionResult {
  match_score: number;
  detected_anomalies: DetectedAnomaly[];
  severity: 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE';
  requires_human_review: boolean;
  inspection_timestamp: string;
  provider_metadata?: {
    provider: string;
    model: string;
    response_time_ms?: number;
  };
}

export interface InspectionRequest {
  check_in_photo: Express.Multer.File;
  check_out_photo: Express.Multer.File;
  booking_id?: string;
  resource_id?: string;
}
