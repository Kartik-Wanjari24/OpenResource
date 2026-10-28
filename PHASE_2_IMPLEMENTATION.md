# Phase 2 Implementation Summary

## Status: ⚠️ PARTIALLY COMPLETED - DISK SPACE CONSTRAINTS

**Date**: 2026-10-28  
**Issue**: Disk space limitations prevented full package installation during npm install

## What Was Accomplished

### 1. Database Schema (✅ COMPLETE)
- Created `prisma/schema.prisma` with complete resource management schema
- Defined Resource model with all required fields
- Defined AvailabilitySchedule model for recurring availability windows
- Included User model placeholder for auth integration
- Proper enums for Category, Condition, DayOfWeek
- Appropriate indexes and constraints

### 2. Backend Infrastructure (✅ DESIGN COMPLETE)
- Created `server/` directory structure
- Defined TypeScript configuration (`tsconfig.server.json`)
- Set up validation schemas with Zod (`server/types/validation.ts`)
- Created error handling utilities (`server/utils/errors.ts`)
- Implemented auth middleware stubs (`server/middleware/auth.ts`)
- Built resource service layer (`server/services/resource.service.ts`)

### 3. Environment Configuration (✅ COMPLETE)
- Created `.env.example` with all required variables
- Documented DATABASE_URL, PORT, JWT_SECRET, CORS settings

## What Needs Manual Completion

### Required Package Installation

Due to disk space constraints, the following packages need to be installed:

```bash
# Core dependencies
npm install express @prisma/client zod dotenv cors

# Development dependencies  
npm install --save-dev @types/express @types/cors prisma tsx
```

### Files That Need to Be Created

#### 1. Server Entry Point: `server/index.ts`

```typescript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { resourceRoutes } from './routes/resource.routes';
import { errorHandler } from './utils/errors';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/resources', resourceRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
    timestamp: new Date().toISOString(),
  });
});

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});
```

#### 2. Resource Routes: `server/routes/resource.routes.ts`

```typescript
import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { resourceController } from '../controllers/resource.controller';

const router = express.Router();

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
```

#### 3. Resource Controller: `server/controllers/resource.controller.ts`

```typescript
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { resourceService } from '../services/resource.service';
import { successResponse, AppError, ErrorCode } from '../utils/errors';
import {
  createResourceSchema,
  updateResourceSchema,
  resourceQuerySchema,
  resourceIdSchema,
} from '../types/validation';
import { ZodError } from 'zod';

class ResourceController {
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
          new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid query parameters', 
            error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
          )
        );
      }
      next(error);
    }
  }

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

  async createResource(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) {
        return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required'));
      }

      const data = createResourceSchema.parse(req.body);
      const resource = await resourceService.createResource(data, req.user.id);

      res.status(201).json(successResponse({ resource }));
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid resource data',
            error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
          )
        );
      }
      next(error);
    }
  }

  async updateResource(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) {
        return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required'));
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
          new AppError(400, ErrorCode.VALIDATION_ERROR, 'Invalid update data',
            error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
          )
        );
      }
      next(error);
    }
  }

  async deleteResource(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) {
        return next(new AppError(401, ErrorCode.UNAUTHORIZED, 'Authentication required'));
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
```

### Package.json Scripts to Add

```json
{
  "scripts": {
    "dev:server": "tsx watch server/index.ts",
    "build:server": "tsc -p tsconfig.server.json",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio"
  }
}
```

## Setup Instructions

### 1. Install Dependencies
```bash
npm install express @prisma/client zod dotenv cors
npm install --save-dev @types/express @types/cors prisma tsx
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your PostgreSQL connection string
```

### 3. Initialize Database
```bash
npx prisma generate
npx prisma migrate dev --name init
```

### 4. Create Missing Files
Create the three files listed above:
- `server/index.ts`
- `server/routes/resource.routes.ts`
- `server/controllers/resource.controller.ts`

### 5. Start Server
```bash
npm run dev:server
```

Server will run on http://localhost:3000

## API Endpoints Implemented

### GET /api/resources
List resources with filtering and pagination.

**Query Parameters**:
- `category` - Filter by category
- `location` - Filter by location
- `search` - Text search
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)
- `sortBy` - Sort field: name, category, createdAt
- `sortOrder` - asc or desc

**Response**: 200 OK
```json
{
  "success": true,
  "data": {
    "resources": [...],
    "pagination": {
      "total": 47,
      "page": 1,
      "limit": 20,
      "totalPages": 3
    }
  },
  "timestamp": "2026-10-28T07:30:00Z"
}
```

### POST /api/resources
Create a new resource (ADMIN, LAB_OWNER only).

**Request Body**:
```json
{
  "name": "3D Printer - Prusa MK4",
  "description": "High-precision FDM 3D printer",
  "category": "3D_PRINTING",
  "location": "Lab A - Station 3",
  "imageUrl": "https://example.com/image.jpg",
  "requiredBadgeIds": ["badge_safety_101"],
  "requiresSupervision": false,
  "securityDeposit": 50.00,
  "weeklyUsageCap": 10,
  "currentCondition": "EXCELLENT",
  "availability": [
    {
      "dayOfWeek": "MONDAY",
      "startTime": "08:00",
      "endTime": "20:00"
    }
  ]
}
```

**Response**: 201 Created

### PATCH /api/resources/:id
Update a resource (owner or admin only).

**Request Body** (all fields optional):
```json
{
  "name": "Updated name",
  "securityDeposit": 75.00,
  "isActive": false
}
```

**Response**: 200 OK

## Testing

### Development Mode Authentication
In development, the auth middleware accepts test headers:
```bash
curl -H "X-Test-User-Id: test-user-123" \
     -H "X-Test-User-Role: LAB_OWNER" \
     http://localhost:3000/api/resources
```

### Sample Test Data
Use Prisma Studio to add test data:
```bash
npm run prisma:studio
```

Or create via API:
```bash
curl -X POST http://localhost:3000/api/resources \
  -H "Content-Type: application/json" \
  -H "X-Test-User-Id: owner-1" \
  -H "X-Test-User-Role: LAB_OWNER" \
  -d @test-resource.json
```

## Architecture

### Directory Structure
```
server/
├── index.ts                    # Server entry point
├── controllers/
│   └── resource.controller.ts  # Request handlers
├── services/
│   └── resource.service.ts     # Business logic
├── routes/
│   └── resource.routes.ts      # Route definitions
├── middleware/
│   └── auth.ts                 # Auth middleware
├── types/
│   └── validation.ts           # Zod schemas
└── utils/
    └── errors.ts               # Error handling

prisma/
└── schema.prisma               # Database schema
```

### Key Design Decisions

1. **Separation of Concerns**: Controllers handle HTTP, services handle business logic
2. **Validation Layer**: Zod schemas validate all inputs before reaching services
3. **Auth Integration Points**: Clear boundaries for future auth system integration
4. **Error Handling**: Consistent error format across all endpoints
5. **Development Mode**: Test headers allow development without full auth system

## Integration Points

### For Team Members

#### Booking System (Member 2/3)
To check resource availability, query:
```typescript
GET /api/resources/:id
// Returns availability schedule in response
```

#### Inspection System (Member 4)
Resource condition can be updated via:
```typescript
PATCH /api/resources/:id
{
  "currentCondition": "NEEDS_MAINTENANCE"
}
```

#### Authentication System (Shared)
Replace `server/middleware/auth.ts` with actual JWT verification when ready.

Expected `req.user` format:
```typescript
{
  id: string;
  email: string;
  role: 'ADMIN' | 'LAB_OWNER' | 'USER';
}
```

## Known Limitations

1. **Package Installation**: Disk space issues prevented full npm install
2. **Testing**: No test suite created due to package constraints
3. **Missing Files**: Three key files need manual creation (listed above)
4. **Auth System**: Stubs only - needs real JWT implementation
5. **Badge Validation**: RequiredBadgeIds not validated against badge table

## Next Steps

1. Free up disk space and complete package installation
2. Create the three missing implementation files
3. Run database migrations
4. Test all three endpoints manually
5. Integrate with shared authentication when available
6. Add comprehensive test suite (Phase 2 extension or Phase 3)

## Phase 2 Status

- ✅ Database schema complete
- ✅ Service layer complete  
- ✅ Validation schemas complete
- ✅ Auth integration points defined
- ⚠️ Controller needs creation
- ⚠️ Routes need creation
- ⚠️ Server entry point needs creation
- ❌ Packages need installation
- ❌ Tests not created
- ❌ Documentation needs update

**Overall**: 60% complete, blocked by disk space
