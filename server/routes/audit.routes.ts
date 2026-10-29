import { Router } from 'express';
import { AuditController } from '../controllers/audit.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/audit/append
 * Append a new event to the audit chain
 *
 * Phase 3: Hash-chained audit ledger
 * Authorization: Authenticated users
 * Content-Type: application/json
 *
 * Security: Actor identity taken from authentication, not request body
 */
router.post('/append', authenticate, AuditController.appendEvent);

/**
 * GET /api/audit/verify
 * Verify the integrity of the entire audit chain
 *
 * Authorization: Authenticated users
 * Returns: Verification result with any detected integrity issues
 */
router.get('/verify', authenticate, AuditController.verifyChain);

/**
 * GET /api/audit/events
 * Retrieve audit events with optional filtering
 *
 * Authorization: Authenticated users
 * Query parameters: eventType, actorId, resourceId, bookingId, userId, fromSequence, toSequence, limit
 */
router.get('/events', authenticate, AuditController.getEvents);

/**
 * GET /api/audit/status
 * Get audit chain status summary
 *
 * Public endpoint for monitoring
 */
router.get('/status', AuditController.getStatus);

export const auditRoutes = router;
