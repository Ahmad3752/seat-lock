# SeatLock

A TypeScript MERN project for concurrency-safe reserved-seat ticketing. This repository currently completes the project foundation, account authentication, and role-based dashboard phases.

## Run locally

1. Create `server/.env` from [`server/.env.example`](server/.env.example) and set a MongoDB connection string plus a long random JWT secret.
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
| `GET` | `/api/health` | API health check |

## Design notes

- The `User` model normalizes unique email addresses and stores bcrypt password hashes—not passwords.
- Access tokens are signed JWTs with a short expiry. Refresh tokens are random, hashed before storage, rotated on use, and delivered only in an HttpOnly cookie.
- The API sends consistent errors: `{ "error": { "code", "message", "details?" } }`.
- `requireAuth` establishes identity; `requireRole` enforces authorization. `assertOrganizerOwnership` is ready for the venue/event controllers in the next phase, where it will restrict organizers to records with their own `organizerId` (admins may moderate all records).
- Self-registration deliberately creates only customer accounts. Promote trusted accounts to `organizer` or `admin` directly in the database until the admin user-management UI is built.
- In development only, the server creates demo accounts at startup: usernames `organizer` and `admin`, both using password `12345678`. The sign-in screen exposes buttons for them. These accounts are disabled in production.
- Creating an event copies every venue seat into its own `EventSeat` document. A unique `eventId + seatKey` index keeps one independent inventory record per seat per event, ready for holding and booking in Part 5.
- Public event selection is temporary browser state only in this phase. It never reserves, holds, books, or pays for a seat; reservation begins in the next phase.
