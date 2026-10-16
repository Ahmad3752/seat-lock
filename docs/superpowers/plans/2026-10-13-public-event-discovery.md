# Public Event Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let guests browse published events, inspect a public event and seat map, and make a temporary local seat selection.

**Architecture:** A new public Express router builds explicit public DTOs from published event, venue, and event-seat documents. A small public React feature consumes those read-only APIs through the existing fetch helper and plugs into the current pathname router without changing organizer routes.

**Tech Stack:** Express 5, Mongoose, TypeScript, Node test runner via `tsx`, React 19, Vite, ESLint.

**Spec:** `docs/superpowers/specs/2026-10-13-public-event-discovery-design.md`

## Global Constraints

- Do not create holds, timers, payments, Socket.IO events, bookings, or any client write that changes `EventSeat` state.
- Public responses are explicit allowlists; never expose organizer IDs, raw timestamps, hold data, booking/customer data, or audit fields.
- Public event and seat lookups must return the existing `404 NOT_FOUND` envelope for missing, draft, cancelled, malformed, or otherwise non-public records.
- List only future, published, non-cancelled events, sorted by `startsAt` ascending.
- Client selection is temporary state only; page reload refetches server seat states and clears selection.
- Default the named `MAX_SEAT_SELECTION` constant to `8` unless an existing configuration is found during implementation.

## Review Focus

- A draft, cancelled, or already-started event must not be enumerable by its slug or list filters; cover it in the public API integration tests.
- A crafted seat document with future hold, booking, or audit fields must be stripped by the seat DTO; cover exact payload key assertions.
- Query values containing regex metacharacters must be escaped before case-insensitive title/category/location search; cover an input such as `music.*`.
- An invalid or reversed `from`/`to` range must return `422 VALIDATION_ERROR`, not silently return arbitrary events; cover both invalid date text and reversed bounds.
- Seat selection must reject a ninth available seat and any unavailable seat while allowing a previously selected seat to be deselected; cover this as a pure component helper or component test if a test runner is added.

---

## File structure

- `server/src/models/event.model.ts` — public-event fields and status values.
- `server/src/models/event-seat.model.ts` — compatible future-safe `blocked` state plus public accessibility/type source defaults.
- `server/src/modules/organizer/organizer.validation.ts` and `organizer.controller.ts` — create/update/DTO support for new event inputs without changing ownership rules.
- `server/src/modules/public-events/public-events.routes.ts` — unauthenticated public route declarations.
- `server/src/modules/public-events/public-events.controller.ts` — query validation, published visibility checks, and allowlisted public DTOs.
- `server/src/app.ts` — mount `/api/v1/events` before the not-found handler.
- `server/test/event-metadata.test.ts`, `server/test/public-events.test.ts`, and test helper files — isolated Mongo-backed integration coverage.
- `client/src/public-events/PublicEventPages.tsx` — catalogue, event detail, local seat-selection components and public API types.
- `client/src/App.tsx` — public routing, navigation, and login return URL behavior.
- `client/src/App.css` — responsive catalogue, event-detail, and accessible seat-map styles.

### Task 1: Extend the public event data model while preserving organizer behavior

**Files:**
- Create: `server/test/helpers/database.ts`
- Create: `server/test/event-metadata.test.ts`
- Modify: `server/src/models/event.model.ts`
- Modify: `server/src/models/event-seat.model.ts`
- Modify: `server/src/modules/organizer/organizer.validation.ts`
- Modify: `server/src/modules/organizer/organizer.controller.ts`
- Modify: `client/src/organizer/OrganizerPages.tsx`
- Modify: `server/package.json`
- Modify: `server/package-lock.json`

**Interfaces:**
- Produces: event documents with `slug`, `description`, `saleStartsAt`, `saleEndsAt`, and `status: "draft" | "published" | "cancelled"`.
- Produces: event-seat documents whose status union includes `blocked`, and whose public type/accessibility values can be derived without exposing internals.

- [ ] **Step 1: Add the server test harness**

Install `supertest`, `@types/supertest`, and `mongodb-memory-server`; configure `npm test` as `tsx --test`; and create a reusable in-memory Mongo lifecycle helper.

- [ ] **Step 2: Write failing model/validation tests for public event fields**

Add tests that prove a valid organizer event input accepts description and optional sale dates, rejects a sale window ending before it starts, and produces a unique URL-safe slug.

- [ ] **Step 3: Run the focused test to verify it fails**

Run: `cd server; npm test -- --test-name-pattern="public event fields"`

Expected: FAIL because the fields and slug generator do not exist.

- [ ] **Step 4: Extend schemas and organizer input/DTO/form types**

Add the persisted fields and indexes in `event.model.ts`; validate and serialize them through organizer create/update paths. Generate a collision-safe immutable slug from the title when an event is created. Add concise description and optional sales-window form inputs while preserving draft/published edit restrictions.

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `cd server; npm test -- --test-name-pattern="public event fields"`

Expected: PASS.

- [ ] **Step 6: Commit the model extension**

```bash
git add server/src/models server/src/modules/organizer client/src/organizer
git commit -m "feat: add public event metadata"
```

### Task 2: Add a tested read-only public events API

**Files:**
- Create: `server/src/modules/public-events/public-events.routes.ts`
- Create: `server/src/modules/public-events/public-events.controller.ts`
- Create: `server/test/public-events.test.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: Task 1 event metadata and event-seat schema.
- Produces: `GET /api/v1/events`, `GET /api/v1/events/:slug`, and `GET /api/v1/events/:eventId/seats` with `{ data: ... }` envelopes.

- [ ] **Step 1: Write failing public-route integration tests using the Task 1 harness**

Seed published, draft, cancelled, and past events plus a venue and seat inventory. Assert list visibility/sort/filtering, escaped search input, invalid date handling, detail/seat 404s, and an exact public seat key allowlist that excludes injected hold/booking/audit fields.

- [ ] **Step 2: Run the public route test file to verify it fails**

Run: `cd server; npm test -- test/public-events.test.ts`

Expected: FAIL because the router is not mounted.

- [ ] **Step 3: Implement public query parsing, DTOs, and routes**

In `public-events.controller.ts`, expose `listPublicEvents`, `getPublicEvent`, and `getPublicEventSeats` request handlers. Bound filter strings, escape regex input, parse date ranges, require future `startsAt`, require `status: "published"`, populate only venue name/address, calculate min/max prices and sale availability server-side, and sort seats by grid coordinates. In `public-events.routes.ts`, register the list route before slug and seat routes so endpoints are unambiguous, then mount it in `createApp`.

- [ ] **Step 4: Run public route tests and typecheck**

Run: `cd server; npm test -- test/public-events.test.ts; npm run typecheck`

Expected: all focused API tests PASS and TypeScript reports no errors.

- [ ] **Step 5: Commit the public API**

```bash
git add server
git commit -m "feat: add public event browsing api"
```

### Task 3: Make public routing available to guests and create the catalogue

**Files:**
- Create: `client/src/public-events/PublicEventPages.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/App.css`

**Interfaces:**
- Consumes: `GET /events` public-card DTO `{ events: PublicEventCard[] }`.
- Produces: `EventCataloguePage({ navigate })` and guest-accessible `/events` route.

- [ ] **Step 1: Write a minimal client test or pure helper test for query construction and card formatting**

If a lightweight client test runner is added, assert that empty filter values are omitted and populated `q`, `category`, `city`, `from`, and `to` values form the expected URL. Otherwise add a typed pure `buildEventQuery` helper and prove it through a compile-time-safe unit-compatible export.

- [ ] **Step 2: Run the relevant client check to verify it fails**

Run: `cd client; npm run build`

Expected: FAIL until the public feature module and route imports are implemented.

- [ ] **Step 3: Implement catalogue types, fetch state, routes, and styles**

Create the public API types and `EventCataloguePage`. Render a labelled search/filter form, loading/error/empty/success states, and semantic cards with poster fallback, accessible slug links, venue/location, localized date/time, and PKR from-price. Refactor `App` so `/events` and `/events/:slug` render before the authentication gate; add Events navigation for guests and signed-in users without affecting protected organizer routes.

- [ ] **Step 4: Run client lint and production build**

Run: `cd client; npm run lint; npm run build`

Expected: PASS.

- [ ] **Step 5: Commit the catalogue**

```bash
git add client/src/App.tsx client/src/App.css client/src/public-events
git commit -m "feat: add public event catalogue"
```

### Task 4: Build the event detail and temporary seat-selection experience

**Files:**
- Modify: `client/src/public-events/PublicEventPages.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/App.css`

**Interfaces:**
- Consumes: `GET /events/:slug` public detail DTO and `GET /events/:eventId/seats` public seat DTO.
- Produces: `PublicEventDetailPage({ slug, navigate, user })` with local `selectedSeatIds: Set<string>` state.

- [ ] **Step 1: Write a failing selection-state test or isolate a typed selection helper**

Cover available seat select/deselect, disabled `held`/`booked`/`blocked` seats, and the named eight-seat maximum. Assert the total is the sum of server-provided prices and is formatted with `Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" })`.

- [ ] **Step 2: Run the focused check to verify it fails**

Run: `cd client; npm run build`

Expected: FAIL because the detail API types and selection helper/component are absent.

- [ ] **Step 3: Implement detail fetch, responsive seat map, and selection summary**

Fetch detail and seats independently with cancellation guards. Use `gridRow`/`gridColumn` and section grouping for layout. Make every seat a descriptive button with text state and `aria-pressed`; disable unavailable states. Render selected labels/prices/count/PKR total. Route guests to `/login?returnTo=<encoded current event path>` and show authenticated users the clearly labelled next-phase placeholder only.

- [ ] **Step 4: Run client lint and production build**

Run: `cd client; npm run lint; npm run build`

Expected: PASS.

- [ ] **Step 5: Commit the detail experience**

```bash
git add client/src/App.tsx client/src/App.css client/src/public-events
git commit -m "feat: add public seat selection"
```

### Task 5: End-to-end verification and documentation update

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: all implemented routes and client pages.
- Produces: documented public endpoint inventory and verified build evidence.

- [ ] **Step 1: Document the three public endpoints and public-flow limitation**

Add the public endpoints to the API table and explicitly say that selection is local-only until the reservation phase.

- [ ] **Step 2: Run the complete automated verification suite**

Run: `cd server; npm run typecheck; npm test; cd ..\client; npm run lint; npm run build`

Expected: all commands exit 0.

- [ ] **Step 3: Manually verify the guest journey**

Start the server and client. In a browser, confirm only a published future event appears, its card opens the detail page, seat state labels are distinguishable without color, an available seat selects/deselects, the total updates correctly, a ninth selection is refused, and reload clears selection. Confirm Continue preserves the event detail URL in login return state.

- [ ] **Step 4: Commit verification-facing documentation**

```bash
git add README.md
git commit -m "docs: describe public event browsing"
```
