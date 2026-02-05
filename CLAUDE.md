# CLAUDE.md — SYP Analytics

## Project Overview

Lumber trading analytics platform for Buckeye Pacific. Full-stack app with Flask backend and vanilla JS modular frontend. Manages buy/sell orders, CRM, margin analysis, market pricing, quote generation, mill intelligence, risk management, and an AI trading assistant.

## Tech Stack

- **Backend**: Python 3 / Flask 3.0.0, SQLite (`crm.db`), gunicorn
- **Frontend**: Vanilla JavaScript (ES6 modules), Chart.js 4.4.7
- **Storage**: Supabase (cloud - single source of truth), SQLite (CRM cache)
- **Hosting**: Heroku (via `Procfile`)

## Running the App

```bash
pip install -r requirements.txt
python app.py              # Dev server on http://localhost:5001
```

Production: `gunicorn app:app` (Heroku Procfile)

No test suite exists.

## Project Structure

```
├── app.py                 # Flask backend (~1,156 lines)
├── index.html             # SPA entry point
├── styles.css             # Themed stylesheet (dark/light)
├── pricing.html           # Standalone pricing page
├── crm.db                 # SQLite database (CRM cache)
├── requirements.txt       # Python deps
├── Procfile               # Heroku config
├── CLAUDE.md              # This file
│
├── js/
│   ├── app.js             # Settings, initialization, theme toggle
│   ├── state.js           # Global state object (S), constants, localStorage
│   ├── data.js            # Supabase sync, deduplication, cloud-first storage
│   ├── utils.js           # Math/utility helpers, freight calculations
│   │
│   ├── views.js           # Main view rendering (dashboard, blotter, etc.)
│   ├── modals.js          # Modal dialogs & forms (buy/sell)
│   ├── charts.js          # Chart.js visualizations
│   │
│   ├── quotes.js          # Quote Engine with market intelligence
│   ├── quotebuilder.js    # Bulk quote building utilities
│   ├── quoteintel.js      # Quote intelligence helpers
│   │
│   ├── millpricing.js     # Mill pricing intake (Excel/PDF parsing)
│   ├── miutils.js         # Mill Intel utilities
│   ├── midata.js          # Mill Intel data layer
│   ├── miintake.js        # Mill Intel intake processing
│   ├── miaggregated.js    # Mill Intel aggregated views
│   ├── miintelligence.js  # Mill Intel market intelligence
│   ├── miquotes.js        # Mill Intel smart quote builder (product x length matrix)
│   │
│   ├── crm.js             # CRM prospect/customer management
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
└── mill-intel/            # Standalone Mill Intel app (legacy)
    ├── app.py
    ├── index.html
    └── styles.css
```

## Architecture

- **SPA with functional rendering**: Central state object `S` → `save()` + `render()` on every change
- **Cloud-first data**: Supabase is the single source of truth; SQLite is cache only
- **No framework/bundler**: Vanilla JS modules loaded via `<script>` tags
- **Event handling**: Inline `onclick` handlers dispatching state changes
- **Backend API**: Flask REST routes for CRM, mileage/geocoding, futures data, and file parsing

## Data Flow

1. **Supabase** = Single source of truth (customers, mills, trades, mill quotes)
2. **SQLite** = Local cache for CRM display (prospects, touches)
3. **localStorage** = App state (S object), settings, preferences
4. **Sync**: Cloud-first with debounced sync (1.5s delay), deduplication on load

## Key Modules

### Quote Engine (`quotes.js`, `views.js`)
- BUILD tab: Create quotes with market intelligence columns
- SOURCE tab: Smart sourcing from Mill Intel
- Columns: Cost, FOB Sell, Landed, **Landed Cost** (best mill + freight), RL Mkt, Margin
- Freight calculation using flat rate per mile

### Mill Intelligence (`mi*.js`)
- Product x Length matrix for bulk quoting
- Best-source selection across all mills
- Templates for common quote scenarios
- "Send to Quote Engine" transfers products/origin without pre-filling sell prices

### Risk Management (`risk.js`)
- Position limits per product/trader
- VaR calculations (historical, parametric)
- Exposure monitoring
- Drawdown tracking

### Analytics (`analytics.js`)
- Moving averages, trend detection
- Seasonal patterns
- Volatility metrics
- Correlation analysis

## Code Conventions

### JavaScript
- camelCase functions/variables, UPPERCASE constants
- ES6 arrow functions, ternaries, template literals
- No semicolons in most files
- Direct DOM manipulation via `innerHTML` (no templating engine)
- Always call `save()` then `render()` after state mutations
- Toast notifications for user feedback

### Python
- snake_case naming
- Raw `sqlite3` queries (no ORM)
- `jsonify` for API responses
- try/except with HTTP status codes

### CSS
- CSS custom properties for theming (`--accent`, `--bg`, `--panel`, etc.)
- Dark theme default, light via `data-theme="light"`
- BEM-like class naming

## Domain Constants (defined in `js/state.js`)

- **Traders**: Ian P, Aubrey M, Hunter S, Sawyer R, Jackson M, John W
- **Products**: 2x4#2, 2x6#2, 2x8#2, 2x10#2, 2x12#2, 2x4#3, 2x6#3, 2x8#3, MSR, Wides, Studs
- **Regions**: west, central, east
- **Lengths**: 8', 10', 12', 14', 16', 20', RL
- **Storage prefix**: `syp_`

## Key Endpoints

| Route | Purpose |
|---|---|
| `/health` | Health check |
| `/api/crm/prospects` | Prospect CRUD |
| `/api/crm/customers` | Customer mgmt |
| `/api/crm/mills` | Mill mgmt |
| `/api/mileage/calculate` | Distance calc |
| `/api/futures/*` | Futures market data |
| `/api/parse-excel`, `/api/parse-pdf` | Mill pricing file parsing |
| `/api/mi/*` | Mill Intel data endpoints |

## Cache Busting

Script tags in `index.html` use version parameters (`?v=timestamp`). Update with:
```bash
sed -i '' 's|\.js?v=[0-9]*"|.js?v='$(date +%s)'"|g' index.html
```
