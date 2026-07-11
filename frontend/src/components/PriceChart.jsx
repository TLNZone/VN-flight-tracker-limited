import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export default function PriceChart({ trends, routeKey }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!chartRef.current || trends.length === 0) return;

    const [origin, dest] = routeKey.split(':');
    const routeTrends = trends
      .filter(t => t.origin === origin && t.destination === dest)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-30); // Last 30 days

    if (routeTrends.length === 0) return;

    const labels = routeTrends.map(t => t.date);
    const minPrices = routeTrends.map(t => t.min_price);
    const maxPrices = routeTrends.map(t => t.max_price);
    const avgPrices = routeTrends.map(t => t.avg_price);

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    chartInstance.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Average price',
            data: avgPrices,
            borderColor: '#2a78d6',
            backgroundColor: 'rgba(42, 120, 214, 0.05)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: '#2a78d6',
            pointBorderColor: '#fff',
            pointBorderWidth: 2
          },
          {
            label: 'Low',
            data: minPrices,
            borderColor: '#1baf7a',
            borderWidth: 1,
            borderDash: [5, 5],
            fill: false,
            tension: 0.4,
            pointRadius: 2,
            pointBackgroundColor: '#1baf7a'
          },
          {
            label: 'High',
            data: maxPrices,
            borderColor: '#e34948',
            borderWidth: 1,
            borderDash: [5, 5],
            fill: false,
            tension: 0.4,
            pointRadius: 2,
            pointBackgroundColor: '#e34948'
          }
        ]
      },
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
  }, [trends, routeKey]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '300px' }}>
      <canvas
        ref={chartRef}
        role="img"
        aria-label="Flight price trends over 30 days"
      >
        Price chart data
      </canvas>
    </div>
  );
}
