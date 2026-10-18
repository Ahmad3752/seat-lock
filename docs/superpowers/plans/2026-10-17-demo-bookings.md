# Demo Bookings Implementation Plan

**Goal:** Turn active holds into clearly simulated bookings with customer history and unique references.

**Architecture:** A customer-only checkout endpoint performs an atomic, idempotent MongoDB transaction. A React checkout form submits a whole-PKR amount and a dashboard reads owner-scoped booking records. Socket.IO publishes committed inventory changes.

**Tech Stack:** TypeScript, Express, Mongoose, MongoDB transactions, React, Socket.IO.

**Spec:** docs/superpowers/specs/2026-10-17-demo-bookings-design.md

## Tasks

1. Add transaction-backed booking model and owner-only checkout/history endpoints with integration tests for races, wrong amount, expiry, ownership and retries. Disable demo checkout in production.
2. Add a labelled demo payment form to the existing held-seat summary and a customer booking history with ticket references. Test successful and failed checkout.
3. Verify live booking notifications, run full backend and frontend suites, lint and builds, and document limitations and usage.
