# Show Last Ignav Request Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the timestamp of the most recent actual Ignav API request on the deployed frontend, so a manually-triggered GitHub Actions run can be visually confirmed to have made a real request.

**Architecture:** The backend already increments an in-memory `requestCount` for every Ignav request it attempts (regardless of HTTP status or filter matches). Reuse that existing signal to stamp the already-present-but-unused `request_count.last_updated` column, then thread that value through the frontend's existing 30s poll into a new line of text in `RequestCounter`.

**Tech Stack:** Node.js (backend script, ES modules), React + Vite (frontend), Supabase (Postgres + JS client). No test framework exists in this repo.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-last-ignav-request-time-design.md`
- No new database column or migration — reuse the existing `request_count.last_updated timestamptz default now()` column defined in `supabase-schema.sql`.
- `last_updated` must only change on a run that actually attempted at least one Ignav HTTP request. A run that exits early on `SAFETY_MARGIN` must leave it untouched.
- This repo has no test framework (no jest/vitest, no test files anywhere) and Node.js is not installed on the primary dev machine used for planning. Verification steps below are manual (syntax checks where possible, code review, and live end-to-end checks against the deployed GitHub Actions workflow + Supabase). Do not introduce a test framework as part of this change — out of scope per YAGNI.
- Follow existing code style: no comments explaining "what", ES module imports, `log()` helper for backend output.

---

### Task 1: Backend — persist `last_updated` on real Ignav requests

**Files:**
- Modify: `backend/price-checker.js:59-68` (function `incrementRequestCount`)
- Modify: `backend/price-checker.js:121-218` (function `checkPrices`)

**Interfaces:**
- Produces: `incrementRequestCount(amount, didAttemptRequest)` — new second parameter. When `didAttemptRequest` is `true`, the Supabase update also sets `last_updated` to the current ISO timestamp; when `false`, `last_updated` is omitted from the update entirely (column untouched).
- Consumes: nothing new from other tasks (this task is self-contained; Task 2 consumes the DB column this task starts writing to).

- [ ] **Step 1: Modify `incrementRequestCount` to accept and act on a `didAttemptRequest` flag**

Replace the current function body (lines 59-68):

```javascript
async function incrementRequestCount(amount) {
  const { error } = await supabase
    .from('request_count')
    .update({ count: requestCount + amount })
    .eq('id', 1);
  
  if (error && !error.message.includes('no rows')) {
    log(`Warning: Could not update request count: ${error.message}`);
  }
}
```

with:

```javascript
async function incrementRequestCount(amount, didAttemptRequest) {
  const updates = { count: requestCount + amount };
  if (didAttemptRequest) {
    updates.last_updated = new Date().toISOString();
  }

  const { error } = await supabase
    .from('request_count')
    .update(updates)
    .eq('id', 1);

  if (error && !error.message.includes('no rows')) {
    log(`Warning: Could not update request count: ${error.message}`);
  }
}
```

- [ ] **Step 2: Track whether any request was attempted this run, inside `checkPrices()`**

Find this block (around line 133):

```javascript
  let successCount = 0;
  let checkTime = new Date().toISOString();
```

Replace with:

```javascript
  let successCount = 0;
  let didAttemptRequest = false;
  let checkTime = new Date().toISOString();
```

- [ ] **Step 3: Set the flag right after a request round-trip completes**

Find this block (around line 154-155, inside the `for (const route of routes)` loop's `try`):

```javascript
      );

      requestCount++;
```

Replace with:

```javascript
      );

      requestCount++;
      didAttemptRequest = true;
```

- [ ] **Step 4: Pass the flag into `incrementRequestCount`**

Find this line (around line 213):

```javascript
  await incrementRequestCount(successCount);
```

Replace with:

```javascript
  await incrementRequestCount(successCount, didAttemptRequest);
```

- [ ] **Step 5: Syntax-check the file**

Run: `node --check backend/price-checker.js`
Expected: no output, exit code 0. (This only validates JS syntax — it does not require network access or API keys.)

If `node` is not available in your current environment, open the file and re-read the four edited regions instead to confirm they're syntactically valid (balanced braces, correct commas) before moving on.

- [ ] **Step 6: Manually trace both code paths**

Confirm by reading the function:
- Early-exit path (`requestCount >= SAFETY_MARGIN` at the very top of `checkPrices`, line ~128): `process.exit(0)` runs before `incrementRequestCount` is ever called, so `last_updated` is untouched. Correct.
- Normal path with zero routes attempted (e.g. per-route margin check breaks the loop on iteration 1, line ~139-142): `didAttemptRequest` stays `false`, so `incrementRequestCount` runs but omits `last_updated` from the update payload. Correct.
- Normal path with at least one route attempted: `didAttemptRequest` is `true`, `last_updated` is set to `now()` alongside `count`. Correct.

- [ ] **Step 7: Commit**

```bash
git add backend/price-checker.js
git commit -m "$(cat <<'EOF'
Track last actual Ignav request time in request_count

Reuses the existing but previously-unwritten last_updated column so a
manual GitHub Actions run can be confirmed to have hit the Ignav API,
even if no itineraries matched the price/duration filters.
EOF
)"
```

---

### Task 2: Frontend — surface last Ignav request time in the UI

**Files:**
- Modify: `frontend/src/App.jsx:20` (state), `frontend/src/App.jsx:91-99` (fetch), `frontend/src/App.jsx:143` (render — line number may have shifted from earlier edits, search for `<RequestCounter`)
- Modify: `frontend/src/components/RequestCounter.jsx` (full file)
- Modify: `frontend/src/App.css:304-331` (Request Counter section)

**Interfaces:**
- Consumes: `request_count.last_updated` column written by Task 1 (an ISO 8601 timestamp string or `null`).
- Produces: `RequestCounter` accepts a new `lastUpdated` prop (string ISO timestamp or `null`) and renders a relative-time line. No other component depends on this.

- [ ] **Step 1: Add state for the last request time in `App.jsx`**

Find (line 20):

```javascript
  const [requestCount, setRequestCount] = useState(0);
```

Replace with:

```javascript
  const [requestCount, setRequestCount] = useState(0);
  const [lastRequestTime, setLastRequestTime] = useState(null);
```

- [ ] **Step 2: Fetch `last_updated` alongside `count`**

Find (lines 91-99):

```javascript
      // Fetch request count
      const { data: countData, error: countError } = await supabase
        .from('request_count')
        .select('count')
        .single();

      if (!countError && countData) {
        setRequestCount(countData.count);
      }
```

Replace with:

```javascript
      // Fetch request count
      const { data: countData, error: countError } = await supabase
        .from('request_count')
        .select('count, last_updated')
        .single();

      if (!countError && countData) {
        setRequestCount(countData.count);
        setLastRequestTime(countData.last_updated);
      }
```

- [ ] **Step 3: Pass the new prop to `RequestCounter`**

Find:

```jsx
      <RequestCounter count={requestCount} limit={980} />
```

Replace with:

```jsx
      <RequestCounter count={requestCount} limit={980} lastUpdated={lastRequestTime} />
```

- [ ] **Step 4: Add a relative-time formatter and render it in `RequestCounter.jsx`**

Replace the entire contents of `frontend/src/components/RequestCounter.jsx` with:

```jsx
import React from 'react';

function formatRelativeTime(isoString) {
  if (!isoString) return 'never';

  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;

  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
}

export default function RequestCounter({ count, limit, lastUpdated }) {
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

      <div className="last-checked">
        Last Ignav request: {formatRelativeTime(lastUpdated)}
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
```

- [ ] **Step 5: Add styling for the new line in `App.css`**

Find (around line 316, end of `.request-counter` rule):

```css
.request-counter {
  background: white;
  padding: 12px 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  text-align: center;
  font-size: 12px;
  color: #666;
}
```

Add immediately after it (before `.request-counter strong`):

```css
.request-counter .last-checked {
  margin-top: 6px;
  font-size: 11px;
  color: #999;
}
```

- [ ] **Step 6: Build the frontend to catch syntax/type errors**

Run (from `frontend/`): `npm install && npm run build`
Expected: build completes with no errors, `dist/` is produced.

If Node.js is not available in your current environment, this step must be run by whoever has Node available (see conversation history — this was already a blocker for a prior fix in this repo) before merging.

- [ ] **Step 7: Manually verify in the dev server**

Run (from `frontend/`): `npm run dev`, open the printed local URL in a browser.
Expected: the "Last Ignav request" line appears under the request counter's progress bar. Since local Supabase data may have `last_updated` still `null` (column exists but was never written before Task 1 shipped), it's acceptable to see "Last Ignav request: never" at this point — full verification of a real timestamp happens in Task 3 against the live deployment.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/RequestCounter.jsx frontend/src/App.css
git commit -m "$(cat <<'EOF'
Show last Ignav request time next to the request counter

Threads the request_count.last_updated column (now written by
price-checker.js) through to a new relative-time line in
RequestCounter, so a manual GitHub Actions run can be visually
confirmed on the deployed site.
EOF
)"
```

---

### Task 3: End-to-end verification against the live deployment

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Deploy both changes**

Push the commits from Task 1 and Task 2 (or merge the branch) so `deploy-frontend.yml` redeploys the frontend and `price-checker.yml` picks up the updated backend script on its next run.

- [ ] **Step 2: Note the current `last_updated` value**

In the Supabase dashboard → Table Editor → `request_count` → row `id = 1`, note the current `last_updated` value (likely `null` or an old timestamp from row creation).

- [ ] **Step 3: Manually trigger a check**

GitHub repo → Actions tab → "Flight Price Checker" workflow → "Run workflow" → confirm.

- [ ] **Step 4: Wait for the run to finish, then confirm the database updated**

Actions tab → click the run → confirm it completed successfully. Then refresh the Supabase Table Editor view of `request_count`.
Expected: `last_updated` is now a fresh timestamp (within the last minute or two of the workflow completing) and `count` increased by the number of successful route checks in the log.

- [ ] **Step 5: Confirm the frontend reflects it**

Open the deployed site. Since it polls every 30s, wait up to 30s after load.
Expected: the "Last Ignav request" line under the request counter shows "just now" or "X minute(s) ago" matching the workflow run time.

- [ ] **Step 6: Confirm the early-exit path leaves the timestamp untouched (optional, only if quota is nearly exhausted)**

If `count` is currently at or above `SAFETY_MARGIN` (980 by default), trigger the workflow again and confirm in the Actions log it logs `⚠️  Request limit reached` and exits immediately, and that `last_updated` in Supabase does **not** change. This path is unlikely to be reachable in normal testing conditions — skip if quota isn't near the limit.

- [ ] **Step 7: No commit needed — this task is verification-only.**
