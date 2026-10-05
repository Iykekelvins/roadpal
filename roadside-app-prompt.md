# Project Brief: On-Demand Mobile Vulcanizer App (working name: TBD)

## Who I am and how I want to work
I'm a fullstack developer with 4+ years of production React/Next.js experience, now deepening my backend skills. I'm building this project with you, but **learning is as important as shipping**. Work with me like this:

- **Explain the why before the how.** Before each new concept (geo queries, WebSockets, state machines, auth guards, etc.), briefly explain what it is, why we need it here, and what the alternatives are.
- **Build in small steps.** One feature or layer at a time. Never dump an entire feature's code in one go.
- **Let me write code first where it makes sense.** Give me the goal and hints, then review what I write. Write it yourself only when I ask, or when it's boilerplate.
- **Name the trade-offs.** When you pick an approach, tell me what we gain, what we give up, and when we'd switch.
- **Check my understanding.** Occasionally ask me to explain something back or predict what code will do before we run it.
- **Be direct and concise.** No over-engineering. If I'm about to over-engineer, call it out.

## The problem
A bus I was on got a flat tyre in the middle of nowhere on a Nigerian highway. There was no fast way to find the nearest vulcanizer (tyre repairer), get them to come to us, and agree a price. People rely on knowing someone, flagging down help, or walking to find a roadside shop.

**Who has the problem:** drivers (private car owners, commercial bus/taxi drivers, logistics drivers) stranded with tyre issues, especially outside city centres.
**What they do today:** call someone they know, ask passers-by, or walk/ride to find a vulcanizer.
**Why it's painful:** slow, unsafe (stuck on a highway, sometimes at night), unpredictable pricing, no trust signal.

**The other side:** vulcanizers, mostly roadside workers, who earn from walk-ins and have idle time. They'd gain jobs sent straight to their phones.

## Existing players (for research, not competition)
- **Drivly** (Lagos): fixed pricing, explicitly no negotiation, verified providers.
- **Roadly**: subscription model with tyre fixes and other car services.
- **Travo.ng**: service-desk style roadside assistance.
- **HONK / Urgent.ly** (abroad): marketplace roadside assistance; HONK uses bidding.

**My angle:** offer-based pricing (vulcanizers bid, the driver picks) and a focus on highway/intercity breakdowns, not just city coverage.

## Users and roles
1. **Driver**: requests help, receives offers, accepts one, tracks arrival, rates the job.
2. **Vulcanizer (provider)**: sets availability and service area, receives nearby requests, sends offers, updates job status, gets rated.
3. **Admin** (later): verifies providers, handles disputes, views metrics.

## Use cases

### Driver
- Sign up / log in with phone number.
- Create a help request: auto-captured GPS location, vehicle type (car, bus, truck, motorcycle), issue type (flat tyre, puncture, no spare, tyre burst, needs air), optional note/photo.
- See incoming offers in real time: price, ETA, distance, provider rating.
- Accept an offer; all other offers are closed automatically.
- Track job status live: accepted → en route → arrived → in progress → completed.
- See the provider's live location on a map while they're en route.
- Call the provider directly (tap-to-call).
- Cancel a request (with rules about when cancellation is allowed).
- Rate and review the provider after completion.
- View past jobs.

### Vulcanizer
- Sign up / log in with phone number; build a profile (name, photo, services offered, service radius).
- Toggle online/offline.
- Receive nearby requests in real time (only within their service radius).
- Send an offer (price + ETA) or ignore the request.
- Get notified when an offer is accepted or rejected.
- Update job status through the lifecycle.
- Share live location while en route.
- See earnings and job history.
- Rate the driver.

### System
- Match requests to online providers within radius, nearest first.
- Expire requests that get no offers within N minutes; widen the radius and retry.
- Expire offers that aren't accepted.
- Enforce valid job state transitions (no jumping from "requested" to "completed").
- Send notifications for key events.

## MVP scope (v1)
**In:**
- Phone-number auth (OTP can be mocked in development) with JWT access/refresh tokens.
- Driver and vulcanizer roles with separate flows.
- Create request → match nearby providers → receive offers → accept → live status → complete → rate.
- Geospatial matching with PostGIS.
- Real-time updates over WebSockets.
- Map view (Leaflet + OpenStreetMap).
- Tap-to-call instead of in-app chat.
- PWA: installable and works on mobile browsers.

**Out (for now):**
- In-app payments (cash/transfer on completion).
- In-app chat.
- Admin dashboard.
- Native mobile apps.
- SMS/USSD fallback.
- Provider verification workflow.

## Tech stack (and why)
- **Monorepo:** pnpm + Turborepo with `apps/web`, `apps/api`, and `packages/shared` (Zod schemas and types shared by frontend and backend, so validation rules live in one place).
- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS. PWA setup for installability.
- **Backend:** NestJS. Its modules, guards, and gateways give structure for a multi-role, real-time API.
- **Database:** Neon Postgres + **PostGIS** for "find providers within X km, ordered by distance."
- **ORM:** Drizzle (with custom types or raw SQL where PostGIS needs it; explain where Drizzle stops and SQL takes over).
- **Validation:** Zod.
- **Real-time:** NestJS WebSocket gateway (Socket.IO), with rooms per job and per provider area.
- **Auth:** JWT (access + refresh), role-based guards.
- **Maps:** Leaflet + OpenStreetMap (no Google Maps billing).
- **Testing:** Vitest for unit tests, especially the job state machine and matching logic.
- **Deployment (suggest options with trade-offs):** frontend on Vercel; API on a host that supports long-lived WebSocket connections (explain why serverless doesn't fit here).

## Core domain concepts to teach me as we go
- **Job state machine:** states, allowed transitions, who can trigger each, and how to enforce it on the server.
- **Geo queries:** storing points, `ST_DWithin`, `ST_Distance`, spatial indexes (GiST), and why plain lat/lng columns with maths don't scale.
- **Real-time design:** what goes over WebSockets vs REST, rooms, reconnection, and what happens when a client drops offline.
- **Race conditions:** two drivers accepting, or a driver accepting an offer that just expired. Use transactions and row locking.
- **Location updates:** how often to send them, throttling, and why we don't store every ping forever.
- **Auth and roles:** guards, ownership checks (a provider can only update their own jobs).

## Initial data model (to refine together)
- `users`: id, phone, role (driver | provider), name, created_at
- `provider_profiles`: user_id, services[], service_radius_km, is_online, last_location (geography point), rating_avg, rating_count
- `vehicles` (optional for v1): user_id, type
- `requests`: id, driver_id, location (geography point), vehicle_type, issue_type, note, status, created_at, expires_at
- `offers`: id, request_id, provider_id, price, eta_minutes, status (pending | accepted | rejected | expired), created_at
- `jobs`: id, request_id, offer_id, provider_id, driver_id, status, timestamps per status
- `ratings`: id, job_id, from_user_id, to_user_id, score, comment

Challenge this model if it's wrong. Explain normalisation choices and whether `requests` and `jobs` should be one table or two.

## Build phases
1. **Foundations:** monorepo setup, shared Zod package, NestJS + Drizzle + Neon (with PostGIS enabled), environment config.
2. **Auth:** phone login (mocked OTP), JWT, roles, guards.
3. **Provider setup:** profile, online toggle, location updates.
4. **Requests and matching:** create request, geo query for nearby online providers, tests.
5. **Real-time:** WebSocket gateway, broadcast requests to nearby providers, offers back to the driver.
6. **Offers and acceptance:** send/accept offers with transactions to prevent race conditions.
7. **Job lifecycle:** state machine, status updates, live provider location on the map.
8. **Ratings and history.**
9. **Expiry and retries:** request/offer timeouts, radius widening.
10. **Polish and deploy:** PWA, error states, poor-network handling, deployment.

Each phase should end with something working end to end that I can demo.

## Constraints to design for
- **Weak network:** stranded users may have poor signal. Keep payloads small, handle reconnects, show clear offline states.
- **Low-end Android phones:** keep the frontend light.
- **Trust and safety:** ratings, provider details visible before accepting, and the option to share live job status with a contact (later).
- **Cash-first market:** v1 assumes payment is settled in person.

## Scaling plan (later, explain each when relevant)
- **Redis:** Socket.IO adapter so multiple API instances share real-time events; caching online provider locations.
- **Background jobs (BullMQ):** request/offer expiry, radius widening, notifications, instead of in-memory timers.
- **Horizontal scaling:** stateless API instances behind a load balancer; sticky sessions or the Redis adapter for sockets.
- **Database:** connection pooling, spatial index tuning, read replicas for history and analytics.
- **Location pipeline:** keep only the latest location hot; archive or drop old pings.
- **Reach:** SMS/USSD fallback (Termii or Africa's Talking) for providers without smartphones or data.
- **Payments:** Paystack with escrow-style release on job completion.
- **Mobile:** React Native (Expo) apps once the PWA proves the flow.
- **Expansion:** other services (battery jumpstart, fuel delivery, towing) as new `issue_type`s and provider categories.
- **Observability:** logging, error tracking, metrics (time to first offer, acceptance rate, arrival time).

## How to start
Begin with Phase 1. Before writing anything, give me a short overview of the architecture (how web, API, database, and WebSockets talk to each other), then walk me through setting up the monorepo, explaining each decision.
