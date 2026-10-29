import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { bookingRoutes } from './routes/booking.routes.js';
import { notificationRoutes } from './routes/notification.routes.js';
import { trustRoutes } from './routes/trust.routes.js';
import { auditRoutes } from './routes/audit.routes.js';
import { incidentRoutes } from './routes/incident.routes.js';
import { errorHandler } from './utils/errors.js';
import { StorageAdapter } from './adapters/storage.adapter.js';
import { SchedulerService } from './services/scheduler.service.js';
import { loadConfig } from './config/env.js';

dotenv.config();

const config = loadConfig();
const app = express();

// Security: Disable express fingerprinting header
app.disable('x-powered-by');

// Security Headers Middleware
app.use((_req: Request, res: Response, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (config.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// CORS: Strictly validate allowed origins in production
const corsOrigin = config.isProduction
  ? (config.allowedOrigins.length > 0 ? config.allowedOrigins : false)
  : (config.allowedOrigins.length > 0 ? config.allowedOrigins : ['http://localhost:5173']);

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

// Payload limit: Restrict request payload size to prevent DoS via payload flooding
app.use(express.json({ limit: '100kb' }));

// Health check endpoint (safe for public monitoring without exposing credentials or internal state)
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    module: 'OpenResource - Member 2 (Booking, Custody & Notifications)',
    storageMode: StorageAdapter.getMode(),
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Member 2 Routes
app.use('/api/bookings', bookingRoutes);
app.use('/api/notifications', notificationRoutes);

// Phase 1: Trust & Inspection Routes
app.use('/api/trust', trustRoutes);

// Phase 3: Audit Ledger Routes
app.use('/api/audit', auditRoutes);

// Phase 4: Incident Management Routes
app.use('/api/incidents', incidentRoutes);

// 404 Catch-All
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware (must be registered last)
app.use(errorHandler);

// Clean connection and background process shutdown
let serverInstance: any = null;

const shutdown = async () => {
  try {
    SchedulerService.getInstance().stop();
    await StorageAdapter.close();
    if (serverInstance) {
      serverInstance.close();
    }
  } catch (err) {
    console.error('Error closing storage adapter:', err);
  }
};

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

// Standalone server launch
if (process.env.NODE_ENV !== 'test' && !process.env.VITE_DEV_SERVER) {
  const mode = StorageAdapter.getMode();
  serverInstance = app.listen(config.port, () => {
    console.log(`OpenResource API Server running at http://localhost:${config.port}`);
    console.log(`Environment: [${config.env.toUpperCase()}] | Storage Mode: [${mode.toUpperCase()}]`);
    console.log(`Mounted routes: /api/bookings/*, /api/notifications/*, /api/trust/*, /api/audit/*, /api/incidents/*`);
  });
}

export default app;
