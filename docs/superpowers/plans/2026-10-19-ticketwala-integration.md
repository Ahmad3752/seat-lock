# Ticketwala integration implementation plan

Goal: run a Python scraper and expose its stored external events in the existing SeatLock catalogue with original-source links.

Spec: ../specs/2026-10-19-external-event-discovery-design.md

The user has approved the design and explicitly requested implementation in the existing project, one source at a time. Implement inline in this checkout so their normal server/client commands see the changes. Other source adapters are deferred. Live requests currently return 403/error 1010, including robots.txt; do not bypass this block. Ticketwala extraction remains unverified until a permitted live run succeeds. A generic schema.org Event parser can be fixture-tested without inventing Ticketwala CSS selectors.

- [x] Python: add tests for structured Event parsing, missing values, dates, URLs, prices, canonical identity and Mongo upserts; run red then implement. Add requests/BeautifulSoup runner with robots checks, timeouts, rate limiting, retry, dry-run, source status and safe logging. Store only external_events and scraper_runs. No production writes.
- [x] Express: test external catalogue retrieval, filters, pagination and booking isolation; run red then add read-only model/query integration. Preserve legacy own-event response when no new query options are requested; combined requests use kind=all and paginated results.
- [x] React: test source links and unknown prices; run red then add external cards and combined pagination to existing catalogue. External event titles and source buttons open the original URL. Own-event links remain internal.
- [x] Verify Python suite, server tests/typecheck, client tests/build/lint. Run live dry-run and report access failures separately. Document PowerShell setup, variables, and exact limitation; do not seed fabricated listings.

Review focus: unknown price must not mean free; date-only listings must not show midnight; blocked/empty/unrecognized pages must not count as success; retries never bypass 403; duplicate source URLs must not create repeated listings.

Progress: live Python requests outside the network sandbox reach both Ticketwala domains and receive HTTP 403/error 1010. No source permissions or live DOM could be verified. Continue independently testable ingestion and display work; live extraction is explicitly pending.

Final progress (supersedes initial probe): ordinary requests with the honest SeatLock user agent returned 200 for robots, terms, city page, public listing and event details. City page JavaScript revealed the public /api/public/events/public listing with items/totalPages. Verified 3 pages / 17 real events; 15 future events. BeautifulSoup extracts prices from observed TicketItem HTML. Local API timestamps match visible event times; schema.org Z dates do not, so provider normalization uses public API wall time. No Playwright needed. No copied descriptions/images; category unknown where absent.

Verification: Python 12 tests; server 65 tests and typecheck; client build/lint and serial tests. Independent reviewer found legacy slug fallback, invalid stored timezone, and local-calendar query boundary defects; all reproduced and fixed with regression tests. Disposable-database smoke: actual snapshot created17 then updated17, count stayed17; Express returned15 future records with source links. User's database was not seeded.

Rulings: use a feature branch in the existing directory to satisfy the user's normal npm run dev workflow; no worktree relocation. User repeatedly authorized implementation, so do not request further planning approvals. Cross-source merging and adapters deferred until the user tests Ticketwala. Source links open directly from catalogue rather than introducing an unnecessary external detail route in this first increment.
