// SYP Mill Intelligence - Smart Quote Builder
// Best-source selection, intelligence overlay, freight calculation

let _quoteLoading = false;
let _quoteResults = [];

async function renderSmartQuotes() {
  const c = document.getElementById('content');

  // Load customers and latest quotes
  let customers = [];
  try { customers = await loadCustomers(); } catch (e) {}

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
                <select id="quote-customer" onchange="S.quoteCustomer=this.value" style="padding:6px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
                  <option value="">Select customer...</option>
                  ${customers.map(c => `<option value="${c.name}" data-dest="${c.destination||''}"${S.quoteCustomer===c.name?' selected':''}>${c.name} — ${c.destination||'?'}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Or enter destination</label>
                <input type="text" id="quote-dest" placeholder="City, ST" style="padding:6px 8px;font-size:11px" value="">
              </div>
            </div>

            <div style="margin-bottom:12px">
              <label class="form-label" style="margin-bottom:6px;display:block">Products to quote</label>
              <div style="display:flex;flex-wrap:wrap;gap:6px" id="quote-product-checks">
                ${PRODUCTS.map(p => `
                  <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer">
                    <input type="checkbox" value="${p}" checked> ${p}
                  </label>
                `).join('')}
              </div>
            </div>

            <button class="btn btn-primary" onclick="buildSmartQuote()" ${_quoteLoading?'disabled':''}>
              ${_quoteLoading ? '<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px"></span>Building...' : 'Build Smart Quote'}
            </button>

            <div style="margin-top:16px" id="quote-add-customer">
              <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px">
                <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:8px">ADD CUSTOMER</div>
                <div class="form-grid">
                  <div class="form-group"><label class="form-label">Name</label><input type="text" id="new-cust-name" style="font-size:11px"></div>
                  <div class="form-group"><label class="form-label">Destination</label><input type="text" id="new-cust-dest" placeholder="City, ST" style="font-size:11px"></div>
                </div>
                <button class="btn btn-sm btn-default" style="margin-top:8px" onclick="addNewCustomer()">Add Customer</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-header"><span class="card-title positive">QUOTE RESULTS</span></div>
          <div class="card-body" id="quote-results">
            <div class="empty-state">Select a customer and products, then click Build Smart Quote</div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (_quoteResults.length) renderQuoteResults();
}

async function addNewCustomer() {
  const name = document.getElementById('new-cust-name')?.value?.trim();
  const dest = document.getElementById('new-cust-dest')?.value?.trim();
  if (!name) { showToast('Customer name required', 'warn'); return; }
  try {
    await apiPost('/api/customers', {name, destination: dest, trader: S.trader});
    showToast(`Added customer: ${name}`, 'positive');
    renderSmartQuotes();
  } catch (e) {
    showToast('Error: ' + e.message, 'warn');
  }
}

async function buildSmartQuote() {
  const customerName = S.quoteCustomer || '';
  const customDest = document.getElementById('quote-dest')?.value?.trim() || '';
  const destination = customDest || document.querySelector('#quote-customer option:checked')?.dataset?.dest || '';

  if (!destination) {
    showToast('Select a customer or enter a destination', 'warn');
    return;
  }

  const checkedProducts = [];
  document.querySelectorAll('#quote-product-checks input:checked').forEach(cb => checkedProducts.push(cb.value));
  if (!checkedProducts.length) {
    showToast('Select at least one product', 'warn');
    return;
  }

  _quoteLoading = true;
  renderSmartQuotes();

  try {
    // Get latest quotes, recommendations, and mills
    const [latestQuotes, recommendations, mills] = await Promise.all([
      loadLatestQuotes(),
      loadRecommendations(),
      loadMills()
    ]);

    const recByProduct = {};
    recommendations.forEach(r => recByProduct[r.product] = r);

    const millLocations = {};
    mills.forEach(m => { if (m.city) millLocations[m.name] = m.city; });

    _quoteResults = [];

    for (const product of checkedProducts) {
      const productQuotes = latestQuotes.filter(q => q.product === product);
      const rec = recByProduct[product];

      // For each mill offering this product, calculate landed cost
      const options = [];
      for (const q of productQuotes) {
        const origin = millLocations[q.mill_name] || q.city || '';
        if (!origin) continue;

        let miles = null;
        let freightPerMBF = null;

        try {
          const mileageResult = await getMileage(origin, destination);
          miles = mileageResult.miles;
          // Calculate freight per MBF
          const state = extractState(origin);
          const rate = S.stateRates[state] || 2.50;
          freightPerMBF = Math.round((S.freightBase + miles * rate) / S.quoteMBFperTL);
          if (freightPerMBF < S.shortHaulFloor) freightPerMBF = S.shortHaulFloor;
        } catch (e) {
          // Skip if we can't get mileage
        }

        const landedCost = freightPerMBF != null ? q.price + freightPerMBF : null;

        options.push({
          mill: q.mill_name,
          origin,
          fobPrice: q.price,
          miles,
          freightPerMBF,
          landedCost,
          volume: q.volume || 0,
          tls: q.tls || 0,
          shipWindow: q.ship_window,
          date: q.date,
          trader: q.trader,
          region: q.region
        });
      }

      // Sort by landed cost (nulls last)
      options.sort((a, b) => {
        if (a.landedCost == null && b.landedCost == null) return a.fobPrice - b.fobPrice;
        if (a.landedCost == null) return 1;
        if (b.landedCost == null) return -1;
        return a.landedCost - b.landedCost;
      });

      const best = options[0] || null;
      const marginRange = rec?.margin_range || [22, 35];
      const suggestedSellPrice = best && best.landedCost ? best.landedCost + ((marginRange[0] + marginRange[1]) / 2) : null;

      _quoteResults.push({
        product,
        destination,
        customerName,
        recommendation: rec,
        best,
        options,
        marginRange,
        suggestedSellPrice
      });
    }

    renderQuoteResults();
  } catch (e) {
    showToast('Quote error: ' + e.message, 'warn');
  } finally {
    _quoteLoading = false;
  }
}

function renderQuoteResults() {
  const el = document.getElementById('quote-results');
  if (!el || !_quoteResults.length) return;

  el.innerHTML = _quoteResults.map(r => {
    const rec = r.recommendation;
    const actionClass = rec?.action?.includes('BUY') ? 'positive' : rec?.action?.includes('SHORT') ? 'negative' : 'warn';

    let riskBadge = '<span class="badge badge-info">LOW</span>';
    if (rec) {
      if (Math.abs(rec.score) >= 4) riskBadge = rec.score > 0 ? '<span class="badge badge-danger">HIGH — Tightening</span>' : '<span class="badge badge-success">LOW — Ample Supply</span>';
      else if (Math.abs(rec.score) >= 2) riskBadge = '<span class="badge badge-warn">MEDIUM</span>';
    }

    return `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:16px;font-weight:700;color:var(--accent)">${r.product}</span>
        <div style="display:flex;gap:8px;align-items:center">
          ${riskBadge}
          ${rec ? `<span style="font-weight:600;color:var(--${actionClass})">${rec.action}</span>` : ''}
        </div>
      </div>

      ${r.best ? `
        <div style="background:rgba(74,158,110,0.08);padding:10px 12px;border-radius:var(--radius);margin-bottom:8px">
          <div style="font-size:10px;color:var(--positive);font-weight:600;margin-bottom:4px">BEST SOURCE</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px">
            <span><strong>${r.best.mill}</strong> (${r.best.origin})</span>
            <span class="mono">FOB: ${fmt(r.best.fobPrice)}</span>
            ${r.best.freightPerMBF != null ? `<span class="mono">Freight: ${fmt(r.best.freightPerMBF)}/MBF</span>` : ''}
            ${r.best.landedCost != null ? `<span class="mono" style="color:var(--positive);font-weight:600">Landed: ${fmt(r.best.landedCost)}</span>` : ''}
            ${r.best.miles ? `<span style="color:var(--muted)">${r.best.miles} mi</span>` : ''}
          </div>
          ${r.suggestedSellPrice ? `
            <div style="margin-top:6px;font-size:11px;color:var(--text)">
              Suggested sell: <strong class="mono">${fmt(r.suggestedSellPrice)}</strong> delivered
              (margin: $${r.marginRange[0]}-${r.marginRange[1]}/MBF)
            </div>
          ` : ''}
        </div>
      ` : '<div style="color:var(--muted);font-size:11px;margin-bottom:8px">No mill offers available</div>'}

      ${rec?.reasons?.length ? `
        <div style="font-size:10px;color:var(--muted);margin-bottom:4px;font-weight:600">INTEL</div>
        <ul style="list-style:none;padding:0;margin:0">
          ${rec.reasons.slice(0, 3).map(reason => `<li style="font-size:11px;padding:2px 0;color:var(--text)">• ${reason}</li>`).join('')}
        </ul>
      ` : ''}

      ${r.options.length > 1 ? `
        <details style="margin-top:8px">
          <summary style="font-size:10px;color:var(--muted);cursor:pointer">All ${r.options.length} sources</summary>
          <table style="font-size:10px;margin-top:4px">
            <thead><tr><th>Mill</th><th>FOB</th><th>Freight</th><th>Landed</th><th>Miles</th><th>Ship</th></tr></thead>
            <tbody>
              ${r.options.map(o => `<tr>
                <td>${o.mill}</td>
                <td class="mono">${fmt(o.fobPrice)}</td>
                <td class="mono">${o.freightPerMBF != null ? fmt(o.freightPerMBF) : '?'}</td>
                <td class="mono" style="font-weight:600">${o.landedCost != null ? fmt(o.landedCost) : '?'}</td>
                <td>${o.miles || '?'}</td>
                <td>${o.shipWindow || '-'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </details>
      ` : ''}
    </div>`;
  }).join('');
}
