# Demo checkout and confirmed bookings

Customers enter the exact whole-PKR total of their own active hold to simulate checkout. This is not payment verification: no funds are charged. Clearly label checkout, bookings and tickets as demo and disable demo confirmation in production. No Stripe or webhook is implemented.

A transaction verifies ownership, active status, expiry, the server-stored total, and every seat's current hold ID. It atomically converts the hold, marks all seats booked and creates one booking with a unique random ticket reference, server-stored seat and event snapshots, and simulated payment status. The hold ID uniquely identifies a booking; retrying after a lost response returns the original booking only to the owner. Release and expiry must never free booked seats. Notify the event room only after commit. Customers can access their own booking history after refreshing or logging in again. A reference is provided rather than a QR scanner; it is not proof of payment or an admission security mechanism.

Tests cover wrong amount, unauthorized or expired holds, replay, conflicting/concurrent operations, owner-only history, production guard, socket notification and browser checkout. Preserve MongoDB as the source of truth and do not change the existing database.
