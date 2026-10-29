/**
 * Phase 2: Eligibility Verification Types
 * Safe API foundation with manual review
 */

export const VerificationMethod = {
  CERTIFICATE_UPLOAD: 'certificate_upload',
  SAFETY_ASSESSMENT: 'safety_assessment',
} as const;

export type VerificationMethod = (typeof VerificationMethod)[keyof typeof VerificationMethod];

export const VerificationStatus = {
  PENDING_MANUAL_REVIEW: 'PENDING_MANUAL_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CONFIGURATION_REQUIRED: 'CONFIGURATION_REQUIRED',
} as const;

export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

export interface SafetyAssessmentAnswer {
  questionId: string;
  answer: string;
}

export interface SafetyAssessmentSubmission {
  answers: SafetyAssessmentAnswer[];
  resourceCategory?: string;
}

export interface CertificateMetadata {
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}

export interface EligibilityVerificationResult {
  verification_status: VerificationStatus;
  verification_method: VerificationMethod;
  eligible: boolean;
  eligibility_badge: string | null;
  score: number | null;
  reasons: string[];
  requires_human_review: boolean;
  configuration_missing?: string[];
  certificate_metadata?: CertificateMetadata;
  assessment_details?: {
    total_questions: number;
    answered_questions: number;
    passing_threshold?: number;
  };
}

export interface SafetyQuestion {
  id: string;
  question: string;
  category?: string;
  correctAnswer: string;
}

export interface EligibilityConfig {
  safetyQuestions: SafetyQuestion[];
  passingThreshold: number;
  badgeToAward: string;
  trustedCertificateIssuers: string[];
  certificateVerificationEnabled: boolean;
}
