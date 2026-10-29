import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';

import { bookingRoutes } from './routes/booking.routes.js';
import { notificationRoutes } from './routes/notification.routes.js';
import { resourceRoutes } from './routes/resource.routes.js';
import { devRoutes } from './routes/dev.routes.js';
import fairnessRoutes from './routes/fairnessRoutes.js';
import { errorHandler } from './utils/errors.js';
import { StorageAdapter } from './adapters/storage.adapter.js';
import { SchedulerService } from './services/scheduler.service.js';
import { loadConfig } from './config/env.js';

const config = loadConfig();
const app = express();
const PORT = Number(process.env.PORT ?? config.port ?? 3000);

app.disable('x-powered-by');

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

app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-test-user-id',
      'x-test-user-role',
      'x-user-id',
      'x-user-role',
    ],
  })
);

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    module: 'OpenResource - Member 2 (Booking, Custody & Notifications)',
    storageMode: StorageAdapter.getMode(),
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

app.use('/api/bookings', bookingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/dev', devRoutes);
app.use('/api/fairness', fairnessRoutes);

const inspectionCatalog = [
  {
    id: 'insp_prusa_mk4_001',
    resourceId: 'demo_resource_prusa_mk4',
    resourceName: 'Prusa MK4 3D Printer',
    timestamp: '2026-10-27T14:30:00.000Z',
    overallCondition: 'GOOD',
    damageCount: 2,
  },
  {
    id: 'insp_prusa_mk4_002',
    resourceId: 'demo_resource_prusa_mk4',
    resourceName: 'Prusa MK4 3D Printer',
    timestamp: '2026-10-28T16:45:00.000Z',
    overallCondition: 'FAIR',
    damageCount: 4,
  },
];

app.get('/api/inspections', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      inspections: inspectionCatalog,
      total: inspectionCatalog.length,
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/inspections/:id', (req: Request, res: Response) => {
  const inspection = {
    id: req.params.id,
    resourceId: 'demo_resource_prusa_mk4',
    resourceName: 'Prusa MK4 3D Printer',
    inspectorId: 'demo_lab_owner',
    inspectorName: 'Dr. Sarah Martinez',
    overallCondition: 'GOOD',
    timestamp: '2026-10-27T14:30:00.000Z',
    beforeImage: {
      url: 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=1200&q=80',
      width: 1200,
      height: 800,
      boundingBoxes: [
        { x: 180, y: 120, width: 140, height: 100, label: 'Nozzle wear', severity: 'MODERATE' },
        { x: 420, y: 220, width: 160, height: 120, label: 'Build plate scratch', severity: 'MINOR' },
      ],
    },
    afterImage: {
      url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
      width: 1200,
      height: 800,
      boundingBoxes: [
        { x: 110, y: 190, width: 150, height: 90, label: 'Replaced extruder block', severity: 'MINOR' },
      ],
    },
    damageReport: [
      { description: 'Nozzle wear detected on hotend assembly', severity: 'MODERATE', repairCost: 45.0 },
      { description: 'Build plate surface scratching near rear-left corner', severity: 'MINOR', repairCost: 12.5 },
    ],
  };

  res.json({
    success: true,
    data: { inspection },
    timestamp: new Date().toISOString(),
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    timestamp: new Date().toISOString(),
  });
});

app.use(errorHandler);

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

if (process.env.NODE_ENV !== 'test' && !process.env.VITE_DEV_SERVER) {
  const mode = StorageAdapter.getMode();
  serverInstance = app.listen(PORT, '0.0.0.0', () => {
    console.log(`OpenResource Member 2 API Server running at http://localhost:${PORT}`);
    console.log(`Environment: [${config.env.toUpperCase()}] | Storage Mode: [${mode.toUpperCase()}]`);
    console.log('Mounted routes: /api/bookings/*, /api/resources/*, /api/fairness/*, /api/inspections/*');
  });
}

export default app;


