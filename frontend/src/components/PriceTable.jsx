import React, { useState } from 'react';

function formatTime(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('de-AT');
}

function durationHours(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export default function PriceTable({ flights }) {
  const [expandedIdx, setExpandedIdx] = useState(null);

  return (
    <div className="table-wrapper">
      <table className="price-table">
        <thead>
          <tr>
            <th>Price</th>
            <th>Depart</th>
            <th>Arrive</th>
            <th>Duration</th>
            <th>Via</th>
            <th>Return</th>
            <th>Airlines</th>
          </tr>
        </thead>
        <tbody>
          {flights.map((flight, idx) => {
            const airlines = flight.airlines
              ? [...new Set(JSON.parse(flight.airlines))]
              : [];
            const isDirect = flight.outbound_stops === 0;
            const isExpanded = expandedIdx === idx;

            return (
              <React.Fragment key={idx}>
                <tr
                  className={`flight-row ${idx === 0 ? 'best-price' : ''}`}
                  onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                >
                  <td className="price">
                    <span className={`expand-arrow ${isExpanded ? 'open' : ''}`}>▸</span>
                    {idx === 0 && <span className="best-badge">Best price</span>}
                    <strong>€{flight.price}</strong>
                    <span className="price-scope" title="Total price for 2 adults + 2 children">total</span>
                  </td>
                  <td className="time">
                    <span className="date">{formatDate(flight.outbound_departure)}</span>
                    <span className="hour">{formatTime(flight.outbound_departure)}</span>
                  </td>
                  <td className="time">
                    <span className="date">{formatDate(flight.outbound_arrival)}</span>
                    <span className="hour">{formatTime(flight.outbound_arrival)}</span>
                  </td>
                  <td className="duration">
                    {durationHours(flight.duration_outbound)}
                  </td>
                  <td className="stops">
                    {isDirect ? (
                      <span className="stop-badge direct">Direct</span>
                    ) : (
                      <span className="stop-badge" title={flight.outbound_hubs || ''}>
                        {flight.outbound_stops} stop{flight.outbound_stops !== 1 ? 's' : ''}
                      </span>
                    )}
                  </td>
                  <td className="return">
                    {flight.inbound_departure ? (
                      <>
                        <span className="date">{formatDate(flight.inbound_departure)}</span>
                        <span className="hour">{formatTime(flight.inbound_departure)}</span>
                      </>
                    ) : '—'}
                  </td>
                  <td className="airlines">
                    {airlines.length > 0 ? airlines.join(', ') : '—'}
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="detail-row">
                    <td colSpan={7}>
                      <div className="flight-detail">
                        <div className="detail-col">
                          <h4>Outbound</h4>
                          <p>
                            {flight.origin}
                            {flight.outbound_hubs ? ` → ${flight.outbound_hubs} → ` : ' → '}
                            {flight.destination}
                          </p>
                          <p>
                            {durationHours(flight.duration_outbound)} ·{' '}
                            {isDirect ? 'Direct' : `${flight.outbound_stops} stop${flight.outbound_stops !== 1 ? 's' : ''}`}
                          </p>
                        </div>
                        <div className="detail-col">
                          <h4>Return</h4>
                          {flight.inbound_departure ? (
                            <>
                              <p>{flight.destination} → {flight.origin}</p>
                              <p>
                                {flight.duration_inbound ? durationHours(flight.duration_inbound) : '—'} ·{' '}
                                {flight.inbound_stops === 0
                                  ? 'Direct'
                                  : `${flight.inbound_stops} stop${flight.inbound_stops !== 1 ? 's' : ''}`}
                              </p>
                            </>
                          ) : (
                            <p>—</p>
                          )}
                        </div>
                        <div className="detail-col">
                          <h4>Price check</h4>
                          <p>
                            €{flight.price} total
                            {flight.currency && flight.currency !== 'EUR' ? ` (${flight.currency})` : ''}
                          </p>
                          <p>
                            Checked {formatDate(flight.checked_at)} {formatTime(flight.checked_at)}
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
