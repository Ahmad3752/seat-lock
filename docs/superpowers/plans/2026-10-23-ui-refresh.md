# SeatLock UI Refresh Implementation Plan

> **For agentic workers:** Use native execution in this chat. The user approved charcoal/coral and explicitly delegated remaining design decisions.

**Goal:** Refresh all existing SeatLock screens with a consistent professional event-booking identity.
**Architecture:** Keep React, existing routes, API calls, state, and source-validation behavior. Replace the shared stylesheet with semantic tokens and responsive component styles; make scoped markup improvements for navigation, event discovery, authentication, and management presentation.
**Tech Stack:** React 19, TypeScript, Vite, plain CSS, Vitest.
**Spec:** ../specs/2026-10-23-ui-refresh-design.md

## Global constraints
- Preserve uncommitted provider/catalogue changes and all booking/security semantics.
- Charcoal/coral palette, readable warm light surfaces, no new UI dependencies.
- Keep demo-payment disclosures, real event data, labels, and validation intact.
- Work in the existing checkout so the user's current provider changes are included; leave changes uncommitted for review.

## Tasks
1. Establish design tokens, shared controls, typography, responsive spacing, focus/reduced-motion styles, and table/seat/status styles in client/src/index.css and client/src/App.css.
2. Improve shell navigation, authentication presentation, and event catalogue hierarchy/cards with small React markup changes. Use a local SVG icon component; no new package required. Preserve all handler/API behavior.
3. Apply consistent presentation to booking history, organizer/admin overview and reports; give data and actions a readable structure.
4. Validate existing tests, build, lint, and rendered mobile/desktop screens. Cover real-data/error/empty states; inspect keyboard focus, contrast, long titles, and local scrolling for tables and seat maps.

## Review focus
- Existing external sources and unlisted/free prices retain correct labels and links.
- Long titles/addresses and mobile date filters wrap without page overflow.
- Seat states remain labeled and selected seats remain distinguishable.
- All controls have accessible names and visible keyboard focus.
- No invented statistics; empty/error/loading states and demo disclosures remain clear.

## Progress
- Baseline: existing client tests passed (5 files, 11 tests).
- Skill search: ticketing result verified; retain its semantic seat colors. Initial conference structure was too specific and was not persisted. Use minimal readable layouts from the narrower search and the user's chosen charcoal/coral palette.
- Verification strategy: existing behavioral tests plus build/lint and browser checks; no implementation-mirroring tests for cosmetic styling.
- Shared tokens, shell, authentication, catalogue, bookings, reports, and admin presentation implemented. Existing provider validation is intact.
- Build and lint pass. The concurrent build/lint/test run caused timing-related test failures; the unchanged suite passed all 11 tests with `--maxWorkers=1`, and the seat-hold file separately passed all 4 tests.
- Browser verified the real populated catalogue, mobile search/date fields, desktop/mobile sign-in, organizer dashboard, and report. At a 375px viewport, page width stayed within the viewport and the attendee table scrolled inside its container.
- Also verified admin tables, the long-input event form in portrait/landscape, keyboard focus, empty search results, and clearing filters to restore real listings. Demo sessions were signed out after inspection.
- Read-only independent review: no important issues. Improved the optional landmark note by moving header/footer outside the main content landmark. Existing provider/backend work remains outside the visual review.
- Contrast check: normal text/button/status combinations measured 5.74:1 or better; strengthened input borders to 3.07:1 and available-seat outlines for non-text contrast.
