# Flight Tracker - Quick Start

## 1. Supabase Setup (5 min)

1. Go to **supabase.com** → Sign up → Create project (EU region)
2. Wait for provisioning
3. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon key** → `SUPABASE_ANON_KEY`
   - **service_role secret** → Use for GitHub Actions

4. **SQL Editor** → New Query → Paste `supabase-schema.sql` → **Run**

## 2. GitHub Secrets (2 min)

**Repo → Settings → Secrets and variables → Actions**

Add three secrets:
```
IGNAV_API_KEY = your-ignav-key
SUPABASE_URL = https://xxx.supabase.co
SUPABASE_KEY = your-service-role-secret (NOT anon key)
```

## 3. Deploy Code (1 min)

```bash
git init flight-tracker && cd flight-tracker
# Copy all files from /home/claude/flight-tracker
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/flight-tracker.git
git branch -M main
git push -u origin main
```

## 4. GitHub Actions (Auto)

- **price-checker.yml** starts automatically on schedule (6 AM, 12 PM, 6 PM, 10 PM UTC)
- **deploy-frontend.yml** deploys to GitHub Pages on every push

## 5. Access Dashboard

After first push:
1. **Settings → Pages** → Confirm `gh-pages` branch selected
2. Visit: `https://YOUR_USERNAME.github.io/flight-tracker/`

## 6. Monitor Runs

- **Actions** tab → See all runs
- **price-checker** logs show API calls + data saved
- **deploy-frontend** shows build output

---

## File Layout

```
.github/workflows/
├── price-checker.yml          ← Runs 4×/day, queries Ignav
└── deploy-frontend.yml        ← Deploys to GitHub Pages

backend/
├── price-checker.js           ← Queries Ignav, writes to Supabase
└── package.json

frontend/
├── src/App.jsx                ← Main dashboard
├── src/components/            ← PriceChart, PriceTable, RequestCounter
├── package.json
├── vite.config.js
└── .env.example               ← Copy to .env.local (dev only)

supabase-schema.sql            ← Run in Supabase SQL Editor
DEPLOYMENT.md                  ← Full setup guide
```

---

## Environment Files

**frontend/.env** (for local dev):
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**GitHub Secrets** (for Actions + Pages):
```
IGNAV_API_KEY=xxx
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=service-role-secret
SUPABASE_ANON_KEY=anon-key (auto-used by deploy workflow)
```

---

## Testing Locally

```bash
# Backend
cd backend && npm ci
IGNAV_API_KEY=xxx SUPABASE_URL=xxx SUPABASE_KEY=xxx node price-checker.js

# Frontend
cd frontend && npm ci && npm run dev
# Visit http://localhost:5173
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No data in dashboard | Run schema.sql in Supabase; wait 30s for sync |
| Actions failing | Check GitHub secrets set; view logs in Actions tab |
| 404 on GitHub Pages | Verify repo visibility; wait ~2 min after first push |
| Frontend shows nothing | Check browser console (F12); .env has correct keys? |
| Prices not updating | Run price-checker manually: Actions → workflow → Run |

---

## Cost Check

- Ignav: €0 (free 1,000 requests, stops at 980)
- Supabase: €0 (free tier)
- GitHub: €0 (free Actions + Pages)
- **Total: €0/month**

---

## What Next?

✅ Data flows: Ignav → GitHub Actions → Supabase → Frontend
✅ Auto-stops at 980 requests (no accidental charges)
✅ Public dashboard (anyone can view prices, not your credentials)
✅ Historical data accessible forever (read-only after tracking ends)

Visit dashboard in ~6 hours for first price check!
