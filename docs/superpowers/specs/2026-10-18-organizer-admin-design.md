# Organizer and platform administration

Organizers see per-event seat counts and confirmed demo bookings only for events they own. Admins can see all events, users and bookings, summaries, cancel events and grant/revoke organizer access. Sales shown are simulated totals, never money actually collected. No pending hold is shown as an attendee.

All management routes validate the current database role; stale tokens cannot retain revoked organizer privileges. Only admins can change roles, and only between customer and organizer; administrators cannot be created, changed or removed through this UI. Event ownership is enforced server-side. Role-change actions are recorded with actor, target, old/new role and timestamp. Admin cancellation is explicitly marked as a moderation action, preserves bookings, does not imply refunds or payment handling, and must prevent checkout and republishing after cancellation. Regular signup remains customer-only.

The organizer may browse/book as a customer using the existing hold and booking workflows. Aggregates count expired holds as available. Expose attendee names/emails only for authorized event and platform management, never publicly. Test ownership, role denial/revocation, summaries, attendee data, cancellation, real-time booking safety and registration.
