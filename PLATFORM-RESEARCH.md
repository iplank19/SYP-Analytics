# SYP-Analytics Platform Research: From Internal Tool to Professional Trading Platform

**Prepared for:** Buckeye Pacific
**Date:** February 2026
**Scope:** Comprehensive analysis of lumber trading fundamentals, professional platform standards, current gap analysis, and implementation roadmap

---

## Table of Contents

1. [Lumber Trading Fundamentals](#i-lumber-trading-fundamentals)
2. [Professional Trading Platform Standards](#ii-professional-trading-platform-standards)
3. [Current Platform Gap Analysis](#iii-current-platform-gap-analysis)
4. [UI Improvement Recommendations](#iv-ui-improvement-recommendations)
5. [Workflow Pipeline Improvements](#v-workflow-pipeline-improvements)
6. [Data Architecture Recommendations](#vi-data-architecture-recommendations)
7. [Implementation Roadmap](#vii-implementation-roadmap)

---

## I. Lumber Trading Fundamentals

### SYP Market Structure

Southern Yellow Pine (SYP) is the dominant softwood framing lumber species produced in the southeastern United States. The market is structured around a relatively concentrated supply base (large corporate mill groups) selling to a fragmented demand side (wholesalers, distributors, dealers, and building product companies).

**Major Mill Groups (represented in SYP-Analytics):**
- Canfor Southern Pine (12 mills across LA, AR, AL, GA, SC, NC)
- West Fraser (13 mills across AR, AL, GA, TX, LA, FL)
- Georgia-Pacific (12 mills across NC, TX, AL, AR, GA, MS, SC)
- Weyerhaeuser (9 mills across AR, AL, LA, MS, NC, OK)
- Interfor (10 mills across AR, SC, AL, LA, GA)
- PotlatchDeltic (3 mills in AR)
- Rex Lumber (4 mills across FL, AL, MS)
- Plus 15+ smaller producers (Tolko, Idaho Forest Group, Biewer, Anthony Timberlands, etc.)

**Market Participants:**
- **Producers:** Mills that manufacture dimension lumber from logs
- **Wholesalers/Traders:** Buy FOB mill, sell delivered to customers (Buckeye Pacific's role)
- **Distributors/Dealers:** Buy delivered, resell to end users
- **End Users:** Homebuilders, truss manufacturers, industrial users, retailers

**Geographic Regions:**
The SYP market is divided into three pricing regions:
- **West:** TX, LA, AR, OK (MILLS const in `js/state.js:79-101`)
- **Central:** MS, AL, TN, KY, MO (MI_STATE_REGIONS in `app.py:310-317`)
- **East:** GA, FL, SC, NC, VA, WV, OH, IN

Note: There are currently 3 divergent region mappings across the codebase (see Gap Analysis III.2).

### Pricing Framework

**FOB Mill Pricing:**
- The primary buy-side price. Quoted per MBF (thousand board feet) at the mill gate.
- Mill quotes are product-specific and length-specific (e.g., 2x4#2 RL, 2x4#2 16', etc.)
- Pricing varies by grade (#1, #2, #3, #4, MSR), dimension, and ship window.

**Delivered Pricing:**
- The primary sell-side price. FOB mill + freight = delivered (landed) cost.
- Customers buy delivered, meaning freight is embedded in the price they pay.
- The trader's job: buy FOB as low as possible, minimize freight, sell delivered as high as possible.

**Random Lengths (RL) Benchmark:**
- Fastmarkets (formerly Random Lengths) publishes weekly composite pricing for SYP products by region.
- The RL benchmark is the industry standard for evaluating whether a trade was "above market" or "below market."
- The SYP #2 2x4 RL East Side price is the most-watched benchmark and is also the settlement price for CME SYP futures (contract code: SYP).
- RL publishes composite (average), specified-length, and timber prices across west, central, and east regions.

**CME SYP Futures:**
- Contract size: 22,000 board feet
- Cash settled to Fastmarkets FP-LBR-2227 (Kiln-dried SYP Eastside 2x4 RL FOB mill, daily price)
- Tick size: $0.50/MBF ($11/contract)
- Trading hours: Globex Mon-Fri 9:00am-3:05pm CT
- Used for hedging price risk on physical positions

**Basis Trading:**
- Basis = Cash (RL) price - Futures price
- Traders monitor basis to identify hedging opportunities
- The platform calculates this in `js/state.js:722-782` via `getHistoricalBasis()` and `getDailyBasis()`

### Trade Lifecycle

A professional lumber trade follows this lifecycle:

```
1. MARKET INTEL     → Mill pricing intake, RL data analysis, competitor intelligence
2. INQUIRY/NEED     → Customer requests a quote or trader identifies an opportunity
3. QUOTE            → Trader builds a quote: FOB cost + freight + margin = delivered price
4. NEGOTIATION      → Price/terms discussion with customer and mill
5. ORDER ENTRY      → Buy order placed with mill, sell order confirmed with customer
6. CONFIRMATION     → Written confirmation exchanged (PO numbers, order confirmations)
7. SCHEDULING       → Ship window agreed, freight arranged
8. SHIPMENT         → Truck dispatched, BOL generated, transit tracking
9. DELIVERY         → Product received by customer, any claims filed
10. INVOICING       → Invoice generated based on delivery
11. SETTLEMENT      → Payment received, matched to invoice
12. RECONCILIATION  → P&L calculated, actual vs. quoted freight reconciled
```

### Position Management and Risk

**Position Types:**
- **Long:** Bought from mill but not yet sold (inventory risk)
- **Short:** Sold to customer but not yet bought (price risk)
- **Flat/Matched:** Buy and sell order linked by PO/order number

**Key Risk Metrics:**
- **Net Position:** Long volume - Short volume (current: `js/risk.js:9-83`)
- **VaR (Value at Risk):** Maximum expected loss at a confidence level over a time horizon
- **Exposure by Dimension:** Product, region, trader, customer, mill concentration
- **Drawdown:** Peak-to-trough P&L decline
- **Position Limits:** Maximum volume allowed per product/trader/desk

**P&L Attribution:**
- **Trade P&L:** (Sell FOB - Buy FOB) x Volume
- **Freight P&L:** (Budgeted freight - Actual freight) x Volume
- **Basis P&L:** Change in cash-futures basis on hedged positions
- **MTM P&L:** Mark-to-market on open positions using latest RL prices

### Regulatory/Compliance Considerations

- **CFTC Requirements:** Hedging activity using CME futures must comply with position reporting thresholds
- **SPIB Grading Standards:** Southern Pine Inspection Bureau standards govern product grading
- **Freight Documentation:** BOLs, weight tickets, and claims documentation
- **Credit/Risk Policies:** Internal position limits, counterparty credit limits, approval workflows
- **Audit Trail:** All trade modifications must be logged with who, what, when, why

---

## II. Professional Trading Platform Standards

### What CTRM Systems Provide

Commodity Trading and Risk Management (CTRM) platforms are the industry standard for managing commodity trading operations. The CTRM market is projected to reach $266M by 2032, reflecting how critical these systems are.

Leading platforms include ION/Openlink, ION/TriplePoint, Amphora Symphony, Eka, Molecule, Agiboo, and Tradesprint. Their core feature sets define what professional-grade means:

**1. Trade Capture and Lifecycle Management**
- Structured deal entry with mandatory fields and validation
- Multi-leg trade support (buy + sell + freight as one deal)
- Trade versioning with full amendment history
- Status workflow: Draft -> Pending -> Approved -> Confirmed -> Shipped -> Settled
- Automatic PO/confirmation number generation

**2. Real-Time Position Management**
- Live net position by product, trader, desk, region, counterparty
- Intraday position updates as trades execute
- Position limit monitoring with automatic breach alerts
- Integration with futures positions for hedged view

**3. Risk Management Dashboard**
- VaR calculation (historical simulation, parametric, Monte Carlo)
- Stress testing and scenario analysis
- Credit risk monitoring (counterparty exposure, credit limits, aging AR)
- Limit utilization visualization (gauges, heatmaps)
- Automated breach escalation workflows

**4. P&L Attribution**
- Real-time P&L by trader, desk, product, customer, mill, region, time period
- Decomposition: Trade P&L + Freight P&L + Basis P&L + MTM
- Waterfall charts for attribution breakdown
- Period comparison (WoW, MoM, YoY)
- Realized vs. unrealized separation

**5. Market Data Integration**
- Live feed from pricing agencies (Fastmarkets/Random Lengths)
- Historical price databases with charting
- Benchmark comparison (trades vs. market)
- Futures data integration (CME SYP)

**6. CRM and Counterparty Management**
- Full customer lifecycle: Prospect -> Qualified -> Customer -> Active Account
- Credit management: Limits, payment terms, aging receivables
- Contact management: Multiple contacts per entity, interaction history
- Customer profitability analysis: Revenue, margin, cost-to-serve
- Mill relationship management: Pricing history, reliability scoring, product coverage

**7. Reporting and Analytics**
- Scheduled reports: Daily flash, weekly review, monthly summary
- Ad-hoc report builder with export (PDF, Excel, CSV)
- Executive dashboards with drill-down
- Regulatory reports and audit exports

**8. Audit and Compliance**
- Immutable audit log: Every change timestamped with user identity
- Amendment tracking: Old value -> New value with reason
- Approval workflows: Multi-level trade approval based on value/risk
- Data retention policies
- Role-based access control (RBAC)

### Data Integrity Requirements

**For a system managing real trades and real money:**
- Single source of truth: One authoritative data store, not multiple syncing copies
- Referential integrity: Foreign keys enforced at the database level
- Atomic transactions: Multi-table updates succeed or fail together
- Immutable audit trail: Append-only log that cannot be modified
- Conflict resolution: Deterministic rules for concurrent edits
- Backup and recovery: Point-in-time recovery capability
- Data validation: Schema validation at every entry point

### Multi-User Collaboration Requirements

- **Trader isolation:** Each trader's view filtered to their data by default, with department-wide view for managers
- **Concurrent editing:** Optimistic locking or real-time collaboration on shared entities
- **Role-based access:** Trader, Senior Trader, Manager, Admin roles with different permissions
- **Activity feeds:** See what teammates are doing in real time
- **Shared resources:** Lanes, freight rates, market blurbs, customer notes visible to authorized users

---

## III. Current Platform Gap Analysis

### III.1 Architecture Gaps

**No single source of truth — 4 competing storage layers:**
The platform stores data in localStorage, IndexedDB, SQLite, and Supabase simultaneously. The `save()` function in `js/data.js:536-550` writes to IndexedDB and localStorage, then triggers a debounced cloud push. The `loadAllLocal()` function (`js/data.js:454-480`) tries IndexedDB first, falls back to localStorage. The `cloudSync('pull')` at `js/data.js:225-278` merges cloud data with local data using `_mergeById()`. SQLite (`crm.db`) is yet another copy of customer/mill data.

**Result:** Data can diverge between storage layers with no reconciliation mechanism. The merge function (`js/data.js:83-105`) uses `updatedAt` timestamps but many records lack this field, leading to silent data loss.

**No backend validation or business logic:**
The Flask backend (`app.py`) serves as a thin CRUD wrapper around SQLite. All business logic — trade matching, P&L calculation, risk assessment, price normalization — runs in the browser. This means:
- No server-side validation of trade integrity
- No referential integrity enforcement
- No protection against data corruption from browser bugs
- No ability to run background jobs (scheduled reports, price feeds, alerts)

**Client-side state management is fragile:**
The global `S` object (`js/state.js:645-710`) holds ALL application state. A single localStorage corruption event (quota exceeded, malformed JSON) can wipe the entire application state. The `SS()` function silently fails on quota errors (`js/state.js:633`), setting a flag `S._localStorageFull` that nothing checks.

### III.2 Data Consistency Gaps

**3 divergent region mappings:**
1. `FREIGHT` object in `js/state.js:103` — hardcoded 3-region flat rate matrix
2. `MI_STATE_REGIONS` in `app.py:310-317` — state-to-region mapping
3. Frontend region normalization in `js/utils.js:58-62` defaults to 'central' for unknowns

These don't always agree. For example, Illinois is 'central' in app.py but not represented in the FREIGHT matrix at all.

**3 separate mill alias dictionaries:**
1. `_MILL_COMPANY_ALIASES` in `js/state.js:172-213` (55+ entries)
2. `_MILL_CRM_ALIASES` in `js/state.js:433-448` (30+ entries, different keys)
3. `MILL_COMPANY_ALIASES` in `app.py:377-399` (partial copy of #1)

Each serves a slightly different purpose with different matching logic. The state.js aliases use longest-match-first sorting, while app.py uses simple dictionary lookup.

**Shadow functions with different matching logic:**
- `buildBuyByOrder()` in `js/analytics.js:5-12` — keeps first match per order
- `buildBuyByOrderForPnL()` in `js/pnl.js:24-31` — identical logic, separate function
- Both use `String(b.orderNum||b.po||'').trim()` but sells use `String(s.orderNum||s.linkedPO||s.oc||'').trim()` — the field name discrepancy (`po` vs `linkedPO` vs `oc`) means the same physical trade can match or not depending on which field was filled.

**Product normalization inconsistencies:**
- `normalizeProduct()` in `js/utils.js:65-87` handles casing and spacing
- Quote engine in `js/quotes.js` uses `parseProductString()` with different parsing logic
- Mill Intel modules use their own product matching against `MI_PRODUCTS` array
- The base `PRODUCTS` array (`js/state.js:2`) has 8 items while `MI_PRODUCTS` (`js/state.js:5-11`) has 25 items

### III.3 Feature Gaps vs. Professional Standards

**No audit trail:**
There is zero change tracking. When a trade is modified, the old values are simply overwritten. There is no `modifiedBy`, `modifiedAt`, or change log. For a trading system managing real money, this is the single most critical gap.

**No trade approval workflow:**
Any trader can enter, modify, or delete any trade with no approval gate. Professional systems require:
- Senior approval for trades above a value threshold
- Dual confirmation for trade amendments
- Approval chain for position limit overrides

**No credit management:**
The platform has no concept of customer credit limits, payment terms, or aging receivables. Professional systems enforce:
- Credit limit checks before allowing new sells to a customer
- Automatic hold on orders when credit is exceeded
- Aging reports (30/60/90/120 days) with escalation

**CRM conversion loses data:**
When a prospect is "converted" to a customer, there is no evidence the process preserves contact history, notes, or product interest data. The CRM module (`js/crm.js:1-76`) loads data from the Flask backend but the SQLite schema (`app.py:121-200`) has no explicit migration logic for prospect-to-customer conversion.

**reports.js is broken:**
The `generateWeeklyReport()` function (`js/reports.js:72-100`) calls `getPnLBreakdown('product','7d')` with positional arguments, but `getPnLBreakdown()` in `js/pnl.js:38-39` expects an options object: `function getPnLBreakdown(options={})`. It also calls `getTraderPerformance()`, `getCustomerProfitability()`, `calcMarketMovers()`, and `getRollingPnL()` — functions that either don't exist or have different signatures than expected.

**alerts.js has API mismatches:**
The alert system (`js/alerts.js`) references `S.alerts`, `S.alertHistory`, and `S.alertConfig` which are initialized lazily in `initAlertConfig()` but never persisted to Supabase (not included in the `cloudSync` push at `js/data.js:143-167`). Alert state is lost on cloud sync.

**No freight reconciliation:**
The platform calculates estimated freight using flat rates per mile (`js/state.js:103`) or state-based rates (`js/state.js:664`), but there is no mechanism to record actual freight costs and reconcile them against estimates. This freight P&L leakage is invisible.

**No inventory aging:**
Buys have a `shipped` flag but no timestamp tracking for when inventory was purchased. There is no automated alert when inventory ages beyond a threshold (30/60/90 days), which is critical for a perishable commodity position.

### III.4 Security and Access Control Gaps

**No frontend authentication enforcement:**
The backend has JWT auth decorators (`app.py:80-108`) but the frontend JavaScript has no token management or auth state. The CRM endpoints use `login_required` but trade data flows through Supabase directly from the browser, bypassing server-side auth entirely.

**Passwords stored in localStorage and Supabase:**
`traderPasswords` are synced to cloud via Supabase (`js/data.js:138-139, 258-259`), which means password hashes are stored in a JSON blob accessible to anyone with the Supabase key. The Supabase key itself is fetched from `/api/config` and stored in localStorage (`js/data.js:51-52`).

**No role-based access control in the frontend:**
The `S.trader` value (`js/state.js:672`) is set by the user selecting from a dropdown. There is no verification that the logged-in user is who they say they are for Supabase operations.

---

## IV. UI Improvement Recommendations

### IV.1 Dashboard Redesign

**Current State:** The dashboard (`js/views.js:299-420`) is a large HTML string with inline styles. It has KPI cards with sparklines, market movers, price charts, region mix, and recent activity. The layout is functional but not optimized for trading speed.

**Recommendations:**

**Information Hierarchy:**
- **Tier 1 (Top):** Critical numbers that change daily — Today's P&L, Open Position (net MBF), Total Exposure ($), Risk Score
- **Tier 2 (Middle):** Actionable context — Market movers, stale data alerts, pending actions (unmatched trades, overdue follow-ups, approaching ship windows)
- **Tier 3 (Bottom):** Analytical — Charts, trends, historical comparisons

**KPI Cards Enhancement:**
- Add configurable thresholds with color-coded borders (green/amber/red)
- Add target lines on sparklines (e.g., daily P&L target)
- Add click-through: clicking a KPI drills into the relevant detail view
- Add "compared to" context: "vs. last week", "vs. 30-day avg"

**Action-Oriented Widgets:**
- "Needs Attention" panel: Unmatched trades, inventory aging > 30 days, overdue customer follow-ups
- "Quick Actions" bar: New Buy, New Sell, New Quote, Sync Data
- Position alert summary with link to Risk view

### IV.2 Trading Blotter Improvements

**Current State:** The blotter renders buy and sell tables via inline HTML string building in views.js. No virtual scrolling, limited sorting, no column pinning.

**Recommendations:**

**Virtual Scrolling:**
- Implement windowed rendering for tables with 100+ rows
- Only render visible rows + buffer, dramatically improving performance
- Libraries: Consider a lightweight virtual list (e.g., Clusterize.js or custom IntersectionObserver)

**Column Management:**
- Sortable columns (click header to sort ascending/descending)
- Column reordering via drag-and-drop
- Column visibility toggle (show/hide columns)
- Pinned columns (Order#, Customer/Mill, Product always visible during horizontal scroll)
- Resizable column widths

**Filtering and Search:**
- Global search across all visible columns
- Per-column filter dropdowns (product, trader, status, date range)
- Saved filter presets (e.g., "My open buys", "This week's sells")
- Quick date range picker: Today, This Week, MTD, Last 30 Days, Custom

**Inline Editing:**
- Double-click to edit price, volume, notes directly in the blotter
- Tab to move between editable cells
- Undo last edit with Ctrl+Z

**Row Actions:**
- Hover actions: Edit, Match, Clone, Cancel
- Multi-select rows with Shift+Click for bulk operations
- Right-click context menu

### IV.3 Risk Dashboard

**Current State:** `js/risk.js` calculates exposure, VaR, position limits, and drawdown. The rendering is functional but lacks visual impact for quick risk assessment.

**Recommendations:**

**Limit Utilization Gauges:**
- Circular/semi-circular gauge for each position limit (product, trader)
- Color gradient: Green (0-50%) -> Amber (50-80%) -> Red (80-100%) -> Flashing Red (>100% breach)
- Animated transitions as positions change

**Exposure Treemap:**
- Treemap visualization of exposure by product x region
- Cell size = absolute volume, color = direction (green = long, red = short)
- Click to drill into specific product/region

**VaR Confidence Bands:**
- Line chart showing historical portfolio value with VaR bands (95%, 99%)
- Highlight periods where actual losses exceeded VaR (backtest violations)
- Toggle between 1-day and 5-day VaR

**Concentration Heatmap:**
- Grid showing exposure concentration: products on one axis, counterparties on the other
- Color intensity = notional exposure
- Identify dangerous concentration (>20% of portfolio in one product/counterparty)

**Drawdown Chart:**
- Cumulative P&L line with max drawdown highlighted
- Current drawdown vs. historical max
- Drawdown duration tracking

### IV.4 P&L Views

**Current State:** P&L is calculated in `js/pnl.js` with multi-dimensional breakdown. The P&L Calendar (`js/views.js:108-186`) shows daily P&L with heatmap coloring.

**Recommendations:**

**Waterfall Chart:**
- Visual decomposition: Starting P&L -> +Trade P&L -> +Freight P&L -> +Basis P&L -> +MTM -> Ending P&L
- Each component as a colored bar segment
- Period comparison: This month vs. last month side by side

**Attribution Breakdown:**
- Stacked bar chart by trader, product, customer, region
- Toggle between gross revenue, margin, and profit views
- Pareto chart: Which 20% of customers/products generate 80% of profit?

**Period Comparison:**
- Side-by-side table: This Week vs. Last Week, This Month vs. Last Month
- Highlight deltas with up/down arrows and percentage change
- Trend arrows showing multi-period direction

**P&L Calendar Enhancement:**
- Hover tooltip showing trade details without clicking
- Week summary row below each week
- Running cumulative line within the month
- Export to PDF/Excel with one click

### IV.5 Quote Workflow UI

**Current State:** Quote Engine (`js/quotes.js`, `js/quotebuilder.js`) builds quotes with market intelligence. It has a BUILD tab and SOURCE tab with product x length matrix from Mill Intel.

**Recommendations:**

**Multi-Step Wizard:**
1. **Select Customer** -> Customer lookup, auto-populate destination, credit check
2. **Select Products** -> Grid selection from MI matrix, historical purchase suggestions
3. **Price and Source** -> FOB costs from Mill Intel, freight calculation, margin targets
4. **Review and Finalize** -> Summary with total value, margin %, competitive comparison
5. **Send** -> Generate formatted quote (PDF/email), save to history

**Approval Status:**
- Visual status badges: Draft, Pending Approval, Approved, Sent, Accepted, Expired, Rejected
- Approval chain visualization (who needs to approve and current status)
- Expiration countdown for sent quotes

**Version History:**
- Track all revisions of a quote
- Diff view: what changed between versions
- Restore previous version capability

**Smart Suggestions:**
- "Based on this customer's history, they usually buy these products..."
- "Best-in-market for this product is [mill] at [price]"
- "Last time you quoted this customer, margin was X%"

### IV.6 CRM Improvements

**Current State:** CRM (`js/crm.js`) manages prospects and customers with a table/card view toggle. Basic CRUD with status tracking.

**Recommendations:**

**Pipeline Kanban Board:**
- Drag-and-drop columns: Prospect -> Qualified -> Quoting -> Active -> Dormant
- Card shows: Company name, last touch date, estimated annual volume, assigned trader
- Color coding by staleness (green = recent contact, yellow = warning, red = overdue)

**Customer 360 View:**
- Single page with all customer information:
  - Contact details, locations, delivery preferences
  - Full trade history (buys sold to them) with P&L
  - Quote history with win/loss rate
  - Interaction timeline (calls, emails, meetings, notes)
  - Credit status and payment history
  - Product mix analysis (pie chart)
  - Profitability trend (line chart over time)

**Interaction Timeline:**
- Chronological feed of all touchpoints
- Filter by type (call, email, meeting, trade, quote)
- Quick-add touch with minimal form (just type and note)
- Automatic entries for trades and quotes

**Credit Management Panel:**
- Credit limit vs. current outstanding AR
- Payment terms and history
- Aging buckets: Current, 30, 60, 90, 120+
- Credit hold warning when limit approaching

### IV.7 Mobile/Responsive Considerations

- Sidebar should fully collapse to bottom nav on mobile
- KPI cards should stack vertically on small screens
- Blotter tables should scroll horizontally with pinned first column
- Touch-friendly button sizes (min 44x44px)
- Swipe gestures for navigation between views
- Critical actions (new trade, approve) accessible from mobile

### IV.8 Accessibility

- ARIA labels on all interactive elements
- Keyboard navigation for all views (not just mouse/touch)
- Color should never be the only indicator (add icons/patterns for red/green)
- Screen reader support for KPI values and chart data
- Focus management when modals open/close
- Minimum contrast ratios per WCAG 2.1 AA

### IV.9 Keyboard Shortcuts for Power Users

Recommended shortcuts:
- `N B` — New Buy
- `N S` — New Sell
- `N Q` — New Quote
- `/` — Focus global search
- `G D` — Go to Dashboard
- `G B` — Go to Blotter
- `G R` — Go to Risk
- `G Q` — Go to Quotes
- `G C` — Go to CRM
- `Esc` — Close modal / clear search
- `Ctrl+S` — Force cloud sync
- `?` — Show keyboard shortcut help overlay

---

## V. Workflow Pipeline Improvements

### V.1 Quote-to-Cash Pipeline

**Current:** Quotes are generated in the Quote Engine, but there is no connection from quote to order to invoice to payment. Each step is manual and disconnected.

**Recommended Pipeline:**

```
QUOTE CREATED
  |-> Customer accepts quote
  |-> SELL ORDER auto-generated from quote line items
  |-> BUY ORDER auto-generated (sourced from quote's best-mill selection)
  |-> Orders linked by deal ID (buy PO <-> sell confirmation)
  |-> SHIPMENT scheduled (ship window from quote terms)
  |-> DELIVERY confirmed (customer signs BOL)
  |-> INVOICE generated from delivery receipt
  |-> PAYMENT received and matched
  |-> P&L finalized (actual freight reconciled against estimate)
```

**Key Automations:**
- Quote acceptance triggers automatic order creation (eliminating manual re-entry)
- Order matching is automatic (buy and sell linked from inception)
- Invoice generation pulls from delivered quantities and confirmed prices
- Payment matching auto-updates trade status to "settled"

### V.2 Trade Validation and Approval Workflow

**Rules Engine:**
- Validate all required fields before save (product, price, volume, counterparty, date)
- Price sanity check: Alert if buy price > RL market + 15% or sell price < RL market - 15%
- Volume sanity check: Alert if volume > 100 MBF for a single trade
- Duplicate detection: Warn if same counterparty + product + date + volume already exists

**Approval Workflow:**
- Trades above $50,000 notional require senior trader approval
- Position limit overrides require desk head approval
- Off-market trades (>10% from RL) require documented justification
- Audit trail on every approval/rejection with timestamp and reason

### V.3 Freight Calculation Automation

**Current:** Freight uses a flat rate per mile (`S.flatRate` = $3.50, `js/state.js:658`) or state-based rates (`S.stateRates`, `js/state.js:664`). No actual freight reconciliation.

**Recommended:**
- **Lane-based pricing:** Store actual negotiated freight rates per origin-destination lane
- **Carrier integration:** When available, pull actual freight quotes from carrier APIs
- **Auto-calculate:** When mill (origin) and customer (destination) are selected, auto-fill freight
- **Reconciliation:** After delivery, enter actual freight paid and compare to estimate
- **Freight P&L:** Track freight savings/overruns separately from trade P&L

### V.4 Mill Intel to Quote Engine to Trade Blotter Pipeline

**Current:** Mill Intel (`js/mi*.js`) collects mill pricing. The Quote Engine sources from Mill Intel. But there is no automatic flow from quotes to trades.

**Recommended Pipeline:**

```
MILL PRICING INTAKE (Excel/PDF parsing)
  |-> Normalized to product x length x mill matrix
  |-> BEST-SOURCE RANKING calculated per product
  |-> Quote Engine sources best prices
  |-> QUOTE BUILT with customer pricing + freight + margin
  |-> On acceptance: TRADE BLOTTER entry auto-created
  |-> Buy linked to specific mill quote that sourced it
  |-> Traceability: Every trade traces back to the mill quote that originated it
```

### V.5 Automated Reporting Cadence

| Report | Frequency | Contents | Delivery |
|--------|-----------|----------|----------|
| Daily Flash | 7:00 AM | Today's open positions, yesterday's P&L, market movers, pending actions | Dashboard + email |
| Weekly Review | Monday AM | Week's P&L by trader/product/customer, top trades, risk summary | PDF + email |
| Monthly Performance | 1st of month | Full month attribution, customer profitability, trader rankings | PDF + meeting deck |
| Risk Report | Real-time | Position limit utilization, VaR breaches, concentration alerts | Dashboard + push notification |
| CRM Health | Weekly | Stale prospects, overdue follow-ups, pipeline conversion rates | Dashboard |
| Inventory Aging | Daily | Open positions > 14/30/60 days with estimated MTM | Dashboard + alert |

### V.6 Alert Escalation Rules

**Tiered Escalation:**

```
LEVEL 1 (Info) — In-app toast notification
  Examples: RL data updated, trade synced, quote saved

LEVEL 2 (Warning) — In-app alert + dashboard badge
  Examples: Price moved > 5%, inventory aging > 14 days, customer overdue for contact

LEVEL 3 (Urgent) — In-app alert + email + dashboard highlight
  Examples: Position limit at 80%, trade P&L loss > $5K, unmatched trade > 7 days

LEVEL 4 (Critical) — All channels + require acknowledgment
  Examples: Position limit breached, VaR exceeded, credit limit breached, system error
```

### V.7 CRM to Sales to Trading Handoff

**Current:** CRM prospects exist in SQLite. Customers exist in Supabase/localStorage. There is no formal handoff from "this prospect wants to buy" to "create a quote" to "execute a trade."

**Recommended:**
1. CRM prospect reaches "qualified" status
2. Trader creates a quote from the prospect's CRM card (pre-populated with their product interests)
3. Quote accepted -> prospect auto-promoted to customer
4. All prospect data (contacts, notes, touches, product interests) migrated to customer record
5. Trade history begins accumulating from first order
6. Customer profitability analysis becomes available after first trade

### V.8 Inventory Aging Automated Alerts and Actions

**Rules:**
- 0-14 days: Normal — no action
- 14-30 days: Warning — badge on dashboard, suggest selling at current market
- 30-60 days: Urgent — email alert to trader and manager, MTM loss highlighted
- 60+ days: Critical — require written plan to exit position, escalate to desk head

**Automated Actions:**
- Auto-calculate MTM P&L on aging inventory using latest RL prices
- Suggest target sell prices to break even on aging positions
- Track days-in-inventory metric on the Risk dashboard

---

## VI. Data Architecture Recommendations

### VI.1 Proposed Relational Data Model

**Core Entities (ERD):**

```
COMPANIES (customers + mills unified)
  - id (UUID, PK)
  - name (TEXT, UNIQUE, NOT NULL)
  - type (ENUM: 'customer', 'mill', 'both')
  - parent_company_id (FK -> COMPANIES, nullable, for mill groups)
  - created_at, updated_at, created_by

COMPANY_CONTACTS
  - id (UUID, PK)
  - company_id (FK -> COMPANIES, CASCADE DELETE)
  - name, title, phone, email, is_primary

COMPANY_LOCATIONS
  - id (UUID, PK)
  - company_id (FK -> COMPANIES, CASCADE DELETE)
  - city, state, lat, lon, region
  - is_primary, address, notes

TRADES
  - id (UUID, PK)
  - deal_id (UUID, nullable — links buy + sell as one deal)
  - side (ENUM: 'buy', 'sell')
  - trader_id (FK -> USERS)
  - counterparty_id (FK -> COMPANIES)
  - product, length, grade
  - volume_mbf, price_per_mbf, total_value
  - freight_estimated, freight_actual
  - origin_location_id (FK -> COMPANY_LOCATIONS, for buys)
  - destination_location_id (FK -> COMPANY_LOCATIONS, for sells)
  - status (ENUM: 'draft','pending','approved','confirmed','shipped','delivered','settled','cancelled')
  - order_number, po_number, confirmation_number
  - ship_window_start, ship_window_end
  - shipped_date, delivered_date, settled_date
  - version (INT, for optimistic locking)
  - created_at, updated_at, created_by, updated_by

TRADE_AMENDMENTS
  - id (UUID, PK)
  - trade_id (FK -> TRADES, CASCADE DELETE)
  - field_name, old_value, new_value
  - reason, amended_by, amended_at

QUOTES
  - id (UUID, PK)
  - customer_id (FK -> COMPANIES)
  - trader_id (FK -> USERS)
  - status (ENUM: 'draft','sent','accepted','rejected','expired')
  - valid_until (DATE)
  - version (INT)
  - notes, created_at, updated_at

QUOTE_LINES
  - id (UUID, PK)
  - quote_id (FK -> QUOTES, CASCADE DELETE)
  - product, length, volume_mbf
  - fob_cost, freight_rate, landed_cost, sell_price, margin
  - source_mill_id (FK -> COMPANIES, nullable)
  - source_quote_id (FK -> MILL_QUOTES, nullable)

MILL_QUOTES
  - id (UUID, PK)
  - mill_id (FK -> COMPANIES)
  - product, length, price, volume
  - ship_window, date, trader_id
  - source (TEXT — 'intake', 'email', 'phone')
  - created_at

RL_PRICES
  - id (SERIAL, PK)
  - date (DATE, NOT NULL)
  - product, region, price
  - price_type (ENUM: 'composite', 'specified_length', 'timber')
  - UNIQUE(date, product, region, price_type)

CRM_PROSPECTS
  - id (UUID, PK)
  - company_name, contact_name, phone, email, address
  - status (ENUM: 'prospect', 'qualified', 'converted', 'lost')
  - converted_to_company_id (FK -> COMPANIES, nullable)
  - source, trader_id, notes
  - created_at, updated_at

CRM_TOUCHES
  - id (UUID, PK)
  - prospect_id (FK -> CRM_PROSPECTS, CASCADE DELETE)
  - touch_type (ENUM: 'call', 'email', 'meeting', 'note')
  - notes, follow_up_date
  - created_at, created_by

USERS
  - id (UUID, PK)
  - username, display_name, email
  - role (ENUM: 'trader', 'senior_trader', 'manager', 'admin')
  - password_hash, is_active
  - created_at

AUDIT_LOG (append-only)
  - id (BIGSERIAL, PK)
  - table_name, record_id
  - action (ENUM: 'create', 'update', 'delete')
  - old_values (JSONB), new_values (JSONB)
  - user_id, ip_address, timestamp
```

### VI.2 Migration Path

**Phase 1: Consolidate to PostgreSQL (Supabase)**
- Create the proper schema in Supabase PostgreSQL
- Write migration scripts that:
  1. Read all data from current `S` object (localStorage/IndexedDB)
  2. Normalize and deduplicate entities
  3. Insert into proper relational tables with FK relationships
  4. Generate UUIDs for all entities
- Keep a read-only copy of old data for 30 days as rollback insurance

**Phase 2: Move business logic to backend**
- Migrate P&L calculation, risk metrics, trade matching to Python/Flask
- Frontend becomes a thin presentation layer that calls API endpoints
- Server-side validation for all trade CRUD operations
- Server-side audit trail (database triggers on all trade tables)

**Phase 3: Eliminate localStorage/IndexedDB as primary storage**
- Keep only as offline cache for read-only data
- All writes go through the API
- Service worker for offline capability with sync-on-reconnect

### VI.3 API Design Standards

**RESTful API with consistent patterns:**

```
GET    /api/trades              — List trades (paginated, filtered)
GET    /api/trades/:id          — Get single trade
POST   /api/trades              — Create trade (returns 201 + location header)
PATCH  /api/trades/:id          — Update trade (partial update, returns 200)
DELETE /api/trades/:id          — Soft-delete trade (returns 204)

GET    /api/trades/:id/history  — Get amendment history
POST   /api/trades/:id/approve  — Approve trade (workflow action)
POST   /api/trades/:id/match    — Match buy to sell
```

**Standard response envelope:**
```json
{
  "data": { ... },
  "meta": { "page": 1, "per_page": 50, "total": 234 },
  "errors": []
}
```

**Query parameters:**
- Pagination: `?page=1&per_page=50`
- Sorting: `?sort=-date,+product` (prefix `-` for descending)
- Filtering: `?trader=Ian+P&product=2x4%232&date_from=2026-01-01`
- Field selection: `?fields=id,product,price,volume`

**Auth:** JWT Bearer token in Authorization header for all endpoints

### VI.4 Caching Strategy

**Client-Side:**
- Service Worker cache for static assets (JS, CSS, images)
- IndexedDB as read-through cache for reference data (mill directory, products, RL prices)
- Cache invalidation via ETag or Last-Modified headers
- Stale-while-revalidate for non-critical data (RL history, analytics aggregates)

**Server-Side:**
- Redis for session state and rate limiting
- Materialized views for expensive aggregations (daily P&L, position summaries)
- Cache RL price lookups (change infrequently, queried constantly)
- CDN for static assets

### VI.5 Real-Time Sync Architecture

**Current:** Debounced push every 2 seconds (`js/data.js:340-348`), merge-by-ID on pull.

**Recommended:**
- **Supabase Realtime:** Subscribe to table changes using Supabase's built-in realtime feature
- **Event-driven updates:** When any user modifies a trade, all connected clients receive the update instantly
- **Optimistic UI:** Apply changes locally immediately, reconcile when server confirms
- **Conflict resolution:** Last-writer-wins with version numbers; concurrent edits on same record trigger a merge dialog
- **Offline queue:** Buffer changes while disconnected, replay in order on reconnect

---

## VII. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4) — "Stop the Bleeding"

**Goal:** Fix critical data integrity issues without breaking existing functionality.

1. **Unify region mappings** — Single source of truth for state-to-region mapping, used by both frontend and backend
2. **Unify mill alias dictionaries** — One canonical mapping shared between state.js and app.py
3. **Fix reports.js** — Update function signatures to match actual API in pnl.js, analytics.js
4. **Fix alerts.js** — Persist alert state to Supabase, fix function signature mismatches
5. **Add audit trail** — Even a simple append-only localStorage log of trade changes is better than nothing
6. **Fix CRM conversion** — Ensure prospect-to-customer conversion preserves all data

### Phase 2: Data Architecture (Weeks 5-10) — "Single Source of Truth"

**Goal:** Migrate from 4-layer storage to proper relational database.

1. **Design PostgreSQL schema** in Supabase (based on ERD in VI.1)
2. **Build migration scripts** to normalize and deduplicate existing data
3. **Implement server-side validation** for all trade CRUD operations
4. **Add database-level audit triggers** on trade tables
5. **Migrate trade matching logic** to backend (eliminate shadow functions)
6. **Implement proper authentication** with JWT tokens from backend to frontend
7. **Eliminate localStorage as primary storage** — keep only as offline cache

### Phase 3: Trading Workflow (Weeks 11-16) — "Professional Grade"

**Goal:** Implement the workflows that make this a real trading platform.

1. **Trade status workflow** — Draft -> Pending -> Approved -> Confirmed -> Shipped -> Delivered -> Settled
2. **Trade approval workflow** — Rule-based approval gates with escalation
3. **Quote-to-trade pipeline** — Quote acceptance auto-generates linked buy/sell orders
4. **Freight reconciliation** — Actual vs. estimated freight tracking
5. **Credit management** — Customer credit limits and aging AR
6. **Inventory aging alerts** — Automated notifications on aging positions

### Phase 4: UI/UX Modernization (Weeks 17-24) — "Look and Feel"

**Goal:** Upgrade the interface to match professional trading platform standards.

1. **Dashboard redesign** — Information hierarchy, action-oriented widgets
2. **Blotter overhaul** — Virtual scrolling, column management, inline editing
3. **Risk dashboard** — Gauges, treemaps, VaR bands, concentration heatmap
4. **P&L views** — Waterfall charts, attribution breakdown, period comparison
5. **Quote workflow wizard** — Multi-step UI with approval tracking
6. **CRM 360 view** — Customer single-page view with full history
7. **Keyboard shortcuts** for power users
8. **Mobile responsive** improvements

### Phase 5: Intelligence and Automation (Weeks 25-32) — "Work Smarter"

**Goal:** Leverage data for competitive advantage.

1. **Automated reporting** — Scheduled daily flash, weekly review, monthly performance
2. **Alert escalation system** — Tiered notifications with acknowledgment tracking
3. **Smart sourcing** — Automatic best-mill selection based on price, freight, reliability
4. **Customer purchase prediction** — Based on historical patterns, suggest proactive quotes
5. **Market intelligence automation** — Auto-ingest RL data on publication day
6. **Trader performance analytics** — Detailed attribution, benchmarking against desk averages
7. **AI assistant enhancement** — Context-aware suggestions based on current market and positions

---

## Appendix: Reference Files

| File | Lines | Purpose | Key Issues |
|------|-------|---------|------------|
| `js/state.js` | ~898 | Global state, constants, mill directory, normalization | 3 alias dictionaries, fragile localStorage |
| `js/data.js` | ~551 | Storage sync (IndexedDB, localStorage, Supabase, SQLite) | 4 competing storage layers |
| `js/views.js` | ~500+ | Main view rendering, dashboard, calendar | Massive HTML strings, inline styles |
| `js/trades.js` | ~100+ | Trade CRUD, blotter functions | No validation, no audit trail |
| `js/risk.js` | ~100+ | Position, VaR, exposure calculation | Client-side only, no persistence |
| `js/pnl.js` | ~100+ | P&L attribution engine | Good logic, needs server-side migration |
| `js/reports.js` | ~100+ | Report generation | Broken function signatures |
| `js/alerts.js` | ~80+ | Alert system | State not synced to cloud |
| `js/crm.js` | ~100+ | CRM management | Conversion loses data |
| `js/quotes.js` | ~100+ | Quote engine | No quote-to-trade pipeline |
| `js/analytics.js` | ~80+ | Trading analytics | Shadow buildBuyByOrder() |
| `js/utils.js` | ~100+ | Utility functions | Good normalization functions |
| `app.py` | ~1156 | Flask backend | Thin CRUD, duplicate mill aliases |
