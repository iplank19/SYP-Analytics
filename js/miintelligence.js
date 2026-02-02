// SYP Analytics - Mill Intel Intelligence Engine UI
// Signal cards, recommendation display

let _miIntelTrendProduct = '';
let _miIntelTrendDays = 90;

async function renderMiIntelligence() {
  const c = document.getElementById('content');
  c.innerHTML = `
    <div class="kpi-grid" id="mi-intel-kpis"><div class="spinner" style="margin:20px auto;grid-column:1/-1"></div></div>
    <div class="grid-2" style="gap:16px;align-items:start">
      <div>
        <div class="card">
          <div class="card-header"><span class="card-title">RECOMMENDATIONS</span></div>
          <div class="card-body" id="mi-intel-recs"><div class="spinner" style="margin:10px auto"></div></div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-header">
            <span class="card-title warn">MARKET SIGNALS</span>
            <select id="mi-intel-product-filter" onchange="miRefreshSignals(this.value)" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
              <option value="">All Products</option>
              ${PRODUCTS.map(p => `<option value="${p}">${p}</option>`).join('')}
            </select>
          </div>
          <div class="card-body" id="mi-intel-signals" style="max-height:60vh;overflow-y:auto"><div class="spinner" style="margin:10px auto"></div></div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <span class="card-title">PRICE TRENDS</span>
        <div style="display:flex;gap:8px;align-items:center">
          <select onchange="_miIntelTrendProduct=this.value;miRenderIntelTrends()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
            <option value="">All Products (avg)</option>
            ${PRODUCTS.map(p => `<option value="${p}"${_miIntelTrendProduct===p?' selected':''}>${p}</option>`).join('')}
          </select>
          <select onchange="_miIntelTrendDays=parseInt(this.value);miRenderIntelTrends()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
            <option value="30"${_miIntelTrendDays===30?' selected':''}>30d</option>
            <option value="90"${_miIntelTrendDays===90?' selected':''}>90d</option>
            <option value="180"${_miIntelTrendDays===180?' selected':''}>180d</option>
          </select>
        </div>
      </div>
      <div class="card-body">
        <div class="grid-2" style="gap:16px">
          <div style="height:280px;position:relative"><canvas id="mi-intel-price-chart"></canvas></div>
          <div style="height:280px;position:relative"><canvas id="mi-intel-supply-chart"></canvas></div>
        </div>
      </div>
    </div>
  `;

  await Promise.all([miLoadIntelRecs(), miLoadIntelSignals(), miRenderIntelTrends()]);
}

async function miLoadIntelRecs() {
  const el = document.getElementById('mi-intel-recs');
  if (!el) return;
  try {
    const recs = await miLoadRecommendations();
    if (!recs.length) {
      el.innerHTML = '<div class="empty-state">No data yet. Submit mill pricing first.</div>';
      return;
    }

    const kpiEl = document.getElementById('mi-intel-kpis');
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

async function miLoadIntelSignals(product) {
  const el = document.getElementById('mi-intel-signals');
  if (!el) return;
  try {
    const signals = await miLoadSignals(product || '');
    const entries = Object.entries(signals);
    if (!entries.length) {
      el.innerHTML = '<div class="empty-state">No signals yet. Submit mill pricing first.</div>';
      return;
    }

    const signalNames = {
      supply_pressure: 'Supply Pressure', price_momentum: 'Price Momentum',
      print_vs_street: 'Print vs Street', regional_arbitrage: 'Regional Arbitrage',
      offering_velocity: 'Offering Velocity', volume_trend: 'Volume Trend'
    };
    const signalIcons = {
      supply_pressure: '📦', price_momentum: '📈', print_vs_street: '📰',
      regional_arbitrage: '🗺️', offering_velocity: '⚡', volume_trend: '📊'
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

async function miRefreshSignals(product) {
  await miLoadIntelSignals(product);
}

async function miRenderIntelTrends() {
  destroyChart('miIntelPrice');
  destroyChart('miIntelSupply');

  try {
    const trends = await miLoadIntelTrends(_miIntelTrendProduct, _miIntelTrendDays);
    const products = Object.keys(trends);
    if (!products.length) return;

    const colors = ['#89b4fa','#f9e2af','#a6e3a1','#f38ba8','#89dceb','#c084fc','#f59e0b','#ec4899','#22d3ee','#a3e635'];

    const priceCanvas = document.getElementById('mi-intel-price-chart');
    if (priceCanvas && priceCanvas.getContext) {
      const datasets = products.map((p, i) => {
        const data = trends[p].map(d => ({x: d.date, y: d.avg_price}));
        return {
          label: p, data,
          borderColor: colors[i % colors.length], borderWidth: 2,
          pointRadius: 2, tension: 0.3, fill: false
        };
      });

      window._charts.miIntelPrice = new Chart(priceCanvas.getContext('2d'), {
        type: 'line',
        data: {datasets},
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: {mode: 'nearest', intersect: false},
          scales: {
            x: {type: 'category', grid: {color: 'rgba(62,62,86,0.8)'}, ticks: {color: '#a0a0b8', font: {size: 9}, maxTicksLimit: 12}},
            y: {grid: {color: 'rgba(62,62,86,0.8)'}, ticks: {color: '#a0a0b8', font: {size: 9}, callback: v => '$' + v}, title: {display: true, text: 'Avg FOB $/MBF', color: '#a0a0b8', font: {size: 10}}}
          },
          plugins: {
            legend: {position: 'bottom', labels: {color: '#a0a0b8', font: {size: 9}, boxWidth: 10, padding: 6}},
            tooltip: {callbacks: {label: ctx => ctx.dataset.label + ': $' + ctx.parsed.y}},
            title: {display: true, text: 'Average Price Trend', color: '#a0a0b8', font: {size: 11}}
          }
        }
      });
    }

    const supplyCanvas = document.getElementById('mi-intel-supply-chart');
    if (supplyCanvas && supplyCanvas.getContext) {
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

      window._charts.miIntelSupply = new Chart(supplyCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: dates,
          datasets: [
            {
              label: 'Quote Count',
              data: dates.map(d => byDate[d].quotes),
              backgroundColor: 'rgba(137,180,250,0.4)',
              borderColor: 'rgba(137,180,250,0.8)',
              borderWidth: 1, yAxisID: 'y'
            },
            {
              label: 'Mills Offering',
              data: dates.map(d => byDate[d].mills),
              type: 'line',
              borderColor: '#f9e2af', borderWidth: 2,
              pointRadius: 2, tension: 0.3, fill: false,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: {mode: 'index', intersect: false},
          scales: {
            x: {grid: {color: 'rgba(62,62,86,0.8)'}, ticks: {color: '#a0a0b8', font: {size: 9}, maxTicksLimit: 12}},
            y: {position: 'left', grid: {color: 'rgba(62,62,86,0.8)'}, ticks: {color: '#a0a0b8', font: {size: 9}}, title: {display: true, text: 'Quotes/Day', color: '#a0a0b8', font: {size: 10}}},
            y1: {position: 'right', grid: {drawOnChartArea: false}, ticks: {color: '#f9e2af', font: {size: 9}}, title: {display: true, text: 'Mills', color: '#f9e2af', font: {size: 10}}}
          },
          plugins: {
            legend: {position: 'bottom', labels: {color: '#a0a0b8', font: {size: 9}, boxWidth: 10, padding: 6}},
            title: {display: true, text: 'Market Activity', color: '#a0a0b8', font: {size: 11}}
          }
        }
      });
    }
  } catch (e) {
    console.warn('MI Intel trends error:', e);
  }
}
