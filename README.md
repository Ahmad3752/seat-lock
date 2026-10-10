# SeatLock

A TypeScript MERN project for concurrency-safe reserved-seat ticketing. This repository currently completes the project foundation and account authentication phases.

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
| `GET` | `/api/health` | API health check |

## Design notes

- The `User` model normalizes unique email addresses and stores bcrypt password hashes—not passwords.
- Access tokens are signed JWTs with a short expiry. Refresh tokens are random, hashed before storage, rotated on use, and delivered only in an HttpOnly cookie.
- The API sends consistent errors: `{ "error": { "code", "message", "details?" } }`.
- `requireAuth` and `requireRole` are reusable server middleware for later event, venue, seat-hold, and organizer routes.
