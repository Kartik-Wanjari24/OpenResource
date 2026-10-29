import type {
  EligibilityVerificationResult,
  SafetyAssessmentSubmission,
  VerificationMethod,
  VerificationStatus,
  EligibilityConfig,
  CertificateMetadata,
} from '../types/eligibility.js';
import { AppError, ErrorCode } from '../utils/errors.js';

/**
 * Eligibility Verification Service
 * Phase 2: Safe API foundation with manual review
 *
 * CRITICAL SAFETY NOTES:
 * - Does NOT automatically issue badges
 * - Returns PENDING_MANUAL_REVIEW for all verifications until configuration is complete
 * - Certificate uploads validate format only, not authenticity
 * - Assessment answers checked against server-controlled configuration
 * - Never trusts client-supplied eligibility status or badge identifiers
 */
export class EligibilityService {
  private config: Partial<EligibilityConfig> = {};

  constructor() {
    this.loadConfiguration();
  }

  /**
   * Load configuration from environment or config file
   * Currently returns minimal configuration indicating setup required
   */
  private loadConfiguration(): void {
    // Check for configuration in environment
    const configJson = process.env.ELIGIBILITY_CONFIG;

    if (configJson) {
      try {
        this.config = JSON.parse(configJson);
      } catch (err) {
        console.error('Failed to parse ELIGIBILITY_CONFIG:', err);
        this.config = {};
      }
    }

    // Default minimal configuration
    if (!this.config.safetyQuestions) {
      this.config.safetyQuestions = [];
    }
    if (!this.config.trustedCertificateIssuers) {
      this.config.trustedCertificateIssuers = [];
    }
    this.config.certificateVerificationEnabled = false;
  }

  /**
   * Verify eligibility via certificate upload
   *
   * SAFETY: Returns PENDING_MANUAL_REVIEW because:
   * - File format validation does not prove authenticity
   * - No trusted issuer list configured
   * - No external verification service integrated
   * - Certificate data cannot be automatically verified
   */
  public async verifyCertificate(
    certificateFile: Express.Multer.File,
    userId: string
  ): Promise<EligibilityVerificationResult> {
    const certificateMetadata: CertificateMetadata = {
      originalFilename: certificateFile.originalname,
      mimeType: certificateFile.mimetype,
      fileSize: certificateFile.size,
      uploadedAt: new Date().toISOString(),
    };

    const configMissing: string[] = [];

    if (!this.config.trustedCertificateIssuers || this.config.trustedCertificateIssuers.length === 0) {
      configMissing.push('TRUSTED_CERTIFICATE_ISSUERS');
    }

    if (!this.config.certificateVerificationEnabled) {
      configMissing.push('CERTIFICATE_VERIFICATION_SERVICE');
    }

    // CRITICAL: Cannot verify certificate authenticity without configuration
    // File upload validation only confirms format, not authenticity
    return {
      verification_status: 'PENDING_MANUAL_REVIEW',
      verification_method: 'certificate_upload',
      eligible: false,
      eligibility_badge: null,
      score: null,
      reasons: [
        'Certificate uploaded successfully but requires manual verification',
        'Certificate authenticity cannot be automatically verified without trusted issuer list',
        'Human review required to confirm certificate validity and grant appropriate badge',
      ],
      requires_human_review: true,
      configuration_missing: configMissing,
      certificate_metadata: certificateMetadata,
    };
  }

  /**
   * Verify eligibility via safety assessment
   *
   * SAFETY: Only awards badge if:
   * - Questions are properly configured
   * - Answers match server-controlled correct answers
   * - Passing threshold is met
   * - Never trusts client-supplied scores or badge identifiers
   */
  public async verifyAssessment(
    submission: SafetyAssessmentSubmission,
    userId: string
  ): Promise<EligibilityVerificationResult> {
    // Validate submission has answers first
    if (!submission.answers || submission.answers.length === 0) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Assessment submission must include answers'
      );
    }

    const configMissing: string[] = [];

    // Check if safety questions are configured
    if (!this.config.safetyQuestions || this.config.safetyQuestions.length === 0) {
      configMissing.push('SAFETY_ASSESSMENT_QUESTIONS');
    }

    if (this.config.passingThreshold === undefined) {
      configMissing.push('PASSING_THRESHOLD');
    }

    if (!this.config.badgeToAward) {
      configMissing.push('BADGE_TO_AWARD');
    }

    // If configuration is missing, cannot evaluate assessment
    if (configMissing.length > 0) {
      return {
        verification_status: 'CONFIGURATION_REQUIRED',
        verification_method: 'safety_assessment',
        eligible: false,
        eligibility_badge: null,
        score: null,
        reasons: [
          'Safety assessment configuration is incomplete',
          'Cannot evaluate answers without configured questions and passing criteria',
          'Contact administrator to complete eligibility verification setup',
        ],
        requires_human_review: true,
        configuration_missing: configMissing,
        assessment_details: {
          total_questions: 0,
          answered_questions: submission.answers.length,
        },
      };
    }

    // Evaluate answers against server-controlled correct answers
    const { score, totalQuestions, correctCount } = this.evaluateAnswers(submission);

    const passed = correctCount >= (this.config.passingThreshold || 0);

    // CRITICAL: Only award badge if assessment is truly passed
    // Badge persistence not implemented - this is a placeholder
    const eligibilityBadge = passed ? this.config.badgeToAward || null : null;

    const reasons: string[] = [];
    if (passed) {
      reasons.push(`Assessment passed with score ${score}%`);
      reasons.push(`Correctly answered ${correctCount} of ${totalQuestions} questions`);
      reasons.push('Eligibility badge would be awarded: ' + eligibilityBadge);
      reasons.push('NOTE: Badge persistence not yet implemented - manual issuance required');
    } else {
      reasons.push(`Assessment not passed - score ${score}% below passing threshold`);
      reasons.push(`Correctly answered ${correctCount} of ${totalQuestions} questions`);
      reasons.push(`Passing threshold: ${this.config.passingThreshold || 0} correct answers required`);
    }

    return {
      verification_status: passed ? 'APPROVED' : 'REJECTED',
      verification_method: 'safety_assessment',
      eligible: passed,
      eligibility_badge: eligibilityBadge,
      score,
      reasons,
      requires_human_review: true, // Always true until badge persistence implemented
      assessment_details: {
        total_questions: totalQuestions,
        answered_questions: submission.answers.length,
        passing_threshold: this.config.passingThreshold,
      },
    };
  }

  /**
   * Evaluate assessment answers against correct answers
   * Server-controlled evaluation - never trusts client scores
   */
  private evaluateAnswers(submission: SafetyAssessmentSubmission): {
    score: number;
    totalQuestions: number;
    correctCount: number;
  } {
    const questions = this.config.safetyQuestions || [];
    const totalQuestions = questions.length;

    if (totalQuestions === 0) {
      return { score: 0, totalQuestions: 0, correctCount: 0 };
    }

    let correctCount = 0;

    // Build a map of correct answers
    const correctAnswersMap = new Map<string, string>();
    questions.forEach((q) => {
      correctAnswersMap.set(q.id, q.correctAnswer.toLowerCase().trim());
    });

    // Check each submitted answer
    submission.answers.forEach((answer) => {
      const correctAnswer = correctAnswersMap.get(answer.questionId);
      if (correctAnswer && answer.answer.toLowerCase().trim() === correctAnswer) {
        correctCount++;
      }
    });

    const score = Math.round((correctCount / totalQuestions) * 100);

    return { score, totalQuestions, correctCount };
  }

  /**
   * Get available safety questions (if configured)
   * Returns sanitized questions without correct answers
   */
  public getSafetyQuestions(): Array<{ id: string; question: string; category?: string }> {
    if (!this.config.safetyQuestions) {
      return [];
    }

    // Return questions without correct answers
    return this.config.safetyQuestions.map((q) => ({
      id: q.id,
      question: q.question,
      category: q.category,
    }));
  }

  /**
   * Check if eligibility verification is properly configured
   */
  public isConfigured(): {
    certificateVerification: boolean;
    safetyAssessment: boolean;
    missingConfig: string[];
  } {
    const missing: string[] = [];

    const hasCertConfig =
      this.config.certificateVerificationEnabled &&
      this.config.trustedCertificateIssuers &&
      this.config.trustedCertificateIssuers.length > 0;

    const hasAssessmentConfig =
      this.config.safetyQuestions &&
      this.config.safetyQuestions.length > 0 &&
      this.config.passingThreshold !== undefined &&
      this.config.badgeToAward !== undefined;

    if (!hasCertConfig) {
      missing.push('CERTIFICATE_VERIFICATION_CONFIG');
    }

    if (!hasAssessmentConfig) {
      missing.push('SAFETY_ASSESSMENT_CONFIG');
    }

    return {
      certificateVerification: hasCertConfig,
      safetyAssessment: hasAssessmentConfig,
      missingConfig: missing,
    };
  }
}
