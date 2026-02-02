// SYP Analytics - Mill Intel Smart Quote Builder
// Product x Length matrix, templates, best-source selection, freight calculation

let _miQuoteLoading = false;
let _miQuoteResults = [];
let _miActiveTemplate = '';

// Re-render the Smart Quotes UI into whichever container is active (inline or standalone)
function _miReRenderSource() {
  const inline = document.getElementById('mi-quotes-inline');
  if (inline) {
    _miRenderSmartQuotesInto(inline);
  } else {
    renderMiSmartQuotes();
  }
}

// Safe ID for product names with spaces (e.g. "2x4 MSR" → "2x4-MSR")
function _miPid(p) { return p.replace(/\s+/g, '-'); }

// --- Matrix grid helpers ---

function miGetMatrixState() {
  const grid = {};
  MI_PRODUCTS.forEach(p => {
    grid[p] = {};
    QUOTE_LENGTHS.forEach(l => {
      const cb = document.getElementById(`mi-mx-${_miPid(p)}-${l}`);
      grid[p][l] = cb ? cb.checked : false;
    });
  });
  return grid;
}

function miSetMatrixState(grid) {
  MI_PRODUCTS.forEach(p => {
    QUOTE_LENGTHS.forEach(l => {
      const cb = document.getElementById(`mi-mx-${_miPid(p)}-${l}`);
      if (cb) cb.checked = !!(grid[p] && grid[p][l]);
    });
  });
  miUpdateMatrixHeaders();
}

function miUpdateMatrixHeaders() {
  // Update row header checkboxes (indeterminate/checked state)
  MI_PRODUCTS.forEach(p => {
    const rowCb = document.getElementById(`mi-mx-row-${_miPid(p)}`);
    if (!rowCb) return;
    const checks = QUOTE_LENGTHS.map(l => {
      const cb = document.getElementById(`mi-mx-${_miPid(p)}-${l}`);
      return cb ? cb.checked : false;
    });
    const allOn = checks.every(c => c);
    const noneOn = checks.every(c => !c);
    rowCb.checked = allOn;
    rowCb.indeterminate = !allOn && !noneOn;
  });
  // Update col header checkboxes
  QUOTE_LENGTHS.forEach(l => {
    const colCb = document.getElementById(`mi-mx-col-${l}`);
    if (!colCb) return;
    const checks = MI_PRODUCTS.map(p => {
      const cb = document.getElementById(`mi-mx-${_miPid(p)}-${l}`);
      return cb ? cb.checked : false;
    });
    const allOn = checks.every(c => c);
    const noneOn = checks.every(c => !c);
    colCb.checked = allOn;
    colCb.indeterminate = !allOn && !noneOn;
  });
  // Count checked
  const count = miGetCheckedCombos().length;
  const countEl = document.getElementById('mi-mx-count');
  if (countEl) countEl.textContent = `${count} combo${count !== 1 ? 's' : ''} selected`;
}

function miToggleRow(product) {
  const rowCb = document.getElementById(`mi-mx-row-${_miPid(product)}`);
  const on = rowCb ? rowCb.checked : true;
  QUOTE_LENGTHS.forEach(l => {
    const cb = document.getElementById(`mi-mx-${_miPid(product)}-${l}`);
    if (cb) cb.checked = on;
  });
  _miActiveTemplate = '';
  miUpdateMatrixHeaders();
}

function miToggleCol(length) {
  const colCb = document.getElementById(`mi-mx-col-${length}`);
  const on = colCb ? colCb.checked : true;
  MI_PRODUCTS.forEach(p => {
    const cb = document.getElementById(`mi-mx-${_miPid(p)}-${length}`);
    if (cb) cb.checked = on;
  });
  _miActiveTemplate = '';
  miUpdateMatrixHeaders();
}

function miCellChanged() {
  _miActiveTemplate = '';
  miUpdateMatrixHeaders();
}

function miGetCheckedCombos() {
  const combos = [];
  MI_PRODUCTS.forEach(p => {
    QUOTE_LENGTHS.forEach(l => {
      const cb = document.getElementById(`mi-mx-${_miPid(p)}-${l}`);
      if (cb && cb.checked) combos.push({ product: p, length: l });
    });
  });
  return combos;
}

// --- Templates ---

function miApplyTemplate(name) {
  _miActiveTemplate = name;
  let grid;
  if (name === 'History') {
    grid = miHistoryGrid();
  } else if (QUOTE_TEMPLATES[name]) {
    grid = QUOTE_TEMPLATES[name].build();
  } else {
    // Custom saved template
    const custom = S.quoteTemplates.find(t => t.name === name);
    if (custom) grid = custom.grid;
    else return;
  }
  miSetMatrixState(grid);
  miHighlightActiveTemplate();
}

function miHistoryGrid() {
  const combos = getCustomerProductLengths(S.miQuoteCustomer);
  const grid = {};
  MI_PRODUCTS.forEach(p => { grid[p] = {}; QUOTE_LENGTHS.forEach(l => { grid[p][l] = false; }); });
  if (!combos.length) {
    // No history — check everything
    MI_PRODUCTS.forEach(p => QUOTE_LENGTHS.forEach(l => { grid[p][l] = true; }));
    return grid;
  }
  combos.forEach(c => {
    if (grid[c.product] && QUOTE_LENGTHS.includes(c.length)) {
      grid[c.product][c.length] = true;
    }
  });
  return grid;
}

function miHighlightActiveTemplate() {
  document.querySelectorAll('#mi-template-btns button').forEach(btn => {
    const name = btn.dataset.template;
    btn.className = name === _miActiveTemplate ? 'btn btn-primary' : 'btn btn-default';
    btn.style.cssText = 'padding:2px 8px;font-size:10px;min-width:0';
  });
}

function miSaveTemplate() {
  const name = prompt('Template name:');
  if (!name || !name.trim()) return;
  const grid = miGetMatrixState();
  const existing = S.quoteTemplates.findIndex(t => t.name === name.trim());
  if (existing >= 0) {
    S.quoteTemplates[existing].grid = grid;
  } else {
    S.quoteTemplates.push({ name: name.trim(), grid });
  }
  save('quoteTemplates', S.quoteTemplates);
  _miActiveTemplate = name.trim();
  _miReRenderSource();
  showToast(`Template "${name.trim()}" saved`, 'positive');
}

function miDeleteTemplate(name) {
  S.quoteTemplates = S.quoteTemplates.filter(t => t.name !== name);
  save('quoteTemplates', S.quoteTemplates);
  _miReRenderSource();
  showToast(`Template "${name}" deleted`, 'info');
}

// --- Customer change ---

function miOnCustomerChange(value) {
  S.miQuoteCustomer = value;
  const combos = getCustomerProductLengths(value);
  const histNote = document.getElementById('mi-quote-history-note');
  if (combos.length) {
    const orderCount = S.sells.filter(s => s.customer === value && s.status !== 'cancelled').length;
    miApplyTemplate('History');
    if (histNote) {
      const products = [...new Set(combos.map(c => c.product))];
      histNote.textContent = `Based on ${orderCount} past order${orderCount !== 1 ? 's' : ''}: ${products.join(', ')}`;
    }
  } else {
    if (histNote) histNote.textContent = value ? 'No order history' : '';
  }
}

// --- Rendering ---

async function renderMiSmartQuotes() {
  const c = document.getElementById('content');
  await _miRenderSmartQuotesInto(c);
}

async function renderMiSmartQuotesInline(container) {
  await _miRenderSmartQuotesInto(container);
}

async function _miRenderSmartQuotesInto(c) {
  // Merge MI customers + CRM customers (deduplicated)
  let miCustomers = [];
  try { miCustomers = await miLoadCustomers(); } catch (e) {}
  const crmCustomers = (S.customers || []).filter(c => c.type !== 'mill' && c.destination);
  const seen = new Set();
  const customers = [];
  crmCustomers.forEach(c => {
    const key = c.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      const dest = (c.locations && c.locations[0]) || c.destination || '';
      customers.push({ name: c.name, destination: dest, source: 'crm' });
    }
  });
  miCustomers.forEach(c => {
    const key = c.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      customers.push({ name: c.name, destination: c.destination || '', source: 'mi' });
    }
  });

  // Build template buttons
  const builtInNames = Object.keys(QUOTE_TEMPLATES);
  const customNames = S.quoteTemplates.map(t => t.name);
  const hasHistory = S.miQuoteCustomer && getCustomerProductLengths(S.miQuoteCustomer).length > 0;

  const templateBtns = [
    ...builtInNames.map(name => {
      const active = name === _miActiveTemplate;
      return `<button class="btn ${active ? 'btn-primary' : 'btn-default'}" style="padding:2px 8px;font-size:10px;min-width:0" data-template="${name}" onclick="miApplyTemplate('${name}')">${name}</button>`;
    }),
    ...(hasHistory ? [`<button class="btn ${_miActiveTemplate === 'History' ? 'btn-primary' : 'btn-default'}" style="padding:2px 8px;font-size:10px;min-width:0" data-template="History" onclick="miApplyTemplate('History')">History</button>`] : []),
    ...customNames.map(name => {
      const active = name === _miActiveTemplate;
      return `<span style="display:inline-flex;gap:1px"><button class="btn ${active ? 'btn-primary' : 'btn-default'}" style="padding:2px 8px;font-size:10px;min-width:0" data-template="${name}" onclick="miApplyTemplate('${name}')">${name}</button><button class="btn btn-default" style="padding:2px 4px;font-size:8px;min-width:0;color:var(--muted)" onclick="miDeleteTemplate('${name}')" title="Delete template">&times;</button></span>`;
    }),
    `<button class="btn btn-default" style="padding:2px 8px;font-size:10px;min-width:0;color:var(--positive)" onclick="miSaveTemplate()" title="Save current selection as template">+ Save</button>`
  ].join('');

  // Build the matrix grid
  // Group products with visual separators
  const gradeGroups = [
    {label: '#1', products: MI_PRODUCTS.filter(p => p.includes('#1'))},
    {label: '#2', products: MI_PRODUCTS.filter(p => p.includes('#2'))},
    {label: '#3', products: MI_PRODUCTS.filter(p => p.includes('#3'))},
    {label: '#4', products: MI_PRODUCTS.filter(p => p.includes('#4'))},
    {label: 'MSR', products: MI_PRODUCTS.filter(p => p.includes('MSR'))},
  ];

  const matrixRows = gradeGroups.map(grp => {
    const groupHeader = `<tr><td colspan="${QUOTE_LENGTHS.length + 1}" style="padding:6px 6px 2px;font-size:10px;font-weight:700;color:var(--muted);border-top:1px solid var(--border)">${grp.label}</td></tr>`;
    const rows = grp.products.map(p => {
      const pid = _miPid(p);
      const cells = QUOTE_LENGTHS.map(l =>
        `<td style="text-align:center;padding:3px"><input type="checkbox" id="mi-mx-${pid}-${l}" onchange="miCellChanged()"></td>`
      ).join('');
      return `<tr>
        <td style="white-space:nowrap;padding:3px 6px;font-size:11px;font-weight:600">
          <label style="cursor:pointer;display:flex;align-items:center;gap:4px">
            <input type="checkbox" id="mi-mx-row-${pid}" onchange="miToggleRow('${p}')">
            ${p}
          </label>
        </td>
        ${cells}
      </tr>`;
    }).join('');
    return groupHeader + rows;
  }).join('');

  const colHeaders = QUOTE_LENGTHS.map(l =>
    `<th style="text-align:center;padding:3px;font-size:10px;font-weight:600;min-width:28px">
      <div>${l === 'RL' ? 'RL' : l + "'"}</div>
      <input type="checkbox" id="mi-mx-col-${l}" onchange="miToggleCol('${l}')" style="margin-top:2px">
    </th>`
  ).join('');

  c.innerHTML = `
    <div class="grid-2" style="gap:16px;align-items:start">
      <div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">SMART QUOTE BUILDER</span>
          </div>
          <div class="card-body">
            <div class="form-grid" style="margin-bottom:16px">
              <div class="form-group">
                <label class="form-label">Customer</label>
                <select id="mi-quote-customer" onchange="miOnCustomerChange(this.value)" style="padding:6px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
                  <option value="">Select customer...</option>
                  ${customers.map(c => `<option value="${c.name}" data-dest="${c.destination||''}"${S.miQuoteCustomer===c.name?' selected':''}>${c.name} — ${c.destination||'?'}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Or enter destination</label>
                <input type="text" id="mi-quote-dest" placeholder="City, ST" style="padding:6px 8px;font-size:11px" value="">
              </div>
            </div>

            <div style="margin-bottom:12px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:4px">
                <label class="form-label" style="margin:0">Product x Length Matrix</label>
                <span id="mi-mx-count" style="font-size:10px;color:var(--muted)"></span>
              </div>
              <div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:8px" id="mi-template-btns">
                ${templateBtns}
              </div>
              <div style="overflow-x:auto">
                <table style="font-size:11px;border-collapse:collapse;width:100%" id="mi-quote-matrix">
                  <thead>
                    <tr>
                      <th style="text-align:left;padding:3px 6px;font-size:10px">PRODUCT</th>
                      ${colHeaders}
                    </tr>
                  </thead>
                  <tbody>
                    ${matrixRows}
                  </tbody>
                </table>
              </div>
              <div id="mi-quote-history-note" style="font-size:10px;color:var(--muted);margin-top:4px"></div>
            </div>

            <button class="btn btn-primary" onclick="miBuildSmartQuote()" ${_miQuoteLoading?'disabled':''}>
              ${_miQuoteLoading ? '<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px"></span>Building...' : 'Build Smart Quote'}
            </button>

            <div style="margin-top:16px" id="mi-quote-add-customer">
              <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px">
                <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:8px">ADD CUSTOMER</div>
                <div class="form-grid">
                  <div class="form-group"><label class="form-label">Name</label><input type="text" id="mi-new-cust-name" style="font-size:11px"></div>
                  <div class="form-group"><label class="form-label">Destination</label><input type="text" id="mi-new-cust-dest" placeholder="City, ST" style="font-size:11px"></div>
                </div>
                <button class="btn btn-sm btn-default" style="margin-top:8px" onclick="miAddNewCustomer()">Add Customer</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-header"><span class="card-title positive">QUOTE RESULTS</span></div>
          <div class="card-body" id="mi-quote-results">
            <div class="empty-state">Select a customer and product/length combos, then click Build Smart Quote</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Apply active template to set initial checkbox state
  if (_miActiveTemplate && (_miActiveTemplate === 'History' || QUOTE_TEMPLATES[_miActiveTemplate] || S.quoteTemplates.find(t => t.name === _miActiveTemplate))) {
    miApplyTemplate(_miActiveTemplate);
  }
  miUpdateMatrixHeaders();

  if (_miQuoteResults.length) miRenderQuoteResults();
}

async function miAddNewCustomer() {
  const name = document.getElementById('mi-new-cust-name')?.value?.trim();
  const dest = document.getElementById('mi-new-cust-dest')?.value?.trim();
  if (!name) { showToast('Customer name required', 'warn'); return; }
  try {
    await miApiPost('/api/mi/customers', {name, destination: dest, trader: S.trader});
    showToast(`Added customer: ${name}`, 'positive');
    _miReRenderSource();
  } catch (e) {
    showToast('Error: ' + e.message, 'warn');
  }
}

// --- Build Smart Quote (product+length combos) ---

async function miBuildSmartQuote() {
  const customerName = S.miQuoteCustomer || '';
  const customDest = document.getElementById('mi-quote-dest')?.value?.trim() || '';
  const destination = customDest || document.querySelector('#mi-quote-customer option:checked')?.dataset?.dest || '';

  if (!destination) {
    showToast('Select a customer or enter a destination', 'warn');
    return;
  }

  const combos = miGetCheckedCombos();
  if (!combos.length) {
    showToast('Check at least one product/length cell', 'warn');
    return;
  }

  _miQuoteLoading = true;
  _miReRenderSource();

  try {
    // Use length-detail matrix endpoint to get all mill×product×length data in one call
    const [matrixData, recommendations, mills] = await Promise.all([
      miLoadQuoteMatrix('length'),
      miLoadRecommendations(),
      miLoadMills()
    ]);

    const recByProduct = {};
    recommendations.forEach(r => recByProduct[r.product] = r);

    const millLocations = {};
    mills.forEach(m => { if (m.city) millLocations[m.name] = m.city; });

    // matrixData from detail=length: {matrix: {mill: {colKey: {price,...}}}, columns, mills, ...}
    // We need to search across all mills for each combo
    const allMills = matrixData.mills || [];

    _miQuoteResults = [];

    // Group combos by product for recommendation lookup
    for (const combo of combos) {
      const colKey = combo.length === 'RL' ? `${combo.product} RL` : `${combo.product} ${combo.length}'`;
      const rec = recByProduct[combo.product];

      const options = [];
      for (const mill of allMills) {
        const millData = matrixData.matrix[mill];
        if (!millData || !millData[colKey]) continue;

        const q = millData[colKey];
        const origin = millLocations[mill] || q.city || '';
        if (!origin) continue;

        let miles = null;
        let freightPerMBF = null;

        try {
          const mileageResult = await miGetMileage(origin, destination);
          miles = mileageResult.miles;
          const state = miExtractState(origin);
          const rate = S.stateRates[state] || MI_STATE_RATES[state] || 2.50;
          freightPerMBF = Math.round((S.freightBase + miles * rate) / S.quoteMBFperTL);
          if (freightPerMBF < S.shortHaulFloor) freightPerMBF = S.shortHaulFloor;
        } catch (e) {}

        const landedCost = freightPerMBF != null ? q.price + freightPerMBF : null;

        options.push({
          mill, origin, fobPrice: q.price,
          miles, freightPerMBF, landedCost,
          volume: q.volume || 0, tls: q.tls || 0,
          shipWindow: q.ship_window, date: q.date,
          trader: q.trader, region: q.region,
          length: combo.length
        });
      }

      options.sort((a, b) => {
        if (a.landedCost == null && b.landedCost == null) return a.fobPrice - b.fobPrice;
        if (a.landedCost == null) return 1;
        if (b.landedCost == null) return -1;
        return a.landedCost - b.landedCost;
      });

      const best = options[0] || null;
      const marginRange = rec?.margin_range || [22, 35];
      const suggestedSellPrice = best && best.landedCost ? best.landedCost + ((marginRange[0] + marginRange[1]) / 2) : null;

      _miQuoteResults.push({
        product: combo.product, length: combo.length,
        label: combo.length === 'RL' ? `${combo.product} RL` : `${combo.product} ${combo.length}'`,
        destination, customerName,
        recommendation: rec, best, options,
        marginRange, suggestedSellPrice
      });
    }

    miRenderQuoteResults();
  } catch (e) {
    showToast('Quote error: ' + e.message, 'warn');
  } finally {
    _miQuoteLoading = false;
  }
}

// --- Send to Quote Engine ---

function miSendToQuoteEngine() {
  if (!_miQuoteResults.length) { showToast('No quote results to send', 'warn'); return; }

  let added = 0;
  const destination = _miQuoteResults[0]?.destination || '';
  const customerName = _miQuoteResults[0]?.customerName || '';

  _miQuoteResults.forEach(r => {
    if (!r.best) return;

    const productLabel = r.length && r.length !== 'RL' ? `${r.product} ${r.length}` : r.product;

    // Skip duplicates (same product+length+origin already in quoteItems)
    const exists = S.quoteItems.find(i =>
      i.product === productLabel && i.origin === r.best.origin
    );
    if (exists) return;

    S.quoteItems.push({
      id: genId(),
      product: productLabel,
      origin: r.best.origin,
      tls: r.best.tls || 1,
      cost: r.best.fobPrice,
      fob: r.suggestedSellPrice ? Math.round(r.suggestedSellPrice) : Math.round((r.best.landedCost || r.best.fobPrice) + 28),
      isShort: false,
      selected: true,
      shipWeek: r.best.shipWindow || ''
    });
    added++;

    // Push lane data so freight works immediately in Quote Engine
    if (r.best.miles && destination) {
      const laneExists = S.lanes.find(l =>
        l.origin.toLowerCase().trim() === r.best.origin.toLowerCase().trim() &&
        l.dest.toLowerCase().trim() === destination.toLowerCase().trim()
      );
      if (!laneExists) {
        S.lanes.push({ origin: r.best.origin, dest: destination, miles: r.best.miles, added: new Date().toISOString() });
      }
    }
  });

  if (!added) { showToast('All items already in Quote Engine', 'info'); return; }

  save('quoteItems', S.quoteItems);
  save('lanes', S.lanes);
  saveCurrentProfileSelections();

  if (destination) S.specificCity = destination;

  if (customerName) {
    const crmMatch = S.customers.find(c => c.name === customerName && c.type !== 'mill');
    if (crmMatch) {
      S.singleQuoteCustomer = customerName;
      crmMatch.quoteSelected = true;
      save('customers', S.customers);
    }
  }

  S.view = 'quotes';
  S.quoteTab = 'build';
  save();
  render();
  showToast(`Loaded ${added} items into Quote Engine`, 'positive');
}

// --- Render quote results ---

function miRenderQuoteResults() {
  const el = document.getElementById('mi-quote-results');
  if (!el || !_miQuoteResults.length) return;

  const hasResults = _miQuoteResults.some(r => r.best);
  const noResults = _miQuoteResults.filter(r => !r.best);

  el.innerHTML = (hasResults ? `
    <div style="margin-bottom:16px;display:flex;gap:8px">
      <button class="btn btn-success" onclick="miSendToQuoteEngine()" style="flex:1">SEND TO QUOTE ENGINE</button>
    </div>
  ` : '') +

  // Summary table for quick scan
  (hasResults ? `
    <table style="font-size:11px;width:100%;margin-bottom:16px;border-collapse:collapse">
      <thead><tr style="border-bottom:2px solid var(--border)">
        <th style="text-align:left;padding:4px 6px">Item</th>
        <th style="text-align:left;padding:4px 6px">Best Mill</th>
        <th style="text-align:right;padding:4px 6px">FOB</th>
        <th style="text-align:right;padding:4px 6px">Freight</th>
        <th style="text-align:right;padding:4px 6px">Landed</th>
      </tr></thead>
      <tbody>
        ${_miQuoteResults.filter(r => r.best).map(r => `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:4px 6px;font-weight:600;color:var(--accent)">${r.label}</td>
          <td style="padding:4px 6px">${r.best.mill}</td>
          <td style="padding:4px 6px;text-align:right" class="mono">${fmt(r.best.fobPrice)}</td>
          <td style="padding:4px 6px;text-align:right" class="mono">${r.best.freightPerMBF != null ? fmt(r.best.freightPerMBF) : '—'}</td>
          <td style="padding:4px 6px;text-align:right;font-weight:600;color:var(--positive)" class="mono">${r.best.landedCost != null ? fmt(r.best.landedCost) : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  ` : '') +

  // No-offer items
  (noResults.length ? `
    <div style="margin-bottom:12px;padding:8px 10px;background:rgba(255,180,0,0.06);border-radius:var(--radius);font-size:11px;color:var(--warn)">
      No offers: ${noResults.map(r => r.label).join(', ')}
    </div>
  ` : '') +

  // Detailed cards per result
  _miQuoteResults.filter(r => r.best).map(r => {
    const rec = r.recommendation;
    const actionClass = rec?.action?.includes('BUY') ? 'positive' : rec?.action?.includes('SHORT') ? 'negative' : 'warn';

    let riskBadge = '';
    if (rec) {
      if (Math.abs(rec.score) >= 4) riskBadge = rec.score > 0 ? '<span class="badge badge-danger">HIGH</span>' : '<span class="badge badge-success">LOW</span>';
      else if (Math.abs(rec.score) >= 2) riskBadge = '<span class="badge badge-warn">MED</span>';
    }

    return `
      ${r.options.length > 1 ? `
        <details style="margin-bottom:8px">
          <summary style="font-size:11px;cursor:pointer;padding:4px 0">
            <strong style="color:var(--accent)">${r.label}</strong>
            — ${r.options.length} sources
            ${riskBadge}
            ${rec ? `<span style="font-weight:600;color:var(--${actionClass});font-size:10px">${rec.action}</span>` : ''}
          </summary>
          <table style="font-size:10px;margin-top:4px;width:100%">
            <thead><tr><th>Mill</th><th>FOB</th><th>Freight</th><th>Landed</th><th>Mi</th><th>Ship</th></tr></thead>
            <tbody>
              ${r.options.map((o, i) => `<tr style="${i === 0 ? 'background:rgba(74,158,110,0.08)' : ''}">
                <td>${o.mill}</td>
                <td class="mono">${fmt(o.fobPrice)}</td>
                <td class="mono">${o.freightPerMBF != null ? fmt(o.freightPerMBF) : '—'}</td>
                <td class="mono" style="font-weight:600">${o.landedCost != null ? fmt(o.landedCost) : '—'}</td>
                <td>${o.miles || '—'}</td>
                <td>${o.shipWindow || '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </details>
      ` : ''}
    `;
  }).join('');
}
