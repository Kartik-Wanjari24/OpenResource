import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { discoveryService } from '../services/discovery.service.js';
import { successResponse, AppError, ErrorCode } from '../utils/errors.js';
import { discoveryRequestSchema } from '../types/validation.js';
import { ZodError } from 'zod';

class DiscoveryController {
  /**
   * POST /api/resources/discover - Intelligent resource discovery with eligibility
   */
  async discoverResources(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) {
        return next(
          new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required')
        );
      }

      // Validate request body
      const requestData = discoveryRequestSchema.parse(req.body);

      // Get user's badge IDs from headers (development mode)
      // In production, this would come from the user's profile in the database
      const userBadgeIds = this.getUserBadgeIds(req);

      // Execute discovery with eligibility calculation
      const result = await discoveryService.discoverResources(
        requestData,
        req.user.id,
        userBadgeIds
      );

      res.json(successResponse({
        results: result.results,
        alternatives: result.alternatives,
        totalResults: result.results.length,
      }));
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          new AppError(
            400,
            ErrorCode.VALIDATION_ERROR,
            'Invalid discovery request',
            error.errors.map(e => ({
              field: e.path.join('.'),
              message: e.message
            }))
          )
        );
      }
      next(error);
    }
  }

  /**
   * Get user's badge IDs
   * In development mode, read from X-Test-User-Badges header
   * In production, would query user's badge wallet from database
   */
  private getUserBadgeIds(req: AuthenticatedRequest): string[] {
    // Development mode: read from header
    const badgesHeader = req.headers['x-test-user-badges'] as string;
    if (badgesHeader) {
      return badgesHeader.split(',').map(b => b.trim()).filter(b => b.length > 0);
    }

    // Production mode: would query database
    // For now, return empty array
    return [];
  }
}

export const discoveryController = new DiscoveryController();
