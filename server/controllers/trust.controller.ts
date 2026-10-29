import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { TrustService } from '../services/trust.service.js';
import { validateImageUploads } from '../middleware/upload.js';
import { AppError, ErrorCode, successResponse } from '../utils/errors.js';

const trustService = new TrustService();

export class TrustController {
  /**
   * POST /api/trust/inspect-condition
   * Compare check-in and check-out photos to detect condition changes
   *
   * Authorization: Authenticated users only
   * Content-Type: multipart/form-data
   *
   * Form fields:
   *   - check_in_photo: Image file (JPEG, PNG, WebP, max 5MB)
   *   - check_out_photo: Image file (JPEG, PNG, WebP, max 5MB)
   *
   * Returns: ConditionInspectionResult with match_score, detected_anomalies, severity
   *
   * IMPORTANT: requires_human_review is ALWAYS true. This endpoint provides
   * analysis to assist human decision-making, never to automatically impose penalties.
   */
  public static async inspectCondition(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Require authentication
      if (!req.user) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required');
      }

      // Validate uploaded images
      const { checkInPhoto, checkOutPhoto } = validateImageUploads(req.files);

      // Perform condition inspection
      const result = await trustService.inspectCondition(checkInPhoto, checkOutPhoto);

      res.status(200).json(successResponse({ inspection: result }));
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/trust/health
   * Check if vision service is properly configured and available
   *
   * Public endpoint for service health monitoring
   */
  public static async checkHealth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const isAvailable = trustService.isVisionServiceAvailable();

      res.status(200).json(
        successResponse({
          service: 'trust-inspection',
          vision_provider_available: isAvailable,
          requires_configuration: !isAvailable,
          configuration_hint: isAvailable
            ? null
            : 'Set GEMINI_API_KEY environment variable. Obtain key from https://aistudio.google.com/apikey',
        })
      );
    } catch (err) {
      next(err);
    }
  }
}
