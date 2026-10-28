-- OpenResource - Phase 10: PostgreSQL Initial Schema Migration
-- Migration: 001_initial_schema.sql

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL,
  phone VARCHAR(50),
  student_id VARCHAR(50),
  badges TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Resources Table
CREATE TABLE IF NOT EXISTS resources (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  owner_id VARCHAR(255) NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
  category VARCHAR(100) NOT NULL,
  weekly_usage_cap NUMERIC(6, 2) NOT NULL DEFAULT 10.0,
  required_badge_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resources_owner ON resources (owner_id);

-- 3. Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
  id VARCHAR(255) PRIMARY KEY,
  resource_id VARCHAR(255) NOT NULL REFERENCES resources(id) ON UPDATE CASCADE,
  resource_name VARCHAR(255),
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
  owner_id VARCHAR(255) NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  intent TEXT NOT NULL,
  status VARCHAR(50) NOT NULL,
  requires_supervision BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_hours NUMERIC(6, 2) NOT NULL,
  rejection_reason TEXT,
  cancellation_reason TEXT,
  checked_in_at TIMESTAMPTZ,
  checked_in_by VARCHAR(255),
  returned_at TIMESTAMPTZ,
  returned_by VARCHAR(255),
  condition_notes TEXT,
  incident_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast conflict detection and window overlap search
CREATE INDEX IF NOT EXISTS idx_bookings_resource_window ON bookings (resource_id, start_time, end_time);
-- Fast user booking and weekly quota lookups
CREATE INDEX IF NOT EXISTS idx_bookings_user_status ON bookings (user_id, status);
-- Fast scheduler no-show sweep lookup
CREATE INDEX IF NOT EXISTS idx_bookings_status_start ON bookings (status, start_time);

-- 4. Booking Audit History Table
CREATE TABLE IF NOT EXISTS booking_history (
  id VARCHAR(255) PRIMARY KEY,
  booking_id VARCHAR(255) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE ON UPDATE CASCADE,
  from_status VARCHAR(50) NOT NULL,
  to_status VARCHAR(50) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id VARCHAR(255) NOT NULL,
  actor_role VARCHAR(50) NOT NULL,
  reason TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_booking_history_booking ON booking_history (booking_id, timestamp ASC);

-- 5. Custody Credentials Table (Strictly hashes only: never store plaintext OTPs or QR tokens)
CREATE TABLE IF NOT EXISTS custody_credentials (
  id VARCHAR(255) PRIMARY KEY,
  booking_id VARCHAR(255) NOT NULL REFERENCES bookings(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
  action VARCHAR(50) NOT NULL,
  otp_hash VARCHAR(64) NOT NULL,
  qr_token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts_remaining INT NOT NULL DEFAULT 3,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  used_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custody_credentials_booking ON custody_credentials (booking_id, action, created_at DESC);

-- 6. Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(255) PRIMARY KEY,
  recipient_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON UPDATE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  booking_id VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications (recipient_user_id, read, created_at DESC);

-- 7. Idempotency Keys Table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
