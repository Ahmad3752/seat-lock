# SeatLock visual refresh

## Intent and scope
Make the existing React/Vite booking application look polished, coherent, and credible across the public catalogue, event/seat selection, sign-in, customer bookings, organizer workspaces, forms, reports, and admin screens. Use the requested UI/UX Pro Max skill. This is a presentation refresh using existing features and API contracts.

## Approaches
- Blue/navy and white: a restrained business-oriented platform; recommended initially for clarity.
- Charcoal and coral: a warmer entertainment identity while retaining readable, practical booking screens. **Chosen by the user.**
- A new component framework or application rewrite: unnecessary for this visual refresh; retain React and existing CSS.

## Proposed design
- Charcoal navigation and discovery banner, warm off-white canvas, white content surfaces, and coral primary actions. Use a darker coral on small text/buttons when required for readable contrast.
- Consistent sans-serif typography, comfortable line height, clear heading hierarchy, and a shared spacing/radius scale.
- Image-first event cards with category, date/location, price, and original-provider links clearly distinguished. Preserve real event information and source validation.
- Shared polished inputs, buttons, status badges, empty/error/loading states, tables, and responsive layouts across roles.
- Seat availability retains explicit labels and separate semantic colors. Selection, holds, expiry, demo-payment disclosures, role boundaries, and API behavior stay intact.
- Clear keyboard focus, reduced-motion support, readable foreground/background pairs, and no page-level horizontal overflow at phone widths. Large seat maps and data tables may scroll inside their containers.
- No invented events, availability statistics, testimonials, or payment claims. Avoid decorative clutter and unnecessary animation.

## Constraints and validation
Existing uncommitted changes, including public-event provider work, must be preserved. Prefer shared styling and small markup improvements; do not introduce a UI dependency just for the restyle. Validate with the existing client tests, production build, lint, and rendered desktop/mobile checks when browser access is available.

## Builder decisions
Exact token values, icon treatment, component spacing, and responsive breakpoints are implementation choices, guided by the chosen palette and accessibility checks. No new user-facing feature or backend change is required.
