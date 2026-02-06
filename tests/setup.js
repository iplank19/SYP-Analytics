/**
 * Test setup: loads SYP Analytics JS source files into the global scope.
 *
 * Browser JS files use top-level const/function declarations that become
 * window globals in browsers. In Node/Jest, we eval them to place
 * declarations into the test module's scope.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Minimal browser stubs — set on global so they're available everywhere
global.document = global.document || {
  getElementById: () => null,
  createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {} }),
  querySelectorAll: () => [],
  querySelector: () => null,
  body: { appendChild: () => {}, classList: { add: () => {}, remove: () => {} } },
  addEventListener: () => {}
};
global.window = global.window || {
  addEventListener: () => {},
  location: { href: '', reload: () => {} },
  innerWidth: 1024,
  innerHeight: 768
};
if (!global.localStorage) {
  global.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] || null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; },
    clear() { this._store = {}; }
  };
}
global.fetch = global.fetch || (() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
global.alert = global.alert || (() => {});
global.confirm = global.confirm || (() => true);
global.crypto = global.crypto || { randomUUID: () => 'test-' + Math.random().toString(36).slice(2) };
global.Chart = global.Chart || function() { return { destroy: () => {}, update: () => {} }; };
global.indexedDB = global.indexedDB || null;
global.navigator = global.navigator || { userAgent: 'test' };

// Stub save() to just update S (no IndexedDB/localStorage side effects)
global.save = function(key, value) { global.S[key] = value; };
// Stub render() and showToast() to no-op
global.render = function() {};
global.showToast = function() {};

/**
 * Read a JS source file and return its code with const/let converted to var.
 * @param {string} relPath - Path relative to project root (e.g. 'js/state.js')
 * @returns {string} The source code ready for eval
 */
function getSource(relPath) {
  const absPath = path.join(ROOT, relPath);
  let code = fs.readFileSync(absPath, 'utf-8');
  // Convert top-level const/let to var so they become hoisted globals when eval'd
  code = code.replace(/^(const|let) /gm, 'var ');
  return code;
}

/**
 * Reset the global state object S to a clean default.
 * Call this in beforeEach() to isolate tests.
 */
function resetState() {
  global.S = {
    view: 'dashboard',
    filters: { date: '30d', prod: 'all', reg: 'all' },
    buys: [],
    sells: [],
    rl: [],
    customers: [],
    mills: [],
    nextId: 1,
    apiKey: '',
    aiMsgs: [],
    aiPanelOpen: false,
    flatRate: 3.50,
    autoSync: false,
    lanes: [],
    quoteItems: [],
    quoteMode: 'known',
    quoteMBFperTL: 23,
    stateRates: {},
    quoteProfiles: {},
    quoteProfile: 'default',
    marketBlurb: '',
    shortHaulFloor: 0,
    freightBase: 450,
    singleQuoteCustomer: '',
    chartProduct: '2x4#2',
    trader: 'Ian P',
    leaderboardPeriod: '30d',
    traderGoals: {},
    achievements: [],
    crmViewMode: 'table',
    sidebarCollapsed: false,
    futuresContracts: [],
    frontHistory: [],
    futuresParams: {},
    dashChartRange: '1M',
    dashboardOrder: null,
    futuresTab: 'chart',
    calendarMonth: null,
    aiModel: 'claude-opus-4-20250514',
    ppu: { '2x4': 208, '2x6': 128 },
    mbfPerTL: { standard: 23, msr: 20, timber: 20 },
    unitsMode: true,
    millQuotes: [],
    millPricingTab: 'intake',
    miFilterProduct: '',
    miFilterMill: '',
    miFilterTrader: '',
    miFilterDays: 7,
    miQuoteCustomer: '',
    miQuoteItems: [],
    quoteTemplates: []
  };
}

module.exports = { getSource, resetState, ROOT };
