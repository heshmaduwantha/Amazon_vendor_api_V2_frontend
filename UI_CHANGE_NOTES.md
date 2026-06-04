# UI Change Notes — Horizon "Amazon API Performance Dashboard" re-skin

> **Phase 2 update (branch `ui-change`)** — Stop/cancel, weekly schedule widget,
> running-period banner, and responsiveness were added on top of the original
> re-skin. See the "Phase 2" section at the bottom for details. The original
> re-skin notes (below) describe the first pass on branch `ui_change`.

Branch: **`ui_change`** (off `main`) in `Amazon_vendor_api_V2_frontend`.
All work is **frontend-only**. Nothing was pushed, merged, or PR'd. The backend
(`Amazon_vendor_api_V2_backend`) and its `main` branch were **not touched**.

Theme delivered: **dark navy sidebar + light white content**, Horizon brand cyan
accent, semantic status colors kept meaningful (green / amber / red). All colors
are centralized as CSS variables in `src/styles.scss` — no per-component hex.

---

## 1. Mockup element → real file / handler mapping

The re-skin matched the look of `horizon-amazon-api-dashboard.html` (the static
design reference that lives at the frontend root — note the brief called it
`design/horizon-dashboard-mockup.html`, but the actual file shipped under that
name). The mockup was used as a **reference only**; it was not imported.

| Mockup element | Wired to (real code) |
| --- | --- |
| Sidebar brand + logo + nav | `core/layout/main-layout/main-layout.component.*` |
| "Dashboard" nav (active) | `routerLink="/dashboard"` → `app.routes.ts` |
| "Settings" nav | Visual placeholder only (no route exists — see "Needs your decision") |
| Top strip "Today" | `dashboard.component.ts` `todayStr` |
| Header title / breadcrumb | static text in `dashboard.component.html` |
| "SP-API OK" badge | `health.apiHealth.status` (from `/sync/health` poll, 15s) |
| "OPERATIONAL / SYNCING" badge | `combined.sales.isSyncing` (from `/sync/status` poll, 5s) |
| **Fetch Tally** button + date range | `(click)="onFetchTally()"`, `[(ngModel)]="tallyStartDate/tallyEndDate"` → `DashboardService.getSalesSummary()` / `getInventorySnapshot()` / `getSalesByAsin()` |
| Reset (↺) icon button | `(click)="onResetTallyDates()"` |
| Tally results table / KPI strip / inventory snapshot | real `salesTally` / `inventoryTally` data |
| **Sales Report** card (meta + 8-step pipeline + Run) | `<app-sync-timeline>` fed by `buildSyncReportMeta(combined.sales,…)` + `salesPipeline` (`DashboardService.buildPipeline`) |
| **Run Sales Report** button | `(runSync)="onSyncSalesNow()"` → `DashboardService.triggerSalesSync()` (`POST /sync/manual/sales`) |
| 8-step pipeline (REQUEST→…→DONE) | `salesPipeline` from `combined.sales.currentStage` + `stageTimestamps` (real timestamps) |
| Inventory card | **slim under-construction placeholder** — no pipeline, no Run, no data fetch |
| API Quota Health rows | `health.rateLimiters.*` + `health.quotaGroups` (live `/sync/health`) |
| Rate Limiter Telemetry chart + flags | `chartData`/`chartOptions` in `dashboard.component.ts` (same as before, recolored) |

**Business Analytics / Power BI card:** intentionally omitted. It does not exist
in this Angular app and none was added. No Power BI embed, backend call, or
polling was created for it.

---

## 2. Files changed (all under `Amazon_vendor_api_V2_frontend/`)

- `src/styles.scss` — Horizon palette as CSS variables, Archivo/IBM Plex Sans/JetBrains Mono fonts, PrimeNG tag/button overrides, `prefers-reduced-motion` guard.
- `src/index.html` — title → "Amazon API Performance Dashboard…", theme `lara-dark-blue.css` → `lara-light-blue.css`, removed `class="bg-black"`.
- `src/app/core/layout/main-layout/main-layout.component.ts` — dropped `p-menu`/`MenuItem`; now uses `RouterLink`/`RouterLinkActive`.
- `src/app/core/layout/main-layout/main-layout.component.html` — navy sidebar, Horizon logo SVG, "Main" label, Dashboard + Settings only (Sales/Inventory removed).
- `src/app/core/layout/main-layout/main-layout.component.scss` — navy gradient sidebar + light content grid, responsive collapse.
- `src/app/core/layout/main-layout/main-layout.component.spec.ts` — added `provideRouter([])` (required now that the template uses `routerLink`).
- `src/app/features/dashboard/dashboard.component.html` — relaid out to the mockup; **every existing binding/handler preserved**.
- `src/app/features/dashboard/dashboard.component.scss` — full light-theme rewrite; staggered card load-in, pulsing status dots, button hover lift.
- `src/app/features/dashboard/dashboard.component.ts` — **only** `initChart()` colors changed (cyan dashed limit / green rate) to match the light theme. No logic/polling/handler changes.
- `src/app/features/dashboard/components/sync-timeline/sync-timeline.component.scss` — light-theme pipeline (green = completed, cyan = in-progress with pulse ring, grey-dashed = pending, red = error), button hover lift. Component TS/HTML untouched.
- `design/ui_change-dashboard.png` — screenshot (see §5).

> Animations use CSS only and are disabled under `prefers-reduced-motion`. They
> don't block clicks (decorative `::after`/rings are `pointer-events:none` or
> transform-only).

---

## 3. Functionality wiring (Step 3) — what stayed the same

No business logic, API calls, polling intervals, the rate limiter, or routing
were rewritten. I only restyled markup and re-bound it to the **same** existing
handlers/state:

- `onFetchTally()`, `onResetTallyDates()`, `onSyncSalesNow()` — unchanged.
- `DashboardService` (polling at 5s/15s, all HTTP endpoints) — unchanged.
- `sync-timeline.component.ts/html` — unchanged (only its SCSS was re-skinned).
- The `app-sync-timeline` `@Input`/`@Output` contract for the Sales card — unchanged.

Verified live against the **real running backend** on `:3000`: the dashboard
rendered fully, quota groups + telemetry showed live data, and the Sales pipeline
correctly reflected the backend's real state (it was `FAILED` at capture time, so
the red error banner + pending nodes are real, not mocked — confirming the wiring).

---

## 4. Build / lint / test results

- **Build:** `npm run build` → ✅ success, **0 errors / 0 warnings**.
- **Unit tests:** `npx ng test --watch=false --browsers=ChromeHeadless` → **3 pass, 1 fail**.
  - The 1 failure is **pre-existing and unrelated**: `AppComponent > should render title`
    expects `'Hello, frontend'` in an `<h1>`, but `app.component.html` has only
    `<router-outlet>`. This is leftover `ng new` boilerplate that never matched this
    app's template (confirmed identical on `main`). I did **not** touch `app.component`
    or its spec, and did **not** weaken/delete the test. See "Needs your decision".
  - My new `main-layout` spec (with the `provideRouter` fix) **passes**.
- **Lint:** the frontend has **no** lint script / ESLint config (`package.json` has only
  `ng`, `start`, `build`, `watch`, `test`). Nothing to run. (The backend has ESLint but
  was out of scope.)

---

## 5. Screenshot

`design/ui_change-dashboard.png` — full dashboard captured via headless Chrome
against the live backend at `http://localhost:4200/dashboard`. Shows: navy
sidebar + logo, light content, header/breadcrumb/badges, tally empty state,
Sales Report card (real FAILED state), slim Inventory placeholder, Quota Health
and Rate Limiter Telemetry.

---

## 6. How to run the app

**Frontend** (this repo):
```bash
cd Amazon_vendor_api_V2_frontend
npm install            # if needed
npm start              # → http://localhost:4200  (ng serve, watch mode)
npm run build          # production-style build into dist/
npx ng test --watch=false --browsers=ChromeHeadless   # unit tests
```

**Backend** (separate repo, needed for live data — already running on :3000 during this session):
```bash
cd Amazon_vendor_api_V2_backend
npm install
npm run start:dev      # → http://localhost:3000  (needs .env + database)
```

The frontend reads the API base URL from `src/environments/environment*.ts`
(`apiUrl: 'http://localhost:3000'`). The dashboard only renders its body once
`/sync/health` responds, so the backend must be up to see content.

---

## 7. Needs your decision

1. **Settings nav has no route.** The app only routes `/dashboard`. To avoid a
   console "Cannot match any routes" error, "Settings" is rendered as a non-navigating
   visual placeholder (matching the mockup, whose links are inert). Do you want a real
   Settings page + route added? (Out of scope for a pure re-skin, so I left it.)

2. **Pre-existing failing test** `AppComponent > should render title` (boilerplate,
   expects `'Hello, frontend'`). I left it untouched per "don't weaken/delete tests."
   Decide whether to delete/rewrite this stale boilerplate spec.

3. **Mockup file name/location mismatch.** The brief referenced
   `design/horizon-dashboard-mockup.html`; the actual reference shipped as
   `Amazon_vendor_api_V2_frontend/horizon-amazon-api-dashboard.html`. I used the
   existing file and left it in place (it is still untracked in git).

4. **Repo layout.** The outer folder is **not** a git repo; `Amazon_vendor_api_V2_frontend`
   and `Amazon_vendor_api_V2_backend` are two **separate** repos. I created `ui_change`
   only in the frontend (all UI work lives there). No backend branch was created.

5. **Pre-existing uncommitted env changes** (`src/environments/environment.ts`,
   `environment.development.ts`) existed on `main` before I started and were carried onto
   `ui_change`. I did **not** commit or modify them (env/config is out of scope). They
   remain as working-tree changes for you to handle.

6. **KPI summary strip** (Shipped Revenue / Units / COGS) was retained from the existing
   app and shown inside the Tally results — this is real tally data, **not** the omitted
   Power BI/Business Analytics card. Confirm you're happy keeping it.

---

# Phase 2 — Stop/Cancel, Weekly Schedule Widget, Running Banner, Responsiveness

Branch: **`ui-change`** in BOTH repos (frontend `Amazon_vendor_api_V2_frontend`
and backend `Amazon_vendor_api_V2_backend`), each branched off its own `main`.
Nothing pushed/merged. `main` untouched in both.

## What was added

1. **Stop / cancel a running sync** (requirement 1)
   - *Backend* (`ui-change`): new cooperative-cancellation model.
     - `POST /sync/cancel/sales` and `POST /sync/cancel/inventory` → set a Redis
       cancel flag (`sync_cancel_*`). Return `{ cancelled, message }`; `cancelled:false`
       if nothing is running.
     - `execute*Sync` clears any stale cancel flag on start and clears lock+flag in
       `finally`. A `SyncCancelledError` is thrown when the flag is seen, and the catch
       resolves the run to **IDLE** (`lastError: "Sync cancelled by user."`) — *not* FAILED.
     - The flag is checked **(a)** at every pipeline stage boundary and **(b)** on every
       poll iteration inside `SalesService.pollUntilDone` / `InventoryService.pollUntilDone`.
       The 10s poll sleep was split into 1s slices so Stop lands within ~1–2s even while
       the report sits in Amazon's queue (where there is no stage change for minutes).
     - Files: `src/sync/sync.service.ts`, `src/sync/sync.controller.ts`,
       `src/reports/sales/sales.service.ts`, `src/reports/inventory/inventory.service.ts`.
   - *Frontend*: `DashboardService.cancelSalesSync()` → the endpoint; `sync-timeline`
     gained a `stopSync` output + `isStopping` input and a red **Stop** button that
     renders only while `isRunning`; dashboard `onStopSalesNow()` calls it with toast
     feedback.
   - **Verified end-to-end** against the live backend: triggered a real sales sync →
     clicked-equivalent cancel → run stopped in **~3s** and returned to IDLE with
     "Sync cancelled by user." (no FAILED, lock released).
   - *Approach note:* cancellation is **cooperative** (the only safe way — SP-API calls
     run to completion). It cannot kill an in-flight HTTP request to Amazon mid-call; it
     aborts at the next checkpoint. This matches the constraint the task called out.

2. **Running period visible** (requirement 2)
   - `buildSyncReportMeta` now passes `runningPeriod = status.lastSyncPeriod`. The
     sync-timeline shows a prominent cyan banner "Syncing <start> → <end>" while running,
     so the active range stays visible even though the period inputs reset after a run.

3. **Inventory empty state** (requirement 3)
   - The tally inventory "no data" message already uses the shared `.no-data-warn` style,
     matching the sales empty state. The Inventory Report card itself remains the slim
     under-construction placeholder.

4. **Weekly Schedule Health widget** (requirement 4)
   - `weekly-schedule-status` renders after the Sales card (confirmed rendering in the
     running + mobile screenshots). Shows: Last Sync (+status chip), Period Synced,
     Days Since Sync (color-graded), This-Week status vs the Monday baseline
     (success / failed / missing), and Next Scheduled.
   - Logic fixes: dropped needless optional chaining on the required `salesStatus` input
     (this was the **NG8107** source — build is now warning-free); an IN_PROGRESS/IDLE
     run this week no longer mis-reads as "failed".
   - *Note:* "Next Scheduled" reflects the real backend schedule, which is currently a
     **Wednesday** cron (`@Cron('0 0 * * 3')`, presently commented out), while the product
     framing says Monday. The widget's this-week window is Mon→Sun regardless. Flagging in
     case you want the cron day and the "Monday baseline" label reconciled.

5. **Responsiveness** (tablet + mobile)
   - Breakpoints at 980 / 760 / 520 / 480px: sidebar collapses to a top row (≤980),
     week table scrolls horizontally (min-width 620px), tally controls + footer actions
     stack and go full-width, KPI strip / `.row2` / inventory grid collapse to one column,
     and weekly-widget rows stack. Verified at 390px width (see screenshot).

## Build / verify (Phase 2)

- `npx ng build --configuration development` → **clean, 0 errors, 0 warnings** (NG8107 gone).
- `npx nest build` (backend) → clean.
- Live exercise against running dev servers (`:4200` frontend, `:3000` backend): Run Sales
  Report → RUNNING badge + running-period banner + Stop button appear; cancel → stops in
  ~3s to IDLE. Cancel with nothing running → `{cancelled:false,...}`.

## Screenshots (Phase 2)

- `design/ui_change-running-stop.png` — running state: RUNNING badge, cyan running-period
  banner, in-progress pipeline node, **Stop** button, and the Weekly Schedule Health widget.
- `design/ui_change-mobile.png` — full dashboard at 390px width (responsive layout).

## Run commands (unchanged)

Frontend: `cd Amazon_vendor_api_V2_frontend && npm install && npm start` → `:4200`.
Backend:  `cd Amazon_vendor_api_V2_backend && npm install && npm run start:dev` → `:3000`
(needs `.env` + Redis; falls back to in-memory cache if Redis is down).

## Needs your decision (Phase 2)

7. **Two separate `ui-change` branches** were used (frontend + backend) since the cancel
   feature spans both repos. `main` is untouched in both; nothing pushed/merged.
8. **Watch-mode + Redis caveat:** the backend runs under `nest start --watch`. A recompile
   that restarts the server mid-sync leaves stale `sync_*` keys in Redis (isSyncing stuck
   true with no live poller) until the 4h lock TTL. During verification I cleared the
   stale `sync_lock_sales` / `sync_status_sales` / `sync_cancel_sales` keys once. Consider
   clearing a stale lock on `onModuleInit`, or a tiny admin "force reset" if this bites you.
9. **Cron day vs "Monday baseline"** — see item 4 note above.
