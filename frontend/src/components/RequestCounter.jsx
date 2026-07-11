import React from 'react';

export default function RequestCounter({ count, limit }) {
  const used = count;
  const remaining = limit - count;
  const percent = Math.round((used / limit) * 100);
  const isWarning = remaining <= 50;
  const isCritical = remaining <= 10;

  return (
    <div className={`request-counter ${isCritical ? 'critical' : isWarning ? 'warning' : ''}`}>
      <div className="counter-text">
        <strong>{used}/{limit}</strong> requests used
        <span className="remaining">
          ({remaining} remaining)
        </span>
      </div>
      
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{
            width: `${percent}%`,
            backgroundColor: isCritical ? '#d03b3b' : isWarning ? '#fab219' : '#0ca30c'
          }}
        />
      </div>

      {isCritical && (
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#d03b3b', fontWeight: 500 }}>
          ⚠️ Critical: Only {remaining} requests left. Tracker will stop soon.
        </p>
      )}

      {isWarning && !isCritical && (
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#fab219', fontWeight: 500 }}>
          ⚠️ Warning: Only {remaining} requests remaining.
        </p>
      )}
    </div>
  );
}
