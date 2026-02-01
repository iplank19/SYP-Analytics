// SYP Mill Intelligence - Aggregated View
// Table, matrix, trend charts, filters

let _aggTab = 'table'; // table | matrix | trends | log
let _aggSortCol = 'product';
let _aggSortAsc = true;
let _trendProduct = '2x4#2';
let _trendDays = 90;
let _matrixDetail = 'length'; // 'length' (granular) or 'product' (summary)
let _matrixProduct = ''; // filter to one product in length view
let _matrixHideEmpty = LS('matrixHideEmpty', true);
let _matrixHideMills = LS('matrixHideMills', true);
let _matrixDensity = LS('matrixDensity', 'compact'); // 'compact' | 'comfortable'

async function renderAggregated() {
  const c = document.getElementById('content');
  c.innerHTML = `
    <div class="card" style="margin-bottom:0;border-bottom:none;border-radius:var(--radius) var(--radius) 0 0">
      <div class="card-header" style="flex-wrap:wrap;gap:8px">
        <span class="card-title">ALL MILL PRICES</span>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm ${_aggTab==='table'?'btn-primary':'btn-default'}" onclick="_aggTab='table';renderAggregated()">Table</button>
          <button class="btn btn-sm ${_aggTab==='matrix'?'btn-primary':'btn-default'}" onclick="_aggTab='matrix';renderAggregated()">Matrix</button>
          <button class="btn btn-sm ${_aggTab==='trends'?'btn-primary':'btn-default'}" onclick="_aggTab='trends';renderAggregated()">Trends</button>
          <button class="btn btn-sm ${_aggTab==='log'?'btn-primary':'btn-default'}" onclick="_aggTab='log';renderAggregated()">Log</button>
        </div>
      </div>
    </div>
    <div class="card" id="agg-content" style="border-radius:0 0 var(--radius) var(--radius);border-top:1px solid var(--border)">
      <div class="card-body"><div class="spinner" style="margin:20px auto"></div></div>
    </div>
  `;

  if (_aggTab === 'table') await renderAggTable();
  else if (_aggTab === 'matrix') await renderAggMatrix();
  else if (_aggTab === 'trends') await renderAggTrends();
  else if (_aggTab === 'log') await renderAggLog();
}

async function renderAggTable() {
  const el = document.getElementById('agg-content');
  try {
    const quotes = await loadLatestQuotes({product: S.filterProduct || undefined});
    const allMills = [...new Set(quotes.map(q => q.mill_name))].sort();
    const allProducts = [...new Set(quotes.map(q => q.product))].sort();
    const allTraders = [...new Set(quotes.map(q => q.trader))].sort();

    // Best price per product
    const bestByProduct = {};
    quotes.forEach(q => {
      if (!bestByProduct[q.product] || q.price < bestByProduct[q.product]) bestByProduct[q.product] = q.price;
    });

    // Filter
    let filtered = quotes;
    if (S.filterMill) filtered = filtered.filter(q => q.mill_name === S.filterMill);
    if (S.filterTrader) filtered = filtered.filter(q => q.trader === S.filterTrader);

    // Sort
    filtered.sort((a, b) => {
      let va = a[_aggSortCol] ?? '', vb = b[_aggSortCol] ?? '';
      if (typeof va === 'number') return _aggSortAsc ? va - vb : vb - va;
      return _aggSortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });

    const sortIcon = col => _aggSortCol === col ? (_aggSortAsc ? ' ▲' : ' ▼') : '';
    const sortClick = col => `_aggSortCol='${col}';_aggSortAsc=_aggSortCol==='${col}'?!_aggSortAsc:true;renderAggregated()`;

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
        <td style="color:${ageColor(q.date)}">${ageLabel(q.date)}</td>
        <td>${q.trader || '-'}</td>
        <td style="color:var(--muted);font-size:10px">${q.region || '-'}</td>
      </tr>`;
    }).join('');

    el.innerHTML = `<div class="card-body">
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
        <select onchange="S.filterMill=this.value;renderAggregated()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
          <option value="">All Mills</option>
          ${allMills.map(m => `<option value="${m}"${S.filterMill===m?' selected':''}>${m}</option>`).join('')}
        </select>
        <select onchange="S.filterProduct=this.value;renderAggregated()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
          <option value="">All Products</option>
          ${allProducts.map(p => `<option value="${p}"${S.filterProduct===p?' selected':''}>${p}</option>`).join('')}
        </select>
        <select onchange="S.filterTrader=this.value;renderAggregated()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
          <option value="">All Traders</option>
          ${allTraders.map(t => `<option value="${t}"${S.filterTrader===t?' selected':''}>${t}</option>`).join('')}
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
          <tbody>${rows || '<tr><td colspan="10" class="empty-state">No mill quotes yet. Use Intake to add some.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  } catch (e) {
    el.innerHTML = `<div class="card-body empty-state">Error loading quotes: ${e.message}</div>`;
  }
}

async function renderAggMatrix() {
  const el = document.getElementById('agg-content');
  try {
    if (_matrixDetail === 'length') {
      await renderGranularMatrix(el);
    } else {
      await renderSummaryMatrix(el);
    }
  } catch (e) {
    el.innerHTML = `<div class="card-body empty-state">Error: ${e.message}</div>`;
  }
}

function matrixControls(products, colCount, totalCols, millCount, totalMills) {
  const detailBtns = `
    <button class="btn btn-sm ${_matrixDetail==='length'?'btn-primary':'btn-default'}" onclick="_matrixDetail='length';renderAggregated()">By Length</button>
    <button class="btn btn-sm ${_matrixDetail==='product'?'btn-primary':'btn-default'}" onclick="_matrixDetail='product';_matrixProduct='';renderAggregated()">By Product</button>`;
  const productFilter = _matrixDetail === 'length' ? `
    <select onchange="_matrixProduct=this.value;renderAggregated()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
      <option value="">All Products</option>
      ${(products||[]).map(p => `<option value="${p}"${_matrixProduct===p?' selected':''}>${p}</option>`).join('')}
    </select>` : '';
  const hideEmptyChk = _matrixDetail === 'length' ? `
    <label><input type="checkbox" ${_matrixHideEmpty?'checked':''} onchange="_matrixHideEmpty=this.checked;SS('matrixHideEmpty',_matrixHideEmpty);renderAggregated()"> Hide empty cols</label>` : '';
  const hideMillsChk = _matrixDetail === 'length' ? `
    <label><input type="checkbox" ${_matrixHideMills?'checked':''} onchange="_matrixHideMills=this.checked;SS('matrixHideMills',_matrixHideMills);renderAggregated()"> Hide empty mills</label>` : '';
  const densityBtns = `
    <button class="btn btn-sm ${_matrixDensity==='compact'?'btn-primary':'btn-default'}" onclick="_matrixDensity='compact';SS('matrixDensity','compact');renderAggregated()" title="Compact density">◼</button>
    <button class="btn btn-sm ${_matrixDensity==='comfortable'?'btn-primary':'btn-default'}" onclick="_matrixDensity='comfortable';SS('matrixDensity','comfortable');renderAggregated()" title="Comfortable density">◻</button>`;
  const stats = colCount != null ? `<span style="color:var(--muted);font-size:10px">${millCount}${totalMills && millCount!==totalMills?' of '+totalMills:''} mills · ${colCount}${totalCols && colCount!==totalCols?' of '+totalCols:''} cols</span>` : '';
  return `<div class="matrix-ctrl">
    <div style="display:flex;gap:4px">${detailBtns}</div>
    ${productFilter}
    ${hideEmptyChk}
    ${hideMillsChk}
    <div style="display:flex;gap:2px;margin-left:4px">${densityBtns}</div>
    <span style="margin-left:auto;display:flex;gap:12px;align-items:center">
      ${stats}
      <span style="color:var(--muted);font-size:10px">Green→Red = cheap→expensive. Hover for details.</span>
    </span>
  </div>`;
}

async function renderGranularMatrix(el) {
  const params = new URLSearchParams({detail: 'length'});
  if (_matrixProduct) params.set('product', _matrixProduct);
  const data = await apiGet('/api/quotes/matrix?' + params);
  const { matrix, mills: allMills, columns: allColumns, products, best_by_col } = data;

  if (!allMills.length) {
    el.innerHTML = '<div class="card-body empty-state">No mill quotes yet. Use Intake to add some.</div>';
    return;
  }

  // Filter columns: hide empty if toggled
  let columns = allColumns;
  if (_matrixHideEmpty) {
    columns = allColumns.filter(col => allMills.some(m => matrix[m]?.[col]));
  }

  // Filter mills: hide empty rows if toggled
  let mills = allMills;
  if (_matrixHideMills) {
    mills = allMills.filter(m => columns.some(col => matrix[m]?.[col]));
  }

  // Compute max price per column for heat map
  const max_by_col = {};
  columns.forEach(col => {
    let maxP = 0;
    mills.forEach(m => {
      const d = matrix[m]?.[col];
      if (d && d.price > maxP) maxP = d.price;
    });
    max_by_col[col] = maxP;
  });

  // Helper: extract product from column key
  const colProduct = c => c.replace(/\s+\d+[\-\/\d]*['"]?$/, '').replace(/\s+RL$/, '');

  // Build column groups for two-tier header
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

  // Product header row
  const productHeaderCells = colGroups.map((g, gi) =>
    `<th colspan="${g.cols.length}" class="${gi>0?'group-start':''}" style="text-align:center;background:var(--panel-alt);border-bottom:2px solid var(--accent);font-size:11px;padding:6px 4px">${g.product}</th>`
  ).join('');

  // Length header row — mark first col of each group
  const lengthHeaderCells = columns.map((c, idx) => {
    const length = c.split(/\s/).pop();
    const prod = colProduct(c);
    const prevProd = idx > 0 ? colProduct(columns[idx - 1]) : null;
    const gs = prod !== prevProd ? ' group-start' : '';
    return `<th class="${gs}" style="text-align:center;font-weight:400;color:var(--muted);min-width:48px">${length}</th>`;
  }).join('');

  // Body rows
  const bodyRows = mills.map(m => {
    const cells = columns.map((col, idx) => {
      const d = matrix[m]?.[col];
      const prod = colProduct(col);
      const prevProd = idx > 0 ? colProduct(columns[idx - 1]) : null;
      const gs = prod !== prevProd ? ' group-start' : '';

      if (!d) return `<td class="empty-cell${gs}"></td>`;

      const isBest = d.price === best_by_col[col];
      const age = Math.floor((new Date() - new Date(d.date)) / (1000*60*60*24));
      const vol = d.volume ? `${d.volume} MBF` : '';
      const tls = d.tls ? `${d.tls} TL` : '';
      const tip = [vol, tls, d.ship_window, d.trader, `${age}d ago`].filter(Boolean).join(' · ');

      // Heat map: green (best) → yellow (mid) → red (worst)
      let heatBg = '';
      const minP = best_by_col[col] || d.price;
      const maxP = max_by_col[col] || d.price;
      if (maxP > minP) {
        const pct = (d.price - minP) / (maxP - minP); // 0=cheapest, 1=most expensive
        const hue = 120 - (pct * 120); // 120=green, 60=yellow, 0=red
        heatBg = `background:hsla(${hue},45%,45%,0.12);`;
      } else {
        heatBg = 'background:hsla(120,45%,45%,0.12);'; // only price = best
      }

      const fade = age > 3 ? 'opacity:0.5;' : '';
      const bestStyle = isBest ? 'color:var(--positive);font-weight:700;' : '';

      return `<td class="mono${gs}" style="text-align:center;${heatBg}${bestStyle}${fade}" title="${tip}">$${d.price}</td>`;
    }).join('');
    return `<tr><td class="mill-cell" style="white-space:nowrap;font-weight:500;font-size:11px;padding:4px 8px;position:sticky;left:0;background:var(--panel);z-index:1">${m}</td>${cells}</tr>`;
  }).join('');

  const densityClass = `matrix-${_matrixDensity}`;

  el.innerHTML = `<div class="card-body" style="padding:12px">
    ${matrixControls(products, columns.length, allColumns.length, mills.length, allMills.length)}
    <div style="overflow-x:auto;max-height:75vh;overflow-y:auto">
      <table class="matrix-table ${densityClass}" style="border-collapse:collapse">
        <thead style="position:sticky;top:0;z-index:2">
          <tr><th rowspan="2" style="position:sticky;left:0;background:var(--panel);z-index:3;padding:4px 8px">Mill</th>${productHeaderCells}</tr>
          <tr>${lengthHeaderCells}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  </div>`;
}

async function renderSummaryMatrix(el) {
  const data = await loadQuoteMatrix();
  const { matrix, mills, products, best_by_product } = data;

  if (!mills.length) {
    el.innerHTML = '<div class="card-body empty-state">No mill quotes yet. Use Intake to add some.</div>';
    return;
  }

  const headerCells = products.map(p =>
    `<th style="writing-mode:vertical-lr;text-align:center;padding:8px 4px;font-size:10px;white-space:nowrap">${p}</th>`
  ).join('');

  const bodyRows = mills.map(m => {
    const cells = products.map(p => {
      const d = matrix[m]?.[p];
      if (!d) return '<td style="text-align:center;color:var(--muted)">-</td>';
      const isBest = d.price === best_by_product[p];
      const age = Math.floor((new Date() - new Date(d.date)) / (1000*60*60*24));
      return `<td class="mono" style="text-align:center;${isBest?'color:var(--positive);font-weight:700':''}${age>3?';opacity:0.5':''}" title="${d.ship_window||''} | ${d.trader||''} | ${age}d ago">$${d.price}</td>`;
    }).join('');
    return `<tr><td style="white-space:nowrap;font-weight:500">${m}</td>${cells}</tr>`;
  }).join('');

  el.innerHTML = `<div class="card-body">
    ${matrixControls(products)}
    <div style="overflow-x:auto">
      <table style="font-size:11px">
        <thead><tr><th>Mill</th>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  </div>`;
}

async function renderAggTrends() {
  const el = document.getElementById('agg-content');
  // Get available products
  let allProducts;
  try {
    const matrix = await loadQuoteMatrix();
    allProducts = matrix.products;
  } catch (e) {
    allProducts = PRODUCTS;
  }

  el.innerHTML = `<div class="card-body">
    <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
      <select id="trend-product" onchange="_trendProduct=this.value;renderTrendChart()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
        ${allProducts.map(p => `<option value="${p}"${_trendProduct===p?' selected':''}>${p}</option>`).join('')}
      </select>
      <select onchange="_trendDays=parseInt(this.value);renderTrendChart()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
        <option value="30"${_trendDays===30?' selected':''}>30 days</option>
        <option value="90"${_trendDays===90?' selected':''}>90 days</option>
        <option value="180"${_trendDays===180?' selected':''}>180 days</option>
      </select>
    </div>
    <div style="height:350px;position:relative"><canvas id="trend-chart"></canvas></div>
    <div id="trend-summary" style="margin-top:16px"></div>
  </div>`;

  setTimeout(renderTrendChart, 50);
}

async function renderTrendChart() {
  destroyChart('aggTrend');
  const canvas = document.getElementById('trend-chart');
  if (!canvas) return;

  try {
    const quotes = await loadQuoteHistory(null, _trendProduct, _trendDays);
    if (!quotes.length) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#555';
      ctx.font = '13px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('No price history for ' + _trendProduct, canvas.width / 2, canvas.height / 2);
      return;
    }

    const byMill = {};
    quotes.forEach(q => {
      if (!byMill[q.mill_name]) byMill[q.mill_name] = [];
      byMill[q.mill_name].push({x: q.date, y: q.price});
    });

    const colors = ['#4d8df7','#ffab40','#00e676','#ff5252','#64b5f6','#c084fc','#f59e0b','#ec4899','#22d3ee','#a3e635','#fb923c','#818cf8'];
    const datasets = Object.entries(byMill).map(([mill, points], i) => ({
      label: mill,
      data: points,
      borderColor: colors[i % colors.length],
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.3,
      fill: false
    }));

    const ctx = canvas.getContext('2d');
    window._charts.aggTrend = new Chart(ctx, {
      type: 'line',
      data: {datasets},
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {mode: 'nearest', intersect: false},
        scales: {
          x: {type: 'category', grid: {color: 'rgba(28,28,42,0.8)'}, ticks: {color: '#5a6270', font: {size: 10}}},
          y: {grid: {color: 'rgba(28,28,42,0.8)'}, ticks: {color: '#5a6270', font: {size: 10}, callback: v => '$' + v}}
        },
        plugins: {
          legend: {position: 'bottom', labels: {color: '#5a6270', font: {size: 10}, boxWidth: 12, padding: 8}},
          tooltip: {callbacks: {label: ctx => ctx.dataset.label + ': $' + ctx.parsed.y}}
        }
      }
    });

    // Summary
    const summaryEl = document.getElementById('trend-summary');
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

async function renderAggLog() {
  const el = document.getElementById('agg-content');
  try {
    const since = new Date();
    since.setDate(since.getDate() - (S.filterDays || 7));
    const quotes = await loadAllQuotes({since: since.toISOString().split('T')[0], limit: 200});

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
        <select onchange="S.filterDays=parseInt(this.value);renderAggregated()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
          <option value="3"${S.filterDays===3?' selected':''}>Last 3 days</option>
          <option value="7"${S.filterDays===7?' selected':''}>Last 7 days</option>
          <option value="14"${S.filterDays===14?' selected':''}>Last 14 days</option>
          <option value="30"${S.filterDays===30?' selected':''}>Last 30 days</option>
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
