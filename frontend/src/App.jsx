import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import PriceChart from './components/PriceChart';
import PriceTable from './components/PriceTable';
import RequestCounter from './components/RequestCounter';
import './App.css';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const ROUTES = [
  { code: 'SZG:DAD', label: 'Salzburg → Da Nang' },
  { code: 'MUC:DAD', label: 'Munich → Da Nang' },
  { code: 'VIE:DAD', label: 'Vienna → Da Nang' },
  { code: 'FRA:DAD', label: 'Frankfurt → Da Nang' }
];

export default function App() {
  const [prices, setPrices] = useState([]);
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState('SZG:DAD');
  const [sortBy, setSortBy] = useState('price');
  const [filterDirect, setFilterDirect] = useState(false);
  const [maxPrice, setMaxPrice] = useState(null);
  const [requestCount, setRequestCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    loadData();
    
    // Subscribe to realtime updates
    const sub = supabase
      .channel('price_updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'price_history' },
        (payload) => {
          setPrices(prev => [payload.new, ...prev].slice(0, 100));
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    // Poll every 30 seconds for new data
    const interval = setInterval(loadData, 30000);

    return () => {
      clearInterval(interval);
      sub.unsubscribe();
    };
  }, []);

  async function loadData() {
    try {
      // Fetch latest prices
      const { data: priceData, error: priceError } = await supabase
        .from('price_history')
        .select('*')
        .order('checked_at', { ascending: false })
        .limit(500);

      if (!priceError) setPrices(priceData || []);

      // Fetch trends
      const { data: trendData, error: trendError } = await supabase
        .from('price_trends')
        .select('*')
        .order('date', { ascending: false })
        .limit(300);

      if (!trendError) setTrends(trendData || []);

      // Fetch request count
      const { data: countData } = await supabase
        .from('request_count')
        .select('count')
        .single();

      setRequestCount(countData?.count || 0);

      setLastUpdate(new Date());
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const [origin, dest] = selectedRoute.split(':');
  const routePrices = prices.filter(p => p.origin === origin && p.destination === dest);

  // Deduplicate by price + flight times (same flight typically reappears)
  const uniquePrices = Array.from(
    new Map(
      routePrices.map(p => [
        `${p.price}|${p.outbound_departure}|${p.outbound_arrival}`,
        p
      ])
    ).values()
  ).slice(0, 50);

  // Filter
  let filtered = [...uniquePrices];
  if (filterDirect) {
    filtered = filtered.filter(f => f.outbound_stops === 0);
  }
  if (maxPrice) {
    filtered = filtered.filter(f => f.price <= maxPrice);
  }

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'price') return a.price - b.price;
    if (sortBy === 'duration') return a.duration_outbound - b.duration_outbound;
    if (sortBy === 'time') return new Date(a.outbound_departure) - new Date(b.outbound_departure);
    return 0;
  });

  const bestPrice = Math.min(...prices.map(p => p.price), Infinity);
  const avgPrice = Math.round(prices.reduce((s, p) => s + p.price, 0) / prices.length || 0);
  const trackedDays = new Set(prices.map(p => p.checked_at.split('T')[0])).size;

  return (
    <div className="container">
      <header>
        <h1>✈️ Flight Price Tracker</h1>
        <p>Salzburg | Munich | Vienna | Frankfurt → Da Nang, Vietnam</p>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Dec 19–22, 2026 → Jan 7–8, 2027 | 2 Adults, 2 Children | Max €1,450/person
        </p>
      </header>

      <RequestCounter count={requestCount} limit={980} />

      <div className="stats-row">
        <div className="stat">
          <span className="label">Best price found</span>
          <span className="value">{bestPrice !== Infinity ? `€${bestPrice}` : '—'}</span>
        </div>
        <div className="stat">
          <span className="label">Average</span>
          <span className="value">{avgPrice > 0 ? `€${avgPrice}` : '—'}</span>
        </div>
        <div className="stat">
          <span className="label">Days tracked</span>
          <span className="value">{trackedDays}</span>
        </div>
        <div className="stat">
          <span className="label">Checks</span>
          <span className="value">{prices.length}</span>
        </div>
      </div>

      {lastUpdate && (
        <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
          Last updated: {lastUpdate.toLocaleTimeString()}
        </p>
      )}

      <section>
        <h2>Price Trends</h2>
        <PriceChart trends={trends} routeKey={selectedRoute} />
      </section>

      <section>
        <h2>Route</h2>
        <div className="route-selector">
          {ROUTES.map(route => (
            <button
              key={route.code}
              className={selectedRoute === route.code ? 'active' : ''}
              onClick={() => setSelectedRoute(route.code)}
            >
              {route.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Available Flights</h2>
        <div className="controls-wrapper">
          <div className="sort-controls">
            <button
              className={sortBy === 'price' ? 'active' : ''}
              onClick={() => setSortBy('price')}
            >
              ↕ Price
            </button>
            <button
              className={sortBy === 'duration' ? 'active' : ''}
              onClick={() => setSortBy('duration')}
            >
              ↕ Duration
            </button>
            <button
              className={sortBy === 'time' ? 'active' : ''}
              onClick={() => setSortBy('time')}
            >
              ↕ Departure
            </button>
          </div>
          
          <div className="filter-controls">
            <label className="filter-checkbox">
              <input
                type="checkbox"
                checked={filterDirect}
                onChange={(e) => setFilterDirect(e.target.checked)}
              />
              Direct only
            </label>
            <input
              type="number"
              placeholder="Max price (€)"
              value={maxPrice || ''}
              onChange={(e) => setMaxPrice(e.target.value ? parseInt(e.target.value) : null)}
              className="price-input"
            />
            {(filterDirect || maxPrice) && (
              <button
                onClick={() => {
                  setFilterDirect(false);
                  setMaxPrice(null);
                }}
                className="clear-filters"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</p>
        ) : sorted.length > 0 ? (
          <PriceTable flights={sorted} />
        ) : (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            No prices found yet. Check back later.
          </p>
        )}
      </section>

      <footer>
        <p>
          Prices from <strong>Ignav API</strong> | Real-time tracking (4-5 checks/day) |
          Max 980 requests
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
          <strong>Note:</strong> Prices exclude seat selection fees. Most airlines auto-assign seats
          for free; premium seats cost €20–60 extra.
        </p>
      </footer>
    </div>
  );
}
