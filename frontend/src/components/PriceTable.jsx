import React from 'react';

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
            const airlines = flight.airlines ? JSON.parse(flight.airlines) : [];
            const totalDays = flight.inbound_arrival 
              ? Math.ceil(
                  (new Date(flight.inbound_arrival) - new Date(flight.outbound_departure)) / 86400000
                )
              : '—';
            
            return (
              <tr key={idx} className={idx === 0 ? 'best-price' : ''}>
                <td className="price">
                  <strong>€{flight.price}</strong>
                  <span className="per-person">/p</span>
                </td>
                <td className="time">
                  {formatDate(flight.outbound_departure)}
                  <br />
                  {formatTime(flight.outbound_departure)}
                </td>
                <td className="time">
                  {formatDate(flight.outbound_arrival)}
                  <br />
                  {formatTime(flight.outbound_arrival)}
                </td>
                <td className="duration">
                  {durationHours(flight.duration_outbound)}
                </td>
                <td className="stops">
                  {flight.outbound_stops === 0 
                    ? '✈️ Direct' 
                    : flight.outbound_hubs || `${flight.outbound_stops} stop${flight.outbound_stops !== 1 ? 's' : ''}`
                  }
                </td>
                <td className="return">
                  {flight.inbound_departure ? (
                    <>
                      {formatDate(flight.inbound_departure)}
                      <br />
                      {formatTime(flight.inbound_departure)}
                    </>
                  ) : '—'}
                </td>
                <td className="airlines">
                  {airlines.length > 0 ? airlines.join(', ') : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
