-- Request counter table
CREATE TABLE IF NOT EXISTS request_count (
  id INT PRIMARY KEY DEFAULT 1,
  count INT DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO request_count (id, count) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

-- Price history table
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_price_history_route ON price_history(origin, destination);
CREATE INDEX idx_price_history_checked_at ON price_history(checked_at DESC);
CREATE INDEX idx_price_history_price ON price_history(price);

-- View: Latest unique prices per route
CREATE OR REPLACE VIEW latest_prices AS
SELECT DISTINCT ON (origin, destination) 
  origin, destination, price, currency, 
  duration_outbound, duration_inbound,
  outbound_stops, inbound_stops,
  checked_at,
  outbound_departure, outbound_arrival,
  inbound_departure, inbound_arrival,
  airlines
FROM price_history
ORDER BY origin, destination, checked_at DESC;

-- View: Price trends (last 30 days)
CREATE OR REPLACE VIEW price_trends AS
SELECT 
  origin, destination,
  DATE(checked_at) as date,
  MIN(price) as min_price,
  MAX(price) as max_price,
  AVG(price)::INT as avg_price,
  COUNT(*) as checks
FROM price_history
WHERE checked_at > NOW() - INTERVAL '30 days'
GROUP BY origin, destination, DATE(checked_at)
ORDER BY origin, destination, date DESC;

-- Enable Row Level Security (optional, for public access)
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

-- Public read-only policy
CREATE POLICY "Public read access" ON price_history
  FOR SELECT USING (true);

-- Restrict write access to server only (authenticated as service role)
CREATE POLICY "Service role write only" ON price_history
  FOR INSERT USING (auth.role() = 'service_role');

-- Grant public read on views
GRANT SELECT ON latest_prices TO anon, authenticated;
GRANT SELECT ON price_trends TO anon, authenticated;

-- Vacuum and analyze
VACUUM ANALYZE price_history;
