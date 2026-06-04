# UI Change Notes — Horizon "Amazon API Performance Dashboard" re-skin

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
