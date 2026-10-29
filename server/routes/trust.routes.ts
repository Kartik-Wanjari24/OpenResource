import { Router } from 'express';
import { TrustController } from '../controllers/trust.controller.js';
import { EligibilityController } from '../controllers/eligibility.controller.js';
import { authenticate } from '../middleware/auth.js';
import { uploadConditionPhotos, uploadCertificate } from '../middleware/upload.js';

const router = Router();

/**
 * POST /api/trust/inspect-condition
 * Compare before/after images to detect condition changes
 *
 * Authorization: Authenticated users
 * Content-Type: multipart/form-data
 */
router.post(
  '/inspect-condition',
  authenticate,
  uploadConditionPhotos,
  TrustController.inspectCondition
);

/**
 * POST /api/trust/verify-eligibility
 * Verify eligibility via certificate upload or safety assessment
 *
 * Phase 2: Safe API foundation with manual review
 * Authorization: Authenticated users
 *
 * Two verification methods:
 * 1. Certificate upload: multipart/form-data with 'certificate' file
 * 2. Safety assessment: JSON body with 'answers' array
 */
router.post(
  '/verify-eligibility',
  authenticate,
  uploadCertificate,
  EligibilityController.verifyEligibility
);

/**
 * GET /api/trust/eligibility/questions
 * Get available safety assessment questions
 *
 * Public endpoint (returns questions without answers)
 */
router.get('/eligibility/questions', EligibilityController.getAssessmentQuestions);

/**
 * GET /api/trust/eligibility/config
 * Check eligibility verification configuration status
 *
 * Public endpoint for checking available verification methods
 */
router.get('/eligibility/config', EligibilityController.getConfigurationStatus);

/**
 * GET /api/trust/health
 * Check vision service availability
 *
 * Public endpoint for monitoring
 */
router.get('/health', TrustController.checkHealth);

export const trustRoutes = router;
