import { Router } from 'express';
import { IncidentController } from '../controllers/incident.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/incidents/from-inspection
 * Create incident from AI condition inspection
 *
 * Phase 4: Human-in-the-Loop Dispute Console
 * Authorization: Authenticated users
 */
router.post('/from-inspection', authenticate, IncidentController.createFromInspection);

/**
 * POST /api/incidents/manual
 * Create manual damage report
 *
 * Authorization: LAB_OWNER, ADMIN only
 */
router.post('/manual', authenticate, IncidentController.createManualReport);

/**
 * POST /api/incidents/:id/resolve
 * Resolve incident with human review decision
 *
 * Authorization: LAB_OWNER, ADMIN, AUDITOR only
 * Required: decision (CONFIRM/OVERRIDE/DISMISS) and reason
 */
router.post('/:id/resolve', authenticate, IncidentController.resolveIncident);

/**
 * GET /api/incidents/pending
 * Get all pending incidents (review queue)
 *
 * Authorization: LAB_OWNER, ADMIN, AUDITOR only
 */
router.get('/pending', authenticate, IncidentController.getPendingIncidents);

/**
 * GET /api/incidents/:id
 * Get incident by ID
 *
 * Authorization: Authenticated users
 */
router.get('/:id', authenticate, IncidentController.getIncident);

/**
 * GET /api/incidents
 * Query incidents with filtering
 *
 * Authorization: Authenticated users
 * Query params: status, source, bookingId, resourceId, userId, reviewedBy, limit
 */
router.get('/', authenticate, IncidentController.queryIncidents);

export const incidentRoutes = router;
