# SeatLock

A TypeScript MERN project for concurrency-safe reserved-seat ticketing, including public event discovery and temporary seat holds.

## Run locally

1. Start a MongoDB replica set as described below. Create `server/.env` from [`server/.env.example`](server/.env.example) and set a long random JWT secret.
2. Start the API:

   ```powershell
   cd server
   npm run dev
   ```

3. In another terminal, start the React client:

   ```powershell
   cd client
   npm run dev
   ```

Vite forwards `/api` requests to the local API on port `5000` during development. The sign-up/sign-in screen is available at the client URL printed by Vite.

## MongoDB for seat holds

MongoDB transactions require a replica set; a standalone MongoDB container cannot run this feature. The provided Compose setup uses a separate volume and port `27018`, so it does not overwrite your existing MongoDB container or data:

```powershell
docker compose up -d
docker compose exec mongo mongosh --port 27018 --quiet --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27018'}]})"
```

Run the second command once after creating the volume. An `already initialized` message on later runs is harmless. Set `MONGODB_URI=mongodb://127.0.0.1:27018/seatlock?replicaSet=rs0&directConnection=true` in `server/.env`. This new volume starts with an empty database; existing events in another container are not copied automatically. Do not delete the old volume if you need its data.

If you see `ECONNREFUSED`, check that Docker Desktop and the container are running and that the port matches your URI. If MongoDB connects but reports transactions are unsupported, check that the replica set has been initialized. `HOLD_DURATION_MINUTES`, `MAX_SEATS_PER_HOLD`, and `HOLD_EXPIRY_WORKER_INTERVAL_MS` configure the default ten-minute hold, eight-seat limit, and 30-second cleanup interval.

## Current API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Register a customer and create a session |
| `POST` | `/api/v1/auth/login` | Sign in and create a session |
| `POST` | `/api/v1/auth/refresh` | Rotate a valid refresh session and issue a new access token |
| `POST` | `/api/v1/auth/logout` | Revoke the current refresh session (requires access token) |
| `GET` | `/api/v1/auth/me` | Read the signed-in user (requires access token) |
| `GET` | `/api/v1/dashboard/customer` | Customer booking dashboard (customer or organizer) |
| `GET` | `/api/v1/dashboard/organizer` | Organizer dashboard (organizer or admin) |
| `GET` | `/api/v1/dashboard/admin` | Platform moderation dashboard (admin only) |
| `POST` | `/api/v1/organizer/venues` | Create an organizer-owned venue and generated seat grid |
| `GET` | `/api/v1/organizer/venues` | List the organizer's venues |
| `POST` | `/api/v1/organizer/events` | Create a draft event and its independent event-seat inventory |
| `GET` | `/api/v1/organizer/events` | List the organizer's events |
| `PATCH` | `/api/v1/organizer/events/:eventId` | Edit a draft event |
| `POST` | `/api/v1/organizer/events/:eventId/publish` | Publish a complete draft event |
| `GET` | `/api/v1/events` | Browse upcoming published events with optional search, category, city, and date filters |
| `GET` | `/api/v1/events/:slug` | Read one upcoming published event and its public pricing and venue details |
| `GET` | `/api/v1/events/:eventId/seats` | Read the current public seat map for one upcoming published event |
| `POST` | `/api/v1/events/:eventId/holds` | Atomically hold selected seats for an authenticated customer |
| `DELETE` | `/api/v1/holds/:holdId` | Release the customer's own hold |
| `GET` | `/api/health` | API health check |

## Design notes

- The `User` model normalizes unique email addresses and stores bcrypt password hashes—not passwords.
- Access tokens are signed JWTs with a short expiry. Refresh tokens are random, hashed before storage, rotated on use, and delivered only in an HttpOnly cookie.
- The API sends consistent errors: `{ "error": { "code", "message", "details?" } }`.
- `requireAuth` establishes identity; `requireRole` enforces authorization. `assertOrganizerOwnership` is ready for the venue/event controllers in the next phase, where it will restrict organizers to records with their own `organizerId` (admins may moderate all records).
- Self-registration deliberately creates only customer accounts. Promote trusted accounts to `organizer` or `admin` directly in the database until the admin user-management UI is built.
- In development only, the server creates demo accounts at startup: usernames `organizer` and `admin`, both using password `12345678`. The sign-in screen exposes buttons for them. These accounts are disabled in production.
- Creating an event copies every venue seat into its own `EventSeat` document. A unique `eventId + seatKey` index keeps one independent inventory record per seat per event, ready for holding and booking in Part 5.
- Selecting seats is browser-only until the customer clicks Reserve seats. A MongoDB transaction then holds the full selection for ten minutes or holds none. Expired holds are released automatically. Holds are not bookings or payments, and refreshing the page does not restore a hold summary.
- Ticket prices are non-negative whole Pakistani rupees; `2500` means Rs 2,500.
- Event pages use Socket.IO rooms for live seat-map updates after committed holds, releases, and expiry. Reconnecting clients rejoin and reload the authoritative seat map; Socket.IO never replaces the database's concurrency checks. Booking is not yet implemented. The built-in broadcaster is intended for one API process; multiple API instances need a shared Socket.IO adapter.
