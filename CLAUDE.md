# CLAUDE.md — SYP Analytics

## Project Overview

Lumber trading analytics platform for Buckeye Pacific. Full-stack app with Flask backend and vanilla JS modular frontend. Manages buy/sell orders, CRM, margin analysis, market pricing, quote generation, mill intelligence, risk management, and an AI trading assistant.

## Tech Stack

- **Backend**: Python 3 / Flask 3.0.0, SQLite (`crm.db` + `mill-intel/mill_intel.db`), gunicorn
- **Frontend**: Vanilla JavaScript (26 modules, ~24k lines), Chart.js 4.4.7
- **Storage**: Supabase (cloud SOT), SQLite (CRM/MI cache), IndexedDB (primary local), localStorage (backup)
- **Hosting**: Railway (via `Procfile`)
- **AI**: Claude API (Sonnet) for mill price list parsing (text + vision)

## Running the App

```bash
pip install -r requirements.txt
python app.py              # Dev server on http://localhost:5001
```

Production: `gunicorn app:app --workers 2 --threads 4 --timeout 120` (Railway Procfile)

Tests: `npm test` (Jest, 191 tests across 9 suites) and `npm run test:py` (pytest).

## Environment Variables

Required for full functionality (set in Railway dashboard for production):

| Variable | Purpose | Default |
|---|---|---|
| `JWT_SECRET` | JWT auth signing key | (required) |
| `TRADER_CREDENTIALS` | JSON map of trader:password | (required) |
| `ADMIN_USERS` | Comma-separated admin usernames | (none) |
| `ALLOWED_ORIGINS` | CORS origins | `*` |
| `PRICING_PASSWORD` | Matrix login PIN | `2026` |
| `SUPABASE_URL` | Supabase REST API URL | (required for cloud sync) |
| `SUPABASE_ANON_KEY` | Supabase anon key | (required for cloud sync) |

## Cloning onto a New Machine

```bash
git clone https://github.com/iplank19/SYP-Analytics.git
cd SYP-Analytics
pip install -r requirements.txt
python app.py
```

- All data syncs from Supabase on first login — no local data files needed
- `crm.db` and `mill-intel/mill_intel.db` are auto-created on first run
- On Railway deploys, `seed_mi_from_supabase()` auto-populates SQLite from cloud
- Set your Claude API key in Settings for AI parsing features
- Browser IndexedDB stores local state; cloud pull overwrites it

## Project Structure

```
├── app.py                 # Flask backend (~4,300 lines)
├── index.html             # SPA entry point
├── styles.css             # Themed stylesheet (dark/light)
├── pricing.html           # Standalone pricing portal (PIN-protected)
├── crm.db                 # SQLite database (CRM cache, auto-created)
├── requirements.txt       # Python deps
├── Procfile               # Railway config (gunicorn w/ 2 workers)
├── CLAUDE.md              # This file
│
├── js/
│   ├── app.js             # Login, initialization, Supabase config
│   ├── state.js           # Global state (S), MI_PRODUCTS, QUOTE_LENGTHS, QUOTE_TEMPLATES
│   ├── data.js            # Cloud sync, IndexedDB, parallel IDB reads/writes
│   ├── utils.js           # Math/utility helpers, freight calculations
│   │
│   ├── views.js           # Main view rendering (~2,940 lines)
│   ├── modals.js          # Modal dialogs & forms (buy/sell)
│   ├── charts.js          # Chart.js visualizations
│   │
│   ├── quotes.js          # Quote Engine (~2,510 lines) — BUILD tab matrix + pricing
│   ├── quotebuilder.js    # Bulk quote building utilities
│   ├── quoteintel.js      # Quote intelligence helpers
│   │
│   ├── millpricing.js     # Mill pricing intake (CSV/AI parsing, trends, matrix view)
│   ├── miutils.js         # Mill Intel utilities (formatProductLabel, normalizeMillName)
│   ├── midata.js          # Mill Intel REST API layer (/api/mi/*)
│   ├── miintake.js        # Mill Intel intake processing (drag-drop, file upload)
│   ├── miaggregated.js    # Mill Intel aggregated views (granular matrix, wipe)
│   ├── miintelligence.js  # Mill Intel market intelligence
│   ├── miquotes.js        # Mill Intel SOURCE tab (product x length matrix)
│   │
│   ├── crm.js             # CRM prospect/customer management (SQLite-backed)
│   ├── trades.js          # Trade blotter, customer/mill CRUD
│   │
│   ├── analytics.js       # Trading analytics, moving averages, trends
│   ├── risk.js            # Risk management (VaR, position limits, exposure)
│   ├── pnl.js             # P&L attribution engine
│   ├── portfolio.js       # Portfolio management, MTM
│   ├── signals.js         # Trading signals engine
│   ├── alerts.js          # Alert system and notifications
│   ├── reports.js         # Report generation
│   │
│   └── ai.js              # Claude AI assistant (60+ tools)
│
└── mill-intel/            # Standalone Mill Intel app (legacy, integrated into main)
    ├── app.py
    ├── index.html
    └── styles.css
```

## Architecture

- **SPA with functional rendering**: Central state object `S` → `save()` + `render()` on every change
- **Cloud-first data**: Supabase is single source of truth; SQLite is cache only
- **No framework/bundler**: Vanilla JS modules loaded via `<script>` tags, global namespace
- **Event handling**: Inline `onclick` handlers dispatching state changes
- **Backend API**: Flask REST routes for CRM, mileage/geocoding, futures, file parsing, Mill Intel

## Data Flow & Sync Architecture

### Three Storage Layers
1. **Supabase** (cloud) — Single source of truth. Stores full state as JSON blob per user_id
2. **SQLite** (`crm.db` + `mill_intel.db`) — Server-side cache for CRM prospects/touches and Mill Intel queries. Ephemeral on Railway (wiped each deploy)
3. **IndexedDB + localStorage** (browser) — Primary local storage with localStorage backup

### Sync Flow (login / page load)
```
loadAllLocal() (parallel IDB reads)
  → loadSupabaseConfig()
  → cloudSync('pull')  — Supabase → S.* (cloud wins, direct replacement)
    → saveAllLocal()   — S.* → IDB + LS (parallel writes)
    → syncCustomersToServer()  — S.customers → SQLite (fire-and-forget)
    → syncMillsToServer()      — S.mills → SQLite (fire-and-forget)
    → syncMillQuotesToMillIntel() — S.millQuotes → mill_intel.db (fire-and-forget)
  → render()
```

### Key Sync Rules
- **Cloud wins on pull**: Direct replacement, no merge (prevents revert bugs)
- **No push-after-pull**: Push timer cancelled after pull to prevent overwriting cloud
- **Memory wins over SQLite**: `loadCRMData()` uses S.customers as authority, only adds SQLite-only entries
- **Mill quote sync only on pull**: Not on every save (prevents server overload)
- **Server-side seeding**: `seed_mi_from_supabase()` populates SQLite on fresh Railway deploys

## Key Modules

### Quote Engine (`quotes.js`, `views.js`)
- **BUILD tab**: Product x Length checkbox matrix (MI_PRODUCTS × QUOTE_LENGTHS) + pricing panel
  - Left: Matrix with grade group toggles, customer/destination select, templates
  - Right: Cost (best mill), Freight, Landed, Sell, Margin, TLs, Ship Week columns
  - One-click Reflow pricing button
- **SOURCE tab**: Smart sourcing from Mill Intel matrix
- `showBestCosts()`: Fetches best mill cost via `miLoadLatestQuotes()` → falls back to `getBestPrice()`
- `parseProductString()`: Parses "2x4 RL #2" → `{base: "2x4#2", length: "RL"}`

### Mill Intelligence (`mi*.js`)
- Product x Length matrix for bulk quoting (SOURCE tab)
- AI-powered price list parsing (text + scanned PDF vision)
- Aggregated matrix view with "Wipe" cutoff feature
- Best-source selection across all mills
- Templates for common quote scenarios (state.js: `QUOTE_TEMPLATES`)
- Matrix wipe cutoff (`_miMatrixCutoff`) only applies to aggregated views, NOT quote engine

### CRM (`crm.js`, `trades.js`)
- Prospects pipeline (SQLite-only, backed up to cloud)
- Customer/Mill CRUD with cloud sync
- Prospect → Customer conversion with data carry-over
- Mill rename cascades across SQLite + state

### Risk, Analytics, Reports (`risk.js`, `analytics.js`, `reports.js`, etc.)
- Position limits, VaR, exposure monitoring
- Moving averages, trend detection, seasonal patterns
- Report generation and alert system

## Code Conventions

### JavaScript
- camelCase functions/variables, UPPERCASE constants
- ES6 arrow functions, ternaries, template literals
- No semicolons in most files
- Direct DOM manipulation via `innerHTML` (no templating engine)
- Always call `save()` then `render()` after state mutations
- Toast notifications for user feedback (`showToast()`)
- Quote engine BUILD tab functions prefixed `qe` (e.g., `qeBuildFromMatrix`)
- Mill Intel matrix functions prefixed `mi` (e.g., `miLoadLatestQuotes`)

### Python
- snake_case naming
- Raw `sqlite3` queries (no ORM), `row_factory = sqlite3.Row`
- `jsonify` for API responses
- try/except with HTTP status codes
- JWT auth on protected endpoints

### CSS
- CSS custom properties for theming (`--accent`, `--bg`, `--panel`, etc.)
- Dark theme default, light via `data-theme="light"`
- Catppuccin Mocha inspired color scheme

## Domain Constants (defined in `js/state.js`)

- **Traders**: Ian P, Aubrey M, Hunter S, Sawyer R, Jackson M, John W
- **MI_PRODUCTS** (25): 2x4-2x12 in grades #1, #2, #3, #4, MSR
- **QUOTE_LENGTHS** (8): 8, 10, 12, 14, 16, 18, 20, RL
- **PRODUCT_GROUPS**: All, #1, #2, #3, #4, MSR, Studs, Wides
- **Regions**: west, central, east (canonical `REGION_MAP` in state.js)
- **Storage prefix**: `syp_`

## Key Endpoints

| Route | Purpose |
|---|---|
| `/health` | Health check |
| `/api/auth/login` | JWT login |
| `/api/pricing/login` | Matrix PIN login |
| `/api/crm/prospects` | Prospect CRUD |
| `/api/crm/customers` | Customer mgmt |
| `/api/crm/mills` | Mill mgmt |
| `/api/mileage/calculate` | Distance calc (Nominatim geocoding) |
| `/api/futures/*` | Futures market data (Yahoo Finance) |
| `/api/parse-excel`, `/api/parse-pdf` | File parsing for mill pricing |
| `/api/mi/quotes` | Mill Intel quote CRUD (GET/POST) |
| `/api/mi/quotes/latest` | Latest quote per mill+product |
| `/api/mi/quotes/matrix` | Full matrix view (with cache) |
| `/api/mi/mills` | Mill Intel mill directory |
| `/api/supabase/config` | Client Supabase credentials |
| `/api/pricing/cutoff` | Matrix wipe date sync |

## Known Architectural Notes

- Railway filesystem is ephemeral — SQLite wiped on each deploy, reseeded from Supabase
- `seed_mi_from_supabase()` runs on server startup if `mill_quotes` table is empty
- Geocoding uses Nominatim (rate-limited, ~0.5s/call) — server pre-caches known mills to skip
- Single Supabase JSON blob per user_id stores entire app state (can get large)
- Gunicorn runs 2 workers + 4 threads to prevent single-request blocking

## Cache Busting

Script tags in `index.html` use version parameters (`?v=timestamp`). Update with:
```bash
sed -i '' 's|\.js?v=[0-9]*"|.js?v='$(date +%s)'"|g' index.html
```
