import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { resourceController } from '../controllers/resource.controller.js';
import { discoveryController } from '../controllers/discovery.controller.js';

const router = express.Router();

// Discovery endpoint - must come before /:id route
router.post('/discover', authenticate, discoveryController.discoverResources);

// GET /api/resources - List all resources (authenticated)
router.get('/', authenticate, resourceController.getAllResources);

// GET /api/resources/:id - Get single resource (authenticated)
router.get('/:id', authenticate, resourceController.getResourceById);

// POST /api/resources - Create resource (admin/lab owner only)
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'LAB_OWNER'),
  resourceController.createResource
);

// PATCH /api/resources/:id - Update resource (owner/admin only)
router.patch(
  '/:id',
  authenticate,
  resourceController.updateResource
);

// DELETE /api/resources/:id - Delete resource (owner/admin only)
router.delete(
  '/:id',
  authenticate,
  resourceController.deleteResource
);

export { router as resourceRoutes };
