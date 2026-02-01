// SYP Mill Intelligence - App Shell
// Init, routing, settings, render dispatcher

function render() {
  renderNav();
  renderHeader();

  const view = S.view;
  if (view === 'intake') renderIntake();
  else if (view === 'aggregated') renderAggregated();
  else if (view === 'map') renderMap();
  else if (view === 'intel') renderIntelligence();
  else if (view === 'quotes') renderSmartQuotes();
  else if (view === 'settings') renderSettings();
  else renderIntake();
}

function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML = NAV.map(n =>
    `<button class="nav-item${S.view===n.id?' active':''}" onclick="navigate('${n.id}')">
      <span>${n.icon}</span>
      <span class="nav-label">${n.label}</span>
    </button>`
  ).join('');
}

function renderHeader() {
  const h = document.getElementById('header');
  if (!h) return;
  const label = NAV.find(n => n.id === S.view)?.label || 'Mill Intel';
  h.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px">
      <h1 style="font-size:16px;font-weight:600">${label}</h1>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <span style="color:var(--muted);font-size:11px">${S.trader}</span>
    </div>
  `;
}

function navigate(view) {
  S.view = view;
  SS('view', view);
  render();
}

function setTrader(name) {
  S.trader = name;
  SS('trader', name);
  render();
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  S.sidebarCollapsed = !S.sidebarCollapsed;
  SS('sidebarCollapsed', S.sidebarCollapsed);
  if (S.sidebarCollapsed) sb.classList.add('collapsed');
  else sb.classList.remove('collapsed');
}

// Settings view
function renderSettings() {
  const c = document.getElementById('content');
  c.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">SETTINGS</span></div>
      <div class="card-body">
        <div class="form-grid" style="max-width:600px">
          <div class="form-group full">
            <label class="form-label">Claude API Key</label>
            <input type="password" id="settings-apikey" value="${S.apiKey}" placeholder="sk-ant-..." style="font-size:11px">
            <div style="color:var(--muted);font-size:10px;margin-top:2px">Used for AI parsing of mill pricing. Stored locally in your browser.</div>
          </div>
          <div class="form-group">
            <label class="form-label">Freight Base ($/load)</label>
            <input type="number" id="settings-freight-base" value="${S.freightBase}" style="font-size:11px">
          </div>
          <div class="form-group">
            <label class="form-label">MBF per Truckload</label>
            <input type="number" id="settings-mbf-tl" value="${S.quoteMBFperTL}" style="font-size:11px">
          </div>
          <div class="form-group">
            <label class="form-label">Short Haul Floor ($/MBF)</label>
            <input type="number" id="settings-floor" value="${S.shortHaulFloor}" style="font-size:11px">
          </div>
        </div>
        <button class="btn btn-primary" style="margin-top:16px" onclick="saveSettings()">Save Settings</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title warn">STATE FREIGHT RATES</span></div>
      <div class="card-body">
        <div style="display:flex;flex-wrap:wrap;gap:8px;max-width:600px">
          ${Object.entries(S.stateRates).map(([st, rate]) => `
            <div style="display:flex;align-items:center;gap:4px">
              <span style="font-size:11px;font-weight:600;width:24px">${st}</span>
              <input type="number" step="0.05" value="${rate}" data-state="${st}" class="state-rate-input" style="width:60px;padding:4px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
            </div>
          `).join('')}
        </div>
        <button class="btn btn-default" style="margin-top:12px" onclick="saveStateRates()">Save Rates</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title info">DATABASE</span></div>
      <div class="card-body" id="settings-db-info">
        <div class="spinner" style="margin:10px"></div>
      </div>
    </div>
  `;

  // Load DB info
  loadDbInfo();
}

function saveSettings() {
  S.apiKey = document.getElementById('settings-apikey')?.value || '';
  S.freightBase = parseFloat(document.getElementById('settings-freight-base')?.value) || 450;
  S.quoteMBFperTL = parseInt(document.getElementById('settings-mbf-tl')?.value) || 23;
  S.shortHaulFloor = parseFloat(document.getElementById('settings-floor')?.value) || 0;
  SS('apiKey', S.apiKey);
  SS('freightBase', S.freightBase);
  SS('quoteMBFperTL', S.quoteMBFperTL);
  SS('shortHaulFloor', S.shortHaulFloor);
  showToast('Settings saved', 'positive');
}

function saveStateRates() {
  document.querySelectorAll('.state-rate-input').forEach(input => {
    const st = input.dataset.state;
    const rate = parseFloat(input.value) || 2.50;
    S.stateRates[st] = rate;
  });
  SS('stateRates', S.stateRates);
  showToast('Freight rates saved', 'positive');
}

async function loadDbInfo() {
  const el = document.getElementById('settings-db-info');
  if (!el) return;
  try {
    const [mills, quotes] = await Promise.all([loadMills(), loadAllQuotes()]);
    el.innerHTML = `
      <div style="display:flex;gap:24px;font-size:12px">
        <div><span style="color:var(--muted)">Mills:</span> <strong>${mills.length}</strong></div>
        <div><span style="color:var(--muted)">Quotes:</span> <strong>${quotes.length}</strong></div>
        <div><span style="color:var(--muted)">Geocoded:</span> <strong>${mills.filter(m => m.lat).length}</strong></div>
        <div><span style="color:var(--muted)">Database:</span> <strong>mill_intel.db</strong></div>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div style="color:var(--warn);font-size:11px">Could not connect to server. Is Flask running?</div>`;
  }
}

// Status bar clock
function initStatusBar() {
  const clockEl = document.getElementById('status-clock');
  const traderEl = document.getElementById('status-trader');
  if (traderEl) traderEl.textContent = S.trader || '—';
  if (clockEl) {
    const tick = () => {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString('en-US', { hour12: false });
    };
    tick();
    setInterval(tick, 1000);
  }
}

// ----- INIT -----

function init() {
  // Populate trader selector
  const sel = document.getElementById('trader-select');
  if (sel) {
    sel.innerHTML = TRADERS.map(t => `<option value="${t}"${S.trader===t?' selected':''}>${t}</option>`).join('');
  }

  // Apply sidebar state
  if (S.sidebarCollapsed) {
    document.getElementById('sidebar')?.classList.add('collapsed');
  }

  initStatusBar();
  render();
}

// Start on load
document.addEventListener('DOMContentLoaded', init);
