# Phase 11 — Production Authentication, Security Hardening & Deployment Readiness

This document specifies the production security architecture, authentication mechanisms, environment validation, authorization policies, and deployment procedures implemented for the OpenResource Member 2 backend module (Booking, Custody & Notifications).

---

## 1. Authentication Architecture

### 1.1 Before Phase 11 (Audit Findings)
* **Development Headers:** Requests relied on development-only headers (`X-Test-User-Id`, `X-Test-User-Role`, `X-Test-User-Badges`) and mapped string tokens in `Authorization: Bearer <persona_name>` to hardcoded demo personas in `KNOWN_PERSONAS`.
* **Missing JWT Verification:** In production mode (`NODE_ENV=production`), test headers were skipped, but real Bearer JWT cryptographic verification was only a stubbed comment, rendering real production authentication inoperable.
* **Unenforced Roles:** Test headers allowed caller-controlled roles (`X-Test-User-Role`) during non-production testing, which could lead to privilege escalation if accidentally exposed.

### 1.2 After Phase 11 (Production Ready)
* **Standard JWT Authentication:** Built on the industry-standard `jsonwebtoken` library. Requests on protected endpoints must provide an `Authorization: Bearer <token>` header containing a cryptographically signed JSON Web Token (JWT).
* **Claims & Cryptographic Verification:**
  - Token signatures are verified against `JWT_SECRET` (HMAC-SHA256) or `JWT_PUBLIC_KEY` (RS256).
  - Validates `iss` (Issuer), `aud` (Audience), and expiration time (`exp`).
  - Rejects tokens with `none` algorithm or untrusted signing keys.
  - Derives user identity strictly from verified token claims: `sub` (User ID), `role` (UserRole), `name`, `email`, `badges`.
* **Privilege Escalation Prevention:** Client-supplied role headers or body overrides are ignored or rejected. The actor's authority is determined strictly by the cryptographic token claims.
* **Distinct Error Responses:**
  - `401 UNAUTHORIZED`: Unauthenticated requests, missing tokens, expired tokens, or signature verification failures.
  - `403 FORBIDDEN`: Authenticated callers attempting actions beyond their assigned role permissions or ownership boundaries.

---

## 2. Development vs. Production Authentication

| Feature | Development / Test Mode (`NODE_ENV != 'production'`) | Production Mode (`NODE_ENV=production`) |
| :--- | :--- | :--- |
| **JWT Bearer Auth** | Fully supported (`createTestJwt` helper available for tests). | **Required** on all protected endpoints. |
| **Persona Bearer Tokens** | Allowed (`Bearer demo_lab_owner`) if `ENABLE_DEV_TEST_AUTH=true`. | **Strictly Rejected** (returns `401 UNAUTHORIZED`). |
| **`X-Test-User-*` Headers** | Allowed if `ENABLE_DEV_TEST_AUTH=true` or in Vitest runner. | **Strictly Rejected** (returns `401 UNAUTHORIZED`). |
| **Identity Source** | Verified JWT claim, or resolved persona fixture. | **Strictly verified JWT claims**. |
| **Client-Supplied Roles** | Permitted in test fixtures for persona testing. | **Completely Ignored/Rejected**. |
| **Environment Check** | Permissive fallback defaults for fast development. | **Strict Fail-Closed Startup Validation**. |

---

## 3. Environment & Configuration Security

### 3.1 Git Safety
- `.gitignore` was updated to explicitly ignore `.env` and all secret-bearing `.env.*` files.
- `.env.example` provides safe placeholder templates with zero real credentials.

### 3.2 Environment Variables

| Variable | Required in Production? | Description / Requirements |
| :--- | :--- | :--- |
| `PORT` | Optional (default: `3000`) | Network port for Express server. |
| `NODE_ENV` | Recommended | Set to `production` in staging/production deployments. |
| `STORAGE_MODE` | Optional (default: `memory`) | Set to `postgres` for persistent PostgreSQL operation. |
| `DATABASE_URL` | **Yes** (when `STORAGE_MODE=postgres`) | PostgreSQL connection string (`postgresql://user:pass@host:5432/dbname?sslmode=require`). Placeholders trigger startup failure. |
| `JWT_SECRET` | **Yes** (if `JWT_PUBLIC_KEY` unset) | Secret key for HS256 tokens. Minimum **32 characters**. Placeholders trigger startup failure. |
| `JWT_PUBLIC_KEY` | Optional | Public PEM key for RS256 token verification (if using external IdP like Auth0, Keycloak, or Cognito). |
| `JWT_ISSUER` | Optional (default: `openresource-auth`) | Expected token issuer (`iss`). |
| `JWT_AUDIENCE` | Optional (default: `openresource-api`) | Expected token audience (`aud`). |
| `JWT_ALGORITHMS` | Optional (default: `HS256,RS256`) | Comma-separated list of permitted cryptographic signing algorithms. |
| `ENABLE_DEV_TEST_AUTH` | No | Must be `false` or unset in production. Production ignores it and strictly forbids test headers. |
| `ALLOWED_ORIGINS` | Recommended | Comma-separated list of allowed frontend origins (e.g. `https://app.openresource.org`). Wildcard `*` is strictly forbidden in production. |

### 3.3 Fail-Closed Startup Validation (`server/config/env.ts`)
When `NODE_ENV=production`, the application validates all configuration on boot:
- Verifies that `JWT_SECRET` or `JWT_PUBLIC_KEY` is present, not a placeholder, and sufficiently strong.
- Verifies that `DATABASE_URL` is present and valid if `STORAGE_MODE=postgres`.
- Verifies that `ALLOWED_ORIGINS` contains no wildcards.
- If any check fails, logs a clear message without revealing secrets and terminates execution (`exit code 1`).

---

## 4. HTTP Security Hardening

1. **Fingerprint Masking:** `app.disable('x-powered-by')` removes the Express signature header.
2. **Security Headers Middleware:**
   - `X-Content-Type-Options: nosniff` (prevents MIME-type sniffing).
   - `X-Frame-Options: DENY` (clickjacking protection).
   - `X-XSS-Protection: 0` (modern standard).
   - `Referrer-Policy: strict-origin-when-cross-origin`.
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (enforced when `NODE_ENV=production`).
3. **Payload Limit:** `express.json({ limit: '100kb' })` prevents memory exhaustion and DoS via oversized request bodies (returns `413 PAYLOAD_TOO_LARGE`).
4. **CORS Restrictions:** Only explicitly whitelisted origins are permitted. Wildcards are rejected in production.
5. **Sanitized Error Handling:** Stack traces, internal file paths (`node_modules`), and SQL details are never sent in API error responses.

---

## 5. PostgreSQL Persistence Safety

- **Storage Abstraction:** Production operates through `PostgresStorageAdapter` using connection pooling (`pg.Pool`), transaction-safe queries, and parametrized statements ($1, $2, ...) to prevent SQL injection.
- **Deadlock-Free Cleanup:** Replaced all `TRUNCATE ... CASCADE` calls with ordered `DELETE FROM` statements within transactions, eliminating `40P01` table locks.
- **Hermetic Testing:** Vitest executes tests with `STORAGE_MODE=memory` by default, protecting persistent records in `openresource_dev` from accidental truncation.
- **Graceful Shutdown:** `SIGINT` and `SIGTERM` signals trigger orderly closing of Express HTTP listeners, scheduler loops, and database connection pools.

---

## 6. Production Deployment Steps

### 6.1 Prerequisites
1. Node.js LTS (v20+ or v24+) installed on target host/container.
2. Managed PostgreSQL 15+ database with SSL enabled.
3. Production Identity Provider or secret management system supplying `JWT_SECRET`.
4. Reverse proxy (Nginx, Caddy, Cloudflare, AWS ALB) configured for HTTPS/TLS termination.

### 6.2 Deployment Procedure
```bash
# 1. Install production dependencies
npm ci --omit=dev

# 2. Build frontend assets and compile TypeScript
npm run build

# 3. Apply PostgreSQL migrations
npm run db:migrate

# 4. Start production server
NODE_ENV=production npm run start
```

### 6.3 Deployment Checklist
- [ ] Database credentials and `JWT_SECRET` set via secure environment variables (not committed to repo).
- [ ] Database migration `001_initial_schema.sql` applied to target database.
- [ ] HTTPS / TLS termination configured on reverse proxy or load balancer.
- [ ] `ALLOWED_ORIGINS` configured with the exact production frontend domain.
- [ ] Health check endpoint `/health` monitored by orchestrator or uptime bot.
- [ ] Database backup policy (automated daily snapshots and WAL archiving) active.

---

## 7. Known Limitations & Future External Setup

1. **External Identity Provider (IdP):**
   - The backend currently verifies standard JWT tokens signed with HMAC-SHA256 (`JWT_SECRET`) or RSA (`JWT_PUBLIC_KEY`).
   - If integrating with Auth0, Keycloak, Firebase, or AWS Cognito, configure `JWT_PUBLIC_KEY` or connect a JWKS endpoint (e.g. `jwks-rsa`) and supply the IdP's `JWT_ISSUER` and `JWT_AUDIENCE`.
2. **Reverse Proxy SSL Termination:**
   - The Node.js Express server does not handle TLS termination directly; it expects a reverse proxy (Nginx, AWS ALB, Cloudflare) to terminate SSL and forward standard `X-Forwarded-Proto` and `X-Forwarded-For` headers.
