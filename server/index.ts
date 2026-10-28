import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Import routes
import { resourceRoutes } from './routes/resource.routes.js';
import { devRoutes } from './routes/dev.routes.js';
import { errorHandler } from './utils/errors.js';

// API routes
app.use('/api/resources', resourceRoutes);

// Development-only routes (protected by service layer checks)
app.use('/api/dev', devRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    timestamp: new Date().toISOString(),
  });
});

// Error handler (must be last)
app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 OpenResource API Server`);
    console.log(`📍 Running on http://localhost:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);

    const devEnabled = process.env.ALLOW_DEV_ENDPOINTS === 'true';
    if (devEnabled) {
      console.log(`🔧 Dev endpoints enabled at /api/dev/*`);
    } else {
      console.log(`🔒 Dev endpoints disabled (set ALLOW_DEV_ENDPOINTS=true to enable)`);
    }
  });
}

export default app;
