import ws from 'ws';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

global.WebSocket = ws;

const IGNAV_API_KEY = process.env.IGNAV_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SAFETY_MARGIN = parseInt(process.env.SAFETY_MARGIN || '980');
const MAX_PRICE = parseInt(process.env.MAX_PRICE || '1450');
const MAX_DURATION = parseInt(process.env.MAX_DURATION || '22');
const MAX_STOPS_DEFAULT = parseInt(process.env.MAX_STOPS_DEFAULT || '1');
const MAX_STOPS_SALZBURG = parseInt(process.env.MAX_STOPS_SALZBURG || '2');

// Parse routes (e.g., "SZG:DAD,MUC:DAD,VIE:DAD,FRA:DAD")
const routes = process.env.ROUTES.split(',').map(r => {
  const [origin, dest] = r.split(':');
  return { origin: origin.trim(), destination: dest.trim() };
});

const OUTBOUND_DATE = process.env.OUTBOUND_DATE;
const RETURN_DATE = process.env.RETURN_DATE;

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

async function initDatabase() {
  // Create price_history table if not exists
  const { error } = await supabase.rpc('init_schema', {});
  if (error) {
    log(`Note: RPC init_schema not found (first run). Creating tables manually...`);
    
    // Create tables directly via raw SQL would require PostgREST access
    // For now, we'll handle errors gracefully
  }
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

function makeIgnavRequest(origin, destination, departureDate, returnDate, maxStops) {
  return new Promise((resolve, reject) => {
    const payload = {
      origin,
      destination,
      departure_date: departureDate,
      return_date: returnDate,
      max_stops: maxStops,
      cabin_class: 'economy',
      market: 'AT'  // Austria
    };

    const options = {
      hostname: 'ignav.com',
      path: '/api/fares/round-trip',
      method: 'POST',
      headers: {
        'X-Api-Key': IGNAV_API_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'FlightTracker/1.0'
      },
      timeout: 10000
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

  for (const route of routes) {
    const maxStops = route.origin === 'SZG' ? MAX_STOPS_SALZBURG : MAX_STOPS_DEFAULT;
    
    if (requestCount + 1 > SAFETY_MARGIN) {
      log(`Stopping: only ${SAFETY_MARGIN - requestCount} requests left.`);
      break;
    }

    try {
      log(`Checking: ${route.origin} → ${route.destination} (max ${maxStops} stops)`);
      
      const result = await makeIgnavRequest(
        route.origin,
        route.destination,
        OUTBOUND_DATE,
        RETURN_DATE,
        maxStops
      );

      requestCount++;

      if (result.status === 200 && result.data.itineraries) {
        const itineraries = result.data.itineraries
          .filter(it => 
            it.price.amount <= MAX_PRICE && 
            it.outbound.duration_minutes <= MAX_DURATION * 60
          )
          .sort((a, b) => a.price.amount - b.price.amount)
          .slice(0, 5); // Keep top 5

        log(`  Found ${itineraries.length} itineraries matching criteria`);

        for (const it of itineraries) {
          // Extract hub airports (connection points)
          const outboundSegments = it.outbound.segments || [];
          const hubs = outboundSegments.length > 1 
            ? outboundSegments.slice(0, -1).map(s => s.arrival_airport || s.arrival_iata).join(', ')
            : null;

          const { error } = await supabase.from('price_history').insert({
            origin: route.origin,
            destination: route.destination,
            price: it.price.amount,
            currency: it.price.currency,
            duration_outbound: it.outbound.duration_minutes,
            duration_inbound: it.inbound?.duration_minutes || null,
            outbound_stops: (it.outbound.segments?.length || 1) - 1,
            inbound_stops: (it.inbound?.segments?.length || 1) - 1,
            checked_at: checkTime,
            outbound_departure: it.outbound.segments[0]?.departure_time_local,
            outbound_arrival: it.outbound.segments[it.outbound.segments.length - 1]?.arrival_time_local,
            inbound_departure: it.inbound?.segments[0]?.departure_time_local,
            inbound_arrival: it.inbound?.segments[it.inbound.segments.length - 1]?.arrival_time_local,
            airlines: JSON.stringify(
              [...new Set(it.outbound.segments.map(s => s.marketing_carrier_code))].concat(
                it.inbound?.segments?.map(s => s.marketing_carrier_code) || []
              )
            ),
            outbound_hubs: hubs
          });

          if (error) {
            log(`  ⚠️  Database insert failed: ${error.message}`);
          }
        }
        successCount++;

      } else {
        log(`  ⚠️  API error (${result.status}): ${result.body.substring(0, 100)}`);
      }

    } catch (err) {
      log(`  ❌ Error checking ${route.origin}→${route.destination}: ${err.message}`);
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
    await initDatabase();
    await checkPrices();
  } catch (err) {
    log(`Fatal error: ${err.message}`);
    process.exit(1);
  }
})();
