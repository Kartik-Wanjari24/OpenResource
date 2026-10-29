# Phase 2 Investigation Report: Requirements Analysis

**Investigation Date:** 2026-10-29  
**Investigator:** Claude (Phase 2 Specification Analysis)

---

## Executive Summary

After thoroughly searching the codebase, documentation, and all phase completion reports, I found **NO specifications for Phase 2 eligibility verification API**. The existing codebase implements **eligibility checking** (Phase 3) but not **eligibility verification/badge issuance** (Phase 2).

---

## What EXISTS in the Codebase

### ✅ Badge System Infrastructure

**Location:** `server/middleware/auth.ts`, `server/types/booking.ts`

**Existing Badge IDs:**
- `badge_safety_101` - General Lab Safety
- `badge_3d_basics` - 3D Printing Basics
- `badge_laser_cert` - Laser Cutter Certification
- `badge_cnc_basics` / `badge_cnc_cert` - CNC Machine Certification
- `badge_admin` - Administrative badge

**Current Storage:** 
- Development: Test headers `X-Test-User-Badges: badge1,badge2`
- Production: User profile `badges?: string[]` field exists but no persistence implemented

**Demo Personas with Badges:**
- Lab Owner: `['badge_safety_101', 'badge_admin']`
- Qualified Student: `['badge_safety_101', 'badge_3d_basics', 'badge_laser_cert', 'badge_cnc_basics']`
- Resource-Hog Student: `['badge_safety_101', 'badge_3d_basics']`
- Admin: All badges
- Auditor: No badges

### ✅ Eligibility Checking System (Phase 3)

**Location:** `server/services/discovery.service.ts`, `server/controllers/discovery.controller.ts`

**What it does:**
- Checks if user has required badges for a resource
- Validates weekly quota limits
- Returns eligibility status: `READY_TO_BOOK`, `MISSING_PREREQUISITE`, `QUOTA_EXCEEDED`
- Lists missing badges with names and IDs

**What it does NOT do:**
- Issue or grant badges
- Verify certificates
- Run safety assessments
- Modify user badge lists

### ✅ Authentication & Authorization

**Location:** `server/middleware/auth.ts`

**Current System:**
- JWT authentication enforced
- Development test headers: `X-Test-User-Id`, `X-Test-User-Role`, `X-Test-User-Badges`
- Role-based access control
- Production blocks test headers

### ✅ File Upload Infrastructure (Phase 1)

**Location:** `server/middleware/upload.ts`

**Existing Capabilities:**
- Multer with memory storage
- MIME type validation (JPEG, PNG, WebP)
- Magic byte verification
- File size limits (5MB)
- Security: No disk persistence, no public URLs

---

## What is MISSING for Phase 2

### ❌ Complete Absence of Specifications

**Searched locations:**
- ✅ API_CONTRACTS.md
- ✅ All PHASE_*.md completion reports (Phases 1-8)
- ✅ PHASE_PROGRESS.md
- ✅ PROJECT_ARCHITECTURE.md
- ✅ README.md
- ✅ All server-side code
- ✅ All frontend code
- ✅ All test files

**Result:** **ZERO references** to:
- Certificate verification endpoint
- Safety assessment endpoint
- Badge issuance API
- `/api/trust/verify-eligibility` or similar
- Three-question assessment
- Certificate authenticity verification

### ❌ Certificate Verification Requirements

**Missing:**
1. **Accepted certificate formats** - PDF? Image? Structured data?
2. **Certificate fields to extract** - Issuer, expiry date, certificate number, holder name?
3. **Trusted issuers list** - Which organizations can issue valid certificates?
4. **Verification service** - External API to verify authenticity?
5. **Badge mapping** - Which certificates grant which badges?
6. **Expiry handling** - Do certificates expire? How to validate?
7. **Revocation checking** - Can certificates be revoked?

**Cannot implement without:**
- Specification of certificate format
- List of trusted issuers
- Badge issuance rules

### ❌ Safety Assessment Requirements

**Missing:**
1. **The three questions** - What are the actual safety questions?
2. **Correct answers** - What answers are considered correct?
3. **Passing threshold** - Score required to pass (all correct? 2/3?)
4. **Badge to be earned** - Which badge does passing grant?
5. **Equipment specificity** - Are questions generic or equipment-specific?
6. **Retry policy** - Can users retry failed assessments?
7. **Frontend contract** - What does Step 4 UI expect?

**Cannot implement without:**
- The actual questions and answers
- Passing criteria
- Badge issuance authorization

### ❌ Badge Issuance Authority

**Missing:**
1. **Who can issue badges** - Can users self-issue via this API?
2. **Authorization rules** - Admin-only? Lab owner approval required?
3. **Persistence mechanism** - How are badges stored permanently?
4. **Badge revocation** - Can badges be removed?
5. **Badge expiry** - Do badges expire?
6. **Audit trail** - Must badge issuance be logged?

**Current state:**
- Badges only in test headers (development)
- No database persistence for user badges
- No badge issuance API exists

### ❌ Step 4 Frontend Implementation

**Searched:** `src/` directory for Step 4 or eligibility verification UI

**Found:** NO Step 4 implementation. Existing frontend includes:
- ResourceMarketplace (discovery UI with eligibility badges)
- ConditionComparisonStudio (Phase 1 inspection)
- Member2 components (booking workflow)

**Missing:**
- Step 4 UI component
- Safety assessment form
- Certificate upload form
- API client for verification endpoint

---

## Requirements That Can Be INFERRED

### 🟡 Probable Requirements (Requires Confirmation)

**Based on existing Phase 3 eligibility system:**

1. **Badge System Integration**
   - Phase 2 likely issues badges that Phase 3 checks
   - Probable flow: Verify → Issue Badge → Discovery checks badge → User can book

2. **Authentication Required**
   - Consistent with all other endpoints
   - Users should only be able to verify for themselves

3. **Manual Review Fallback**
   - Following Phase 1 pattern of `requires_human_review: true`
   - Certificate authenticity cannot be verified without external service

4. **Response Format**
   - Should follow existing `successResponse` pattern
   - Should include `success`, `data`, `timestamp`

5. **Badge Identifier Format**
   - Likely `badge_safety_101` format (existing pattern)
   - Probably awards `badge_safety_101` for passing basic assessment

---

## Architectural Constraints

### ✅ Must Reuse

1. **Upload Middleware** - `server/middleware/upload.ts` (Phase 1)
2. **Authentication** - `server/middleware/auth.ts`
3. **Error Handling** - `server/utils/errors.ts`
4. **Response Format** - `successResponse()` helper
5. **Trust Routes** - Mount on existing `/api/trust` router

### ✅ Cannot Modify

1. **Badge checking logic** - `discovery.service.ts` (Phase 3)
2. **Phase 1 endpoints** - Must remain functional
3. **Existing test personas** - Demo users with preset badges
4. **Database schema** - No Prisma changes without approval

### ⚠️ Safety Requirements

1. **No self-issued badges** - Users cannot grant themselves badges
2. **No fake verification** - Cannot return "verified" without actual verification
3. **Pending review default** - Certificates return pending unless provably authentic
4. **Server-controlled answers** - Safety assessment answers must be server-side
5. **Badge persistence required** - Must explain storage mechanism before issuing

---

## Recommended Implementation Approach

### Phase 2A: API Structure (Safe to Implement)

**POST /api/trust/verify-eligibility**

**Accept:**
- Method A: Certificate upload (multipart/form-data)
- Method B: Safety assessment answers (JSON)

**Return:**
```json
{
  "success": true,
  "data": {
    "verification_status": "PENDING_MANUAL_REVIEW",
    "verification_method": "certificate_upload | safety_assessment",
    "eligible": false,
    "eligibility_badge": null,
    "score": null,
    "reasons": ["Certificate authenticity cannot be automatically verified"],
    "requires_human_review": true,
    "configuration_missing": ["TRUSTED_CERTIFICATE_ISSUERS", "SAFETY_ASSESSMENT_QUESTIONS"]
  }
}
```

**Safety guarantees:**
- Never issues badges automatically
- Always returns `requires_human_review: true`
- Clear indication of missing configuration
- No fabricated verification results

### Phase 2B: Configuration-Driven Implementation

**IF provided with:**
1. Safety questions and answers → Implement assessment
2. Trusted certificate issuers → Implement certificate validation
3. Badge persistence design → Implement badge issuance

**Store configuration in:**
- Environment variables (for simple config)
- JSON config file (for complex rules)
- Database (for dynamic configuration)

---

## Decision Points Required

### Critical Decisions Needed Before Full Implementation

1. **Safety Assessment Questions**
   - What are the three questions?
   - What are the correct answers?
   - What score is passing?
   - Which badge is earned?

2. **Certificate Verification**
   - What certificate formats are accepted?
   - Is there a verification service API?
   - What certificates grant what badges?
   - Who are trusted issuers?

3. **Badge Persistence**
   - Where should badges be stored?
   - Current options:
     - a) In-memory only (dev mode, current state)
     - b) User profile in database (requires schema)
     - c) Separate badge_grants table (audit trail)

4. **Badge Issuance Authority**
   - Can users self-issue badges via verification?
   - Or must an admin/lab owner approve?

5. **Frontend Integration**
   - Does Step 4 UI exist?
   - What is the expected request/response format?

---

## Proposed Next Steps

### Option 1: Implement Safe API Foundation (RECOMMENDED)

Implement Phase 2 with:
- ✅ Full API structure and routing
- ✅ Certificate upload validation (file checks only)
- ✅ Safety assessment structure (configurable questions)
- ✅ Authentication and authorization
- ✅ Comprehensive error handling
- ✅ Test coverage for API behavior
- ⚠️ Returns "pending manual review" for all verifications
- ⚠️ Does NOT issue badges automatically
- ⚠️ Clear documentation of missing configuration

**Advantages:**
- Production-safe immediately
- Clear separation of API structure from business rules
- Easy to extend when rules are defined
- No risk of fake verification results

### Option 2: Wait for Complete Specifications

Pause implementation until provided with:
- The three safety questions and answers
- Certificate verification requirements
- Badge issuance rules and persistence design

---

## Conclusion

**Phase 2 specifications do not exist in the codebase.** 

The most responsible approach is **Option 1**: Implement a production-ready API structure that clearly indicates missing configuration and requires manual review for all verification attempts. This provides the technical foundation while ensuring no badges are incorrectly issued based on invented business rules.

**Estimated implementation with Option 1:**
- 7 new files (types, service, controller, routes, tests)
- 2 modified files (trust routes, .env.example)
- Full test coverage
- Production-safe from day one
- Extensible when business rules are defined

---

**Status:** Ready to proceed with Option 1 pending approval.

