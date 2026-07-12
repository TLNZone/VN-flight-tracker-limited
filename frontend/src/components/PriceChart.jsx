import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

const ROUTE_COLORS = ['#2a78d6', '#1baf7a', '#e34948', '#f0a500', '#8e44ad', '#16a085'];

function formatCheckLabel(isoString) {
  const d = new Date(isoString);
  const date = d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

export default function PriceChart({ trends }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!chartRef.current || trends.length === 0) return;

    // Every row from the same check run shares the exact same checked_at,
    // so that timestamp is the natural shared x-axis across all routes.
    const timestamps = [...new Set(trends.map(t => t.checked_at))]
      .sort((a, b) => new Date(a) - new Date(b))
      .slice(-30); // Last 30 checks

    if (timestamps.length === 0) return;

    const labels = timestamps.map(formatCheckLabel);
    const routeKeys = [...new Set(trends.map(t => `${t.origin}:${t.destination}`))];

    const datasets = routeKeys.map((routeKey, i) => {
      const [origin, destination] = routeKey.split(':');
      const priceByTimestamp = new Map(
        trends
          .filter(t => t.origin === origin && t.destination === destination)
          .map(t => [t.checked_at, t.min_price])
      );
      const color = ROUTE_COLORS[i % ROUTE_COLORS.length];

      return {
        label: routeKey,
        data: timestamps.map(ts => priceByTimestamp.get(ts) ?? null),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        fill: false,
        tension: 0.4,
        spanGaps: true,
        pointRadius: 3,
        pointBackgroundColor: color,
        pointBorderColor: '#fff',
        pointBorderWidth: 1
      };
    });

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    chartInstance.current = new Chart(chartRef.current, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            labels: { usePointStyle: true, font: { size: 12 } }
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: { callback: v => '€' + v }
          }
        }
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [trends]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '300px' }}>
      <canvas
        ref={chartRef}
        role="img"
        aria-label="Flight price trends by request time, all routes"
      >
        Price chart data
      </canvas>
    </div>
  );
}
