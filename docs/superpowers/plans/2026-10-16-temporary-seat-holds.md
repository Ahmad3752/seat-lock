# Temporary Seat Holds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a transaction-safe, ten-minute temporary multi-seat reservation flow for signed-in SeatLock customers.

**Architecture:** A `SeatHold` record and the matching `EventSeat` documents change together in a MongoDB replica-set transaction. The hold service owns validation, idempotency, inventory updates, release, and expiry; routes/controllers remain thin. The public React event page requests/release holds and bases its timer on the server expiry.

**Tech Stack:** TypeScript, Express 5, Mongoose 9 transactions, MongoDB replica set, Node test runner/Supertest, React 19, Vite, Vitest/React Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-16-temporary-seat-holds-design.md`

## Global Constraints

- Store all ticket prices and totals as non-negative whole Pakistani rupees; `2500` is Rs 2,500. Do not migrate existing prices.
- A customer may hold one to eight distinct seats for ten minutes by default; make duration, maximum seats, and worker interval validated environment settings.
- The hold operation is all-or-nothing and must execute in a MongoDB transaction on a replica set.
- Keep the existing `EventSeat.status` and `seatKey` fields; add hold metadata rather than introducing a duplicate state field.
- Persist only a cryptographic token hash; never expose token/hash, customer data, payment data, booking data, or hold metadata through public event endpoints.
- Use existing `{ data: ... }` success envelopes and `AppError` error envelopes.
- No payments, confirmed bookings, QR tickets, Socket.IO, or hold recovery after a browser refresh.

## Review Focus

- A browser retry after an uncertain network failure must reuse its key and return the original hold, not double-hold seats. Test in Task 3.
- A repeated idempotency key with a different seat list must fail safely rather than return an incorrect hold. Test in Task 3.
- A seat held past its expiry must be reclaimable even if the worker has not yet run. Test in Task 3.
- A worker acting after a new hold has reused an expired seat must not free the new hold. Test in Task 4.
- A customer whose access token expires during a countdown must receive an honest error and must not lose the selected intent to an automatic duplicate request. Test in Task 6.

---

## File structure

- `server/src/config/env.ts`: validates hold duration, maximum selection, and worker interval.
- `server/src/models/event-seat.model.ts`: adds `holdId`, `holdTokenHash`, `holdExpiresAt`, `version`, and the hold lookup index.
- `server/src/models/seat-hold.model.ts`: defines the private hold record, seat snapshots, and idempotency/expiry indexes.
- `server/src/modules/holds/holds.validation.ts`: parses and validates hold request payloads.
- `server/src/modules/holds/holds.service.ts`: owns transaction-safe hold creation, release, and expiry cleanup.
- `server/src/modules/holds/holds.controller.ts` and `holds.routes.ts`: translate HTTP/auth into service calls.
- `server/src/jobs/hold-expiry-worker.ts`: schedules safe expiry cleanup and supplies a stoppable worker.
- `server/src/modules/public-events/public-events.controller.ts`: treats expired holds as publicly available without leaking hold details.
- `server/src/app.ts` and `server/src/server.ts`: mount hold routes and manage worker lifecycle.
- `server/test/helpers/database.ts` and `server/test/seat-holds.test.ts`: replica-set setup and hold integration/concurrency coverage.
- `client/src/public-events/holdUtils.ts`: pure request-key, countdown, selection reconciliation, and reservation-state helpers.
- `client/src/public-events/PublicEventPages.tsx`: reserve, held-countdown, conflict, release, and refresh behaviour.
- `client/src/App.css`: states for reservation summary and timer.
- `client/vitest.config.ts`, `client/src/test/setup.ts`, `client/src/public-events/holdUtils.test.ts`, `client/src/public-events/PublicEventPages.test.tsx`, and `client/package.json`: client test setup and focused tests.
- `README.md`, `server/.env.example`, and Docker configuration documentation: replica-set and hold configuration instructions.

### Task 1: Define hold persistence, configuration, and integer money rules

**Files:**
- Create: `server/src/models/seat-hold.model.ts`
- Modify: `server/src/models/event-seat.model.ts`
- Modify: `server/src/models/event.model.ts`
- Modify: `server/src/modules/organizer/organizer.validation.ts`
- Modify: `server/src/config/env.ts`
- Test: `server/test/event-metadata.test.ts`

**Interfaces:**
- Produces `SeatHold`, `SeatHoldDocument`, `HoldStatus`, and `HoldSeatSnapshot` for the hold service.
- Produces `env.holdDurationMinutes`, `env.maxSeatsPerHold`, and `env.holdExpiryWorkerIntervalMs`.
- `EventSeat` exposes `holdId?: ObjectId`, `holdTokenHash?: string`, `holdExpiresAt?: Date`, and `version: number`.

- [ ] **Step 1: Add failing metadata tests for an integer section price and invalid fractional price**

Assert a price such as `2500` is accepted and `2500.5` returns the existing validation envelope.

- [ ] **Step 2: Run the metadata test file to verify the fractional-price assertion fails**

Run: `npx tsx --test test/event-metadata.test.ts`

Expected: FAIL because fractional prices are currently accepted.

- [ ] **Step 3: Add the models, indexes, integer validation, and validated hold environment settings**

Define `SeatHold` with `eventId`, `customerId`, `seatIds`, `status`, `expiresAt`, `idempotencyKey`, `tokenHash`, snapshots, `total`, and `currency`; add unique `{ customerId, idempotencyKey }` and `{ status, expiresAt }` indexes. Add `{ eventId, status, holdExpiresAt }` to `EventSeat`. Require `Number.isInteger` for section-price amounts and keep the current whole-rupee meaning.

- [ ] **Step 4: Run the metadata tests and server typecheck**

Run: `npx tsx --test test/event-metadata.test.ts; npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit persistence and configuration changes**

```bash
git add server/src/config/env.ts server/src/models server/src/modules/organizer/organizer.validation.ts server/test/event-metadata.test.ts
git commit -m "feat: add hold persistence primitives"
```

### Task 2: Switch integration testing to a MongoDB replica set

**Files:**
- Modify: `server/test/helpers/database.ts`
- Test: `server/test/seat-holds.test.ts`

**Interfaces:**
- Consumes the models from Task 1.
- Produces `installTestDatabase()` backed by `MongoMemoryReplSet`, reusable by every server integration test.

- [ ] **Step 1: Add a failing transaction smoke test**

Create a one-document transaction in `seat-holds.test.ts` using the test connection and assert it commits.

- [ ] **Step 2: Run the new test against the existing helper**

Run: `npx tsx --test test/seat-holds.test.ts`

Expected: FAIL because a standalone `MongoMemoryServer` does not support transactions.

- [ ] **Step 3: Replace the standalone test server with `MongoMemoryReplSet`**

Use a one-node `wiredTiger` replica set and the existing local binary download directory. Clean collections between tests without dropping indexes required by unique idempotency assertions.

- [ ] **Step 4: Run all current server tests**

Run: `npm test`

Expected: PASS, including the transaction smoke test.

- [ ] **Step 5: Commit replica-set test infrastructure**

```bash
git add server/test/helpers/database.ts server/test/seat-holds.test.ts
git commit -m "test: run integration tests on Mongo replica set"
```

### Task 3: Implement atomic hold creation and authenticated HTTP API

**Files:**
- Create: `server/src/modules/holds/holds.validation.ts`
- Create: `server/src/modules/holds/holds.service.ts`
- Create: `server/src/modules/holds/holds.controller.ts`
- Create: `server/src/modules/holds/holds.routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/test/seat-holds.test.ts`

**Interfaces:**
- Consumes `SeatHold`, `Event`, `EventSeat`, `env`, and `req.user.sub`.
- Produces `createSeatHold(input: { eventId: string; customerId: string; seatIds: string[]; idempotencyKey: string }): Promise<PublicHold>`.
- Produces `publicHold` as `{ id, status, expiresAt, seats: Array<{ id, label, price }>, total, currency }`.
- Mounts `POST /api/v1/events/:eventId/holds` behind `requireAuth` and `requireRole("customer")`.

- [ ] **Step 1: Add failing hold API tests**

Cover malformed/duplicate seat ids, non-UUID key, zero/nine seats, unauthenticated and organizer access, unavailable/blocked/booked/unexpired-held seats, unpublished/not-on-sale events, a successful two-seat response, a whole-rupee total, repeated same-key response, and changed-payload key reuse.

- [ ] **Step 2: Run the hold API tests to verify they fail**

Run: `npx tsx --test test/seat-holds.test.ts`

Expected: FAIL because no holds router or service exists.

- [ ] **Step 3: Implement request parsing and `createSeatHold`**

Parse an object body with 1–`env.maxSeatsPerHold` distinct valid ObjectIds and a UUID. In `mongoose.startSession().withTransaction`, re-check published/sale state, return an existing matching key, generate/hash a random token, conditionally `updateMany` only requested available or expired-held seats, require exact `modifiedCount`, save snapshots/total, and return only allowlisted data. Convert transaction contention into `409 SEAT_UNAVAILABLE`; distinguish incompatible idempotency reuse with a `409` code.

- [ ] **Step 4: Run the hold API tests and typecheck**

Run: `npx tsx --test test/seat-holds.test.ts; npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Add the twenty-request concurrency test and no-partial-update test**

Send twenty simultaneous authenticated requests for the same available seat using different customers/keys; assert exactly one `201`, nineteen `409 SEAT_UNAVAILABLE`, one active hold, and one held seat. Request two seats with one unavailable and assert the available seat remains available.

- [ ] **Step 6: Run the whole server test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit hold creation API**

```bash
git add server/src/app.ts server/src/modules/holds server/test/seat-holds.test.ts
git commit -m "feat: add transactional seat holds"
```

### Task 4: Implement owner-only release, expiry worker, and public availability projection

**Files:**
- Create: `server/src/jobs/hold-expiry-worker.ts`
- Modify: `server/src/modules/holds/holds.service.ts`
- Modify: `server/src/modules/holds/holds.controller.ts`
- Modify: `server/src/modules/holds/holds.routes.ts`
- Modify: `server/src/modules/public-events/public-events.controller.ts`
- Modify: `server/src/server.ts`
- Test: `server/test/seat-holds.test.ts`
- Test: `server/test/public-events.test.ts`

**Interfaces:**
- Produces `releaseSeatHold(input: { holdId: string; customerId: string }): Promise<ReleaseResult>` and `expireDueSeatHolds(now?: Date): Promise<number>`.
- Produces `startHoldExpiryWorker(): () => void`.
- Mounts `DELETE /api/v1/holds/:holdId` behind `requireAuth` and customer role checking.

- [ ] **Step 1: Add failing release, expiry, and public-seat tests**

Assert an owner can release an active hold; a non-owner cannot; repeated release is safe; expiry frees only seats still carrying that hold id; booked seats are never freed; a stale worker cannot free a newer replacement hold; and public seats with a past hold expiry project as `available` without hold metadata.

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `npx tsx --test test/seat-holds.test.ts test/public-events.test.ts`

Expected: FAIL because release, expiry, and effective availability do not exist.

- [ ] **Step 3: Implement transactional release and expiry cleanup**

Release only an active hold owned by `customerId`; update seats using both `status: "held"` and matching `holdId`, clear hold fields, increment `version`, and mark the hold terminal. The expiry function follows the same matching rule, marks due holds expired, and returns safely if cleanup races a newer hold. Start the interval only after database connection and stop it during graceful shutdown.

- [ ] **Step 4: Project expired holds as available in the public seat DTO**

Map an expired `held` seat to public `state: "available"` without writing it from the read endpoint or revealing internal hold fields.

- [ ] **Step 5: Run all server tests, typecheck, and build**

Run: `npm test; npm run typecheck; npm run build`

Expected: PASS.

- [ ] **Step 6: Commit release, expiry, and public availability changes**

```bash
git add server/src/jobs server/src/modules/holds server/src/modules/public-events/public-events.controller.ts server/src/server.ts server/test
git commit -m "feat: expire and release temporary seat holds"
```

### Task 5: Add pure client hold helpers and client test infrastructure

**Files:**
- Create: `client/src/public-events/holdUtils.ts`
- Create: `client/src/public-events/holdUtils.test.ts`
- Create: `client/vitest.config.ts`
- Create: `client/src/test/setup.ts`
- Modify: `client/package.json`

**Interfaces:**
- Produces `newReservationKey(): string`, `remainingHoldSeconds(expiresAt: string, now?: number): number`, `formatHoldCountdown(seconds: number): string`, and `reconcileSelectedSeats(selected: ReadonlySet<string>, seats: PublicSeat[]): Set<string>`.
- Adds a `test` script using Vitest.

- [ ] **Step 1: Add failing helper tests**

Test a UUID-shaped fresh key, zero at/past expiry, `MM:SS` formatting, selected-seat removal after a conflict refresh, and selected available seats surviving reconciliation.

- [ ] **Step 2: Run the helper tests to verify they fail**

Run: `npx vitest run src/public-events/holdUtils.test.ts`

Expected: FAIL because the test runner and helpers do not exist.

- [ ] **Step 3: Add the smallest client test setup and pure helpers**

Add Vitest, jsdom, and React Testing Library setup. Use `crypto.randomUUID()` at user-action time, not render/effect time; calculate remaining time from the absolute server expiry.

- [ ] **Step 4: Run client tests, lint, and build**

Run: `npm test; npm run lint; npm run build`

Expected: PASS.

- [ ] **Step 5: Commit client hold helpers and tests**

```bash
git add client/package.json client/package-lock.json client/vitest.config.ts client/src/test/setup.ts client/src/public-events/holdUtils.ts client/src/public-events/holdUtils.test.ts
git commit -m "test: add client hold helpers"
```

### Task 6: Connect the customer reservation experience

**Files:**
- Modify: `client/src/public-events/PublicEventPages.tsx`
- Modify: `client/src/App.css`
- Test: `client/src/public-events/PublicEventPages.test.tsx`

**Interfaces:**
- Consumes `api`, `ApiError`, `useAuth`, and Task 5 helpers.
- Consumes `POST /events/:eventId/holds` and `DELETE /holds/:holdId` returning the Task 3 public hold DTO.
- Produces the authenticated Reserve seats, active hold countdown, Release hold, conflict-refresh, and expiry-refresh UI states.

- [ ] **Step 1: Add failing page-level reservation tests**

Mock the API/auth hook and cover one request while Reserve is pending, the same idempotency key for a retry, clearing/reconciling on `SEAT_UNAVAILABLE`, a server-expiry countdown reaching zero and refetching seats, successful release, failed release retaining the held summary, and a failed authenticated API request leaving no false “reserved” state.

- [ ] **Step 2: Run the client tests to verify the new expectations fail**

Run: `npx vitest run src/public-events/PublicEventPages.test.tsx`

Expected: FAIL because no reservation state flow exists.

- [ ] **Step 3: Replace the placeholder Continue flow with reserve/hold/release states**

Read `accessToken` through `useAuth`. Fetch seats through one reusable refresh function. POST selected ids/key only when the sale is open and selection is valid; lock selection while pending or held; render the server snapshot/total and absolute-expiry countdown; DELETE only the current owner’s hold; refresh after release, expiry, or `SEAT_UNAVAILABLE`. Keep a browser refresh honest by not restoring an unknown hold.

- [ ] **Step 4: Add accessible visual states in `App.css`**

Style the pending, active countdown, conflict, expiry, and release controls using the existing public-event visual language without changing unrelated pages.

- [ ] **Step 5: Run client verification**

Run: `npm test; npm run lint; npm run build`

Expected: PASS.

- [ ] **Step 6: Commit the customer hold UI**

```bash
git add client/src/public-events/PublicEventPages.tsx client/src/public-events/PublicEventPages.test.tsx client/src/App.css
git commit -m "feat: reserve seats with temporary holds"
```

### Task 7: Document replica-set development and complete end-to-end verification

**Files:**
- Modify: `README.md`
- Create: `server/.env.example`
- Create or modify: Docker Compose configuration if none exists

**Interfaces:**
- Documents `MONGODB_URI` with `replicaSet=rs0`, hold-related settings, and Docker commands to initialise the one-node replica set.

- [ ] **Step 1: Add Docker and environment documentation**

Document the exact single-node replica-set setup, the difference between a stopped Docker container (`ECONNREFUSED`) and a running standalone MongoDB (transactions unavailable), and the settings added in Task 1.

- [ ] **Step 2: Manually verify the full customer scenario with replica-set MongoDB**

Start MongoDB as a replica set, start the API/client, sign in as a customer, reserve one or more seats, verify a second customer receives the conflict, release or expire the first hold, and verify the second customer can reserve.

- [ ] **Step 3: Run the complete automated verification suite**

Run: `cd server; npm test; npm run typecheck; npm run build; cd ../client; npm test; npm run lint; npm run build`

Expected: PASS. Report honestly if Docker/manual replica-set setup cannot be executed in this environment.

- [ ] **Step 4: Commit operational documentation**

```bash
git add README.md server/.env.example docker-compose.yml
git commit -m "docs: explain replica set seat hold setup"
```
