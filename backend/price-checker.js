import ws from 'ws';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

global.WebSocket = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IGNAV_API_KEY = process.env.IGNAV_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SAFETY_MARGIN = parseInt(process.env.SAFETY_MARGIN || '980');
const MAX_PRICE = parseInt(process.env.MAX_PRICE || '6000');
const MAX_DURATION = parseInt(process.env.MAX_DURATION || '26');
const MAX_STOPS = parseInt(process.env.MAX_STOPS || '2');
const ADULTS = parseInt(process.env.ADULTS || '2');
const CHILDREN = parseInt(process.env.CHILDREN || '2');

// Parse routes with per-route departure dates
// (e.g., "FRA:SGN:2026-12-19|2026-12-20,MUC:SGN:2026-12-19|2026-12-20,SGN:DAD:2026-12-20|2026-12-21")
const routes = process.env.ROUTES.split(',').map(r => {
  const [origin, dest, datesStr] = r.split(':');
  if (!datesStr) {
    throw new Error(`Route "${r}" is missing departure dates (expected ORIGIN:DEST:date1|date2)`);
  }
  return {
    origin: origin.trim(),
    destination: dest.trim(),
    departureDates: datesStr.split('|').map(d => d.trim())
  };
});

const RETURN_DATES = process.env.RETURN_DATE.split(',').map(d => d.trim());
// Check the latest return date first — if that outbound leg has no availability at
// all, the earlier return dates won't either, so skip them and save the request.
const RETURN_DATES_CHECK_ORDER = [...RETURN_DATES].reverse();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let requestCount = 0;
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logFile = path.join(logsDir, `price-check-${new Date().toISOString().split('T')[0]}.log`);

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage + '\n');
}

async function getRequestCount() {
  const { data, error } = await supabase
    .from('request_count')
    .select('count')
    .single();
  
  if (error) {
    log(`Warning: Could not fetch request count: ${error.message}`);
    return 0;
  }
  return data?.count || 0;
}

async function incrementRequestCount(amount) {
  const { error } = await supabase
    .from('request_count')
    .update({ count: requestCount + amount })
    .eq('id', 1);
  
  if (error && !error.message.includes('no rows')) {
    log(`Warning: Could not update request count: ${error.message}`);
  }
}

function segmentDate(s) {
  return s.departure_time_local ? s.departure_time_local.split('T')[0] : null;
}

function flightKey(s) {
  return `${s.marketing_carrier_code}:${s.flight_number}:${segmentDate(s)}`;
}

async function upsertFlights(segments) {
  if (segments.length === 0) return new Map();

  const uniqueByKey = new Map();
  for (const s of segments) {
    const key = flightKey(s);
    if (!uniqueByKey.has(key)) {
      uniqueByKey.set(key, {
        marketing_carrier_code: s.marketing_carrier_code,
        flight_number: String(s.flight_number),
        operating_carrier_name: s.operating_carrier_name || null,
        departure_date: segmentDate(s)
      });
    }
  }

  const { data, error } = await supabase
    .from('flights')
    .upsert([...uniqueByKey.values()], { onConflict: 'marketing_carrier_code,flight_number,departure_date' })
    .select('id, marketing_carrier_code, flight_number, departure_date');

  if (error) {
    log(`  ⚠️  Flight upsert failed: ${error.message}`);
    return new Map();
  }

  return new Map(
    data.map(row => [`${row.marketing_carrier_code}:${row.flight_number}:${row.departure_date}`, row.id])
  );
}

async function linkFlights(priceHistoryId, outboundSegs, inboundSegs) {
  const flightIdByKey = await upsertFlights([...outboundSegs, ...inboundSegs]);

  const junctionRows = [];
  const addLeg = (segments, leg) => {
    segments.forEach((s, i) => {
      const flightId = flightIdByKey.get(flightKey(s));
      if (flightId) {
        junctionRows.push({ price_history_id: priceHistoryId, flight_id: flightId, leg, leg_position: i + 1 });
      }
    });
  };
  addLeg(outboundSegs, 'outbound');
  addLeg(inboundSegs, 'inbound');

  if (junctionRows.length === 0) return;

  const { error } = await supabase.from('price_history_flights').insert(junctionRows);
  if (error) {
    log(`  ⚠️  price_history_flights insert failed: ${error.message}`);
  }
}

function makeIgnavRequest(origin, destination, departureDate, returnDate) {
  return new Promise((resolve, reject) => {
    const payload = {
      origin,
      destination,
      departure_date: departureDate,
      return_date: returnDate,
      max_stops: MAX_STOPS,
      adults: ADULTS,
      children: CHILDREN,
      cabin_class: 'economy',
      market: 'DE'
    };
    log(`Ignav payload: ${JSON.stringify(payload)}`);
    const options = {
      hostname: 'ignav.com',
      path: '/api/fares/round-trip',
      method: 'POST',
      headers: {
        'X-Api-Key': IGNAV_API_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'FlightTracker/1.0'
      },
      timeout: 20000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: res.statusCode === 200 ? JSON.parse(data) : null,
            body: data
          });
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
}

async function checkPrices() {
  log('=== Flight Price Check Started ===');
  
  // Check current request count
  requestCount = await getRequestCount();
  log(`Current request count: ${requestCount}/1000 (${1000 - requestCount} remaining)`);
  
  if (requestCount >= SAFETY_MARGIN) {
    log(`⚠️  Request limit reached (${requestCount} >= ${SAFETY_MARGIN}). Stopping tracker.`);
    process.exit(0);
  }

  let successCount = 0;
  let checkTime = new Date().toISOString();

  routeLoop:
  for (const route of routes) {
    for (const departureDate of route.departureDates) {
      let departureHasNoFlights = false;

      for (let i = 0; i < RETURN_DATES_CHECK_ORDER.length; i++) {
        const returnDate = RETURN_DATES_CHECK_ORDER[i];

        if (departureHasNoFlights) {
          log(`  Skipping return ${returnDate}: no itineraries found for ${route.origin}→${route.destination} on ${departureDate}`);
          continue;
        }

        if (requestCount + 1 > SAFETY_MARGIN) {
          log(`Stopping: only ${SAFETY_MARGIN - requestCount} requests left.`);
          break routeLoop;
        }

        try {
          log(`Checking: ${route.origin} → ${route.destination} (max ${MAX_STOPS} stops, depart ${departureDate}, return ${returnDate})`);

          const result = await makeIgnavRequest(
            route.origin,
            route.destination,
            departureDate,
            returnDate
          );

          requestCount++;

          if (result.status === 200 && result.data.itineraries) {
            const rawItineraries = result.data.itineraries;
            log(`  Ignav returned ${rawItineraries.length} itineraries before filtering`);

            if (i === 0 && rawItineraries.length === 0) {
              departureHasNoFlights = true;
            }

            const passesFilter = it =>
              it.price.amount <= MAX_PRICE &&
              it.outbound.duration_minutes <= MAX_DURATION * 60;

            const itineraries = rawItineraries
              .filter(passesFilter)
              .sort((a, b) => a.price.amount - b.price.amount)
              .slice(0, 5); // Keep top 5

            log(`  Found ${itineraries.length} itineraries matching criteria`);

            const omitted = rawItineraries.filter(it => !passesFilter(it));
            if (omitted.length > 0) {
              const details = omitted
                .map(it => `€${it.price.amount} (${Math.round(it.outbound.duration_minutes / 60)}h)`)
                .join(', ');
              log(`  Omitted ${omitted.length} by filter: ${details}`);
            }

            for (const it of itineraries) {
              const outboundSegs = it.outbound.segments || [];
              const inboundSegs = it.inbound?.segments || [];

              // Extract hub airports (connection points)
              const hubs = outboundSegs.length > 1
                ? outboundSegs.slice(0, -1).map(s => s.arrival_airport || s.arrival_iata).join(', ')
                : null;

              const { data: priceRow, error: insertError } = await supabase
                .from('price_history')
                .insert({
                  origin: route.origin,
                  destination: route.destination,
                  price: it.price.amount,
                  currency: it.price.currency,
                  duration_outbound: it.outbound.duration_minutes,
                  duration_inbound: it.inbound?.duration_minutes || null,
                  outbound_stops: (outboundSegs.length || 1) - 1,
                  inbound_stops: (inboundSegs.length || 1) - 1,
                  outbound_hubs: hubs,
                  checked_at: checkTime,
                  outbound_departure: outboundSegs[0]?.departure_time_local,
                  outbound_arrival: outboundSegs[outboundSegs.length - 1]?.arrival_time_local,
                  inbound_departure: inboundSegs[0]?.departure_time_local,
                  inbound_arrival: inboundSegs[inboundSegs.length - 1]?.arrival_time_local
                })
                .select('id')
                .single();

              if (insertError) {
                log(`  ⚠️  Database insert failed: ${insertError.message}`);
                continue;
              }

              await linkFlights(priceRow.id, outboundSegs, inboundSegs);
            }
            successCount++;

          } else {
            log(`  ⚠️  API error (${result.status}): ${result.body.substring(0, 100)}`);
          }

        } catch (err) {
          log(`  ❌ Error checking ${route.origin}→${route.destination} (depart ${departureDate}, return ${returnDate}): ${err.message}`);
        }
      }
    }
  }

  // Update request count in database
  await incrementRequestCount(successCount);
  
  log(`=== Check Complete ===`);
  log(`Requests used: ${successCount} | Total: ${requestCount}/${SAFETY_MARGIN}`);
  log(`Next check scheduled automatically (6h interval)`);
}

// Main execution
(async () => {
  try {
    await checkPrices();
  } catch (err) {
    log(`Fatal error: ${err.message}`);
    process.exit(1);
  }
})();
