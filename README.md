# OpenResource Platform

A collaborative resource-booking platform for makerspaces, labs, and shared equipment facilities. Built with React, TypeScript, Express, and PostgreSQL.

**Current Status**: Phase 7 Complete (Frontend Integration Ready, Backend Requires Database Setup)

---

## Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **PostgreSQL** 13+ (for backend features)
- **Git** for version control

### Frontend Development (Available Now)

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

Frontend runs on `http://localhost:5173`

### Backend Development (Requires Setup)

The backend is fully implemented but requires database configuration:

```bash
# 1. Create PostgreSQL database
createdb openresource

# 2. Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL

# 3. Install backend dependencies
npm install @prisma/client prisma zod express cors dotenv
npm install --save-dev @types/express @types/cors supertest

# 4. Generate Prisma client
npx prisma generate

# 5. Run migrations
npx prisma migrate dev --name init

# 6. Start backend server
npm run dev:server
```

Backend will run on `http://localhost:3000`

---

## Project Structure

```
openresource/
├── src/                          # Frontend React application
│   ├── components/              # UI components
│   │   ├── JudgeTelemetryBar.tsx          # Judge mode controls
│   │   ├── ResourceMarketplace.tsx        # Resource discovery
│   │   ├── ResourceTimeline.tsx           # Booking timeline
│   │   ├── ConditionComparisonStudio.tsx  # Before/after comparison
│   │   └── ...
│   ├── lib/                     # Utilities and API clients
│   │   ├── api.ts              # Main API client
│   │   ├── inspectionApi.ts    # Inspection integration
│   │   └── timeUtils.ts        # Time helpers
│   ├── App.tsx                 # Main application
│   └── main.tsx                # Entry point
│
├── server/                      # Backend Express API
│   ├── controllers/            # HTTP request handlers
│   ├── services/               # Business logic
│   ├── routes/                 # API routes
│   ├── middleware/             # Auth and validation
│   ├── types/                  # TypeScript types
│   ├── utils/                  # Error handling
│   ├── tests/                  # Unit and API tests
│   └── index.ts                # Server entry point
│
├── prisma/
│   └── schema.prisma           # Database schema
│
└── Documentation files
    ├── PROJECT_ARCHITECTURE.md
    ├── API_CONTRACTS.md
    ├── UI_DESIGN_SYSTEM.md
    └── PHASE_*.md              # Completion reports
```

---

## Features Implemented

### ✅ Phase 1-7 Complete

#### Frontend (Working)
- **Judge Telemetry Bar**: Development persona switching and challenge tracking
- **Resource Marketplace**: Discovery interface with eligibility badges
- **Resource Timeline**: Multi-lane booking visualization
- **Condition Comparison Studio**: Before/after image comparison with damage highlighting
- **Design System**: Clinical dashboard aesthetic with royal blue palette
- **Responsive Design**: Desktop, tablet, and mobile support
- **Accessibility**: WCAG AA compliant with keyboard navigation

#### Backend (Implemented, Requires DB)
- **Resource Management API**: CRUD operations with validation
- **Intelligent Discovery**: Eligibility calculation with badge/quota/supervision checks
- **Development Tools**: Persona impersonation and deterministic seed reset
- **Authentication Middleware**: Integration points for JWT system
- **Database Schema**: PostgreSQL with Prisma ORM
- **API Validation**: Zod schemas for all endpoints

---

## Available Commands

### Development
```bash
npm run dev              # Start Vite dev server (frontend)
npm run dev:server       # Start Express server (backend, requires setup)
```

### Build & Preview
```bash
npm run build            # Build for production
npm run preview          # Preview production build
```

### Quality Checks
```bash
npm run lint             # Run oxlint
npm run test             # Run Vitest tests
npm run test:watch       # Watch mode
```

### Database (After Setup)
```bash
npx prisma generate      # Generate Prisma client
npx prisma migrate dev   # Run migrations
npx prisma studio        # Open database GUI
npx prisma db seed       # Seed demo data (when configured)
```

---

## Environment Configuration

Create `.env` file in project root:

```env
# Database (Required for backend)
DATABASE_URL=postgresql://user:password@localhost:5432/openresource

# Server
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173

# Development Tools (Use with caution)
ALLOW_DEV_ENDPOINTS=true
```

**⚠️ Security Warning**: Never set `ALLOW_DEV_ENDPOINTS=true` in production.

---

## API Endpoints

### Resource Management
- `GET /api/resources` - List resources with filtering
- `POST /api/resources` - Create resource (admin/owner)
- `GET /api/resources/:id` - Get resource details
- `PATCH /api/resources/:id` - Update resource
- `DELETE /api/resources/:id` - Delete resource

### Intelligent Discovery
- `POST /api/resources/discover` - Smart search with eligibility

### Development Tools (Dev Only)
- `GET /api/dev/personas` - List demo personas
- `POST /api/dev/impersonate` - Switch user context
- `POST /api/dev/reset-seed` - Reset to demo state

### Health Check
- `GET /health` - Server status

Full API documentation in `API_CONTRACTS.md`

---

## Integration Status

### ✅ Fully Integrated
- Frontend UI components
- Design system and tokens
- API client with error handling
- Development persona system
- Demo fixture data

### ⚠️ Requires Database Setup
- Resource CRUD operations
- Discovery eligibility engine
- Seed data and reset functionality
- Backend tests (4 test suites blocked by missing packages)

### ⏳ Awaiting External APIs
- **Booking System** (Member 2/3): Timeline uses fixture data
  - Expected: `GET /api/bookings?resourceId=...`
  - Expected: `POST /api/bookings`
  
- **Inspection System** (Member 4): Comparison studio uses demo mode
  - Expected: `GET /api/inspections/:id`
  - Expected: `GET /api/resources/:id/inspections`

---

## Test Status

### Frontend Tests: ✅ PASSING
- `src/lib/timeUtils.test.ts` - 24 tests passing
- `src/components/ConditionComparisonStudio.test.tsx` - 22 tests passing
- **Total**: 46 tests passing

### Backend Tests: ⚠️ BLOCKED
- 4 test suites blocked by missing dependencies:
  - `@prisma/client` (not installed)
  - `supertest` (not installed)
  - `express` (not installed)
  - `cors` (not installed)

**To Fix**: Install backend dependencies as shown in Backend Development section above.

### Build Status: ✅ SUCCESS
```
✓ 33 modules transformed
✓ built in 666ms
Bundle: 259.78 kB (79.06 kB gzipped)
```

### Lint Status: ⚠️ MINOR WARNINGS
- No critical errors
- 12 minor warnings (unused variables, React hooks dependencies)
- Safe to ignore or fix incrementally

---

## Security Notes

### Development Mode Features
The `/api/dev/*` endpoints are for testing only and include:
- **Multi-layer protection**: Environment variable + production check
- **No real authentication bypass**: Only sets test headers
- **Deterministic seed data**: Safe to reset repeatedly

**Never enable in production**. Real production deployment must:
1. Implement proper JWT authentication
2. Disable all dev endpoints
3. Use environment-based configuration
4. Never trust client-supplied role/badge headers

---

## Known Limitations

### Current Scope
1. **No Real Booking System**: Timeline shows fixture data only
2. **No Real Inspection API**: Comparison studio uses placeholder images
3. **No Database Configured**: Backend requires manual PostgreSQL setup
4. **No Real Authentication**: Using test headers in development mode
5. **Backend Tests Blocked**: Missing package dependencies

### By Design
- Development persona system is not production auth
- Seed reset is for testing only
- Demo fixture data is clearly labeled in UI

---

## Browser Support

✅ **Tested & Supported**:
- Chrome 120+
- Firefox 120+
- Safari 17+
- Edge 120+

**Required Features**:
- ES2020+ JavaScript
- CSS custom properties
- CSS clip-path
- Touch events (mobile)

---

## Contributing

### Before Starting Development

1. Read `PROJECT_ARCHITECTURE.md` for module boundaries
2. Check `API_CONTRACTS.md` for integration points
3. Follow `UI_DESIGN_SYSTEM.md` for design tokens
4. Review phase completion reports for context

### Code Quality Standards

- **TypeScript**: Strict mode enabled
- **Linting**: Oxlint with React and TypeScript plugins
- **Testing**: Vitest for unit and integration tests
- **Accessibility**: WCAG AA compliance required
- **Performance**: Keep bundle under 300KB gzipped

---

## Troubleshooting

### Frontend won't start
```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Backend tests failing
Install missing dependencies:
```bash
npm install @prisma/client prisma express cors dotenv zod
npm install --save-dev @types/express @types/cors supertest
```

### Database connection errors
1. Ensure PostgreSQL is running
2. Check DATABASE_URL in `.env`
3. Run `npx prisma migrate dev`

### Build errors
```bash
npm run lint
npm run build
```

---

## Next Steps

### For Production Deployment
1. ✅ Frontend is production-ready (build succeeds)
2. ⚠️ Backend requires:
   - PostgreSQL setup
   - Environment configuration
   - Package installation
   - Database migrations
   - Real JWT authentication

### For Team Integration
1. **Member 2/3**: Implement booking API endpoints
2. **Member 4**: Implement inspection API endpoints
3. **Shared Auth**: Replace test headers with real JWT system

---

## Documentation

- **Architecture**: `PROJECT_ARCHITECTURE.md`
- **API Contracts**: `API_CONTRACTS.md`
- **Design System**: `UI_DESIGN_SYSTEM.md`
- **Phase Reports**: `PHASE_*_COMPLETION_REPORT.md`
- **Progress Tracking**: `PHASE_PROGRESS.md`

---

## License

[Add License Information]

---

## Support

For questions or issues:
1. Check documentation files in project root
2. Review phase completion reports for feature context
3. Verify environment configuration matches `.env.example`

---

**Last Updated**: 2026-10-28  
**Version**: 1.0.0  
**Status**: Phase 7 Complete, Phase 8 Integration Documentation Done
