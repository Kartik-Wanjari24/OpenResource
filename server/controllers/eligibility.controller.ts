import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { EligibilityService } from '../services/eligibility.service.js';
import { AppError, ErrorCode, successResponse } from '../utils/errors.js';

const eligibilityService = new EligibilityService();

export class EligibilityController {
  /**
   * POST /api/trust/verify-eligibility
   * Verify user eligibility via certificate upload or safety assessment
   *
   * SAFETY: Phase 2 implementation with manual review
   * - Certificate uploads return PENDING_MANUAL_REVIEW
   * - Assessment requires configured questions and answers
   * - Does NOT automatically grant badges without persistence mechanism
   * - Always returns requires_human_review: true
   */
  public static async verifyEligibility(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Require authentication
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }

      // Determine verification method based on request content
      const hasCertificate = req.file !== undefined;
      const hasAssessment = req.body && req.body.answers !== undefined;

      if (!hasCertificate && !hasAssessment) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'Must provide either safety certificate file or assessment answers',
          [
            {
              message:
                'Include certificate file as multipart/form-data OR assessment answers as JSON',
            },
          ]
        );
      }

      if (hasCertificate && hasAssessment) {
        throw new AppError(
          400,
          ErrorCode.VALIDATION_ERROR,
          'Cannot submit both certificate and assessment in same request',
          [
            {
              message: 'Submit certificate OR assessment separately, not both',
            },
          ]
        );
      }

      let result;

      if (hasCertificate) {
        // Certificate verification
        result = await eligibilityService.verifyCertificate(req.file!, req.user.id);
      } else {
        // Safety assessment verification
        const submission = {
          answers: req.body.answers,
          resourceCategory: req.body.resourceCategory,
        };

        // Validate answers structure
        if (!Array.isArray(submission.answers)) {
          throw new AppError(
            400,
            ErrorCode.VALIDATION_ERROR,
            'Assessment answers must be an array',
            [{ field: 'answers', message: 'Must be an array of {questionId, answer} objects' }]
          );
        }

        // Validate each answer
        for (let i = 0; i < submission.answers.length; i++) {
          const answer = submission.answers[i];
          if (!answer.questionId || typeof answer.questionId !== 'string') {
            throw new AppError(
              400,
              ErrorCode.VALIDATION_ERROR,
              `Answer ${i + 1} missing or invalid questionId`,
              [{ field: `answers[${i}].questionId`, message: 'Must be a non-empty string' }]
            );
          }
          if (answer.answer === undefined || typeof answer.answer !== 'string') {
            throw new AppError(
              400,
              ErrorCode.VALIDATION_ERROR,
              `Answer ${i + 1} missing or invalid answer`,
              [{ field: `answers[${i}].answer`, message: 'Must be a string' }]
            );
          }
        }

        result = await eligibilityService.verifyAssessment(submission, req.user.id);
      }

      res.status(200).json(successResponse({ verification: result }));
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/trust/eligibility/questions
   * Get available safety assessment questions
   *
   * Public endpoint - returns questions without correct answers
   */
  public static async getAssessmentQuestions(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const questions = eligibilityService.getSafetyQuestions();

      if (questions.length === 0) {
        res.status(200).json(
          successResponse({
            questions: [],
            available: false,
            message: 'Safety assessment questions not configured. Contact administrator.',
          })
        );
        return;
      }

      res.status(200).json(
        successResponse({
          questions,
          available: true,
          total: questions.length,
        })
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/trust/eligibility/config
   * Check eligibility verification configuration status
   *
   * Useful for frontend to determine available verification methods
   */
  public static async getConfigurationStatus(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const status = eligibilityService.isConfigured();

      res.status(200).json(
        successResponse({
          certificate_verification_enabled: status.certificateVerification,
          safety_assessment_enabled: status.safetyAssessment,
          configuration_complete: status.missingConfig.length === 0,
          missing_configuration: status.missingConfig,
          note:
            status.missingConfig.length > 0
              ? 'Verification methods require additional configuration'
              : 'All verification methods are configured',
        })
      );
    } catch (err) {
      next(err);
    }
  }
}
