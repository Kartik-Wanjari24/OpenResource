import type { ConditionInspectionResult } from '../types/trust.js';
import { VisionService } from './vision.service.js';
import { AppError, ErrorCode } from '../utils/errors.js';

/**
 * Trust Service
 * Handles condition inspection and comparison logic
 */
export class TrustService {
  private visionService: VisionService;

  constructor() {
    this.visionService = new VisionService();
  }

  /**
   * Inspect condition by comparing check-in and check-out photos
   *
   * Safety: This method NEVER automatically imposes penalties or determines liability.
   * All findings require human review before any action is taken.
   */
  public async inspectCondition(
    checkInPhoto: Express.Multer.File,
    checkOutPhoto: Express.Multer.File
  ): Promise<ConditionInspectionResult> {
    // Verify vision provider is available
    if (!this.visionService.isAvailable()) {
      throw new AppError(
        503,
        ErrorCode.SERVICE_UNAVAILABLE,
        'Vision analysis service is not configured. Please set GEMINI_API_KEY environment variable. ' +
          'Obtain an API key from https://aistudio.google.com/apikey'
      );
    }

    // Perform vision analysis
    const analysisResult = await this.visionService.compareCondition(
      checkInPhoto.buffer,
      checkInPhoto.mimetype,
      checkOutPhoto.buffer,
      checkOutPhoto.mimetype
    );

    // Construct inspection result
    // CRITICAL: requires_human_review is ALWAYS true per Phase 1 requirements
    const result: ConditionInspectionResult = {
      match_score: analysisResult.match_score,
      detected_anomalies: analysisResult.detected_anomalies,
      severity: analysisResult.severity,
      requires_human_review: true, // ALWAYS require human review - never auto-penalize
      inspection_timestamp: new Date().toISOString(),
      provider_metadata: analysisResult.provider_metadata,
    };

    return result;
  }

  /**
   * Check if the vision service is properly configured
   */
  public isVisionServiceAvailable(): boolean {
    return this.visionService.isAvailable();
  }
}
