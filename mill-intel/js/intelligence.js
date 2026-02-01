// SYP Mill Intelligence - Intelligence Engine UI
// Signal cards, recommendation display

let _intelTrendProduct = '';
let _intelTrendDays = 90;

async function renderIntelligence() {
  const c = document.getElementById('content');
  c.innerHTML = `
    <div class="kpi-grid" id="intel-kpis"><div class="spinner" style="margin:20px auto;grid-column:1/-1"></div></div>
    <div class="grid-2" style="gap:16px;align-items:start">
      <div>
        <div class="card">
          <div class="card-header"><span class="card-title">RECOMMENDATIONS</span></div>
          <div class="card-body" id="intel-recs"><div class="spinner" style="margin:10px auto"></div></div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-header">
            <span class="card-title warn">MARKET SIGNALS</span>
            <select id="intel-product-filter" onchange="refreshSignals(this.value)" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
              <option value="">All Products</option>
              ${PRODUCTS.map(p => `<option value="${p}">${p}</option>`).join('')}
            </select>
          </div>
          <div class="card-body" id="intel-signals" style="max-height:60vh;overflow-y:auto"><div class="spinner" style="margin:10px auto"></div></div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <span class="card-title">PRICE TRENDS</span>
        <div style="display:flex;gap:8px;align-items:center">
          <select onchange="_intelTrendProduct=this.value;renderIntelTrends()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
            <option value="">All Products (avg)</option>
            ${PRODUCTS.map(p => `<option value="${p}"${_intelTrendProduct===p?' selected':''}>${p}</option>`).join('')}
          </select>
          <select onchange="_intelTrendDays=parseInt(this.value);renderIntelTrends()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
            <option value="30"${_intelTrendDays===30?' selected':''}>30d</option>
            <option value="90"${_intelTrendDays===90?' selected':''}>90d</option>
            <option value="180"${_intelTrendDays===180?' selected':''}>180d</option>
          </select>
        </div>
      </div>
      <div class="card-body">
        <div class="grid-2" style="gap:16px">
          <div style="height:280px;position:relative"><canvas id="intel-price-chart"></canvas></div>
          <div style="height:280px;position:relative"><canvas id="intel-supply-chart"></canvas></div>
        </div>
      </div>
    </div>
  `;

  await Promise.all([loadIntelRecs(), loadIntelSignals(), renderIntelTrends()]);
}

async function loadIntelRecs() {
  const el = document.getElementById('intel-recs');
  if (!el) return;
  try {
    const recs = await loadRecommendations();
    if (!recs.length) {
      el.innerHTML = '<div class="empty-state">No data yet. Submit mill pricing first.</div>';
      return;
    }

    // KPIs
    const kpiEl = document.getElementById('intel-kpis');
    const buyCount = recs.filter(r => r.action.includes('BUY')).length;
    const shortCount = recs.filter(r => r.action.includes('SHORT')).length;
    const holdCount = recs.filter(r => r.action.includes('HOLD')).length;
    if (kpiEl) {
      kpiEl.innerHTML = `
        <div class="kpi"><div class="kpi-label">BUY SIGNALS</div><div class="kpi-value positive">${buyCount}</div></div>
        <div class="kpi"><div class="kpi-label">SHORT SIGNALS</div><div class="kpi-value negative">${shortCount}</div></div>
        <div class="kpi"><div class="kpi-label">HOLD / NEUTRAL</div><div class="kpi-value" style="color:var(--warn)">${holdCount}</div></div>
        <div class="kpi"><div class="kpi-label">PRODUCTS TRACKED</div><div class="kpi-value" style="color:var(--accent)">${recs.length}</div></div>
      `;
    }

    el.innerHTML = recs.map(rec => {
      const actionClass = rec.action.includes('BUY') ? 'buy' : rec.action.includes('SHORT') ? 'sell' : 'hold';
      const confidence = Math.round(rec.confidence * 100);
      const best = rec.best_source;

      return `<div class="rec-card">
        <div class="rec-product">${rec.product}</div>
        <div class="rec-action ${actionClass}">${rec.action}</div>
        <div class="rec-meta">
          <div class="rec-meta-item">Score: <strong>${rec.score > 0 ? '+' : ''}${rec.score}</strong></div>
          <div class="rec-meta-item">Confidence: <strong>${confidence}%</strong></div>
          <div class="rec-meta-item">Margin: <strong>$${rec.margin_range[0]}-${rec.margin_range[1]}/MBF</strong></div>
          ${best ? `<div class="rec-meta-item">Best: <strong>${best.mill_name} @ $${best.price}</strong> (${best.city || best.region || ''})</div>` : ''}
        </div>
        ${rec.reasons.length ? `
          <ul class="rec-reasons">
            ${rec.reasons.slice(0, 4).map(r => `<li>${r}</li>`).join('')}
          </ul>
        ` : ''}
      </div>`;
    }).join('');

  } catch (e) {
    el.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
  }
}

async function loadIntelSignals(product) {
  const el = document.getElementById('intel-signals');
  if (!el) return;
  try {
    const signals = await loadSignals(product || '');
    const entries = Object.entries(signals);
    if (!entries.length) {
      el.innerHTML = '<div class="empty-state">No signals yet. Submit mill pricing first.</div>';
      return;
    }

    const signalNames = {
      supply_pressure: 'Supply Pressure',
      price_momentum: 'Price Momentum',
      print_vs_street: 'Print vs Street',
      regional_arbitrage: 'Regional Arbitrage',
      offering_velocity: 'Offering Velocity',
      volume_trend: 'Volume Trend'
    };

    const signalIcons = {
      supply_pressure: '📦',
      price_momentum: '📈',
      print_vs_street: '📰',
      regional_arbitrage: '🗺️',
      offering_velocity: '⚡',
      volume_trend: '📊'
    };

    let html = '';
    entries.forEach(([product, sigs]) => {
      html += `<div style="margin-bottom:16px">
        <div style="font-weight:600;font-size:12px;color:var(--accent);margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid var(--border)">${product}</div>`;
      sigs.forEach(sig => {
        html += `<div class="signal-card ${sig.direction}">
          <div class="signal-header">
            <span class="signal-name">${signalIcons[sig.signal] || '📊'} ${signalNames[sig.signal] || sig.signal}</span>
            <span class="signal-badge ${sig.direction}">${sig.direction.toUpperCase()} (${sig.strength})</span>
          </div>
          <div class="signal-explanation">${sig.explanation}</div>
        </div>`;
      });
      html += '</div>';
    });

    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
  }
}

async function refreshSignals(product) {
  await loadIntelSignals(product);
}

async function renderIntelTrends() {
  destroyChart('intelPrice');
  destroyChart('intelSupply');

  try {
    const trends = await loadIntelTrends(_intelTrendProduct, _intelTrendDays);
    const products = Object.keys(trends);
    if (!products.length) return;

    const colors = ['#5b8af5','#e8734a','#4a9e6e','#e05252','#6e9ecf','#c084fc','#f59e0b','#ec4899','#22d3ee','#a3e635'];

    // ---- Price chart: avg price over time per product ----
    const priceCanvas = document.getElementById('intel-price-chart');
    if (priceCanvas && priceCanvas.getContext) {
      const datasets = products.map((p, i) => {
        const data = trends[p].map(d => ({x: d.date, y: d.avg_price}));
        return {
          label: p,
          data,
          borderColor: colors[i % colors.length],
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.3,
          fill: false
        };
      });

      window._charts.intelPrice = new Chart(priceCanvas.getContext('2d'), {
        type: 'line',
        data: {datasets},
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: {mode: 'nearest', intersect: false},
          scales: {
            x: {type: 'category', grid: {color: 'rgba(255,255,255,0.05)'}, ticks: {color: '#888', font: {size: 9}, maxTicksLimit: 12}},
            y: {grid: {color: 'rgba(255,255,255,0.05)'}, ticks: {color: '#888', font: {size: 9}, callback: v => '$' + v}, title: {display: true, text: 'Avg FOB $/MBF', color: '#888', font: {size: 10}}}
          },
          plugins: {
            legend: {position: 'bottom', labels: {color: '#888', font: {size: 9}, boxWidth: 10, padding: 6}},
            tooltip: {callbacks: {label: ctx => ctx.dataset.label + ': $' + ctx.parsed.y}},
            title: {display: true, text: 'Average Price Trend', color: '#888', font: {size: 11}}
          }
        }
      });
    }

    // ---- Supply chart: mill count + volume over time ----
    const supplyCanvas = document.getElementById('intel-supply-chart');
    if (supplyCanvas && supplyCanvas.getContext) {
      // Aggregate across products per date
      const byDate = {};
      products.forEach(p => {
        trends[p].forEach(d => {
          if (!byDate[d.date]) byDate[d.date] = {mills: 0, volume: 0, quotes: 0};
          byDate[d.date].mills += d.mill_count;
          byDate[d.date].volume += d.volume || 0;
          byDate[d.date].quotes += d.quotes || 0;
        });
      });
      const dates = Object.keys(byDate).sort();

      window._charts.intelSupply = new Chart(supplyCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: dates,
          datasets: [
            {
              label: 'Quote Count',
              data: dates.map(d => byDate[d].quotes),
              backgroundColor: 'rgba(91,138,245,0.4)',
              borderColor: 'rgba(91,138,245,0.8)',
              borderWidth: 1,
              yAxisID: 'y'
            },
            {
              label: 'Mills Offering',
              data: dates.map(d => byDate[d].mills),
              type: 'line',
              borderColor: '#e8734a',
              borderWidth: 2,
              pointRadius: 2,
              tension: 0.3,
              fill: false,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: {mode: 'index', intersect: false},
          scales: {
            x: {grid: {color: 'rgba(255,255,255,0.05)'}, ticks: {color: '#888', font: {size: 9}, maxTicksLimit: 12}},
            y: {position: 'left', grid: {color: 'rgba(255,255,255,0.05)'}, ticks: {color: '#888', font: {size: 9}}, title: {display: true, text: 'Quotes/Day', color: '#888', font: {size: 10}}},
            y1: {position: 'right', grid: {drawOnChartArea: false}, ticks: {color: '#e8734a', font: {size: 9}}, title: {display: true, text: 'Mills', color: '#e8734a', font: {size: 10}}}
          },
          plugins: {
            legend: {position: 'bottom', labels: {color: '#888', font: {size: 9}, boxWidth: 10, padding: 6}},
            title: {display: true, text: 'Market Activity', color: '#888', font: {size: 11}}
          }
        }
      });
    }
  } catch (e) {
    console.warn('Intel trends error:', e);
  }
}
