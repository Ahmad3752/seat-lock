# Part 5: Temporary Multi-Seat Holds — Design

## Purpose

Customers need a short opportunity to reserve a group of seats while they complete the next step of their purchase. The system must never give the same seat to two customers and must never partly reserve a requested group.

This Part deliberately stops at a temporary hold. It does not add payments, a confirmed booking, QR codes, real-time updates, or a way to recover a hold after a browser refresh.

## Agreed product decisions

- A hold lasts ten minutes by default and is configurable through environment variables.
- A customer may request one to eight seats at once.
- All requested seats are held together, or none are held.
- Prices are stored as **whole Pakistani rupees**. `2500` means Rs 2,500. Fractional prices are rejected; existing prices are not converted.
- The authenticated owner can release their active hold. A customer cannot inspect or release another customer's hold.
- A page refresh does not claim that a hold was restored. The customer sees the current public seat map instead.

## Chosen production architecture

Seat inventory and a hold record are updated inside one MongoDB transaction. This is the production-safe choice because a transaction commits every requested seat together or rolls the entire operation back.

MongoDB transactions require a replica set. Production and local Docker development will therefore run MongoDB as a single-node replica set; a standalone `mongod` is not sufficient for this Part. The automated integration tests will use an in-memory one-node replica set as well.

The existing project already represents each event seat as its own MongoDB document. The implementation keeps its established names:

- `EventSeat.status` remains the inventory state (`available`, `held`, `booked`, or `blocked`). Public responses may continue to call this value `state`.
- `EventSeat.seatKey` remains the stable venue-seat identity and existing unique key with `eventId`; it is the current project's equivalent to the blueprint's `venueSeatId`.

This avoids a risky rename or duplicate sources of truth while adding the fields necessary for safe holds.

## Data model

### EventSeat additions

Each seat gains the following fields:

- `holdId`: the current `SeatHold` id when `status` is `held`.
- `holdTokenHash`: SHA-256 hash of an internally generated cryptographically secure token. The raw token is never persisted or returned.
- `holdExpiresAt`: the time the temporary hold becomes reclaimable.
- `version`: an integer incremented whenever hold state changes, allowing clear inventory-change tracking.

The existing `(eventId, seatKey)` unique index remains. A compound index on `(eventId, status, holdExpiresAt)` makes expired-seat lookup and availability queries efficient.

### SeatHold

`SeatHold` is a new collection with:

- `eventId`, `customerId`, and requested `seatIds`.
- `status`: `active`, `expired`, `converted`, or `released`.
- `expiresAt` and `idempotencyKey`.
- `tokenHash` only; never a raw token.
- Seat snapshots (`seatId`, label, whole-rupee price), `total`, and `currency`. These preserve the exact price response for a retry even if a later organizer edit changes a seat price.

There is a unique index on `(customerId, idempotencyKey)` and an index on `(status, expiresAt)`. The idempotency key is a UUID supplied by the browser for a single reservation intent.

## Hold flow

`POST /api/v1/events/:eventId/holds` requires a signed-in customer. Its body contains non-duplicated `seatIds` and a UUID `idempotencyKey`.

Before and within the transaction, the service validates that the event exists, is published, has not started, and is currently on sale. It also confirms the customer requested one through the configured maximum number of real seats.

Inside the transaction:

1. Look up an existing hold for that customer and idempotency key. A retry returns that hold rather than creating a second hold.
2. Create a new active hold with a server-calculated expiry and a hashed random token.
3. Perform one conditional update for precisely the requested seats. Each seat must be `available`, or `held` with an expired `holdExpiresAt`. The update installs the new hold metadata and increments `version`.
4. If the exact number of requested seats was not changed, abort the transaction. The API returns `409 SEAT_UNAVAILABLE` and none of the seats change.
5. Read the held seats in the same transaction, save their snapshots and total on the hold, then commit.

The success response follows the project’s established envelope: `{ data: { hold } }`, where the hold contains only its id, status, expiry, seat labels/prices, total, and currency. It never reveals token hashes, other customers, payment data, or booking details.

An idempotency key cannot be reused with a different selection. That returns a clear conflict instead of silently associating the wrong seats with a retry.

## Release and expiry

`DELETE /api/v1/holds/:holdId` is authenticated and owner-only. Releasing an active hold uses a transaction that changes only seats whose `holdId` still matches that hold. It clears hold metadata, restores `available`, increments `version`, and marks the hold `released`. Repeating a release is safe and never releases someone else’s seats.

A small in-process worker runs every 30–60 seconds. For each active, expired hold, it transactionally frees only matching held seats and marks that hold `expired`. It never changes `booked` seats. The worker starts only after database connection succeeds and exposes a stop function so tests and server shutdown can cleanly stop it.

Expired held seats are also treated as reclaimable by the next hold transaction, so correctness does not depend on the worker running at an exact second. Public seat responses report an expired hold as effectively available, avoiding a stale “held” display while the worker waits for its next pass.

## Client experience

The public event detail page replaces the current placeholder Continue button with **Reserve seats**.

- The button is available only for an authenticated customer, an open sale, and a selection of one through eight seats.
- The browser creates one `crypto.randomUUID()` per reservation intent. A network retry uses the same key; changing the intended selection creates a new key.
- On success, the seat selection is locked, the summary uses the server-returned snapshot, and a countdown is calculated from server `expiresAt` rather than by decrementing a local number.
- The customer may release the hold. Release, conflict, and expiry clear selection and refresh the seat map.
- A `409 SEAT_UNAVAILABLE` tells the customer that another person got one of the seats and refreshes stale availability.
- The screen is deliberately honest after refresh: there is no active-hold restoration or countdown because this Part has no private hold-recovery endpoint.

## Error and privacy rules

- Invalid seat ids, duplicate ids, bad idempotency keys, and an invalid seat count return `400`.
- Missing authentication returns `401`; a non-customer role returns `403`.
- An unpublished, unsaleable, or unknown event returns `404`.
- Contention and incompatible idempotency reuse return a project-standard `409` code, including `SEAT_UNAVAILABLE` for inventory conflicts.
- Only allowlisted public seat details are returned. Hold metadata and customer identity never appear in public-event responses.

## Configuration and operations

The server will expose documented environment settings for hold duration (default 10 minutes), maximum seats (default 8), and expiry-worker interval (default 30 seconds). Values are validated at startup.

The documentation will include Docker instructions for a MongoDB single-node replica set and explain that the prior `ECONNREFUSED` error means the Docker database is not running or is not published on port 27017; it is distinct from the replica-set requirement needed for transactions.

## Verification

Backend tests will cover validation, total calculation in whole rupees, expiry, idempotency, owner-only release, and status transitions. Transactional integration tests use `MongoMemoryReplSet` and cover:

- a successful multi-seat hold;
- unavailable, booked, blocked, and unexpired-held seats;
- no partial reservation when one requested seat is unavailable;
- idempotent same-key retry and conflicting reuse;
- expiry freeing only the correct hold’s seats;
- twenty concurrent users requesting the same seat, with exactly one success and nineteen safe conflicts.

The client will be verified through lint/build plus focused tests for selection, idempotency-key lifetime, countdown expiry, conflict refresh, and release behavior. The final manual check will use a replica-set MongoDB instance, not a standalone server.
