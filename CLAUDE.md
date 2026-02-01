# CLAUDE.md — SYP Analytics

## Project Overview

Lumber trading analytics platform for Buckeye Pacific. Full-stack app with Flask backend and vanilla JS modular frontend. Manages buy/sell orders, CRM, margin analysis, market pricing, quote generation, mill pricing intake, and an AI trading assistant.

## Tech Stack

- **Backend**: Python 3 / Flask 3.0.0, SQLite (`crm.db`), gunicorn
- **Frontend**: Vanilla JavaScript (ES6 modules), Chart.js 4.4.7
- **Storage**: IndexedDB + localStorage (client), Supabase REST API (cloud sync)
- **Hosting**: Heroku (via `Procfile`)

## Running the App

```bash
pip install -r requirements.txt
python app.py              # Dev server on http://localhost:5000
```

Production: `gunicorn app:app` (Heroku Procfile)

No test suite exists.

## Project Structure

```
├── app.py                 # Flask backend (~1,156 lines)
├── index.html             # SPA entry point
├── styles.css             # Themed stylesheet (dark/light)
├── crm.db                 # SQLite database (CRM data)
├── requirements.txt       # Python deps
├── Procfile               # Heroku config
└── js/
    ├── app.js             # Settings, initialization
    ├── state.js           # Global state, constants, localStorage
    ├── data.js            # IndexedDB, Supabase sync
    ├── utils.js           # Math/utility helpers
    ├── views.js           # View rendering (dashboard, blotter, etc.)
    ├── modals.js          # Modal dialogs & forms
    ├── quotes.js          # Quote engine
    ├── millpricing.js     # Mill pricing intake (Excel/PDF)
    ├── crm.js             # CRM prospect/customer mgmt
    ├── trades.js          # Trade blotter
    ├── analytics.js       # Trading analytics
    ├── charts.js          # Chart.js visualizations
    └── ai.js              # Claude AI assistant (60+ tools)
```

## Architecture

- **SPA with functional rendering**: Central state object `S` → `save()` + `render()` on every change
- **No framework/bundler**: Vanilla JS modules loaded via `<script>` tags
- **Event handling**: Inline `onclick` handlers dispatching state changes
- **Backend API**: Flask REST routes for CRM (`/api/crm/*`), mileage/geocoding (`/api/mileage/*`), futures data (`/api/futures/*`), and file parsing (`/api/parse-*`)
- **Data flow**: localStorage as primary store, Supabase for optional cloud sync, SQLite for CRM persistence

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
- **Products**: 2x4#2, 2x6#2, 2x8#2, 2x10#2, 2x12#2, 2x4#3, 2x6#3, 2x8#3
- **Regions**: west, central, east
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
