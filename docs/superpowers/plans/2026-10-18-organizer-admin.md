# Organizer and Admin Management Plan

**Goal:** Give organizers scoped event reports and admins platform-wide support and role management.

**Architecture:** Management endpoints check current database roles and event ownership; organizer event reports derive seat state and confirmed simulated booking summaries from MongoDB. Admin-only endpoints list users, events and bookings, audit role changes and cancel events safely. React pages consume those endpoints.

**Tech Stack:** TypeScript, Express, Mongoose, MongoDB, React.

**Spec:** docs/superpowers/specs/2026-10-18-organizer-admin-design.md

## Tasks

1. Test and implement current-role authorization and organizer event reporting; commit verified server changes.
2. Test and implement admin summaries, user and organizer access, audit trail and cancellation; commit verified server changes.
3. Test and implement organizer and admin management pages and organizer purchasing; commit verified client changes.
4. Run full tests, lint and builds; document simulated totals and cancellation limitations.
