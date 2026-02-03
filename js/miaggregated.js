// SYP Analytics - Mill Intel Aggregated View
// Table, matrix, trend charts, filters

let _miAggTab = 'table';
let _miAggSortCol = 'product';
let _miAggSortAsc = true;
let _miTrendProduct = '2x4#2';
let _miTrendDays = 90;
let _miMatrixDetail = 'length';
let _miMatrixProduct = '';
let _miMatrixHideEmpty = LS('miMatrixHideEmpty', true);
let _miMatrixHideMills = LS('miMatrixHideMills', true);
let _miMatrixDensity = LS('miMatrixDensity', 'compact');
let _miMatrixCutoff = LS('miMatrixCutoff', ''); // '' = show all, date string = show only quotes since that date
let _miMatrixMaxAge = LS('miMatrixMaxAge', ''); // '' = show all, number = max days old (e.g. '1' = today only, '3' = last 3 days)

async function renderMiAggregated() {
  const c = document.getElementById('content');
  c.innerHTML = `
    <div class="card" style="margin-bottom:0;border-bottom:none;border-radius:var(--radius) var(--radius) 0 0">
      <div class="card-header" style="flex-wrap:wrap;gap:8px">
        <span class="card-title">ALL MILL PRICES</span>
        <div style="display:flex;gap:4px;align-items:center">
          <button class="btn btn-sm ${_miAggTab==='table'?'btn-primary':'btn-default'}" onclick="_miAggTab='table';renderMiAggregated()">Table</button>
          <button class="btn btn-sm ${_miAggTab==='matrix'?'btn-primary':'btn-default'}" onclick="_miAggTab='matrix';renderMiAggregated()">Matrix</button>
          <button class="btn btn-sm ${_miAggTab==='trends'?'btn-primary':'btn-default'}" onclick="_miAggTab='trends';renderMiAggregated()">Trends</button>
          <button class="btn btn-sm ${_miAggTab==='log'?'btn-primary':'btn-default'}" onclick="_miAggTab='log';renderMiAggregated()">Log</button>
          <span style="width:1px;height:16px;background:var(--border);margin:0 4px"></span>
          ${_miMatrixCutoff?`<button class="btn btn-sm btn-default" onclick="miClearMatrixWipe()" title="Showing quotes since ${_miMatrixCutoff}. Click to show all." style="color:var(--warn,#f2ba31)">⚠ Since ${_miMatrixCutoff}</button>`:''}
          <button class="btn btn-sm ${_miMatrixCutoff?'btn-danger':'btn-default'}" onclick="miWipeMatrix()" title="Hide all current pricing from matrix (data is preserved for history)">🧹 Wipe</button>
        </div>
      </div>
    </div>
    <div class="card" id="mi-agg-content" style="border-radius:0 0 var(--radius) var(--radius);border-top:1px solid var(--border)">
      <div class="card-body"><div class="spinner" style="margin:20px auto"></div></div>
    </div>
  `;

  if (_miAggTab === 'table') await miRenderAggTable();
  else if (_miAggTab === 'matrix') await miRenderAggMatrix();
  else if (_miAggTab === 'trends') await miRenderAggTrends();
  else if (_miAggTab === 'log') await miRenderAggLog();
}

async function miRenderAggTable() {
  const el = document.getElementById('mi-agg-content');
  try {
    const quotes = await miLoadLatestQuotes({product: S.miFilterProduct || undefined});
    const allMills = [...new Set(quotes.map(q => q.mill_name))].sort();
    const allProducts = [...new Set(quotes.map(q => q.product))].sort();
    const allTraders = [...new Set(quotes.map(q => q.trader))].sort();

    const bestByProduct = {};
    quotes.forEach(q => {
      if (!bestByProduct[q.product] || q.price < bestByProduct[q.product]) bestByProduct[q.product] = q.price;
    });

    let filtered = quotes;
    if (S.miFilterMill) filtered = filtered.filter(q => q.mill_name === S.miFilterMill);
    if (S.miFilterTrader) filtered = filtered.filter(q => q.trader === S.miFilterTrader);

    filtered.sort((a, b) => {
      let va = a[_miAggSortCol] ?? '', vb = b[_miAggSortCol] ?? '';
      if (typeof va === 'number') return _miAggSortAsc ? va - vb : vb - va;
      return _miAggSortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });

    const sortIcon = col => _miAggSortCol === col ? (_miAggSortAsc ? ' ▲' : ' ▼') : '';
    const sortClick = col => `_miAggSortCol='${col}';_miAggSortAsc=_miAggSortCol==='${col}'?!_miAggSortAsc:true;renderMiAggregated()`;

    const rows = filtered.map(q => {
      const isBest = q.price === bestByProduct[q.product];
      return `<tr style="${isBest?'background:rgba(74,158,110,0.06)':''}">
        <td>${q.mill_name}</td>
        <td><strong>${q.product}</strong></td>
        <td class="mono" style="${isBest?'color:var(--positive);font-weight:600':''}">${fmt(q.price)}</td>
        <td>${q.length || 'RL'}</td>
        <td class="mono">${q.volume ? q.volume.toLocaleString() : '-'}</td>
        <td>${q.tls || '-'}</td>
        <td>${q.ship_window || '-'}</td>
        <td style="color:${miAgeColor(q.date)}">${miAgeLabel(q.date)}</td>
        <td>${q.trader || '-'}</td>
        <td style="color:var(--muted);font-size:10px">${q.region || '-'}</td>
      </tr>`;
    }).join('');

    el.innerHTML = `<div class="card-body">
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
        <select onchange="S.miFilterMill=this.value;renderMiAggregated()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
          <option value="">All Mills</option>
          ${allMills.map(m => `<option value="${m}"${S.miFilterMill===m?' selected':''}>${m}</option>`).join('')}
        </select>
        <select onchange="S.miFilterProduct=this.value;renderMiAggregated()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
          <option value="">All Products</option>
          ${allProducts.map(p => `<option value="${p}"${S.miFilterProduct===p?' selected':''}>${p}</option>`).join('')}
        </select>
        <select onchange="S.miFilterTrader=this.value;renderMiAggregated()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
          <option value="">All Traders</option>
          ${allTraders.map(t => `<option value="${t}"${S.miFilterTrader===t?' selected':''}>${t}</option>`).join('')}
        </select>
        <span style="color:var(--muted);font-size:11px">${filtered.length} current quotes | Green = best price</span>
      </div>
      <div style="overflow-x:auto">
        <table style="font-size:11px">
          <thead><tr>
            <th onclick="${sortClick('mill_name')}">Mill${sortIcon('mill_name')}</th>
            <th onclick="${sortClick('product')}">Product${sortIcon('product')}</th>
            <th onclick="${sortClick('price')}">FOB $/MBF${sortIcon('price')}</th>
            <th>Len</th><th>Vol</th><th>TLs</th><th>Ship</th>
            <th onclick="${sortClick('date')}">Age${sortIcon('date')}</th>
            <th>By</th><th>Region</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="10" class="empty-state">No mill quotes yet. Use Mill Intake to add some.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  } catch (e) {
    el.innerHTML = `<div class="card-body empty-state">Error loading quotes: ${e.message}</div>`;
  }
}

async function miRenderAggMatrix() {
  const el = document.getElementById('mi-agg-content');
  try {
    if (_miMatrixDetail === 'length') {
      await miRenderGranularMatrix(el);
    } else {
      await miRenderSummaryMatrix(el);
    }
  } catch (e) {
    el.innerHTML = `<div class="card-body empty-state">Error: ${e.message}</div>`;
  }
}

function miMatrixControls(products, colCount, totalCols, millCount, totalMills) {
  const detailBtns = `
    <button class="btn btn-sm ${_miMatrixDetail==='length'?'btn-primary':'btn-default'}" onclick="_miMatrixDetail='length';renderMiAggregated()">By Length</button>
    <button class="btn btn-sm ${_miMatrixDetail==='product'?'btn-primary':'btn-default'}" onclick="_miMatrixDetail='product';_miMatrixProduct='';renderMiAggregated()">By Product</button>`;
  const productFilter = _miMatrixDetail === 'length' ? `
    <select onchange="_miMatrixProduct=this.value;renderMiAggregated()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
      <option value="">All Products</option>
      ${(products||[]).map(p => `<option value="${p}"${_miMatrixProduct===p?' selected':''}>${p}</option>`).join('')}
    </select>` : '';
  const hideEmptyChk = _miMatrixDetail === 'length' ? `
    <label><input type="checkbox" ${_miMatrixHideEmpty?'checked':''} onchange="_miMatrixHideEmpty=this.checked;SS('miMatrixHideEmpty',_miMatrixHideEmpty);renderMiAggregated()"> Hide empty cols</label>` : '';
  const hideMillsChk = _miMatrixDetail === 'length' ? `
    <label><input type="checkbox" ${_miMatrixHideMills?'checked':''} onchange="_miMatrixHideMills=this.checked;SS('miMatrixHideMills',_miMatrixHideMills);renderMiAggregated()"> Hide empty mills</label>` : '';
  const ageFilter = `
    <select onchange="_miMatrixMaxAge=this.value;SS('miMatrixMaxAge',_miMatrixMaxAge);renderMiAggregated()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
      <option value=""${_miMatrixMaxAge===''?' selected':''}>All Ages</option>
      <option value="0"${_miMatrixMaxAge==='0'?' selected':''}>Today Only</option>
      <option value="1"${_miMatrixMaxAge==='1'?' selected':''}>≤1 Day</option>
      <option value="2"${_miMatrixMaxAge==='2'?' selected':''}>≤2 Days</option>
      <option value="3"${_miMatrixMaxAge==='3'?' selected':''}>≤3 Days</option>
      <option value="7"${_miMatrixMaxAge==='7'?' selected':''}>≤1 Week</option>
    </select>`;
  const densityBtns = `
    <button class="btn btn-sm ${_miMatrixDensity==='compact'?'btn-primary':'btn-default'}" onclick="_miMatrixDensity='compact';SS('miMatrixDensity','compact');renderMiAggregated()">◼</button>
    <button class="btn btn-sm ${_miMatrixDensity==='comfortable'?'btn-primary':'btn-default'}" onclick="_miMatrixDensity='comfortable';SS('miMatrixDensity','comfortable');renderMiAggregated()">◻</button>`;
  const stats = colCount != null ? `<span style="color:var(--muted);font-size:10px">${millCount}${totalMills && millCount!==totalMills?' of '+totalMills:''} mills · ${colCount}${totalCols && colCount!==totalCols?' of '+totalCols:''} cols</span>` : '';
  return `<div class="matrix-ctrl">
    <div style="display:flex;gap:4px">${detailBtns}</div>
    ${productFilter} ${hideEmptyChk} ${hideMillsChk} ${ageFilter}
    <div style="display:flex;gap:2px;margin-left:4px">${densityBtns}</div>
    <span style="margin-left:auto;display:flex;gap:12px;align-items:center">
      ${stats}
      <span style="color:var(--muted);font-size:10px">Green→Red = cheap→expensive</span>
    </span>
  </div>`;
}

async function miRenderGranularMatrix(el) {
  // Sync cutoff to server so portal matrix matches
  fetch('/api/pricing/cutoff', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({since:_miMatrixCutoff||''})}).catch(()=>{});
  const params = new URLSearchParams({detail: 'length'});
  if (_miMatrixProduct) params.set('product', _miMatrixProduct);
  if (_miMatrixCutoff) params.set('since', _miMatrixCutoff);
  const data = await miApiGet('/api/mi/quotes/matrix?' + params);
  const { matrix, mills: allMills, columns: allColumns, products, best_by_col } = data;

  if (!allMills.length) {
    el.innerHTML = '<div class="card-body empty-state">No mill quotes yet. Use Mill Intake to add some.</div>';
    return;
  }

  let columns = allColumns;
  if (_miMatrixHideEmpty) columns = allColumns.filter(col => allMills.some(m => matrix[m]?.[col]));

  let mills = allMills;
  if (_miMatrixHideMills) mills = allMills.filter(m => columns.some(col => matrix[m]?.[col]));

  const max_by_col = {};
  columns.forEach(col => {
    let maxP = 0;
    mills.forEach(m => { const d = matrix[m]?.[col]; if (d && d.price > maxP) maxP = d.price; });
    max_by_col[col] = maxP;
  });

  const colProduct = c => c.replace(/\s+\d+[\-\/\d]*['"]?$/, '').replace(/\s+RL$/, '');

  const colGroups = [];
  let currentProd = null, currentGroup = [];
  columns.forEach(c => {
    const prod = colProduct(c);
    if (prod !== currentProd) {
      if (currentGroup.length) colGroups.push({product: currentProd, cols: currentGroup});
      currentProd = prod;
      currentGroup = [c];
    } else {
      currentGroup.push(c);
    }
  });
  if (currentGroup.length) colGroups.push({product: currentProd, cols: currentGroup});

  const productHeaderCells = colGroups.map((g, gi) =>
    `<th colspan="${g.cols.length}" class="${gi>0?'group-start':''}" style="text-align:center;background:var(--panel-alt);border-bottom:2px solid var(--accent);font-size:11px;padding:6px 4px">${typeof formatProductHeader==='function'?formatProductHeader(g.product):g.product}</th>`
  ).join('');

  const lengthHeaderCells = columns.map((c, idx) => {
    const length = c.split(/\s/).pop();
    const prod = colProduct(c);
    const prevProd = idx > 0 ? colProduct(columns[idx - 1]) : null;
    const gs = prod !== prevProd ? ' group-start' : '';
    return `<th class="${gs}" style="text-align:center;font-weight:400;color:var(--muted);min-width:48px">${length}</th>`;
  }).join('');

  const isPortal = sessionStorage.getItem('syp_matrix_only');

  const bodyRows = mills.map(m => {
    const cells = columns.map((col, idx) => {
      const d = matrix[m]?.[col];
      const prod = colProduct(col);
      const prevProd = idx > 0 ? colProduct(columns[idx - 1]) : null;
      const gs = prod !== prevProd ? ' group-start' : '';

      const age = d ? Math.floor((new Date() - new Date(d.date)) / (1000*60*60*24)) : null;
      const maxAge = _miMatrixMaxAge !== '' ? parseInt(_miMatrixMaxAge, 10) : null;

      // Filter by max age if set
      if (!d || (maxAge !== null && age > maxAge)) return `<td class="empty-cell${gs}"></td>`;

      const isBest = d.price === best_by_col[col];
      const vol = d.volume ? `${d.volume} MBF` : '';
      const tls = d.tls ? `${d.tls} TL` : '';
      const tip = [vol, tls, d.ship_window, d.trader, `${age}d ago`].filter(Boolean).join(' · ');

      let heatBg = '';
      const minP = best_by_col[col] || d.price;
      const maxP = max_by_col[col] || d.price;
      if (maxP > minP) {
        const pct = (d.price - minP) / (maxP - minP);
        const hue = 120 - (pct * 120);
        heatBg = `background:hsla(${hue},45%,45%,0.12);`;
      } else {
        heatBg = 'background:hsla(120,45%,45%,0.12);';
      }

      const fade = age > 3 ? 'opacity:0.5;' : '';
      const bestStyle = isBest ? 'color:var(--positive);font-weight:700;' : '';
      const dayPriorBorder = age > 0 ? `border-bottom:2px solid ${age===1?'var(--warn)':'var(--negative)'};` : '';

      return `<td class="mono${gs}" style="text-align:center;${heatBg}${bestStyle}${fade}${dayPriorBorder}" title="${tip}">$${d.price}</td>`;
    }).join('');
    const delBtn = isPortal ? '' : `<td style="padding:2px;position:sticky;right:0;background:var(--panel);z-index:1"><button onclick="miDeleteMillQuotes('${m.replace(/'/g, "\\'")}');event.stopPropagation()" style="background:none;border:none;color:var(--negative);cursor:pointer;font-size:11px;padding:2px 6px;opacity:0.5" title="Delete all quotes for ${m}" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5">×</button></td>`;
    return `<tr><td class="mill-cell" style="white-space:nowrap;font-weight:500;font-size:11px;padding:4px 8px;position:sticky;left:0;background:var(--panel);z-index:1">${m}</td>${cells}${delBtn}</tr>`;
  }).join('');

  const densityClass = `matrix-${_miMatrixDensity}`;

  const controls = isPortal ? `<div style="display:flex;gap:12px;align-items:center;font-size:10px;color:var(--muted);margin-bottom:8px"><span>${mills.length} mills · ${columns.length} columns</span><span>Green→Red = cheap→expensive</span></div>` : miMatrixControls(products, columns.length, allColumns.length, mills.length, allMills.length);

  const delHeader = isPortal ? '' : '<th rowspan="2" style="position:sticky;right:0;background:var(--panel);z-index:3;width:24px"></th>';
  el.innerHTML = `<div class="card-body" style="padding:12px">
    ${controls}
    <div style="overflow-x:auto;max-height:${isPortal?'85':'75'}vh;overflow-y:auto">
      <table class="matrix-table ${densityClass}" style="border-collapse:collapse">
        <thead style="position:sticky;top:0;z-index:2">
          <tr><th rowspan="2" style="position:sticky;left:0;background:var(--panel);z-index:3;padding:4px 8px">Mill</th>${productHeaderCells}${delHeader}</tr>
          <tr>${lengthHeaderCells}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  </div>`;
}

async function miRenderSummaryMatrix(el) {
  const data = await miLoadQuoteMatrix();
  const { matrix, mills, products, best_by_product } = data;

  if (!mills.length) {
    el.innerHTML = '<div class="card-body empty-state">No mill quotes yet. Use Mill Intake to add some.</div>';
    return;
  }

  const headerCells = products.map(p =>
    `<th style="writing-mode:vertical-lr;text-align:center;padding:8px 4px;font-size:10px;white-space:nowrap">${typeof formatProductHeader==='function'?formatProductHeader(p):p}</th>`
  ).join('');

  const bodyRows = mills.map(m => {
    const cells = products.map(p => {
      const d = matrix[m]?.[p];
      const age = d ? Math.floor((new Date() - new Date(d.date)) / (1000*60*60*24)) : null;
      const maxAge = _miMatrixMaxAge !== '' ? parseInt(_miMatrixMaxAge, 10) : null;
      if (!d || (maxAge !== null && age > maxAge)) return '<td style="text-align:center;color:var(--muted)">-</td>';
      const isBest = d.price === best_by_product[p];
      return `<td class="mono" style="text-align:center;${isBest?'color:var(--positive);font-weight:700':''}${age>3?';opacity:0.5':''}" title="${d.ship_window||''} | ${d.trader||''} | ${age}d ago">$${d.price}</td>`;
    }).join('');
    return `<tr><td style="white-space:nowrap;font-weight:500">${m}</td>${cells}</tr>`;
  }).join('');

  el.innerHTML = `<div class="card-body">
    ${miMatrixControls(products)}
    <div style="overflow-x:auto">
      <table style="font-size:11px">
        <thead><tr><th>Mill</th>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  </div>`;
}

async function miRenderAggTrends() {
  const el = document.getElementById('mi-agg-content');
  let allProducts;
  try {
    const matrix = await miLoadQuoteMatrix();
    allProducts = matrix.products;
  } catch (e) {
    allProducts = PRODUCTS;
  }

  el.innerHTML = `<div class="card-body">
    <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
      <select id="mi-trend-product" onchange="_miTrendProduct=this.value;miRenderTrendChart()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
        ${allProducts.map(p => `<option value="${p}"${_miTrendProduct===p?' selected':''}>${p}</option>`).join('')}
      </select>
      <select onchange="_miTrendDays=parseInt(this.value);miRenderTrendChart()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
        <option value="30"${_miTrendDays===30?' selected':''}>30 days</option>
        <option value="90"${_miTrendDays===90?' selected':''}>90 days</option>
        <option value="180"${_miTrendDays===180?' selected':''}>180 days</option>
      </select>
    </div>
    <div style="height:350px;position:relative"><canvas id="mi-trend-chart"></canvas></div>
    <div id="mi-trend-summary" style="margin-top:16px"></div>
  </div>`;

  setTimeout(miRenderTrendChart, 50);
}

async function miRenderTrendChart() {
  destroyChart('miAggTrend');
  const canvas = document.getElementById('mi-trend-chart');
  if (!canvas) return;

  try {
    const quotes = await miLoadQuoteHistory(null, _miTrendProduct, _miTrendDays);
    if (!quotes.length) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#555';
      ctx.font = '13px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('No price history for ' + _miTrendProduct, canvas.width / 2, canvas.height / 2);
      return;
    }

    const byMill = {};
    quotes.forEach(q => {
      if (!byMill[q.mill_name]) byMill[q.mill_name] = [];
      byMill[q.mill_name].push({x: q.date, y: q.price});
    });

    const colors = ['#89b4fa','#f9e2af','#a6e3a1','#f38ba8','#89dceb','#c084fc','#f59e0b','#ec4899','#22d3ee','#a3e635','#fb923c','#818cf8'];
    const datasets = Object.entries(byMill).map(([mill, points], i) => ({
      label: mill, data: points,
      borderColor: colors[i % colors.length], borderWidth: 2,
      pointRadius: 3, tension: 0.3, fill: false
    }));

    window._charts.miAggTrend = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {datasets},
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: {mode: 'nearest', intersect: false},
        scales: {
          x: {type: 'category', grid: {color: 'rgba(62,62,86,0.8)'}, ticks: {color: '#a0a0b8', font: {size: 10}}},
          y: {grid: {color: 'rgba(62,62,86,0.8)'}, ticks: {color: '#a0a0b8', font: {size: 10}, callback: v => '$' + v}}
        },
        plugins: {
          legend: {position: 'bottom', labels: {color: '#a0a0b8', font: {size: 10}, boxWidth: 12, padding: 8}},
          tooltip: {callbacks: {label: ctx => ctx.dataset.label + ': $' + ctx.parsed.y}}
        }
      }
    });

    const summaryEl = document.getElementById('mi-trend-summary');
    if (summaryEl) {
      const prices = quotes.map(q => q.price);
      const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      summaryEl.innerHTML = `
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <div style="background:var(--panel-alt);padding:8px 12px;border-radius:var(--radius)">
            <div style="color:var(--muted);font-size:10px">AVG PRICE</div>
            <div class="mono" style="font-size:14px;font-weight:600">$${avg}</div>
          </div>
          <div style="background:var(--panel-alt);padding:8px 12px;border-radius:var(--radius)">
            <div style="color:var(--muted);font-size:10px">RANGE</div>
            <div class="mono" style="font-size:14px;font-weight:600">$${min} — $${max}</div>
          </div>
          <div style="background:var(--panel-alt);padding:8px 12px;border-radius:var(--radius)">
            <div style="color:var(--muted);font-size:10px">QUOTES</div>
            <div class="mono" style="font-size:14px;font-weight:600">${quotes.length}</div>
          </div>
        </div>
      `;
    }
  } catch (e) {
    showToast('Trend error: ' + e.message, 'warn');
  }
}

async function miRenderAggLog() {
  const el = document.getElementById('mi-agg-content');
  try {
    const since = new Date();
    since.setDate(since.getDate() - (S.miFilterDays || 7));
    const quotes = await miLoadAllQuotes({since: since.toISOString().split('T')[0], limit: 200});

    const rows = quotes.map(q => `
      <tr>
        <td style="color:var(--muted);font-size:10px">${q.date}</td>
        <td>${q.trader}</td>
        <td>${q.mill_name}</td>
        <td><strong>${q.product}</strong></td>
        <td class="mono">${fmt(q.price)}</td>
        <td>${q.volume || '-'}</td>
        <td>${q.ship_window || '-'}</td>
        <td><span class="badge badge-info">${q.source}</span></td>
      </tr>
    `).join('');

    el.innerHTML = `<div class="card-body">
      <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
        <select onchange="S.miFilterDays=parseInt(this.value);renderMiAggregated()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
          <option value="3"${S.miFilterDays===3?' selected':''}>Last 3 days</option>
          <option value="7"${S.miFilterDays===7?' selected':''}>Last 7 days</option>
          <option value="14"${S.miFilterDays===14?' selected':''}>Last 14 days</option>
          <option value="30"${S.miFilterDays===30?' selected':''}>Last 30 days</option>
        </select>
        <span style="color:var(--muted);font-size:11px">${quotes.length} submissions</span>
      </div>
      <div style="overflow-x:auto">
        <table style="font-size:11px">
          <thead><tr><th>Date</th><th>Trader</th><th>Mill</th><th>Product</th><th>FOB $</th><th>Vol</th><th>Ship</th><th>Source</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="8" class="empty-state">No recent submissions</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  } catch (e) {
    el.innerHTML = `<div class="card-body empty-state">Error: ${e.message}</div>`;
  }
}

function miWipeMatrix() {
  const today = new Date().toISOString().slice(0, 10);
  _miMatrixCutoff = today;
  SS('miMatrixCutoff', today);
  fetch('/api/pricing/cutoff', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({since:today})}).catch(()=>{});
  showToast('Matrix wiped — only new quotes will appear. Historical data preserved.', 'info');
  renderMiAggregated();
}

function miClearMatrixWipe() {
  _miMatrixCutoff = '';
  SS('miMatrixCutoff', '');
  fetch('/api/pricing/cutoff', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({since:''})}).catch(()=>{});
  showToast('Showing all historical pricing', 'positive');
  renderMiAggregated();
}

async function miDeleteMillQuotes(millName) {
  if (!confirm(`Delete ALL quotes for "${millName}"?\n\nThis cannot be undone.`)) return;
  try {
    const res = await fetch(`/api/mi/quotes/by-mill?mill=${encodeURIComponent(millName)}`, {method: 'DELETE'});
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    showToast(`Deleted ${data.deleted} quotes for ${millName}`, 'positive');
    renderMiAggregated();
  } catch (e) {
    showToast(`Failed to delete: ${e.message}`, 'negative');
  }
}
