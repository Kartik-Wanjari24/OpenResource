# OpenResource - Project Architecture

## Overview
OpenResource is a collaborative resource-booking platform built as a multi-phase project with clear team member responsibilities.

## Current State (Phase 1)
- **Frontend**: React 19.3.1 + TypeScript 7.0.2 + Vite 8.3.5
- **Styling**: CSS Modules with CSS custom properties
- **Linting**: Oxlint 1.90.0
- **Backend**: Not yet implemented
- **Database**: Not yet implemented
- **Testing**: Not yet configured

## Technology Stack Decisions

### Frontend
- **React 19.3.1** with TypeScript for type safety
- **Vite 8.3.5** for fast development and optimized builds
- **CSS Modules** for component-scoped styling
- **Design tokens** via CSS custom properties for consistency

### Backend (Planned)
- **Node.js + Express + TypeScript** for API server
- **PostgreSQL + Prisma** for database and ORM
- **Zod** for runtime validation
- **Vitest + Supertest** for testing

### Development Tools
- **Oxlint** for fast linting
- **TypeScript 7.0.2** with strict mode
- Environment variables for configuration

## Module Architecture

### 1. Resource Management (Member 1 - Primary Responsibility)
**Location**: `src/features/resources/`, `/api/resources/`

**Responsibilities**:
- Resource CRUD operations
- Availability tracking
- Training prerequisites
- Supervision requirements
- Security deposits
- Weekly usage caps

**Core Models**:
```typescript
Resource {
  id: string
  name: string
  category: string
  location: string
  availability: AvailabilitySchedule
  requiredBadgeIds: string[]
  requiresSupervision: boolean
  securityDeposit: number
  weeklyUsageCap: number
  condition: ResourceCondition
}
```

**API Endpoints**:
- `GET /api/resources` - List resources with filters
- `POST /api/resources` - Create resource (admin)
- `PATCH /api/resources/:id` - Update resource
- `GET /api/resources/:id` - Get resource details

### 2. Intelligent Discovery & Eligibility (Member 1 - Primary Responsibility)
**Location**: `src/features/discovery/`, `/api/resources/discover`

**Responsibilities**:
- Smart resource search and filtering
- Eligibility calculation
- Training prerequisite validation
- Quota checking
- Alternative equipment suggestions

**Eligibility Statuses**:
- `READY_TO_BOOK` - User meets all requirements
- `MISSING_PREREQUISITE` - Lacks required training/badges
- `QUOTA_EXCEEDED` - Weekly usage cap reached

**API Endpoints**:
- `POST /api/resources/discover` - Intelligent resource search with eligibility

### 3. Judge God-Mode & Telemetry (Member 1 - Primary Responsibility)
**Location**: `src/features/judge/`, `src/components/JudgeTelemetryBar.tsx`

**Responsibilities**:
- Persistent telemetry bar across all pages
- Demo challenge progress tracking (10 steps)
- Real-time system health monitoring
- Development impersonation controls

**Features**:
- Always visible, non-intrusive bar
- Challenge step completion indicators
- Quick role-switching UI

### 4. Resource Marketplace (Member 1 - Primary Responsibility)
**Location**: `src/features/marketplace/`

**Responsibilities**:
- Resource card grid display
- Search and filter interface
- Eligibility badges
- Alternative equipment display
- Security deposit visibility

**UI Components**:
- `ResourceCard` - Individual resource display
- `ResourceGrid` - Grid layout with filtering
- `EligibilityBadge` - Visual status indicators
- `AlternativesList` - Suggested equipment

### 5. Booking Conflict Timeline (Member 1 - Primary Responsibility)
**Location**: `src/features/timeline/`

**Responsibilities**:
- Multi-lane timeline visualization
- Conflict detection and highlighting
- Time slot selection
- Visual booking density indicators

**Dependencies**:
- Requires booking data from Member 2/3's system
- Integration point: `GET /api/bookings?resourceId=...&dateRange=...`

### 6. Condition Comparison Studio (Member 1 - Primary Responsibility)
**Location**: `src/features/inspection/`

**Responsibilities**:
- Before/after image comparison slider
- Inspection report bounding boxes
- Visual damage highlighting

**Dependencies**:
- Requires inspection API from Member 4
- Integration point: `GET /api/inspections/:inspectionId`

### 7. Authentication & Authorization (Shared - Integration Point)
**Location**: `src/features/auth/`, `/api/auth/`

**Responsibilities**:
- User login/logout
- Role-based access control (Admin, Lab Owner, Student)
- Session management
- Protected route middleware

**Roles**:
- `ADMIN` - Full system access
- `LAB_OWNER` - Resource management
- `QUALIFIED_STUDENT` - Normal booking privileges
- `RESOURCE_HOG_STUDENT` - For quota testing

**Integration Points**:
- User model owned by other team members
- Auth middleware shared across all APIs
- Member 1 consumes auth state, does not modify user data

### 8. Development & Demo Tools (Member 1 - Primary Responsibility)
**Location**: `src/features/dev/`, `/api/dev/`

**Responsibilities**:
- User impersonation for testing
- Database seed reset
- Demo data generation

**API Endpoints**:
- `POST /api/dev/impersonate` - Switch user context
- `POST /api/dev/reset-seed` - Reset to initial demo state

**Safety**:
- Development-only endpoints
- Require special environment variable flag
- Never available in production

### 9. Booking System (Other Members - Integration Point)
**Location**: Owned by Member 2/3

**Integration Points Member 1 Needs**:
- `GET /api/bookings?resourceId=...` - For conflict timeline
- `GET /api/bookings/user/:userId` - For quota checking
- `POST /api/bookings` - For creating bookings from marketplace

**Expected Data**:
```typescript
Booking {
  id: string
  resourceId: string
  userId: string
  startTime: ISO8601DateTime
  endTime: ISO8601DateTime
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'
}
```

### 10. Inspection System (Member 4 - Integration Point)
**Location**: Owned by Member 4

**Integration Points Member 1 Needs**:
- `GET /api/inspections/:id` - Full inspection with images
- `GET /api/resources/:id/inspections` - Inspection history

**Expected Data**:
```typescript
Inspection {
  id: string
  resourceId: string
  beforeImage: ImageWithBoundingBoxes
  afterImage: ImageWithBoundingBoxes
  damageReport: DamageItem[]
  timestamp: ISO8601DateTime
}
```

### 11. Shared Frontend Components
**Location**: `src/components/`

**Reusable Components**:
- `Button` - Primary, secondary, danger variants
- `Card` - Resource cards, info panels
- `Badge` - Status, eligibility indicators
- `Input` - Form inputs with validation states
- `Select` - Dropdown filters
- `Sidebar` - Navigation layout
- `TopNav` - Header with user menu
- `Modal` - Dialogs and confirmations
- `Spinner` - Loading states

**Design Token System**:
- Colors, typography, spacing defined in CSS custom properties
- Consistent interaction states (hover, focus, active)
- Responsive breakpoints
- Dark mode support

### 12. Shared API Utilities
**Location**: `src/lib/api/`, `/api/lib/`

**Shared Utilities**:
- HTTP client with error handling
- Request/response type definitions
- Validation schemas (Zod)
- Error formatting
- Authentication helpers
- Date/time utilities

## Data Flow

### Resource Discovery Flow
1. User enters marketplace
2. Frontend fetches resources via `GET /api/resources`
3. Frontend calls `POST /api/resources/discover` with user context
4. Discovery engine calculates eligibility for each resource
5. UI displays resources with eligibility badges

### Booking Conflict Flow
1. User selects resource in marketplace
2. Frontend fetches bookings via `GET /api/bookings?resourceId=...`
3. Timeline component renders multi-lane view
4. User selects desired time slot
5. System validates availability before booking

### Impersonation Flow (Dev Mode)
1. Developer opens Judge God-Mode panel
2. Selects target user persona
3. `POST /api/dev/impersonate` updates session
4. All subsequent API calls use impersonated user context
5. UI reflects impersonated user's permissions and quotas

## Environment Configuration

### Required Environment Variables
```
# Database
DATABASE_URL=postgresql://...

# Authentication
JWT_SECRET=...
SESSION_SECRET=...

# Development
NODE_ENV=development|production
ALLOW_DEV_ENDPOINTS=true|false

# Frontend
VITE_API_BASE_URL=http://localhost:3000
```

## Build and Deploy

### Development
```bash
npm run dev        # Start Vite dev server (frontend)
npm run dev:api    # Start Express server (backend) - TBD Phase 2+
```

### Production
```bash
npm run build      # Build frontend
npm run preview    # Preview production build
```

### Testing
```bash
npm run lint       # Run Oxlint
npm run test       # Run Vitest (once configured)
```

## Code Organization Principles

1. **Feature-based structure**: Group by business domain, not technical layer
2. **Clear boundaries**: Each module has well-defined responsibilities
3. **Integration contracts**: Document all cross-member dependencies
4. **Shared infrastructure**: Common components and utilities prevent duplication
5. **Type safety**: TypeScript interfaces define all data contracts
6. **Validation**: Runtime validation with Zod for API boundaries
7. **Accessibility**: WCAG AA compliance for all UI components
8. **Performance**: Lazy loading, code splitting, optimized assets

## Phase 1 Scope Limitations

**What Phase 1 DOES include**:
- Architecture documentation
- API contract definitions
- Design system and tokens
- Favicon and branding
- Smooth interaction patterns
- Reusable component structure

**What Phase 1 DOES NOT include**:
- Complete backend implementation
- Database schema and migrations
- Full resource CRUD functionality
- Working discovery engine
- Actual impersonation system
- Complete marketplace UI
- Working timeline component
- Inspection comparison studio
- Integration with other members' APIs

## Next Steps for Phase 2+

1. Set up backend server with Express + TypeScript
2. Configure PostgreSQL + Prisma ORM
3. Implement authentication system
4. Build resource management APIs
5. Create discovery engine with eligibility logic
6. Develop marketplace UI
7. Integrate with booking system
8. Build conflict timeline
9. Implement inspection comparison studio
10. Add comprehensive testing coverage
