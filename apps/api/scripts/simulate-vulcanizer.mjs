// DEV ONLY: plays two vulcanizers so the driver screens can be tried before the vulcanizer app exists.
//
//   1. In the browser, log in as a driver and send a request.
//   2. Run: pnpm --filter @repo/api simulate
//   3. Two offers arrive. Accept one: that vulcanizer drives to you on the map, then does the job.
//
// It talks to the running API like a real app would (HTTP + Socket.IO). It reads the database
// only to find where your request is, since a vulcanizer's API never reveals a driver's location.
// It only works against a development API: logging in relies on the dev-only OTP code.
import { io } from 'socket.io-client';
import pg from 'pg';

const API = process.env.SIM_API_URL ?? 'http://localhost:8000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toLocaleTimeString('en-NG'), ...a);

const VULCANIZERS = [
  // Fixed numbers, so re-running reuses the same two accounts instead of piling up new ones.
  { phone: '+2347000000101', name: 'Sim · Bayo Vulcanizer', price: 4000, eta: 6, northKm: 1.6 },
  { phone: '+2347000000102', name: 'Sim · Emeka Tyres', price: 3000, eta: 12, northKm: 3.2 },
];

async function call(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

// --- 1. wait for the driver's open request
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
async function latestOpenRequest() {
  const { rows } = await db.query(`
    select r.id, st_y(r.location::geometry) as lat, st_x(r.location::geometry) as lng, r.issue_type
    from requests r
    where r.status = 'open' and r.expires_at > now()
      -- skip requests these simulated vulcanizers already handled on an earlier run
      and not exists (
        select 1 from offers o join users u on u.id = o.provider_id
        where o.request_id = r.id and u.phone = any($1)
      )
    order by r.created_at desc limit 1`, [VULCANIZERS.map((v) => v.phone)]);
  return rows[0];
}
let request = await latestOpenRequest();
if (!request) log('Waiting for a driver request. Send one from the browser…');
while (!request) {
  await sleep(2000);
  request = await latestOpenRequest();
}
await db.end();
log(`Found request near ${request.lat.toFixed(4)}, ${request.lng.toFixed(4)} (${request.issue_type})`);

// --- 2. log the vulcanizers in, put them online a little north of the driver, send offers
const north = (km) => ({ lat: request.lat + km / 111, lng: request.lng }); // ~111 km per degree of latitude
const team = [];
for (const v of VULCANIZERS) {
  const { devCode } = await call('/auth/otp/request', { method: 'POST', body: { phone: v.phone } });
  if (!devCode) throw new Error('No dev OTP code: is the API running in development?');
  const { accessToken: token } = await call('/auth/otp/verify', { method: 'POST', body: { phone: v.phone, code: devCode, role: 'provider' } });
  await call('/users/me', { token, method: 'PATCH', body: { name: v.name } });
  await call('/providers/me/profile', {
    token,
    method: 'PUT',
    body: { services: ['flat_tyre', 'puncture', 'tyre_burst', 'no_spare', 'needs_air', 'other'], serviceRadiusKm: 20 },
  });
  const start = north(v.northKm);
  await call('/providers/me/status', { token, method: 'PATCH', body: { isOnline: true, location: start } });
  const socket = io(API, { auth: { token }, transports: ['websocket'] });
  await new Promise((r, reject) => {
    socket.once('connect', r);
    socket.once('connect_error', reject);
  });
  team.push({ ...v, token, socket, start });
}
for (const v of team) {
  await call(`/requests/${request.id}/offers`, { token: v.token, method: 'POST', body: { priceNaira: v.price, etaMinutes: v.eta } });
  log(`${v.name} offered ₦${v.price}, ~${v.eta} min`);
  await sleep(1500); // arrive one after the other, like real offers
}

async function goOffline() {
  for (const v of team) {
    await call('/providers/me/status', { token: v.token, method: 'PATCH', body: { isOnline: false } }).catch(() => {});
    v.socket.close();
  }
}

// --- 3. wait for the driver to choose (or cancel, or let it expire)
log('Now accept an offer in the browser.');
const outcome = await new Promise((resolve) => {
  for (const v of team) {
    v.socket.on('offer:accepted', (job) => resolve({ winner: v, job }));
    v.socket.on('offer:expired', () => resolve({ ended: 'the offers expired' }));
  }
  let rejected = 0;
  for (const v of team) v.socket.on('offer:rejected', () => ++rejected === team.length && resolve({ ended: 'you cancelled the request' }));
});
if (!outcome.winner) {
  log(`Stopping: ${outcome.ended}.`);
  await goOffline();
  process.exit(0);
}

// --- 4. the winner drives to the driver and does the job
const { winner, job } = outcome;
let cancelled = false;
winner.socket.on('job:updated', (j) => {
  if (j.status === 'cancelled') cancelled = true;
});
const step = async (status, wait) => {
  if (cancelled) return false;
  await call(`/jobs/${job.id}/status`, { token: winner.token, method: 'PATCH', body: { status } });
  log(`${winner.name}: ${status.replace('_', ' ')}`);
  await sleep(wait);
  return !cancelled;
};

log(`You chose ${winner.name}.`);
await sleep(3000);
if (await step('en_route', 1000)) {
  const STEPS = 12; // one position every 5 s, about a minute of driving
  for (let i = 1; i <= STEPS && !cancelled; i++) {
    const t = i / STEPS;
    // A slight curve so it doesn't look like a ruler-straight line.
    const location = {
      lat: winner.start.lat + (request.lat - winner.start.lat) * t,
      lng: winner.start.lng + Math.sin(t * Math.PI) * 0.004,
    };
    await new Promise((r) => winner.socket.emit('location:update', location, r));
    await sleep(5000);
  }
  if ((await step('arrived', 6000)) && (await step('in_progress', 8000))) await step('completed', 0);
}
log(cancelled ? 'You cancelled the job. Stopping.' : 'Done. Rate them in the browser.');
await goOffline();
process.exit(0);
