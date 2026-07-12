# ✈️ Flight Price Tracker

Auto-track flight prices from **Frankfurt/Munich → Ho Chi Minh City → Da Nang, Vietnam** using the Ignav API. Monitors prices 4 times daily, stores results in Supabase, displays trends in a web dashboard. **Completely free** (stays within Ignav's 1,000-request free tier).

## Features

✅ **Automatic Price Checks** (GitHub Actions)
- 4–5 checks per day (6 AM, 12 PM, 6 PM, 10 PM UTC)
- Queries 3 routes simultaneously
- Auto-stops at 980 requests (100% free)

✅ **Price Trends** (Chart.js)
- 30-day history visualization
- Min/avg/max pricing per route
- Line chart with interactive legend

✅ **Sortable Results**
- Sort by price, duration, departure time
- Deduplicates same flights (same price + times)
- Shows airline, stops, layover details

✅ **Request Budget Tracking**
- Live counter: `847/1000 used`
- Stops automatically at safety margin
- Warnings when approaching limit

✅ **Security**
- API key in GitHub secrets (never exposed)
- Database row-level security (public read-only)
- HTTPS + encrypted credentials

✅ **Zero Cost**
- Ignav: €0 (within free 1,000 requests)
- Supabase: €0 (free tier)
- GitHub: €0 (free Actions + Pages)
- **Total: €0/month**

## Quick Start

### 1. Supabase (Database)
```bash
# At supabase.com:
# - Create project
# - SQL Editor → Paste supabase-schema.sql → Run
# - Copy Project URL and service_role key
```

### 2. GitHub Secrets
```bash
# Repo → Settings → Secrets → Add:
IGNAV_API_KEY=xxx
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-service-role-key
```

### 3. Deploy
```bash
git push origin main
# GitHub Actions starts automatically on schedule
# Frontend deployed to Pages
```

### 4. View Results
- **Dashboard**: `https://username.github.io/flight-tracker/`
- **Logs**: GitHub Actions tab

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full setup.

## Routes & Dates

| From | To | Outbound | Return |
|------|----|---------:|--------|
| FRA (Frankfurt) | SGN (Ho Chi Minh City) | Dec 19–20, 2026 | Jan 6–8, 2027 |
| MUC (Munich) | SGN (Ho Chi Minh City) | Dec 19–20, 2026 | Jan 6–8, 2027 |
| SGN (Ho Chi Minh City) | DAD (Da Nang) | Dec 20–21, 2026 | Jan 6–8, 2027 |

**Constraints**:
- Max €1,450/person
- Max 26h flight duration
- Max 2
- Excludes Middle East hubs

## File Structure

```
flight-tracker/
├── .github/workflows/
│   ├── price-checker.yml          # Schedule price checks (4x/day)
│   └── deploy-frontend.yml        # Deploy to GitHub Pages
├── backend/
│   ├── price-checker.js           # Ignav API + Supabase writes
│   ├── package.json
│   └── logs/                      # Daily check logs
├── frontend/
│   ├── src/
│   │   ├── App.jsx                # Main dashboard
│   │   ├── App.css                # Styling
│   │   └── components/
│   │       ├── PriceChart.jsx     # Chart.js trends
│   │       ├── PriceTable.jsx     # Sortable flights
│   │       └── RequestCounter.jsx # Budget tracker
│   ├── package.json
│   └── .env.example
├── supabase-schema.sql            # Database setup
├── DEPLOYMENT.md                  # Detailed guide
└── README.md                      # This file
```

## Database Schema

### Tables
- `price_history` — Flight results (500MB free in Supabase)
- `request_count` — Tracks API usage (stops at 980)

### Views
- `latest_prices` — Most recent unique fares
- `price_trends` — Daily min/avg/max (30 days)

## Security

| Component | Method |
|-----------|--------|
| **API Key** | GitHub Actions secrets (not in code) |
| **Database** | Supabase RLS (public read-only) |
| **HTTPS** | GitHub Pages + Supabase encryption |
| **Budget** | Auto-stops at 980 requests |

**GDPR**: No PII stored (only flight + price data). EU Supabase server available.

## Local Development

```bash
# Backend
cd backend && npm ci
IGNAV_API_KEY=xxx SUPABASE_URL=xxx SUPABASE_KEY=xxx node price-checker.js

# Frontend
cd frontend && npm ci
cp .env.example .env.local  # Fill in credentials
npm run dev  # http://localhost:5173
npm run build  # Production build
```

## Cost Breakdown

| Service | Plan | Cost |
|---------|------|------|
| Ignav API | Free 1,000 reqs | €0 |
| Supabase | Free tier (500MB) | €0 |
| GitHub Actions | Free 2,000 min/mo | €0 |
| GitHub Pages | Free | €0 |
| **Total** | | **€0/month** |

## Seat Selection Fee

**Note**: Displayed prices do NOT include seat selection.
- Most airlines: **Free auto-assigned seating**
- Premium seats: €20–60 per flight
- Prices shown are base fares only

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No data in dashboard | Check Supabase tables exist; run schema.sql |
| GitHub Actions failing | Verify secrets set; check logs in Actions tab |
| Frontend not loading | Confirm `.env` has SUPABASE_URL + ANON_KEY |
| Request counter stuck | Wait ~30s for Supabase sync; refresh page |

## What Happens After 980 Requests?

1. Backend detects limit before next check
2. Scheduler stops automatically
3. Frontend shows final prices (read-only)
4. Data remains accessible indefinitely

## Privacy Policy (Add to Footer)

> This tracker stores flight prices and itineraries from Ignav API. No personal data is collected. Usage is tracked only to enforce Ignav's free tier limits. For questions, contact [your-email].

## License

MIT

## Support

- **API Docs**: [ignav.com/docs](https://ignav.com/docs)
- **Database**: [supabase.com/docs](https://supabase.com/docs)
- **CI/CD**: [github.com/features/actions](https://github.com/features/actions)
