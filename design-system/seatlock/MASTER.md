# SeatLock visual system

The user chose charcoal and coral for a professional, entertainment-focused identity. UI/UX Pro Max's verified ticketing guidance informs semantic seat states and its minimal style guidance informs readable composition. The product is a multi-event catalogue and booking app, so conference-specific agenda/speaker recommendations do not apply.

## Source of truth
Color tokens: `client/src/index.css`. Shared components and breakpoints: `client/src/App.css`.

| Token | Value | Use |
| --- | --- | --- |
| Charcoal | #242227 | Header, discovery banner, sign-in story |
| Coral | #ff826e | Brand mark, hero emphasis, dark-background actions |
| Primary | #b93829 | Buttons with white labels |
| Primary ink | #a22e21 | Links and small accent text on light surfaces |
| Canvas | #f7f6f3 | Warm off-white page background |
| Surface | #ffffff | Cards, forms, tables |
| Ink | #252427 | Main text |
| Muted | #66616a | Secondary text |
| Success | #226543 / #e9f4ed | Available seats, published/confirmed statuses |
| Warning | #83550a / #fff4d9 | Holds and draft status |
| Danger | #b12e32 / #fff0ef | Errors, destructive actions, blocked seats |

## Typography and layout
Use the local Segoe UI / Helvetica Neue / Arial sans-serif stack; no remote font dependency. Body text uses comfortable line height, headings use deliberate size/weight/spacing, and amounts use tabular figures. A 1200px maximum content width adapts to 32px desktop and 16px phone gutters. Catalogue: three columns on desktop, two on tablet, one on phones. Forms use one or two columns according to width.

## Components
One outline SVG icon style. White cards with subtle borders and restrained shadows. Primary actions use the darker coral token for contrast; secondary actions use neutral outlined buttons. Errors include text and status color. Seat selection adds both an outline and explicit Selected text. Large seat maps and tables scroll within focusable containers.

## Accessibility and content
Retain visible labels, strong keyboard focus, reduced-motion support, authentic event/provider data, unknown-versus-free pricing, and demo-payment disclosures. Do not invent statistics, testimonials, venue orientation, or availability. Prefer wrapping long labels and descriptions. Decorative ticket artwork is hidden from assistive technology.
