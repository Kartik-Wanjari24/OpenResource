# OpenResource — Phase 10: PostgreSQL Persistence Guide

This guide documents the PostgreSQL persistence architecture for OpenResource (Member 2 backend), including local setup, migration execution, configuration security, and persistence verification across server restarts.

---

## 1. Storage Architecture Overview

The backend uses a clean, interface-driven persistence model defined by `IStorageAdapter` ([server/types/storage.interface.ts](file:///D:/Hackathon%20website/OpenResource/server/types/storage.interface.ts)):

```
                             ┌────────────────────────┐
                             │    IStorageAdapter     │
                             └───────────┬────────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
      ┌─────────────────────────┐                 ┌─────────────────────────┐
      │  InMemoryStorageAdapter │                 │  PostgresStorageAdapter │
      │  (Zero-Dependency Mode) │                 │  (PostgreSQL Pool & TX) │
      └─────────────────────────┘                 └─────────────────────────┘
```

### Storage Modes & Resolution Order
1. **In-Memory Mode (`memory`)**:
   - Active when `DATABASE_URL` is unset or `STORAGE_MODE=memory`.
   - Used for zero-credential unit testing and offline development.
   - All 134 automated tests run with 100% isolation in this mode.
2. **PostgreSQL Mode (`postgres`)**:
   - Active when `DATABASE_URL` is set or `STORAGE_MODE=postgres`.
   - Connects to PostgreSQL using `pg.Pool` with parameterized queries.
   - If PostgreSQL is configured but cannot connect or is misconfigured, the backend **fails closed with a clear error**; it **never silently falls back to in-memory mode**.

---

## 2. Database Creation & Local Setup

### Step 1: Create the Database
Ensure PostgreSQL 14+ is installed and running on your system (e.g. localhost port 5432).

Run either command in your terminal:

**Option A: Using PostgreSQL CLI (`createdb`)**
```bash
createdb -U postgres openresource_dev
```

**Option B: Using `psql` interactive prompt**
```sql
psql -U postgres
CREATE DATABASE openresource_dev;
\q
```

---

## 3. Configuring `DATABASE_URL` Without Committing Secrets

### Step 2: Configure Environment Variables

> [!IMPORTANT]
> Never commit actual database passwords to Git. The `.gitignore` file must ignore `.env`.

1. Copy the provided `.env.example` template:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and set your credentials:
   ```env
   PORT=3000
   NODE_ENV=development
   STORAGE_MODE=postgres
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/openresource_dev
   ```

### Securing Credentials with `.pgpass` (Alternative)
To avoid putting passwords in connection strings entirely, configure a local `~/.pgpass` (Linux/macOS) or `%APPDATA%\postgresql\pgpass.conf` (Windows):
```
localhost:5432:openresource_dev:postgres:YOUR_PASSWORD
```
Then use:
```env
DATABASE_URL=postgresql://postgres@localhost:5432/openresource_dev
```

---

## 4. Applying Schema Migrations

### Step 3: Run the Migration Runner

The migration runner reads pending SQL files from `server/db/migrations/`, executes them within an atomic transaction, records the applied version in `schema_migrations`, and idempotently seeds canonical personas and default lab resources:

```bash
npm run db:migrate
```

Expected output:
```
[DB Migrate] Applying migration: 001_initial_schema.sql...
[DB Migrate] ✓ Migration applied successfully: 001_initial_schema.sql
[DB Migrate] Migration run complete. Applied: 1, Skipped: 0
```

### Database Tables Created
| Table | Description |
|---|---|
| `schema_migrations` | Tracks applied migration versions (`version`, `applied_at`) |
| `users` | Personas, contact details, roles, and safety certification badges |
| `resources` | Physical lab resources with weekly usage limits and badge requirements |
| `bookings` | Primary booking records with timestamps, statuses, supervision, and custody timestamps |
| `booking_history` | Immutable audit log of every booking state transition with actor IDs and notes |
| `custody_credentials` | Security credentials storing **only SHA-256 hashes** (`otp_hash`, `qr_token_hash`) |
| `notifications` | In-app user notifications with read status, timestamps, and metadata |
| `idempotency_keys` | Unique key index preventing duplicate webhook or event notifications |

---

## 5. Starting in PostgreSQL Mode

### Step 4: Launch the Server
To run the standalone Express backend:
```bash
npm run server
```

Expected startup log:
```
OpenResource Member 2 API Server running at http://localhost:3000
Storage Mode: [POSTGRES]
Mounted routes: /api/bookings/* and /api/notifications/*
```

To run with Vite frontend integration:
```bash
npm run dev
```

### Checking Active Storage Mode via API
Query the health check endpoint:
```bash
curl http://localhost:3000/health
```
Response:
```json
{
  "status": "ok",
  "module": "OpenResource - Member 2 (Booking, Custody & Notifications)",
  "storageMode": "postgres",
  "timestamp": "2026-10-28T22:15:00.000Z",
  "version": "1.0.0"
}
```

---

## 6. Verifying Persistence Across Server Restarts

### Step 5: Test Data Durability
Follow this repeatable smoke test to prove data persists after a full server restart:

1. **Create a Booking Request**:
   ```bash
   curl -X POST http://localhost:3000/api/bookings \
     -H "Content-Type: application/json" \
     -H "X-Test-User-Id: demo_qualified_student" \
     -H "X-Test-User-Role: STUDENT" \
     -d '{
       "resourceId": "res_3d_prusa",
       "startTime": "2026-10-30T10:00:00.000Z",
       "endTime": "2026-10-30T12:00:00.000Z",
       "intent": "Printing custom drone chassis prototype"
     }'
   ```
   Note the returned booking `id` (e.g., `book_1730000000_abcd`).

2. **Stop the Server**:
   Press `Ctrl+C` in the terminal running `npm run server`.

3. **Restart the Server**:
   ```bash
   npm run server
   ```

4. **Retrieve the Booking**:
   ```bash
   curl http://localhost:3000/api/bookings/book_1730000000_abcd \
     -H "X-Test-User-Id: demo_qualified_student" \
     -H "X-Test-User-Role: STUDENT"
   ```
   The booking and its audit history will be returned intact from PostgreSQL.

5. **Verify Notifications Persisted**:
   ```bash
   curl http://localhost:3000/api/notifications \
     -H "X-Test-User-Id: demo_lab_owner" \
     -H "X-Test-User-Role: LAB_OWNER"
   ```
   The booking request notification for the lab owner will be returned intact.

---

## 7. Security and Concurrency Features

1. **Advisory Locks (`pg_advisory_lock`)**:
   Booking creations and custody state transitions acquire a PostgreSQL advisory lock hashed to the `resource_id`. This prevents double-booking race conditions even across multiple clustered application instances.
2. **Credential Zero-Plaintext Policy**:
   Only cryptographic hashes (`otp_hash` and `qr_token_hash`) are stored in `custody_credentials`. Plaintext OTPs and QR tokens are discarded immediately after issuance.
3. **Graceful Connection Shutdown**:
   Upon receiving `SIGINT` or `SIGTERM`, `StorageAdapter.close()` drains and closes the `pg.Pool` cleanly.
