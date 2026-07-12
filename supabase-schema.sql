-- ============================================
-- Flight Tracker - Complete Supabase Schema
-- ============================================
-- This script creates all tables, views, and RLS policies
-- Run this once in Supabase SQL Editor to set up the database correctly

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
DROP POLICY IF EXISTS "Allow public read request_count" ON request_count;
DROP POLICY IF EXISTS "Allow service role update request_count" ON request_count;

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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Drop the old JSONB airline/segment columns — replaced by the flights and
-- price_history_flights tables below, which model each itinerary's flights
-- as proper relational entities instead of embedded JSON blobs. CASCADE
-- because the latest_prices view (recreated further down) still depends on
-- these columns on a database that already has it.
ALTER TABLE price_history DROP COLUMN IF EXISTS airlines CASCADE;
ALTER TABLE price_history DROP COLUMN IF EXISTS outbound_segments CASCADE;
ALTER TABLE price_history DROP COLUMN IF EXISTS inbound_segments CASCADE;

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
-- 3. FLIGHTS TABLE (deduped flight-number catalog)
-- ============================================
-- One row per unique marketing carrier + flight number + departure date
-- (e.g. "AA100 on 2026-12-19"). Flight numbers are daily schedules, not
-- permanent identifiers, so the same number on a different date may be a
-- different actual flight — date is part of what makes it unique.
--
-- Dropped and recreated (not just IF NOT EXISTS) because the unique key
-- changed from (code, number) to (code, number, date) — flights and its
-- dependent price_history_flights are derived/supplementary data, safe to
-- rebuild from scratch on future price checks.
DROP TABLE IF EXISTS price_history_flights CASCADE;
DROP TABLE IF EXISTS flights CASCADE;
CREATE TABLE IF NOT EXISTS flights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketing_carrier_code VARCHAR(3) NOT NULL,
  flight_number VARCHAR(10) NOT NULL,
  operating_carrier_name VARCHAR(255),
  departure_date DATE NOT NULL,
  UNIQUE (marketing_carrier_code, flight_number, departure_date)
);

ALTER TABLE flights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read flights" ON flights;
DROP POLICY IF EXISTS "Allow service role insert flights" ON flights;
DROP POLICY IF EXISTS "Allow service role update flights" ON flights;

CREATE POLICY "Allow public read flights" ON flights
  FOR SELECT USING (true);

CREATE POLICY "Allow service role insert flights" ON flights
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow service role update flights" ON flights
  FOR UPDATE USING (true) WITH CHECK (true);

GRANT SELECT ON public.flights TO anon, authenticated;
GRANT INSERT, UPDATE ON public.flights TO service_role;

-- ============================================
-- 4. PRICE_HISTORY_FLIGHTS TABLE (junction)
-- ============================================
-- Links each price_history itinerary to the flights it used. An itinerary
-- can involve multiple flights per leg (connections), so this is a
-- many-to-many relationship, ordered by position within outbound/inbound.
CREATE TABLE IF NOT EXISTS price_history_flights (
  id BIGSERIAL PRIMARY KEY,
  price_history_id BIGINT NOT NULL REFERENCES price_history(id) ON DELETE CASCADE,
  flight_id UUID NOT NULL REFERENCES flights(id),
  leg VARCHAR(8) NOT NULL CHECK (leg IN ('outbound', 'inbound')),
  leg_position SMALLINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phf_price_history ON price_history_flights(price_history_id);
CREATE INDEX IF NOT EXISTS idx_phf_flight ON price_history_flights(flight_id);

ALTER TABLE price_history_flights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read price_history_flights" ON price_history_flights;
DROP POLICY IF EXISTS "Allow service role insert price_history_flights" ON price_history_flights;

CREATE POLICY "Allow public read price_history_flights" ON price_history_flights
  FOR SELECT USING (true);

CREATE POLICY "Allow service role insert price_history_flights" ON price_history_flights
  FOR INSERT WITH CHECK (true);

GRANT SELECT ON public.price_history_flights TO anon, authenticated;
GRANT INSERT ON public.price_history_flights TO service_role;

-- ============================================
-- 5. VIEWS FOR DASHBOARD
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
  inbound_departure, inbound_arrival
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
