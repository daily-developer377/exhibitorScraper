# Exhibitor Scraper

Scrapes exhibitor data from [MMI Connect](https://mmiconnect.in)'s exhibitor
catalogue and stores it in a normalized PostgreSQL database, with a trigger
endpoint to run the scrape on demand.

This covers **Task 2** of the Cavliwireless web developer brief (the
exhibitor scraper + database). It does not include Task 1 (the Hubble
landing page).

## How the scraper works

The target page (`https://mmiconnect.in/app/catalogue/exhibitors/ep-blr-2026`)
is a client-rendered SPA — there's no exhibitor data in the initial HTML. It
loads everything from an **unauthenticated GraphQL endpoint** at
`https://mmiconnect.in/graphql` (operation `getExhibitorListForGroup`),
found by inspecting the page's network traffic. The scraper calls that
endpoint directly instead of rendering the page in a browser.

- **Pagination**: the API takes `first` (page size) and `after` (a 0-indexed
  cursor pointing at the last item already fetched, `-1` meaning "from the
  start"). The scraper requests pages of 20 by default and advances
  `after += itemsReturned` each time, continuing until it has fetched the
  API's reported `totalCount` (814 exhibitors for `ep-blr-2026` at the time
  of writing).
- **Upsert on re-run**: every record is keyed on MMI's own ids (the
  exhibitor's `customer.id`, the show's `showId`, and the
  `(exhibitorId, showId)` pair), so re-running the scraper updates existing
  rows instead of duplicating them.

See [`src/lib/scraper/mmiconnect.ts`](src/lib/scraper/mmiconnect.ts) (fetches
and paginates) and [`src/lib/scraper/persist.ts`](src/lib/scraper/persist.ts)
(upserts into Postgres via Prisma).

## Project setup

### Docker Compose (preferred)

Requires Docker.

```bash
docker compose up --build
```

This starts Postgres and the app, and the app container automatically runs
`prisma migrate deploy` before starting, so the schema is created on first
boot. The app is then available at `http://localhost:3000`.

### Local (without Docker)

Requires Node.js 20+ and a Postgres database.

```bash
npm install                            # also runs `prisma generate` via postinstall
npx prisma dev -n exhibitor-scraper -d  # starts an isolated local Postgres in the background
                                         # (prints its own connection string - copy it into .env)
cp .env.example .env                    # then set DATABASE_URL to the string prisma dev printed
npm run db:deploy                       # applies the migrations in prisma/migrations
npm run dev                             # http://localhost:3000
```

> **Important:** always pass `-n <some-name>` to `prisma dev`. Without it,
> `prisma dev` uses a server named `"default"` that's shared **machine-wide**
> across every project that doesn't name its own - if you (or another
> project) already ran plain `npx prisma dev` once, this app's migrations
> would run against that same shared database. Naming it keeps this
> project's data (and anyone else's) isolated.
>
> `prisma dev` is also throwaway/local-only - it does not persist the way
> Docker Compose's volume does. Prefer Docker Compose for anything you want
> to keep around or hand off.

## How to trigger the scraper

```bash
curl -X POST http://localhost:3000/api/scrape/exhibitors
```

Optional JSON body to override the catalogue group or page size:

```bash
curl -X POST http://localhost:3000/api/scrape/exhibitors \
  -H "Content-Type: application/json" \
  -d '{"group": "ep-blr-2026", "pageSize": 20}'
```

Response:

```json
{
  "ok": true,
  "group": "ep-blr-2026",
  "durationMs": 48213,
  "exhibitorsSeen": 814,
  "showsUpserted": 2,
  "participationsUpserted": 814
}
```

Run it again any time — it's idempotent and only updates changed fields.

To verify what landed in the database:

```bash
curl http://localhost:3000/api/exhibitors?take=5
```

(`GET /api/exhibitors` is a small read-only convenience endpoint, not part
of the brief's required surface, added so the trigger → verify flow doesn't
require a separate DB client.)

## Database schema

Three tables, each scoped to one real-world concept, so no column repeats
information that belongs to a different entity:

### `exhibitors`

Company identity data — true of the company regardless of which show it's
attending.

| Column          | Type      | Notes                                   |
| --------------- | --------- | ---------------------------------------- |
| `id`            | int, PK   | MMI's own customer id (natural key)      |
| `userId`        | uuid, unique | MMI's internal user id                |
| `companyName`   | text      |                                          |
| `country`       | text?     |                                          |
| `squareLogoUrl` | text?     |                                          |
| `createdAt` / `updatedAt` | timestamp | bookkeeping                   |

### `shows`

One row per trade show / exhibition event (e.g. "electronica India -
Bangalore").

| Column      | Type    | Notes                              |
| ----------- | ------- | ----------------------------------- |
| `id`        | int, PK | MMI's own show id (natural key)     |
| `showName`  | text    |                                      |
| `startDate` / `endDate` | timestamp |                         |
| `createdAt` / `updatedAt` | timestamp | bookkeeping                |

### `exhibitor_participations`

Junction table: one row per `(exhibitor, show)` pairing.

| Column          | Type      | Notes                                         |
| --------------- | --------- | ----------------------------------------------- |
| `id`            | serial, PK |                                                 |
| `exhibitorId`   | int, FK → `exhibitors.id` |                                 |
| `showId`        | int, FK → `shows.id`      |                                 |
| `groupCode`     | text      | the MMI catalogue group this was scraped from, e.g. `ep-blr-2026` |
| `boothNo` / `hallNo` | text? |                                                 |
| `exhibitorType` / `sponsorship` | text? |                                     |
| `scrapedAt` / `updatedAt` | timestamp | bookkeeping                          |

Unique constraint on `(exhibitorId, showId)` — this is the upsert key that
makes re-running the scraper safe.

### Why this is 3NF

- **1NF**: every column holds a single atomic value; no repeating groups.
- **2NF**: `exhibitor_participations` has a composite natural key of
  `(exhibitorId, showId)` (enforced as a unique constraint; a surrogate `id`
  is used as the actual PK purely for a simpler FK/ORM story). Every
  non-key column on that table — `boothNo`, `hallNo`, `exhibitorType`,
  `sponsorship` — depends on the *whole* pair, not on just the exhibitor or
  just the show, so there's no partial dependency.
- **3NF**: nothing depends transitively on a non-key attribute. The
  tell-tale smell this schema avoids: if `showName`/`startDate`/`endDate`
  were stored directly on each exhibitor (or participation) row instead of
  in their own `shows` table, they'd be functionally determined by
  `showId`, not by the row's own key — a transitive dependency, and the
  classic source of update anomalies (update one exhibitor's show dates,
  forget the other 400 exhibitors at the same show). Pulling `shows` out
  into its own table with `showId` as its key removes that dependency. Same
  reasoning separates `exhibitors` (company identity) from
  `exhibitor_participations` (per-event facts like booth number): booth
  number depends on *which show*, so it cannot live on the company's own
  row without becoming stale the moment a company exhibits at a second
  show.

**Known limitation / extension point**: the source API also exposes a
richer per-exhibitor detail query (company profile, address, phone,
website, social links, product categories) via a second GraphQL operation
(`getExibitorDetailsForGroup`) that requires one request *per exhibitor*.
The scraper currently only calls the list endpoint (one request per page of
20), which is what the brief's target URL returns. Capturing the detail
fields would mean ~800 additional requests per run and a few more
normalized tables (`addresses`, `exhibitor_categories`, etc.) — left out
here to keep the scrape fast and polite to the source site, but the schema
is structured so adding them later is additive, not a redesign.

## Project structure

```
prisma/schema.prisma              # schema (source of truth for the 3 tables above)
prisma/migrations/                # SQL migrations
src/lib/scraper/mmiconnect.ts     # fetches + paginates the MMI Connect GraphQL API
src/lib/scraper/persist.ts        # upserts scraped data into Postgres
src/lib/prisma.ts                 # Prisma Client singleton (pg driver adapter)
src/app/api/scrape/exhibitors/    # POST trigger endpoint
src/app/api/exhibitors/           # GET read-back endpoint (convenience, see above)
```

## Stack

Next.js 16 (App Router, Route Handlers) + TypeScript, Prisma 7 (with the
`@prisma/adapter-pg` driver adapter) + PostgreSQL 16, Docker Compose.

## Demo

A screen recording is included with this submission (sent separately),
showing: the app starting up, the scrape triggered via
`POST /api/scrape/exhibitors`, the scraped rows verified via
`GET /api/exhibitors`, and a second scrape run proving the upsert is
idempotent (no duplicate rows on re-run).
