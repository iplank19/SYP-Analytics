// SYP Analytics - Mill Intel Smart Quote Builder
// Product entry + length selection, best-source selection, freight calculation

let _miQuoteLoading = false;
let _miQuoteResults = [];
let _miActiveTemplate = '';
let _miQuoteProducts = []; // [{product:'2x4#2', lengths:{8:true,10:true}, qty:'', ship:'1-2 Weeks'}]
let _miQuoteMode = 'entry'; // 'entry' = new product entry, 'matrix' = classic checkbox

// Toggle between entry and matrix modes
function miToggleQuoteMode() {
  _miQuoteMode = _miQuoteMode === 'entry' ? 'matrix' : 'entry';
  _miReRenderSource();
}

// Re-render the Smart Quotes UI into whichever container is active (inline or standalone)
function _miReRenderSource() {
  const inline = document.getElementById('mi-quotes-inline');
  const content = document.getElementById('content');
  if (inline) {
    _miRenderSmartQuotesInto(inline);
  } else if (content) {
    renderMiSmartQuotes();
  }
}

// Safe ID for product names with spaces (e.g. "2x4 MSR" → "2x4-MSR")
function _miPid(p) { return p.replace(/\s+/g, '-'); }

// --- Classic Matrix Helpers ---

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
  const count = miGetMatrixCheckedCombos().length;
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

function miGetMatrixCheckedCombos() {
  const combos = [];
  MI_PRODUCTS.forEach(p => {
    QUOTE_LENGTHS.forEach(l => {
      const cb = document.getElementById(`mi-mx-${_miPid(p)}-${l}`);
      if (cb && cb.checked) combos.push({ product: p, length: l });
    });
  });
  return combos;
}

// --- Product Entry Helpers ---

function miAddQuoteProduct() {
  const input = document.getElementById('mi-product-input');
  if (!input) return;
  let product = input.value.trim();
  if (!product) { showToast('Enter a product', 'warn'); return; }
  product = normalizeProduct(product);
  _miQuoteProducts.push({product, lengths: {}, qty: '', ship: '1-2 Weeks'});
  input.value = '';
  input.focus();
  _miReRenderSource();
}

function miRemoveQuoteProduct(idx) {
  _miQuoteProducts.splice(idx, 1);
  _miReRenderSource();
}

function miToggleQuoteLength(idx, len) {
  if (!_miQuoteProducts[idx]) return;
  if (!_miQuoteProducts[idx].lengths) _miQuoteProducts[idx].lengths = {};
  _miQuoteProducts[idx].lengths[len] = !_miQuoteProducts[idx].lengths[len];
  _miReRenderSource();
}

function miSelectAllLengths(idx) {
  if (!_miQuoteProducts[idx]) return;
  _miQuoteProducts[idx].lengths = {};
  const lengths = ['8','10','12','14','16','18','20'];
  lengths.forEach(l => _miQuoteProducts[idx].lengths[l] = true);
  _miReRenderSource();
}

function miUpdateProductField(idx, field, value) {
  if (!_miQuoteProducts[idx]) return;
  _miQuoteProducts[idx][field] = value;
}

function miGetSelectedCount() {
  let count = 0;
  const lengths = ['8','10','12','14','16','18','20'];
  _miQuoteProducts.forEach(p => {
    lengths.forEach(l => { if (p.lengths && p.lengths[l]) count++; });
  });
  return count;
}

function miGetCheckedCombos() {
  // Use matrix mode if active, otherwise use product entry
  if (_miQuoteMode === 'matrix') {
    return miGetMatrixCheckedCombos();
  }
  const combos = [];
  const lengths = ['8','10','12','14','16','18','20'];
  _miQuoteProducts.forEach(p => {
    lengths.forEach(l => {
      if (p.lengths && p.lengths[l]) {
        combos.push({ product: p.product, length: l, qty: p.qty, ship: p.ship });
      }
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
  if (!c) {
    console.warn('_miRenderSmartQuotesInto: container is null, skipping render');
    return;
  }

  const lengths = ['8','10','12','14','16','18','20'];
  const isEntryMode = _miQuoteMode === 'entry';

  // Mode toggle buttons
  const modeToggle = `
    <div style="display:flex;gap:4px;margin-bottom:12px">
      <button class="btn ${isEntryMode ? 'btn-primary' : 'btn-default'}" style="padding:6px 12px;font-size:11px" onclick="_miQuoteMode='entry';_miReRenderSource()">Type to Add</button>
      <button class="btn ${!isEntryMode ? 'btn-primary' : 'btn-default'}" style="padding:6px 12px;font-size:11px" onclick="_miQuoteMode='matrix';_miReRenderSource()">Checkbox Matrix</button>
    </div>`;

  let productSection = '';
  let totalSelected = 0;

  if (isEntryMode) {
    // Product Entry Mode
    totalSelected = miGetSelectedCount();

    let productRows = '';
    for (let idx = 0; idx < _miQuoteProducts.length; idx++) {
      const p = _miQuoteProducts[idx];
      let lengthCells = '';
      for (let li = 0; li < lengths.length; li++) {
        const len = lengths[li];
        const isOn = p.lengths && p.lengths[len];
        const bgColor = isOn ? 'var(--accent)' : 'var(--bg)';
        const txtColor = isOn ? 'var(--bg)' : 'var(--muted)';
        lengthCells += `<td style="padding:8px;text-align:center;border:1px solid var(--border);cursor:pointer;background:${bgColor};color:${txtColor};font-weight:600;font-size:14px" onclick="miToggleQuoteLength(${idx},'${len}')">${isOn ? '✓' : ''}</td>`;
      }
      productRows += `<tr>
        <td style="padding:10px 12px;font-weight:600;font-size:13px;border:1px solid var(--border);background:var(--panel-alt)">${p.product}</td>
        ${lengthCells}
        <td style="padding:2px;border:1px solid var(--border)">
          <input type="text" value="${p.qty || ''}" placeholder="Qty" style="width:50px;padding:4px;font-size:11px;text-align:center;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)" onchange="miUpdateProductField(${idx},'qty',this.value)">
        </td>
        <td style="padding:2px;border:1px solid var(--border)">
          <select style="padding:4px;font-size:10px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)" onchange="miUpdateProductField(${idx},'ship',this.value)">
            <option value="Prompt" ${p.ship === 'Prompt' ? 'selected' : ''}>Prompt</option>
            <option value="1-2 Weeks" ${!p.ship || p.ship === '1-2 Weeks' ? 'selected' : ''}>1-2 Wks</option>
            <option value="2-3 Weeks" ${p.ship === '2-3 Weeks' ? 'selected' : ''}>2-3 Wks</option>
            <option value="3-4 Weeks" ${p.ship === '3-4 Weeks' ? 'selected' : ''}>3-4 Wks</option>
          </select>
        </td>
        <td style="padding:4px;text-align:center;border:1px solid var(--border)">
          <button class="btn btn-default" style="padding:4px 8px;font-size:10px" onclick="miSelectAllLengths(${idx})">ALL</button>
        </td>
        <td style="padding:4px;text-align:center;border:1px solid var(--border)">
          <button class="btn" style="padding:4px 8px;font-size:10px;background:var(--negative);color:#fff" onclick="miRemoveQuoteProduct(${idx})">✕</button>
        </td>
      </tr>`;
    }

    const productTable = _miQuoteProducts.length ? `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:var(--panel-alt)">
              <th style="padding:10px 12px;text-align:left;border:1px solid var(--border);min-width:100px">Product</th>
              ${lengths.map(l => `<th style="padding:10px 8px;text-align:center;border:1px solid var(--border);min-width:50px">${l}'</th>`).join('')}
              <th style="padding:10px 4px;text-align:center;border:1px solid var(--border);width:60px">Qty</th>
              <th style="padding:10px 4px;text-align:center;border:1px solid var(--border);width:70px">Ship</th>
              <th style="padding:10px 4px;text-align:center;border:1px solid var(--border);width:50px"></th>
              <th style="padding:10px 4px;text-align:center;border:1px solid var(--border);width:40px"></th>
            </tr>
          </thead>
          <tbody>${productRows}</tbody>
        </table>
      </div>
    ` : `<div style="text-align:center;padding:30px;color:var(--muted)">Type a product above (e.g., 2x4#2) and click ADD</div>`;

    productSection = `
      <label class="form-label">① ADD PRODUCTS</label>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <input type="text" id="mi-product-input" placeholder="Type: 2x4#2, 2x6 #1, 2x8 MSR..." style="flex:1;padding:12px;font-size:14px;background:var(--surface);color:var(--text);border:2px solid var(--border);border-radius:var(--radius)" onkeydown="if(event.key==='Enter'){event.preventDefault();miAddQuoteProduct()}">
        <button class="btn btn-primary" style="padding:12px 20px;font-size:14px" onclick="miAddQuoteProduct()">+ ADD</button>
      </div>
      ${productTable}`;
  } else {
    // Classic Checkbox Matrix Mode
    const gradeGroups = [
      {label: '#1', products: MI_PRODUCTS.filter(p => p.includes('#1'))},
      {label: '#2', products: MI_PRODUCTS.filter(p => p.includes('#2'))},
      {label: '#3', products: MI_PRODUCTS.filter(p => p.includes('#3'))},
      {label: '#4', products: MI_PRODUCTS.filter(p => p.includes('#4'))},
      {label: 'MSR', products: MI_PRODUCTS.filter(p => p.includes('MSR'))},
    ];

    const matrixRows = gradeGroups.map(grp => {
      const groupHeader = `<tr><td colspan="${lengths.length + 1}" style="padding:6px 6px 2px;font-size:10px;font-weight:700;color:var(--muted);border-top:1px solid var(--border)">${grp.label}</td></tr>`;
      const rows = grp.products.map(p => {
        const pid = _miPid(p);
        const cells = lengths.map(l =>
          `<td style="text-align:center;padding:3px"><input type="checkbox" id="mi-mx-${pid}-${l}" onchange="miCellChanged()"></td>`
        ).join('');
        return `<tr>
          <td style="white-space:nowrap;padding:3px 6px;font-size:11px;font-weight:600">
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px">
              <input type="checkbox" id="mi-mx-row-${pid}" onchange="miToggleRow('${p}')">
              ${typeof formatProductHeader === 'function' ? formatProductHeader(p) : p}
            </label>
          </td>
          ${cells}
        </tr>`;
      }).join('');
      return groupHeader + rows;
    }).join('');

    const colHeaders = lengths.map(l =>
      `<th style="text-align:center;padding:3px;font-size:10px;font-weight:600;min-width:28px">
        <div>${l}'</div>
        <input type="checkbox" id="mi-mx-col-${l}" onchange="miToggleCol('${l}')" style="margin-top:2px">
      </th>`
    ).join('');

    productSection = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <label class="form-label" style="margin:0">① SELECT PRODUCTS & LENGTHS</label>
        <span id="mi-mx-count" style="font-size:10px;color:var(--muted)">0 combos selected</span>
      </div>
      <div style="overflow-x:auto;max-height:400px;overflow-y:auto">
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
      </div>`;
  }

  c.innerHTML = `
    <div class="grid-2" style="gap:16px;align-items:start">
      <div>
        <div class="card">
          <div class="card-header">
            <span class="card-title">SMART QUOTE BUILDER</span>
            <span style="font-size:11px;color:var(--muted)">${isEntryMode ? totalSelected + ' selected' : ''}</span>
          </div>
          <div class="card-body">
            ${modeToggle}
            <div style="margin-bottom:16px">
              <div class="form-group">
                <label class="form-label">Destination</label>
                <input type="text" id="mi-quote-dest" placeholder="City, ST" style="padding:10px;font-size:14px;width:100%;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)" value="">
              </div>
            </div>

            <div style="margin-bottom:16px">
              ${productSection}
            </div>

            <button class="btn btn-success" onclick="miBuildSmartQuote()" style="padding:14px 28px;font-size:16px;width:100%" ${_miQuoteLoading ? 'disabled' : ''}>
              ${_miQuoteLoading ? '<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;border-width:2px"></span>Building...' : '💰 GET COSTS'}
            </button>
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-header">
            <span class="card-title positive">② QUOTE RESULTS</span>
            ${_miQuoteResults.length ? `<button class="btn btn-sm btn-success" onclick="miCopyQuoteResults()">📋 Copy</button>` : ''}
          </div>
          <div class="card-body" id="mi-quote-results">
            <div class="empty-state">Enter a destination, select products/lengths, then click GET COSTS</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // For matrix mode, update headers after render
  if (!isEntryMode) {
    setTimeout(() => miUpdateMatrixHeaders(), 0);
  }

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
  const destination = document.getElementById('mi-quote-dest')?.value?.trim() || '';

  if (!destination) {
    showToast('Enter a destination (City, ST)', 'warn');
    return;
  }

  const combos = miGetCheckedCombos();
  if (!combos.length) {
    showToast('Add products and select at least one length', 'warn');
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
    mills.forEach(m => {
      if (m.location) millLocations[m.name] = m.location;
      else if (m.city) millLocations[m.name] = m.state ? m.city + ', ' + m.state : m.city;
    });

    const allMills = matrixData.mills || [];

    // --- STEP 1: Collect all unique origin→destination lanes needed ---
    const originMap = {}; // mill → origin string
    const neededLanes = [];
    const seenKeys = new Set();

    for (const combo of combos) {
      const colKey = combo.length === 'RL' ? `${combo.product} RL` : `${combo.product} ${combo.length}'`;
      for (const mill of allMills) {
        const millData = matrixData.matrix[mill];
        if (!millData || !millData[colKey]) continue;

        const q = millData[colKey];
        const qOrigin = q.city && q.state ? q.city + ', ' + q.state : q.city || '';
        const origin = millLocations[mill] || qOrigin;
        if (!origin) continue;

        originMap[mill] = origin;

        // Check if lane is already cached (same logic as build side)
        const key = `${origin}|${destination}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        const cachedMiles = typeof getLaneMiles === 'function' ? getLaneMiles(origin, destination) : null;
        if (!cachedMiles) {
          neededLanes.push({ key, origin, dest: destination });
        }
      }
    }

    // --- STEP 2: Bulk lookup missing lanes (same as build side) ---
    if (neededLanes.length > 0) {
      console.log(`Sourcing: Looking up ${neededLanes.length} missing lane(s)...`);
      if (typeof lookupMileageWithAPI === 'function') {
        const failed = await lookupMileageWithAPI(neededLanes);
        if (failed.length > 0) {
          console.log(`${failed.length} lane(s) failed lookup — freight will be unavailable for those`);
        }
      }
    }

    // --- STEP 3: Build quotes using cached lanes + calcFreightPerMBF (same as build side) ---
    _miQuoteResults = [];

    for (const combo of combos) {
      const colKey = combo.length === 'RL' ? `${combo.product} RL` : `${combo.product} ${combo.length}'`;
      const rec = recByProduct[combo.product];

      const options = [];
      for (const mill of allMills) {
        const millData = matrixData.matrix[mill];
        if (!millData || !millData[colKey]) continue;

        const q = millData[colKey];
        const origin = originMap[mill] || (q.city && q.state ? q.city + ', ' + q.state : q.city || '');
        if (!origin) continue;

        // Use getLaneMiles (same cache as build side)
        const miles = typeof getLaneMiles === 'function' ? getLaneMiles(origin, destination) : null;

        // Use calcFreightPerMBF (same function as build side)
        const isMSR = (combo.product || '').toUpperCase().includes('MSR');
        const freightPerMBF = miles && typeof calcFreightPerMBF === 'function'
          ? calcFreightPerMBF(miles, origin, isMSR) : null;

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
        label: formatProductLabel(combo.product, combo.length),
        destination,
        qty: combo.qty, ship: combo.ship,
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

    const productLabel = formatProductLabel(r.product, r.length);

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
      fob: Math.round(r.best.fobPrice),
      marginAdj: 0,
      isShort: false,
      selected: true,
      shipWeek: r.best.shipWindow || '',
      quoteDate: r.best.date || ''
    });
    added++;

    // Push lane data so freight works immediately in Quote Engine
    if (r.best.miles && destination) {
      const existingMiles = typeof getLaneMiles === 'function' ? getLaneMiles(r.best.origin, destination) : null;
      if (!existingMiles) {
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

function miCopyQuoteResults() {
  const results = _miQuoteResults.filter(r => r.best);
  if (!results.length) return;
  const dest = document.getElementById('mi-quote-dest')?.value?.trim() || '';

  // Build HTML table (matches Build tab style for Outlook paste)
  const html = `<html><body style="font-family:Calibri,Arial,sans-serif;">
<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;">
  <thead>
    <tr style="background:#1a5f7a;color:white;">
      <th style="padding:8px 12px;text-align:left;border:1px solid #ccc;">Product</th>
      <th style="padding:8px 12px;text-align:right;border:1px solid #ccc;">Price</th>
      <th style="padding:8px 12px;text-align:center;border:1px solid #ccc;">Qty</th>
      <th style="padding:8px 12px;text-align:right;border:1px solid #ccc;">Ship</th>
    </tr>
  </thead>
  <tbody>
    ${results.map((r, i) => {
      const displayQty = r.qty || (r.best.tls ? r.best.tls + ' TL' : '1 TL');
      const displayShip = r.ship || r.best.shipWindow || 'Prompt';
      return `<tr style="background:${i % 2 ? '#f5f5f5' : 'white'};">
      <td style="padding:6px 12px;border:1px solid #ddd;">${r.label}</td>
      <td style="padding:6px 12px;text-align:right;border:1px solid #ddd;font-weight:bold;color:#2e7d32;">${r.best.landedCost != null ? '$' + Math.round(r.best.landedCost) : '$' + Math.round(r.best.fobPrice)}</td>
      <td style="padding:6px 12px;text-align:center;border:1px solid #ddd;">${displayQty}</td>
      <td style="padding:6px 12px;text-align:right;border:1px solid #ddd;color:#666;">${displayShip}</td>
    </tr>`;}).join('')}
  </tbody>
</table>
<p style="font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#666;margin-top:8px;">
  <strong>DLVD ${dest}</strong>
</p>
</body></html>`;

  // Plain text fallback
  const lines = ['SYP Quote \u2014 Delivered: ' + dest, ''];
  lines.push(['Product', 'Price', 'Qty', 'Ship'].join('\t'));
  results.forEach(r => {
    const price = r.best.landedCost != null ? '$' + Math.round(r.best.landedCost) : '$' + Math.round(r.best.fobPrice);
    const displayQty = r.qty || (r.best.tls ? r.best.tls + ' TL' : '1 TL');
    const displayShip = r.ship || r.best.shipWindow || 'Prompt';
    lines.push([r.label, price, displayQty, displayShip].join('\t'));
  });
  const noOffer = _miQuoteResults.filter(r => !r.best);
  if (noOffer.length) { lines.push(''); lines.push('No offers: ' + noOffer.map(r => r.label).join(', ')); }
  const text = lines.join('\n');

  // Copy HTML + plain text (like Build tab)
  try {
    const htmlBlob = new Blob([html], {type: 'text/html'});
    const textBlob = new Blob([text], {type: 'text/plain'});
    navigator.clipboard.write([new ClipboardItem({'text/html': htmlBlob, 'text/plain': textBlob})]).then(() => {
      if (typeof showToast === 'function') showToast('Copied! Paste into Outlook for formatted table', 'positive');
    }).catch(() => {
      navigator.clipboard.writeText(text).then(() => {
        if (typeof showToast === 'function') showToast('Copied to clipboard', 'positive');
      });
    });
  } catch (e) {
    navigator.clipboard.writeText(text).then(() => {
      if (typeof showToast === 'function') showToast('Copied to clipboard', 'positive');
    });
  }
}

function miRenderQuoteResults() {
  const el = document.getElementById('mi-quote-results');
  if (!el || !_miQuoteResults.length) return;

  const hasResults = _miQuoteResults.some(r => r.best);
  const noResults = _miQuoteResults.filter(r => !r.best);
  const isMatrixMode = !!document.getElementById('matrix-quotes-content');

  el.innerHTML = (hasResults ? `
    <div style="margin-bottom:16px;display:flex;gap:8px">
      ${isMatrixMode ? '' : '<button class="btn btn-success" onclick="miSendToQuoteEngine()" style="flex:1">SEND TO QUOTE ENGINE</button>'}
      <button class="btn btn-default" onclick="miCopyQuoteResults()" style="${isMatrixMode ? 'flex:1' : ''}"><span style="margin-right:4px">📋</span> COPY TO CLIPBOARD</button>
    </div>
  ` : '') +

  // Summary table for quick scan
  (hasResults ? `
    <table style="font-size:11px;width:100%;margin-bottom:16px;border-collapse:collapse">
      <thead><tr style="border-bottom:2px solid var(--border)">
        ${isMatrixMode ? `
          <th style="text-align:left;padding:4px 6px">Product</th>
          <th style="text-align:right;padding:4px 6px">Price</th>
          <th style="text-align:center;padding:4px 6px">Qty</th>
          <th style="text-align:right;padding:4px 6px">Ship</th>
        ` : `
          <th style="text-align:left;padding:4px 6px">Item</th>
          <th style="text-align:left;padding:4px 6px">Best Mill</th>
          <th style="text-align:right;padding:4px 6px">FOB</th>
          <th style="text-align:right;padding:4px 6px">Freight</th>
          <th style="text-align:right;padding:4px 6px">Landed</th>
        `}
      </tr></thead>
      <tbody>
        ${_miQuoteResults.filter(r => r.best).map(r => {
          const displayQty = r.qty || (r.best.tls ? r.best.tls + ' TL' : '1 TL');
          const displayShip = r.ship || r.best.shipWindow || 'Prompt';
          return isMatrixMode ? `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:4px 6px;font-weight:600;color:var(--accent)">${r.label}${r.best.date && miAgeLabel(r.best.date) !== 'Today' ? `<span style="font-size:9px;padding:1px 5px;border-radius:3px;margin-left:6px;background:${miAgeBadgeBg(r.best.date)};color:${miAgeBadgeColor(r.best.date)}">${miAgeLabel(r.best.date)}</span>` : ''}</td>
          <td style="padding:4px 6px;text-align:right;font-weight:600;color:var(--positive)" class="mono">${r.best.landedCost != null ? fmt(r.best.landedCost) : fmt(r.best.fobPrice)}</td>
          <td style="padding:4px 6px;text-align:center" class="mono">${displayQty}</td>
          <td style="padding:4px 6px;text-align:right;color:var(--muted)">${displayShip}</td>
        </tr>` : `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:4px 6px;font-weight:600;color:var(--accent)">${r.label}${r.best.date && miAgeLabel(r.best.date) !== 'Today' ? `<span style="font-size:9px;padding:1px 5px;border-radius:3px;margin-left:6px;background:${miAgeBadgeBg(r.best.date)};color:${miAgeBadgeColor(r.best.date)}">${miAgeLabel(r.best.date)}</span>` : ''}</td>
          <td style="padding:4px 6px">${r.best.mill}</td>
          <td style="padding:4px 6px;text-align:right" class="mono">${fmt(r.best.fobPrice)}</td>
          <td style="padding:4px 6px;text-align:right" class="mono">${r.best.freightPerMBF != null ? fmt(r.best.freightPerMBF) : '—'}</td>
          <td style="padding:4px 6px;text-align:right;font-weight:600;color:var(--positive)" class="mono">${r.best.landedCost != null ? fmt(r.best.landedCost) : '—'}</td>
        </tr>`; }).join('')}
      </tbody>
    </table>
  ` : '') +

  // No-offer items
  (noResults.length ? `
    <div style="margin-bottom:12px;padding:8px 10px;background:rgba(255,180,0,0.06);border-radius:var(--radius);font-size:11px;color:var(--warn)">
      No offers: ${noResults.map(r => r.label).join(', ')}
    </div>
  ` : '') +

  // Detailed cards per result — show sources, hide intel badges in matrix mode
  _miQuoteResults.filter(r => r.best).map(r => {
    const rec = r.recommendation;
    const actionClass = rec?.action?.includes('BUY') ? 'positive' : rec?.action?.includes('SHORT') ? 'negative' : 'warn';

    let riskBadge = '';
    if (!isMatrixMode && rec) {
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
            ${!isMatrixMode && rec ? `<span style="font-weight:600;color:var(--${actionClass});font-size:10px">${rec.action}</span>` : ''}
          </summary>
          <table style="font-size:10px;margin-top:4px;width:100%">
            <thead><tr><th>Mill</th><th>FOB</th><th>Freight</th><th>Landed</th><th>Mi</th><th>Ship</th><th>Age</th></tr></thead>
            <tbody>
              ${r.options.map((o, i) => `<tr style="${i === 0 ? 'background:rgba(74,158,110,0.08)' : ''}">
                <td>${o.mill}</td>
                <td class="mono">${fmt(o.fobPrice)}</td>
                <td class="mono">${o.freightPerMBF != null ? fmt(o.freightPerMBF) : '—'}</td>
                <td class="mono" style="font-weight:600">${o.landedCost != null ? fmt(o.landedCost) : '—'}</td>
                <td>${o.miles || '—'}</td>
                <td>${o.shipWindow || '—'}</td>
                <td style="color:${miAgeColor(o.date)}">${miAgeLabel(o.date)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </details>
      ` : ''}
    `;
  }).join('');
}
