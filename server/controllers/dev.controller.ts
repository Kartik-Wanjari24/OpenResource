import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { devService } from '../services/dev.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { successResponse, AppError, ErrorCode } from '../utils/errors.js';

// Validation schemas
const impersonateSchema = z.object({
  personaName: z.string().min(1, 'Persona name is required'),
});

const resetSeedSchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'Must explicitly confirm seed reset with confirm: true' }),
  }),
});

export class DevController {
  /**
   * POST /api/dev/impersonate
   * Switch user context to a demo persona
   */
  async impersonate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { personaName } = impersonateSchema.parse(req.body);

      const persona = await devService.impersonate(personaName);

      // Update the request user context (for this session)
      req.user = {
        id: persona.id,
        email: persona.email,
        role: persona.role,
      };

      // In a real implementation, this would update the session/JWT
      // For development, we'll return the persona info and rely on the client
      // to send appropriate test headers

      res.json(
        successResponse({
          impersonatedUser: {
            id: persona.id,
            name: persona.name,
            email: persona.email,
            role: persona.role,
            badges: persona.badges,
          },
          message: `Impersonating: ${persona.name} (${persona.role})`,
          instructions: {
            note: 'In development mode, send these headers with subsequent requests:',
            headers: {
              'X-Test-User-Id': persona.id,
              'X-Test-User-Role': persona.role,
              'X-Test-User-Badges': persona.badges.join(','),
            },
          },
        })
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(
          new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid request', [
            { message: error.errors.map((e) => e.message).join(', ') },
          ])
        );
      }
      next(error);
    }
  }

  /**
   * POST /api/dev/reset-seed
   * Reset database to deterministic demo state
   */
  async resetSeed(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { confirm } = resetSeedSchema.parse(req.body);

      const operations = await devService.resetSeed();

      res.json(
        successResponse({
          message: 'Database reset to demo state',
          operations,
          timestamp: new Date().toISOString(),
          warning: 'All previous bookings and non-demo data have been cleared',
        })
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(
          new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid request', [
            { message: error.errors.map((e) => e.message).join(', ') },
          ])
        );
      }
      next(error);
    }
  }

  /**
   * GET /api/dev/personas
   * List all available demo personas
   */
  async listPersonas(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const personas = devService.getAvailablePersonas();

      res.json(
        successResponse({
          personas: Object.entries(personas).map(([name, persona]) => ({
            name,
            id: persona.id,
            displayName: persona.name,
            role: persona.role,
            email: persona.email,
            badges: persona.badges,
          })),
          total: Object.keys(personas).length,
        })
      );
    } catch (error) {
      next(error);
    }
  }
}

export const devController = new DevController();
