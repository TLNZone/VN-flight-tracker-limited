-- ============================================
-- Flight Tracker - Complete Supabase Schema
-- ============================================
-- This script creates all tables, views, and RLS policies
-- Run this once in Supabase SQL Editor to set up the database correctly

-- ============================================
-- 1. REQUEST COUNTER TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS request_count (
  id INT PRIMARY KEY DEFAULT 1,
  count INT DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Initialize counter
INSERT INTO request_count (id, count) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

-- Enable RLS on request_count
ALTER TABLE request_count ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Allow public read" ON request_count;
DROP POLICY IF EXISTS "Allow service role update" ON request_count;

-- Create RLS policies for request_count
CREATE POLICY "Allow public read request_count" ON request_count
  FOR SELECT USING (true);

CREATE POLICY "Allow service role update request_count" ON request_count
  FOR UPDATE USING (true) WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON public.request_count TO anon, authenticated;
GRANT UPDATE ON public.request_count TO service_role;

-- ============================================
-- 2. PRICE HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS price_history (
  id BIGSERIAL PRIMARY KEY,
  origin VARCHAR(3) NOT NULL,
  destination VARCHAR(3) NOT NULL,
  price INT NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  duration_outbound INT NOT NULL,          -- minutes
  duration_inbound INT,                    -- minutes
  outbound_stops INT DEFAULT 0,
  inbound_stops INT DEFAULT 0,
  outbound_hubs VARCHAR(255),              -- Hub airport codes (e.g., "VIE, MUC")
  checked_at TIMESTAMP WITH TIME ZONE NOT NULL,
  outbound_departure TIMESTAMP WITH TIME ZONE,
  outbound_arrival TIMESTAMP WITH TIME ZONE,
  inbound_departure TIMESTAMP WITH TIME ZONE,
  inbound_arrival TIMESTAMP WITH TIME ZONE,
  airlines JSONB,                          -- JSON array of airline codes
  outbound_segments JSONB,                 -- JSON array of {airline, code, flight_number} per outbound segment
  inbound_segments JSONB,                  -- JSON array of {airline, code, flight_number} per inbound segment
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns for deployments created before segment details were tracked
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS outbound_segments JSONB;
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS inbound_segments JSONB;

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_price_history_route ON price_history(origin, destination);
CREATE INDEX IF NOT EXISTS idx_price_history_checked_at ON price_history(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_price ON price_history(price);

-- Enable RLS on price_history
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Allow public read" ON price_history;
DROP POLICY IF EXISTS "Allow service role insert" ON price_history;
DROP POLICY IF EXISTS "Allow public read price_history" ON price_history;
DROP POLICY IF EXISTS "Allow service role insert price_history" ON price_history;

-- Create RLS policies for price_history
CREATE POLICY "Allow public read price_history" ON price_history
  FOR SELECT USING (true);

CREATE POLICY "Allow service role insert price_history" ON price_history
  FOR INSERT WITH CHECK (true);

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.price_history TO anon, authenticated;
GRANT INSERT ON public.price_history TO service_role;

-- ============================================
-- 3. VIEWS FOR DASHBOARD
-- ============================================

-- View: Latest unique prices per route
-- Dropped and recreated (not REPLACE) because Postgres forbids renaming or
-- reordering existing view columns via CREATE OR REPLACE VIEW.
DROP VIEW IF EXISTS latest_prices CASCADE;
CREATE VIEW latest_prices AS
SELECT DISTINCT ON (origin, destination)
  origin, destination, price, currency,
  duration_outbound, duration_inbound,
  outbound_stops, inbound_stops,
  outbound_hubs,
  checked_at,
  outbound_departure, outbound_arrival,
  inbound_departure, inbound_arrival,
  airlines, outbound_segments, inbound_segments
FROM price_history
ORDER BY origin, destination, checked_at DESC;

-- View: Price trends per check (last 30 days), one point per request time per route
DROP VIEW IF EXISTS price_trends CASCADE;
CREATE VIEW price_trends AS
SELECT
  origin, destination,
  checked_at,
  MIN(price) as min_price,
  MAX(price) as max_price,
  AVG(price)::INT as avg_price,
  COUNT(*) as checks
FROM price_history
WHERE checked_at > NOW() - INTERVAL '30 days'
GROUP BY origin, destination, checked_at
ORDER BY checked_at DESC;

-- Grant permissions on views
GRANT SELECT ON latest_prices TO anon, authenticated;
GRANT SELECT ON price_trends TO anon, authenticated;

-- Note: no manual VACUUM ANALYZE here — Supabase's SQL Editor runs pasted
-- scripts inside a transaction, and Postgres forbids VACUUM inside one.
-- Autovacuum handles this automatically; run VACUUM ANALYZE by hand outside
-- a transaction (e.g. via psql) if you ever need to force it immediately.
