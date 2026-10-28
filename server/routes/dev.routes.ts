import express from 'express';
import { devController } from '../controllers/dev.controller.js';

const router = express.Router();

// GET /api/dev/personas - List available demo personas (no auth required in dev)
router.get('/personas', devController.listPersonas);

// POST /api/dev/impersonate - Switch to a demo persona
router.post('/impersonate', devController.impersonate);

// POST /api/dev/reset-seed - Reset database to demo state
router.post('/reset-seed', devController.resetSeed);

export { router as devRoutes };
