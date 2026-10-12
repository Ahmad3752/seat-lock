# Public event discovery and seat selection design

## Purpose

Give guests a safe public path to discover published SeatLock events, inspect an event and its venue, and temporarily select available seats. This phase deliberately stops before any server-side reservation, hold, payment, booking, or realtime behavior.

## Scope and constraints

- Preserve the completed authenticated organizer workflows.
- Public routes expose only published, non-cancelled events.
- The server remains the source of truth for event visibility, prices, and seat states.
- Client-side selections are ephemeral React state and never mutate `EventSeat` records.
- Public responses must be explicit allowlists rather than serialized database documents.

## Data model

`Event` gains the customer-facing fields that the existing model lacks:

- `slug`: a unique, URL-safe, immutable identifier generated at event creation.
- `description`: event copy shown on the detail page.
- `saleStartsAt` and `saleEndsAt`: optional dates that describe the sales window. When omitted, public availability is derived from publication through the event start time.
- `status` adds `cancelled`; public queries still require `published`, so cancelled events never appear publicly.

The current venue `address` remains the public location value. City filtering performs a bounded case-insensitive text match against that address; no unsupported city field is invented.

`EventSeat` retains its existing inventory shape. The public DTO maps `gridRow` and `gridColumn` to map coordinates and returns only seat id, label, section, row, number, coordinates, type/accessibility metadata, price, and a state. The DTO recognizes `available`, `held`, `booked`, and `blocked`, while current persisted values remain compatible with the existing schema.

## Server API

A new unauthenticated `/api/v1/events` router provides read-only endpoints:

- `GET /events`: accepts optional bounded `q`, `category`, `city`, `from`, and `to` query values. It requires published status, limits dates to upcoming events, sorts by `startsAt` ascending, and returns public-card DTOs only.
- `GET /events/:slug`: loads a published event and its venue by slug. It returns public event fields, venue name and address, derived sale availability, and min/max section-price summary.
- `GET /events/:eventId/seats`: first verifies that the event is published, then returns the public seat-map DTO ordered by grid position.

Missing, draft, cancelled, malformed, or non-public resources return the established `404 NOT_FOUND` envelope so visibility is not leaked. Invalid filter values return the established `422 VALIDATION_ERROR` envelope.

## Client experience

The existing pathname router adds public `/events` and `/events/:slug` routes before protected dashboard routing. The navigation exposes Events to both guests and signed-in users.

The catalogue owns its query state and renders loading, error, empty, and success states. Filter controls submit `q`, `category`, city text, and future date range to the public API. Cards are keyboard-accessible links with poster fallback, title, category, venue/location, date/time, and a from-price.

The detail page fetches event information and the current seat map separately. It renders a responsive grid grouped by section using server map coordinates. Every seat is an accessible button with a text state and descriptive ARIA label. Only `available` seats can be toggled locally; held, booked, and blocked seats are disabled. A named `MAX_SEAT_SELECTION` constant defaults to eight. The selection summary displays seat labels, prices, count, and a PKR-formatted total.

The page performs no write request. A browser refresh clears selection and refetches the map. Guests continue to login with a `returnTo` query for the current detail route. Authenticated users receive a plainly labelled next-phase reservation placeholder.

## Error handling and verification

Server tests cover published-only listing, filtering/search behavior, public 404 behavior for missing or unpublished events and seats, and exclusion of sensitive seat data. The test helper uses the app’s normal error envelope.

Because the client has no configured test runner, client components remain focused and strictly typed. Verification runs server typecheck and tests, client lint and production build, followed by a manual catalogue-to-seat-selection flow. No completion claim is made unless these checks produce successful output.

