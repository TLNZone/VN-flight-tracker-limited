import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import PriceChart from './components/PriceChart';
import PriceTable from './components/PriceTable';
import RequestCounter from './components/RequestCounter';
import './App.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('supabaseUrl and supabaseAnonKey are required');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function App() {
  const [flights, setFlights] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [requestCount, setRequestCount] = useState(0);
  const [selectedRoute, setSelectedRoute] = useState('SZG:DAD');
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('price');
  const [filterDirect, setFilterDirect] = useState(false);
  const [maxPrice, setMaxPrice] = useState(2000);
  const [maxDuration, setMaxDuration] = useState(30);
  const [stats, setStats] = useState({
    bestPrice: null,
    averagePrice: null,
    daysTracked: 0,
    checksCompleted: 0,
  });

  const routes = [
    { code: 'SZG:DAD', label: 'Salzburg → Da Nang' },
    { code: 'MUC:DAD', label: 'Munich → Da Nang' },
    { code: 'VIE:DAD', label: 'Vienna → Da Nang' },
    { code: 'FRA:DAD', label: 'Frankfurt → Da Nang' },
  ];

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [selectedRoute]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [origin, destination] = selectedRoute.split(':');

      const { data: historyData } = await supabase
        .from('price_history')
        .select('*')
        .eq('origin', origin)
        .eq('destination', destination)
        .order('checked_at', { ascending: false });

      const safeFlights = historyData && Array.isArray(historyData) ? historyData : [];
      setFlights(safeFlights);

      if (safeFlights && safeFlights.length > 0) {
        const prices = safeFlights.map(f => f.price).filter(p => typeof p === 'number');
        const uniqueDates = new Set(
          safeFlights.map(f => {
            if (f && f.checked_at) {
              return f.checked_at.split('T')[0];
            }
            return null;
          }).filter(d => d !== null)
        );

        setStats({
          bestPrice: prices.length > 0 ? Math.min(...prices) : null,
          averagePrice: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
          daysTracked: uniqueDates.size,
          checksCompleted: safeFlights.length,
        });
      } else {
        setStats({
          bestPrice: null,
          averagePrice: null,
          daysTracked: 0,
          checksCompleted: 0,
        });
      }

      const { data: trendsData } = await supabase
        .from('price_trends')
        .select('*')
        .eq('origin', origin)
        .eq('destination', destination)
        .order('date', { ascending: false })
        .limit(30);

      const safeTrends = trendsData && Array.isArray(trendsData) ? trendsData : [];
      setTrendData(safeTrends);

      const { data: countData } = await supabase
        .from('request_count')
        .select('count')
        .single();

      if (countData && typeof countData.count === 'number') {
        setRequestCount(countData.count);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setFlights([]);
      setTrendData([]);
      setStats({
        bestPrice: null,
        averagePrice: null,
        daysTracked: 0,
        checksCompleted: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredFlights = (() => {
    if (!flights || !Array.isArray(flights) || flights.length === 0) {
      return [];
    }

    const filtered = flights.filter(f => {
      if (!f || typeof f !== 'object') return false;
      const stops = Number(f.outbound_stops) || 0;
      const price = Number(f.price) || 999999;
      const duration = Number(f.duration_outbound) || 999999;

      if (filterDirect && stops > 0) return false;
      if (price > maxPrice) return false;
      if (duration > maxDuration * 60) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'price':
          return (Number(a.price) || 0) - (Number(b.price) || 0);
        case 'duration':
          return (Number(a.duration_outbound) || 0) - (Number(b.duration_outbound) || 0);
        case 'departure': {
          const aTime = a.outbound_departure ? new Date(a.outbound_departure).getTime() : 0;
          const bTime = b.outbound_departure ? new Date(b.outbound_departure).getTime() : 0;
          return aTime - bTime;
        }
        default:
          return 0;
      }
    });
  })();

  const clearFilters = () => {
    setFilterDirect(false);
    setMaxPrice(2000);
    setMaxDuration(30);
  };

  const hasActiveFilters = filterDirect || maxPrice < 2000 || maxDuration < 30;

  return (
    <div className="app-container">
      <header className="header">
        <h1>✈️ Flight Price Tracker</h1>
        <p>Salzburg, Munich, Vienna, Frankfurt → Da Nang, Vietnam</p>
      </header>

      <RequestCounter count={requestCount} />

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">
            {stats.bestPrice ? `€${stats.bestPrice}` : '—'}
          </div>
          <div className="stat-label">Best price found</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stats.averagePrice ? `€${stats.averagePrice}` : '—'}
          </div>
          <div className="stat-label">Average price</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.daysTracked}</div>
          <div className="stat-label">Days tracked</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.checksCompleted}</div>
          <div className="stat-label">Checks</div>
        </div>
      </div>

      <div className="chart-section">
        <h2>Price Trends</h2>
        {trendData && trendData.length > 0 ? (
          <PriceChart data={trendData} />
        ) : (
          <p className="no-data">No trend data available yet.</p>
        )}
      </div>

      <div className="routes-section">
        <h2>Select Route</h2>
        <div className="routes-grid">
          {routes.map(route => (
            <button
              key={route.code}
              className={`route-button ${selectedRoute === route.code ? 'active' : ''}`}
              onClick={() => setSelectedRoute(route.code)}
            >
              {route.label}
            </button>
          ))}
        </div>
      </div>

      <div className="controls-wrapper">
        <div className="sort-controls">
          <label>Sort by:</label>
          <button
            className={`sort-button ${sortBy === 'price' ? 'active' : ''}`}
            onClick={() => setSortBy('price')}
          >
            ↕ Price
          </button>
          <button
            className={`sort-button ${sortBy === 'duration' ? 'active' : ''}`}
            onClick={() => setSortBy('duration')}
          >
            ↕ Duration
          </button>
          <button
            className={`sort-button ${sortBy === 'departure' ? 'active' : ''}`}
            onClick={() => setSortBy('departure')}
          >
            ↕ Departure
          </button>
        </div>

        <div className="filter-controls">
          <label>
            <input
              type="checkbox"
              checked={filterDirect}
              onChange={e => setFilterDirect(e.target.checked)}
              className="filter-checkbox"
            />
            Direct only
          </label>

          <label className="price-filter">
            Max price per person (€):
            <input
              type="number"
              min="100"
              max="5000"
              step="50"
              value={maxPrice}
              onChange={e => setMaxPrice(Math.max(100, parseInt(e.target.value) || 2000))}
              className="price-input"
            />
            <span className="price-display">€{maxPrice}</span>
          </label>

          <label className="duration-filter">
            Max duration (hours):
            <input
              type="number"
              min="1"
              max="48"
              step="1"
              value={maxDuration}
              onChange={e => setMaxDuration(Math.max(1, parseInt(e.target.value) || 30))}
              className="duration-input"
            />
            <span className="duration-display">{maxDuration}h</span>
          </label>

          {hasActiveFilters && (
            <button className="clear-filters" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="table-section">
        <h2>
          Available Flights
          {filteredFlights && filteredFlights.length > 0 && ` (${filteredFlights.length})`}
        </h2>
        {loading ? (
          <p className="loading">Loading...</p>
        ) : filteredFlights && filteredFlights.length > 0 ? (
          <PriceTable flights={filteredFlights} />
        ) : flights && flights.length > 0 ? (
          <p className="no-results">
            No flights match your filters. Try adjusting price or duration limits.
          </p>
        ) : (
          <p className="no-data">
            No flight data available yet. Price checker runs 4 times daily at 6 AM, 12 PM, 6 PM, 10 PM UTC.
          </p>
        )}
      </div>

      <footer className="footer">
        <p>
          💡 Prices shown are base fares. Seat selection fees (€20–60) not included.
          <br />
          🔐 Your dashboard is public; API keys stay encrypted in GitHub Secrets.
        </p>
      </footer>
    </div>
  );
}
