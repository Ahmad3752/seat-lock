# SeatLock: Ticketwala scraper

Python `requests` collects the public paginated listing used by Ticketwala's own city page; BeautifulSoup extracts ticket prices from each public event page. Playwright is unnecessary for the verified path. This first increment supports **Ticketwala / Islamabad only**. It writes to MongoDB; React continues to read exclusively through Express.

## Run on Windows PowerShell

From the repository:

```powershell
cd C:\Projects\Seat_Lock\scraper
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

The virtual environment has already been created in this checkout. Activation is optional; using its Python executable avoids PowerShell execution-policy issues.

Inspect live data without connecting to MongoDB:

```powershell
.\.venv\Scripts\python.exe main.py --source ticketwala --dry-run --output output\ticketwala.json
```

With the project's local MongoDB replica set running, import:

```powershell
.\.venv\Scripts\python.exe main.py --source ticketwala
```

`MONGODB_URI` is read from environment variables, then `scraper/.env`. If absent, only that setting is read from `server/.env`; the API and scraper therefore use the same configured database. To override settings, copy `.env.example` to `.env` **only if you do not already have one**, and set the URI to the same local database used by the server. Do not copy secrets into the client. `NODE_ENV=production` disables ingestion for this development increment. Do not point it at a production database.

Then run your usual commands in separate terminals:

```powershell
cd C:\Projects\Seat_Lock\server
npm run dev
```

```powershell
cd C:\Projects\Seat_Lock\client
npm run dev
```

Open the client URL printed by Vite and choose **Events** (`/events`). External event titles and **View on Ticketwala** open the original event in a new tab. SeatLock events retain their internal detail/seat-selection flow. A new scrape updates MongoDB; refresh the catalogue to see it. The server need not be running during ingestion, but MongoDB must be running.

`--all` currently means Ticketwala only. `--source bookme` and other providers are intentionally unsupported until the next increment.

## Configuration

| Variable | Default / meaning |
| --- | --- |
| `MONGODB_URI` | Required for writes; fallback to `server/.env`; URI must name the database |
| `NODE_ENV` | `development`; ingestion rejects `production` |
| `SCRAPER_TIMEOUT_SECONDS` | `20` per request |
| `SCRAPER_DELAY_SECONDS` | `3`, minimum `1`; robots crawl-delay takes precedence |
| `SCRAPER_MAX_PAGES` | `25`, maximum `100`; exceeding the bound fails rather than silently truncating |
| `SCRAPER_USER_AGENT` | `SeatLockEventResearch/0.1`; use an honest identifier, optionally with your contact |

The runner logs each page and counts found/created/updated/skipped/failed, returning nonzero on failure. HTTP 401/403/429 stop immediately. Network and 5xx failures get at most three attempts with backoff. Redirects are reported for review. It checks robots rules before each source request. No login, CAPTCHA, payment, checkout or private endpoint is accessed.

## Verified source and limitations

Verified live on **19 October 2026**:

- `https://ticketwala.pk/robots.txt` returned 200 and allows public pages. It disallows account and checkout paths and several named crawlers.
- `https://ticketwala.pk/city/islamabad` is a Next.js shell that initially displays "No events found". Treating this shell as an empty listing is incorrect.
- The page's public JavaScript uses `GET /api/public/events/public?city=islamabad&present=true&page=1&perPage=6`. The adapter follows the observed `items` / `totalPages` response, without credentials.
- Public detail pages contain `[data-sentry-component="TicketItem"]` with ticket name/price `h4` elements. Parse exact price labels and preserve unknown prices as null. Zero explicitly means free. Starting prices may include specific attendee or group ticket types; availability and conditions must be checked at the provider.
- The live run found **17** listings across **3** pages. **15** were upcoming; two had already started. Counts change as the source changes. One listing's price was not exposed by the verified HTML selector and remains unknown.
- API date strings are local Pakistan wall time. Confirmed against the visible SOT Events page: 24 Oct at 11am becomes 06:00 UTC. Its schema.org `Z` timestamps disagree with visible local times, so the adapter uses the public listing's local timestamps instead.
- Categories are generally absent from the response; they remain null (displayed as "Event"). A source record explicitly marked `workshops` maps to Workshops. No inferred genres are presented as source facts.
- Poster and description reuse permission was not established. Both remain null in this increment. The client uses its existing placeholder. Only factual listing metadata is stored.
- The linked `/terms-conditions` was reviewed. It includes restrictions on automated ordering and commercial promotional sharing, and provides no general image reuse license. This local development integration does not purchase or republish ticket products. Public commercial deployment or media reuse needs a separate permission review; no deployment is included here.

Initial urllib/web probes returned 403/1010; the ordinary requests session with the honest scraper User-Agent subsequently returned 200. No anti-bot bypass was implemented. Any future blocked response will be reported rather than worked around.

The JSON snapshot from the verified run is locally available at `output/ticketwala.json` (ignored by Git). It is an inspection artifact, not a fixture automatically loaded into the application.

## Storage and API

- Explicit collection `external_events`, shared between PyMongo and the read-only Mongoose model.
- Unique `sourceKey` = `ticketwala:<source ID>`; stable even when the event slug changes. Index `(status, startAt)` supports catalogue filtering. Never writes to existing `events`, `venues`, seats, holds or bookings.
- BSON UTC dates plus `timezone`, `datePrecision`, nullable fields, original source URLs and check/seen timestamps. Successful source observations replace their own record; `$setOnInsert` preserves creation time. No deletion when a scrape fails or an event disappears.
- `scraper_runs` stores the latest result and retains `lastSuccessfulAt` across failures, when a database connection is available.
- Cross-provider matching/provenance merging is deferred until another provider is added. Repeated Ticketwala IDs are deduplicated now; no fuzzy title merging.
- Existing `GET /api/v1/events` without new query options preserves its old SeatLock-only contract.
- Catalogue uses `GET /api/v1/events?kind=all&page=1&limit=12`; `kind` accepts `all`, `external`, `seatlock`. Existing `q/category/city/from/to` filters work. Pagination returns `{data:{events,pagination:{page,limit,total,pages}}}`. Maximum limit 100 and page 1000. Date-only query filters use Pakistan calendar boundaries for this new catalogue mode.
- Own and external records are sorted/paginated together. External cards carry `kind`, `sources`, `timezone`, `currency`, `datePrecision` and nullable `priceFrom`. Source URLs are allowlisted. External IDs cannot resolve to internal event details or seat maps.
- Only events starting in the future appear; date-only events remain visible through their local day. Ongoing events are retained in storage but are not part of the upcoming catalogue.

## Tests

```powershell
cd C:\Projects\Seat_Lock\scraper
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Tests mix synthetic schema.org edge cases with minimal factual extracts from the real Ticketwala public listing and SOT ticket HTML, saved under `tests/fixtures`. They never call live websites. The full server suite tests MongoDB aggregation, filters, pagination, source links and booking isolation. Client tests cover source navigation, unknown/free prices, pagination and legacy timezone resilience.

A separate development smoke check imported the live 17-record snapshot into disposable MongoDB twice: first run created 17, second updated 17, count stayed 17. Express returned 15 upcoming records with source URLs. The user's application database was not seeded during verification.

Run the scraper manually for now. A later scheduled task can execute the same command from the scraper directory, check its exit code and prevent overlapping runs. No scheduler or recurring job is created by this change.
