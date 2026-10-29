import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { resourceService } from '../services/resource.service.js';
import { successResponse, AppError, ErrorCode } from '../utils/errors.js';
import {
  createResourceSchema,
  updateResourceSchema,
  resourceQuerySchema,
  resourceIdSchema,
} from '../types/validation.js';
import { ZodError } from 'zod';

class ResourceController {
  /**
   * GET /api/resources - List all resources with filtering and pagination
   */
  async getAllResources(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const query = resourceQuerySchema.parse(req.query);
      const result = await resourceService.getAllResources(query, req.user?.id);

      res.json(successResponse({
        resources: result.items,
        pagination: result.pagination,
      }));
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          new AppError(
            400,
            ErrorCode.VALIDATION_ERROR,
            'Invalid query parameters',
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
   * GET /api/resources/:id - Get single resource by ID
   */
  async getResourceById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { id } = resourceIdSchema.parse(req.params);
      const resource = await resourceService.getResourceById(id);
      res.json(successResponse({ resource }));
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid resource ID')
        );
      }
      next(error);
    }
  }

  /**
   * POST /api/resources - Create a new resource
   */
  async createResource(
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

      const data = createResourceSchema.parse(req.body);
      const resource = await resourceService.createResource(data, req.user.id);

      res.status(201).json(successResponse({ resource }));
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          new AppError(
            400,
            ErrorCode.VALIDATION_ERROR,
            'Invalid resource data',
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
   * PATCH /api/resources/:id - Update an existing resource
   */
  async updateResource(
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

      const { id } = resourceIdSchema.parse(req.params);
      const data = updateResourceSchema.parse(req.body);

      const resource = await resourceService.updateResource(
        id,
        data,
        req.user.id,
        req.user.role
      );

      res.json(successResponse({ resource }));
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          new AppError(
            400,
            ErrorCode.VALIDATION_ERROR,
            'Invalid update data',
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
   * DELETE /api/resources/:id - Delete a resource (soft delete)
   */
  async deleteResource(
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

      const { id } = resourceIdSchema.parse(req.params);
      await resourceService.deleteResource(id, req.user.id, req.user.role);

      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid resource ID')
        );
      }
      next(error);
    }
  }
}

export const resourceController = new ResourceController();
