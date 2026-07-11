# Design: Show Last Ignav Request Time

Date: 2026-07-12

## Problem

The price checker (`backend/price-checker.js`) can already be triggered manually via the GitHub Actions "Run workflow" button (`workflow_dispatch` in `price-checker.yml`). After doing so, there's no way to confirm from the deployed frontend whether that run actually made a request to the Ignav API.

`price_history.checked_at` isn't a reliable signal for this: a row is only inserted when itineraries are found *and* pass the configured price/duration filters. A manual run that queries Ignav but finds nothing matching leaves no trace in `price_history`, even though quota was consumed.

## Goal

Surface the timestamp of the most recent actual Ignav API call on the frontend, next to the existing request counter, so a manual GitHub Actions run can be visually confirmed.

## Design

### 1. Database

Add a nullable column to the existing single-row `request_count` table:

```sql
alter table request_count add column last_checked_at timestamptz;
```

No new table needed — this table already exists solely to hold the running request count (`id = 1`) that the frontend reads today.

### 2. Backend (`backend/price-checker.js`)

In `checkPrices()`, track whether at least one Ignav request was actually attempted this run (i.e. `makeIgnavRequest` resolved, regardless of HTTP status or whether itineraries matched filters — this already corresponds to the existing per-route `requestCount++`).

- If the run exits early because `requestCount >= SAFETY_MARGIN` (no requests attempted), `last_checked_at` is left untouched — correctly reflecting that no Ignav call happened.
- If one or more requests were attempted, update `last_checked_at` to the current time in the same `request_count` update call that already persists the running `count` (in `incrementRequestCount`), avoiding an extra DB round trip.

### 3. Frontend

`App.jsx` already queries the `request_count` table for `count` in `fetchData()`. Extend that `select` to also fetch `last_checked_at`, and pass it into `RequestCounter` as a new prop.

`RequestCounter.jsx` renders a new line near the existing `{used}/{limit} requests used` text, e.g. "Last request: 3 minutes ago" (relative time, computed client-side from the ISO timestamp). If `last_checked_at` is `null` (fresh DB, never checked), show "Last request: never".

No access gating needed — this is read-only informational data, safe to show to any visitor.

## Out of scope

- No manual-trigger button (explicitly dropped from this feature).
- No change to the existing `count` accumulation logic in `incrementRequestCount`, even though it was observed to add `successCount` on top of an already-incremented `requestCount` (worth a separate look, not part of this change).

## Testing

- Manual: trigger `price-checker.yml` via GitHub Actions "Run workflow", confirm `last_checked_at` updates in Supabase and the frontend reflects it within the existing 30s poll interval.
- Manual: verify a run that hits `SAFETY_MARGIN` before any request leaves `last_checked_at` unchanged.
