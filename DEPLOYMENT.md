# Flight Tracker - Deployment Guide

## 1. Supabase Setup (Database)

### Create Project
1. Go to [supabase.com](https://supabase.com) → Sign up (free)
2. Create new project → Choose region (EU recommended for GDPR)
3. Wait for provisioning (~2 min)
4. Go to **Project Settings** → **API** → Copy:
   - `Project URL` (SUPABASE_URL)
   - `anon public` key (SUPABASE_ANON_KEY for frontend)
   - `service_role` secret (for backend, in GitHub Actions secrets)

### Create Database Tables
1. In Supabase console → **SQL Editor** → New Query
2. Copy entire content from `supabase-schema.sql` and paste
3. Click **Run** → Tables created ✓

### Enable RLS (Row-Level Security)
- Already included in schema.sql
- Ensures public can only read (no unauthorized writes)

---

## 2. GitHub Repository Setup

### Create Repo
```bash
git init flight-tracker
cd flight-tracker
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/flight-tracker.git
git branch -M main
git push -u origin main
```

### Repository Settings
1. **Settings** → **Secrets and variables** → **Actions**

Add these secrets:
- `IGNAV_API_KEY` → Your Ignav API key
- `SUPABASE_URL` → From Supabase (with https://)
- `SUPABASE_KEY` → Use `service_role` secret key (NOT the anon key)

### Visibility (Public vs Private)
- **Public repo**: Anyone can see code; API key stays in GitHub secrets (hidden)
- **Private repo**: Only you + collaborators; GitHub Pro ($4/mo) for private Pages

**Recommendation**: Keep repo **private** (GitHub allows free private repos now).

---

## 3. Backend Setup (GitHub Actions)

### Environment Variables in Workflow
Edit `.github/workflows/price-checker.yml`:

```yaml
env:
  ROUTES: 'FRA:SGN,MUC:SGN,SGN:DAD'
  OUTBOUND_DATE: '2026-12-20'
  RETURN_DATE: '2027-01-06,2027-01-07,2027-01-08'
  MAX_PRICE: 6000
  MAX_DURATION: 26
  SAFETY_MARGIN: 980
```

### Trigger Manual Check
1. Go to **Actions** tab
2. Select **Flight Price Checker**
3. Click **Run workflow** → Starts immediately

### Auto-Schedule
- **6 AM UTC** (morning)
- **12 PM UTC** (midday)
- **6 PM UTC** (evening)
- **10 PM UTC** (night)

To change times, edit `.github/workflows/price-checker.yml` cron values.

### Monitor Runs
- **Actions** tab → Click run → See logs
- If failed, check Ignav API key + Supabase credentials

---

## 4. Frontend Setup (GitHub Pages)

### Deploy to GitHub Pages
1. Create `frontend/vite.config.js`:
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/flight-tracker/',  // Match repo name
  build: { outDir: 'dist' }
});
```

2. Create `.github/workflows/deploy-frontend.yml`:
```yaml
name: Deploy Frontend

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Build
        run: |
          cd frontend
          npm ci
          npm run build
      
      - name: Deploy to Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./frontend/dist
          cname: yourdomain.com  # Optional: custom domain
```

3. **Settings** → **Pages** → Source: **Deploy from branch** → `gh-pages` branch

### Live URL
- **Public**: `https://YOUR_USERNAME.github.io/flight-tracker/`
- **Private**: Same URL (GitHub Pro) or password-protected

---

## 5. Environment Files

### Backend (.env for local testing)
```
IGNAV_API_KEY=your-key
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-service-role-key
```

### Frontend (frontend/.env)
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Never commit .env files** — add to `.gitignore`:
```
.env
.env.local
```

---

## 6. Security Checklist

✅ **API Key Protection**
- Stored only in GitHub Actions secrets
- Never in code or version control
- Used server-side only (backend job)

✅ **Database Security**
- Supabase RLS enabled (public read-only)
- Write access restricted to service role
- Data retention: Optional cleanup (script in schema.sql)

✅ **Request Budget**
- Automatic stop at 980 requests
- Backend checks count before each run
- Prevents accidental overage charges

✅ **HTTPS/TLS**
- GitHub Pages: auto HTTPS
- Supabase: always encrypted
- GitHub Actions: secure secrets

✅ **GDPR Compliance**
- No PII stored (only flight data + prices)
- Supabase EU server option
- Data can be exported/deleted anytime
- Privacy policy: Add to footer

---

## 7. Custom Domain (Optional)

### Point Domain to GitHub Pages
1. Add DNS record (choose one):
   - **CNAME**: `CNAME flight-tracker.example.com username.github.io`
   - **A records**:
     ```
     185.199.108.153
     185.199.109.153
     185.199.110.153
     185.199.111.153
     ```

2. In repo **Settings** → **Pages** → Custom domain: `flight-tracker.example.com`

3. GitHub auto-provisions HTTPS cert (let's encrypt, ~24h)

---

## 8. Local Development

### Run Backend (Test)
```bash
cd backend
npm ci
IGNAV_API_KEY=xxx SUPABASE_URL=xxx SUPABASE_KEY=xxx node price-checker.js
```

### Run Frontend
```bash
cd frontend
npm ci
cp .env.example .env.local  # Fill in your keys
npm run dev  # http://localhost:5173
```

### Build & Preview
```bash
cd frontend
npm run build
npm run preview
```

---

## 9. Troubleshooting

### GitHub Actions Failing
- Check **Actions** → Run logs
- Verify secrets are set (Settings → Secrets)
- Test manually: `npm ci && node backend/price-checker.js`

### No Data Showing
- Confirm Supabase tables created (SQL Editor)
- Check frontend `.env` has correct URL + key
- Supabase → **Realtime** → Check `price_history` enabled
- Browser console (F12) for errors

### Request Counter Not Increasing
- May take ~30s for Supabase replication
- Run test query: `SELECT COUNT(*) FROM price_history;`

### Seat Selection Fee Info
- Ignav API doesn't return seat fees
- Most airlines auto-assign free; premium seats €20–60
- Added note in frontend footer

---

## 10. What Happens After 980 Requests?

1. Backend detects limit before next check
2. Logs: "Request limit reached. Stopping tracker."
3. GitHub Actions stops scheduling further checks
4. Frontend displays: "Tracking complete. 980/1000 used."
5. Historical data still visible (read-only)
6. Manually check `/api/latest` for final prices

---

## 11. Cost Summary

| Service | Tier | Cost/Month | Notes |
|---------|------|-----------|-------|
| Ignav API | Free 1000 reqs + pay-as-you-go | €0 (within 1000) | Stops at 980 |
| Supabase | Free tier | €0 | 500MB + 2 connections |
| GitHub | Free | €0 | 2000 min/month Actions |
| GitHub Pages | Free | €0 | Public or private (Pro) |
| Domain | Custom | €5–15/yr | Optional |
| **Total** | | **€0–15/yr** | All-in with free services |

---

## 12. Next Steps

1. ✅ Create Supabase project
2. ✅ Run schema.sql in SQL Editor
3. ✅ Create GitHub repo
4. ✅ Add secrets (IGNAV_API_KEY, SUPABASE_URL, SUPABASE_KEY)
5. ✅ Push code: `git push origin main`
6. ✅ Trigger first run: Actions → Run workflow
7. ✅ Monitor logs → Check if prices appear in Supabase
8. ✅ Deploy frontend → Actions should auto-deploy to Pages
9. ✅ Visit `yourusername.github.io/flight-tracker/`
10. ✅ Wait for scheduled checks (next cron window)

---

## Support

- **Ignav Issues**: [ignav.com/docs](https://ignav.com/docs)
- **Supabase Help**: [supabase.com/docs](https://supabase.com/docs)
- **GitHub Actions**: [github.com/features/actions](https://github.com/features/actions)
