# Part 6: Real-time seat-map updates

## Goal
Viewers of an event see seat availability change after holds, releases and expiry without reloading. MongoDB remains authoritative; Socket.IO notifies clients to refetch the existing public seat-map endpoint. Booking does not yet exist, so expose a reusable notification function for a future booking implementation rather than pretending bookings are implemented.

## Design
The API attaches Socket.IO to its HTTP server. A client joins one validated event-ID room; notifications contain only that event ID and no customer or hold information. Emit only after a transaction commits and changes inventory. The client joins on every connection, resynchronizes after joining and after notifications, and leaves/disconnects on unmount. Existing request cancellation keeps older responses from replacing newer ones. Expired holds notify on worker cleanup; the existing endpoint already computes expiry correctly.

Allow Socket.IO's normal reconnect and polling fallback, with Vite proxying the Socket.IO path. Display a non-blocking connection warning when disconnected. The database's conditional transactional updates remain the final concurrency authority. A single Node process is assumed; multiple server instances would require a shared Socket.IO adapter later.

## Verification
Test room isolation, invalid subscriptions, reconnect and refetch, committed hold/release/expiry notifications, and no broadcast for failed or duplicate actions. Run server and client suites, type checks, lint and builds. No new booking or payment flow is in scope.
