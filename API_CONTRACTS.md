# API Contracts

## Overview
This document defines the planned API endpoints for the OpenResource platform. These contracts establish the interface between frontend and backend, and between team members' modules.

**Phase 1 Status**: Contracts defined, implementation planned for Phase 2+.

## Base URL
- **Development**: `http://localhost:3000/api`
- **Production**: `https://api.openresource.app` (TBD)

## Authentication
All endpoints except `/auth/login` and `/auth/register` require authentication.

**Authorization Header**:
```
Authorization: Bearer <JWT_TOKEN>
```

**Response Codes**:
- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - Valid token but insufficient permissions

---

## Resource Management APIs

### GET /api/resources
List resources with filtering and pagination.

**Authorization**: All authenticated users

**Query Parameters**:
```typescript
{
  category?: string          // Filter by category
  location?: string          // Filter by location
  available?: boolean        // Filter by current availability
  search?: string           // Text search across name/description
  page?: number             // Pagination (default: 1)
  limit?: number            // Items per page (default: 20, max: 100)
  sortBy?: 'name' | 'category' | 'availability'
  sortOrder?: 'asc' | 'desc'
}
```

**Response 200**:
```json
{
  "resources": [
    {
      "id": "res_abc123",
      "name": "3D Printer - Prusa MK4",
      "category": "3D_PRINTING",
      "location": "Lab A - Station 3",
      "description": "High-precision FDM 3D printer",
      "availability": {
        "status": "AVAILABLE",
        "nextAvailable": null,
        "schedule": [
          {
            "dayOfWeek": "MONDAY",
            "startTime": "08:00",
            "endTime": "20:00"
          }
        ]
      },
      "requiredBadgeIds": ["badge_safety_101", "badge_3d_basics"],
      "requiresSupervision": false,
      "securityDeposit": 50.00,
      "weeklyUsageCap": 10,
      "currentCondition": "EXCELLENT",
      "imageUrl": "/uploads/resources/res_abc123.jpg",
      "createdAt": "2026-09-15T10:30:00Z",
      "updatedAt": "2026-10-20T14:22:00Z"
    }
  ],
  "pagination": {
    "total": 47,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

**Error Responses**:
- `400 Bad Request` - Invalid query parameters
- `500 Internal Server Error`

---

### POST /api/resources
Create a new resource (admin only).

**Authorization**: `ADMIN`, `LAB_OWNER`

**Request Body**:
```json
{
  "name": "Laser Cutter - Epilog Fusion Pro",
  "category": "LASER_CUTTING",
  "location": "Lab B - Station 1",
  "description": "48\" x 36\" CO2 laser cutter",
  "availability": {
    "schedule": [
      {
        "dayOfWeek": "MONDAY",
        "startTime": "09:00",
        "endTime": "18:00"
      }
    ]
  },
  "requiredBadgeIds": ["badge_laser_cert"],
  "requiresSupervision": true,
  "securityDeposit": 100.00,
  "weeklyUsageCap": 5,
  "imageUrl": "/uploads/resources/laser_cutter.jpg"
}
```

**Response 201**:
```json
{
  "resource": {
    "id": "res_xyz789",
    "name": "Laser Cutter - Epilog Fusion Pro",
    "category": "LASER_CUTTING",
    // ... full resource object
  }
}
```

**Validation Rules**:
- `name`: Required, 3-200 characters
- `category`: Required, must be valid enum value
- `location`: Required, 3-100 characters
- `securityDeposit`: Non-negative number
- `weeklyUsageCap`: Positive integer, 1-168 hours
- `requiredBadgeIds`: Array of valid badge IDs

**Error Responses**:
- `400 Bad Request` - Validation errors
- `403 Forbidden` - Insufficient permissions
- `409 Conflict` - Resource with same name already exists
- `500 Internal Server Error`

---

### PATCH /api/resources/:id
Update an existing resource.

**Authorization**: `ADMIN`, `LAB_OWNER`

**Path Parameters**:
- `id`: Resource ID

**Request Body** (all fields optional):
```json
{
  "name": "3D Printer - Prusa MK4 (Upgraded)",
  "availability": {
    "status": "MAINTENANCE",
    "schedule": []
  },
  "securityDeposit": 75.00
}
```

**Response 200**:
```json
{
  "resource": {
    // ... updated resource object
  }
}
```

**Error Responses**:
- `400 Bad Request` - Validation errors
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource does not exist
- `500 Internal Server Error`

---

### GET /api/resources/:id
Get detailed information about a specific resource.

**Authorization**: All authenticated users

**Path Parameters**:
- `id`: Resource ID

**Response 200**:
```json
{
  "resource": {
    "id": "res_abc123",
    "name": "3D Printer - Prusa MK4",
    // ... full resource object including:
    "statistics": {
      "totalBookings": 142,
      "averageRating": 4.7,
      "utilizationRate": 0.68
    },
    "recentInspections": [
      {
        "id": "insp_123",
        "timestamp": "2026-10-27T10:00:00Z",
        "condition": "EXCELLENT"
      }
    ]
  }
}
```

**Error Responses**:
- `404 Not Found` - Resource does not exist
- `500 Internal Server Error`

---

## Intelligent Discovery API

### POST /api/resources/discover
Intelligent resource search with eligibility calculation.

**Authorization**: All authenticated users

**Request Body**:
```json
{
  "query": "3D printer for prototyping",
  "filters": {
    "category": "3D_PRINTING",
    "location": "Lab A",
    "maxDeposit": 100.00,
    "availableOn": "2026-11-05"
  },
  "userContext": {
    "userId": "user_abc123",  // Auto-filled from auth token
    "includeEligibility": true,
    "includeAlternatives": true
  }
}
```

**Response 200**:
```json
{
  "results": [
    {
      "resource": {
        "id": "res_abc123",
        "name": "3D Printer - Prusa MK4",
        // ... full resource object
      },
      "eligibility": {
        "status": "READY_TO_BOOK",
        "canBook": true,
        "reasons": [],
        "nextAvailableSlot": "2026-11-05T09:00:00Z"
      },
      "matchScore": 0.95,
      "matchReasons": [
        "Exact category match",
        "Available on requested date",
        "Within security deposit budget"
      ]
    },
    {
      "resource": {
        "id": "res_def456",
        "name": "3D Printer - Creality CR-10",
        // ...
      },
      "eligibility": {
        "status": "MISSING_PREREQUISITE",
        "canBook": false,
        "reasons": [
          {
            "type": "MISSING_BADGE",
            "badgeId": "badge_3d_advanced",
            "badgeName": "Advanced 3D Printing Certification",
            "howToObtain": "Complete online course at /training/3d-advanced"
          }
        ],
        "nextAvailableSlot": "2026-11-05T14:00:00Z"
      },
      "matchScore": 0.82
    },
    {
      "resource": {
        "id": "res_ghi789",
        "name": "CNC Mill - Tormach 1100",
        // ...
      },
      "eligibility": {
        "status": "QUOTA_EXCEEDED",
        "canBook": false,
        "reasons": [
          {
            "type": "WEEKLY_CAP_REACHED",
            "currentUsage": 10,
            "weeklyLimit": 10,
            "resetsAt": "2026-11-03T00:00:00Z"
          }
        ]
      },
      "matchScore": 0.45,
      "note": "Alternative suggestion based on similar capabilities"
    }
  ],
  "alternatives": [
    {
      "resourceId": "res_jkl012",
      "name": "3D Printer - Bambu Lab X1",
      "reason": "Faster print speed, no training required",
      "availability": "AVAILABLE"
    }
  ],
  "totalResults": 3
}
```

**Eligibility Status Values**:
- `READY_TO_BOOK` - User can book immediately
- `MISSING_PREREQUISITE` - Missing training badges or qualifications
- `QUOTA_EXCEEDED` - Weekly usage cap reached
- `REQUIRES_APPROVAL` - Needs admin/owner approval
- `SUSPENDED` - User account suspended from this resource

**Error Responses**:
- `400 Bad Request` - Invalid query or filters
- `500 Internal Server Error`

---

## Development & Demo APIs (Phase 4 - IMPLEMENTED)

### GET /api/dev/personas
List available demo personas (development only).

**Authorization**: Development environment only, requires `ALLOW_DEV_ENDPOINTS=true`

**Response 200**:
```json
{
  "success": true,
  "data": {
    "personas": [
      {
        "name": "Lab Owner",
        "id": "demo_lab_owner",
        "displayName": "Dr. Sarah Martinez",
        "role": "LAB_OWNER",
        "email": "lab.owner@openresource.demo",
        "badges": ["badge_safety_101", "badge_admin"]
      },
      {
        "name": "Qualified Student A",
        "id": "demo_qualified_student",
        "displayName": "Alice Chen",
        "role": "USER",
        "email": "alice.chen@openresource.demo",
        "badges": ["badge_safety_101", "badge_3d_basics", "badge_laser_cert", "badge_cnc_basics"]
      },
      {
        "name": "Resource-Hog Student B",
        "id": "demo_resource_hog",
        "displayName": "Bob Wilson",
        "role": "USER",
        "email": "bob.quota@openresource.demo",
        "badges": ["badge_safety_101", "badge_3d_basics"]
      },
      {
        "name": "Admin",
        "id": "demo_admin",
        "displayName": "System Administrator",
        "role": "ADMIN",
        "email": "admin@openresource.demo",
        "badges": ["badge_safety_101", "badge_admin", "badge_3d_basics", "badge_laser_cert", "badge_cnc_basics"]
      }
    ],
    "total": 4
  },
  "timestamp": "2026-10-28T08:45:00Z"
}
```

**Error Responses**:
- `403 Forbidden` - Not in development environment or `ALLOW_DEV_ENDPOINTS` not set

---

### POST /api/dev/impersonate
Switch user context for testing (development only).

**Authorization**: Development environment only, requires `ALLOW_DEV_ENDPOINTS=true`

**Request Body**:
```json
{
  "personaName": "Qualified Student A"
}
```

**Available Personas**:
- `"Lab Owner"` - Dr. Sarah Martinez (LAB_OWNER)
- `"Qualified Student A"` - Alice Chen (USER, 4 badges)
- `"Resource-Hog Student B"` - Bob Wilson (USER, 2 badges)
- `"Admin"` - System Administrator (ADMIN, all badges)

**Response 200**:
```json
{
  "success": true,
  "data": {
    "impersonatedUser": {
      "id": "demo_qualified_student",
      "name": "Alice Chen",
      "email": "alice.chen@openresource.demo",
      "role": "USER",
      "badges": ["badge_safety_101", "badge_3d_basics", "badge_laser_cert", "badge_cnc_basics"]
    },
    "message": "Impersonating: Alice Chen (USER)",
    "instructions": {
      "note": "In development mode, send these headers with subsequent requests:",
      "headers": {
        "X-Test-User-Id": "demo_qualified_student",
        "X-Test-User-Role": "USER",
        "X-Test-User-Badges": "badge_safety_101,badge_3d_basics,badge_laser_cert,badge_cnc_basics"
      }
    }
  },
  "timestamp": "2026-10-28T08:45:00Z"
}
```

**Error Responses**:
- `400 Bad Request` - Missing or invalid `personaName`
- `403 Forbidden` - Not in development environment
- `404 Not Found` - Unknown persona name
- `500 Internal Server Error`

**Usage Pattern**:
```bash
# Step 1: Get persona headers
curl -X POST http://localhost:3000/api/dev/impersonate \
  -H "Content-Type: application/json" \
  -d '{"personaName": "Qualified Student A"}'

# Step 2: Use headers in subsequent requests
curl http://localhost:3000/api/resources \
  -H "X-Test-User-Id: demo_qualified_student" \
  -H "X-Test-User-Role: USER" \
  -H "X-Test-User-Badges: badge_safety_101,badge_3d_basics,badge_laser_cert,badge_cnc_basics"
```

---

### POST /api/dev/reset-seed
Reset database to initial demo state (development only).

**Authorization**: Development environment only, requires `ALLOW_DEV_ENDPOINTS=true`

**Request Body**:
```json
{
  "confirm": true
}
```

**Validation**: `confirm` must be exactly `true` (boolean, not string)

**Response 200**:
```json
{
  "success": true,
  "data": {
    "message": "Database reset to demo state",
    "operations": [
      "Cleared all availability schedules",
      "Cleared all resources",
      "Created/updated 4 demo users",
      "Created 5 demo resources",
      "Database reset to deterministic demo state"
    ],
    "timestamp": "2026-10-28T08:45:00Z",
    "warning": "All previous bookings and non-demo data have been cleared"
  },
  "timestamp": "2026-10-28T08:45:00Z"
}
```

**What Gets Reset**:
- ✅ All availability schedules deleted
- ✅ All resources deleted
- ✅ 4 demo users created/updated (Lab Owner, Qualified Student A, Resource-Hog Student B, Admin)
- ✅ 5 seed resources created (3D printers, laser cutter, CNC mill, electronics bench)
- ⚠️ Bookings cleared (when booking system implemented)

**Seed Resources Created**:
1. 3D Printer - Prusa MK4 (10hr/week cap, $50 deposit)
2. Laser Cutter - Epilog Fusion Pro (5hr/week cap, $100 deposit, supervision required)
3. CNC Mill - Tormach 1100 (8hr/week cap, $150 deposit, supervision required)
4. 3D Printer - Bambu Lab X1 (15hr/week cap, $30 deposit)
5. Electronics Lab Bench (20hr/week cap, no deposit)

**Error Responses**:
- `400 Bad Request` - Missing `confirm` or `confirm` is not `true`
- `403 Forbidden` - Not in development environment
- `500 Internal Server Error` - Database operation failed

---

## Integration Points (Other Team Members)

### Booking System (Member 2/3 - Required for Timeline)

#### GET /api/bookings
Get bookings for a resource.

**Expected Response**:
```json
{
  "bookings": [
    {
      "id": "book_123",
      "resourceId": "res_abc123",
      "userId": "user_456",
      "userName": "Bob Smith",
      "startTime": "2026-11-05T09:00:00Z",
      "endTime": "2026-11-05T11:00:00Z",
      "status": "CONFIRMED",
      "hasConflict": false
    }
  ]
}
```

**Member 1 Usage**: Timeline visualization, conflict detection

---

#### GET /api/bookings/user/:userId
Get user's booking history and quota usage.

**Expected Response**:
```json
{
  "bookings": [],
  "weeklyUsage": {
    "res_abc123": 3,
    "res_xyz789": 5
  },
  "weekStartDate": "2026-10-27T00:00:00Z"
}
```

**Member 1 Usage**: Quota checking in discovery engine

---

### Inspection System (Member 4 - Required for Comparison Studio)

#### GET /api/inspections/:id
Get full inspection details.

**Expected Response**:
```json
{
  "inspection": {
    "id": "insp_123",
    "resourceId": "res_abc123",
    "inspectorId": "user_789",
    "beforeImage": {
      "url": "/uploads/inspections/insp_123_before.jpg",
      "boundingBoxes": [
        {
          "x": 120,
          "y": 450,
          "width": 80,
          "height": 60,
          "label": "Scratch on build plate",
          "severity": "MINOR"
        }
      ]
    },
    "afterImage": {
      "url": "/uploads/inspections/insp_123_after.jpg",
      "boundingBoxes": []
    },
    "damageReport": [
      {
        "description": "Minor scratch on build plate",
        "severity": "MINOR",
        "repairCost": 15.00
      }
    ],
    "overallCondition": "GOOD",
    "timestamp": "2026-10-27T10:00:00Z"
  }
}
```

**Member 1 Usage**: Before/after comparison slider UI

---

## Common Response Formats

### Success Response
```json
{
  "success": true,
  "data": { /* ... */ },
  "timestamp": "2026-10-28T07:30:00Z"
}
```

### Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "weeklyUsageCap",
        "message": "Must be a positive integer between 1 and 168"
      }
    ]
  },
  "timestamp": "2026-10-28T07:30:00Z"
}
```

### Validation Error Codes
- `VALIDATION_ERROR` - Request validation failed
- `RESOURCE_NOT_FOUND` - Resource does not exist
- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Insufficient permissions
- `CONFLICT` - Resource conflict (e.g., duplicate name)
- `QUOTA_EXCEEDED` - Rate limit or usage quota exceeded
- `MAINTENANCE_MODE` - System temporarily unavailable

---

## Rate Limiting
- **Anonymous**: 10 requests/minute
- **Authenticated**: 100 requests/minute
- **Admin**: 1000 requests/minute

**Rate Limit Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1698483600
```

---

## Versioning
API version included in URL path:
- Current: `/api/v1/resources`
- Future versions maintain backward compatibility for 6 months

---

## Phase 1 Status
✅ Contracts defined and documented  
⏳ Implementation planned for Phase 2+  
⏳ Integration testing planned for Phase 3+
