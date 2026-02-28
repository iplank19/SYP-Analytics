// SYP Analytics — Entity Resolution Frontend
// Fuzzy matching modal, unified entity view, review queue, migration

// ── API helpers ──────────────────────────────────────────────────

async function erApi(path, opts = {}) {
  const url = '/api/entity' + path
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? {'Content-Type': 'application/json'} : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) throw new Error(`Entity API error: ${res.status}`)
  return res.json()
}

// ── Core resolution function ─────────────────────────────────────

/**
 * Resolve a name to a canonical entity.
 * Returns a promise that resolves to {canonical_id, canonical_name, action}
 * If manual review is needed, shows modal and waits for user choice.
 */
function resolveEntity(name, type, context = 'manual') {
  return new Promise(async (resolve, reject) => {
    try {
      const result = await erApi('/resolve', {
        method: 'POST',
        body: { name, type, context }
      })

      if (result.action === 'matched' || result.action === 'created') {
        resolve(result)
      } else if (result.action === 'review') {
        // Show review modal — user picks candidate or creates new
        showEntityReviewModal(result, (choice) => {
          resolve(choice)
        })
      } else {
        resolve(result)
      }
    } catch (e) {
      console.error('Entity resolution error:', e)
      // Fallback: don't block workflow
      resolve({ canonical_id: null, canonical_name: name, action: 'error', error: e.message })
    }
  })
}


// ── Review Modal ─────────────────────────────────────────────────

function showEntityReviewModal(reviewData, callback) {
  const { input_name, candidates, review_id } = reviewData
  const type = candidates?.[0]?.metadata ? 'mill' : 'entity'

  const candidateCards = candidates.map((c, i) => {
    const pct = (c.score * 100).toFixed(0)
    const scoreColor = c.score >= 0.9 ? 'var(--positive)' : c.score >= 0.8 ? 'var(--warn,#f2ba31)' : 'var(--muted)'
    const aliases = (c.aliases || []).filter(a => a.toLowerCase() !== c.canonical_name.toLowerCase()).slice(0, 3)
    return `
      <label class="er-candidate" style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;transition:background 0.15s" onclick="this.querySelector('input').checked=true;document.querySelectorAll('.er-candidate').forEach(c=>c.style.background='');this.style.background='rgba(74,158,110,0.1)'">
        <input type="radio" name="er-choice" value="${c.canonical_id}" style="margin-top:3px" ${i===0?'checked':''} />
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px">${_escHtml(c.canonical_name)}</div>
          ${aliases.length ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">Also: ${aliases.map(a=>_escHtml(a)).join(', ')}</div>` : ''}
        </div>
        <span style="font-size:12px;font-weight:600;color:${scoreColor};white-space:nowrap">${pct}%</span>
      </label>`
  }).join('')

  const html = `
    <div class="modal-overlay" onclick="closeModal()" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center">
      <div onclick="event.stopPropagation()" style="background:var(--panel);border-radius:var(--radius);width:460px;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.3)">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700;font-size:14px">Confirm Match</span>
          <button onclick="closeModal()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer">&times;</button>
        </div>
        <div style="padding:16px 20px">
          <div style="margin-bottom:12px">
            <span style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Input name</span>
            <div style="font-size:15px;font-weight:600;margin-top:2px">${_escHtml(input_name)}</div>
          </div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Select the matching entity or create a new one:</div>
          <div style="display:grid;gap:6px;margin-bottom:10px">
            ${candidateCards}
            <label class="er-candidate" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px dashed var(--border);border-radius:var(--radius);cursor:pointer" onclick="this.querySelector('input').checked=true;document.querySelectorAll('.er-candidate').forEach(c=>c.style.background='');this.style.background='rgba(242,186,49,0.1)'">
              <input type="radio" name="er-choice" value="NEW" />
              <div style="color:var(--warn,#f2ba31);font-weight:600;font-size:13px">+ Create New Entity</div>
            </label>
          </div>
        </div>
        <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-default btn-sm" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="_erSubmitReview(${review_id})">Confirm</button>
        </div>
      </div>
    </div>`

  const modal = document.getElementById('modal') || document.createElement('div')
  if (!modal.id) { modal.id = 'er-modal'; document.body.appendChild(modal) }
  modal.innerHTML = html
  modal.style.display = 'block'

  // Store callback
  window._erCallback = callback
  // Select first candidate by default
  const first = modal.querySelector('.er-candidate')
  if (first) first.style.background = 'rgba(74,158,110,0.1)'
}

async function _erSubmitReview(reviewId) {
  const radio = document.querySelector('input[name="er-choice"]:checked')
  if (!radio) return

  const choice = radio.value
  try {
    const result = await erApi(`/review/${reviewId}`, {
      method: 'POST',
      body: choice === 'NEW' ? { create_new: true } : { choice }
    })
    closeModal()
    if (window._erCallback) {
      window._erCallback(result)
      window._erCallback = null
    }
    showToast(`Entity ${result.action === 'created' ? 'created' : 'linked'}: ${result.canonical_name || result.canonical_id}`, 'positive')
  } catch (e) {
    showToast('Review error: ' + e.message, 'negative')
  }
}


// ── Unified Entity View ──────────────────────────────────────────

async function showUnifiedEntityView(canonicalId) {
  const modal = document.getElementById('modal') || document.createElement('div')
  if (!modal.id) { modal.id = 'modal'; document.body.appendChild(modal) }
  modal.innerHTML = `<div class="modal-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center">
    <div style="background:var(--panel);border-radius:var(--radius);width:700px;padding:40px;text-align:center">
      <div class="spinner" style="margin:0 auto 12px"></div>
      <div style="color:var(--muted);font-size:12px">Loading entity data...</div>
    </div>
  </div>`
  modal.style.display = 'block'

  try {
    // Post trades data so the backend can match against aliases
    const tradesData = { buys: S.buys || [], sells: S.sells || [] }
    const data = await erApi(`/${canonicalId}/unified`, {
      method: 'POST',
      body: tradesData
    })

    if (data.error) {
      modal.innerHTML = ''
      modal.style.display = 'none'
      showToast('Entity not found', 'negative')
      return
    }

    const c = data.canonical
    let _uevTab = 'overview'

    function renderUEV() {
      const aliasRows = data.aliases.map(a =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:12px">${_escHtml(a.variant)}</span>
          <span style="font-size:10px;color:var(--muted)">${a.source}${a.score ? ` (${(a.score*100).toFixed(0)}%)` : ''}</span>
        </div>`
      ).join('')

      const tradeRows = [...(data.trades.buys||[]).map(t=>({...t,_type:'BUY'})), ...(data.trades.sells||[]).map(t=>({...t,_type:'SELL'}))]
        .sort((a,b)=>(b.date||'').localeCompare(a.date||''))
        .slice(0,50)
        .map(t => `<tr>
          <td style="font-size:11px">${t.date||'-'}</td>
          <td><span style="color:${t._type==='BUY'?'var(--accent)':'var(--positive)'}; font-weight:600;font-size:11px">${t._type}</span></td>
          <td style="font-size:11px">${t.product||'-'}</td>
          <td class="mono" style="font-size:11px">${t.volume ? t.volume.toLocaleString()+' MBF' : '-'}</td>
          <td class="mono" style="font-size:11px">${t.price ? '$'+Number(t.price).toFixed(0) : '-'}</td>
          <td style="font-size:11px;color:var(--muted)">${t.mill||t.customer||'-'}</td>
        </tr>`).join('')

      const quoteRows = (data.mill_quotes||[]).slice(0,50).map(q =>
        `<tr>
          <td style="font-size:11px">${q.date||'-'}</td>
          <td style="font-size:11px">${_escHtml(q.mill_name||'')}</td>
          <td style="font-size:11px;font-weight:600">${q.product||'-'}</td>
          <td class="mono" style="font-size:11px">$${Number(q.price||0).toFixed(0)}</td>
          <td style="font-size:11px">${q.length||'RL'}</td>
          <td style="font-size:11px;color:var(--muted)">${q.trader||'-'}</td>
        </tr>`).join('')

      const changeRows = (data.price_changes||[]).slice(0,30).map(pc =>
        `<tr>
          <td style="font-size:11px">${pc.date||'-'}</td>
          <td style="font-size:11px">${pc.product||'-'}</td>
          <td class="mono" style="font-size:11px">$${Number(pc.old_price||0).toFixed(0)}</td>
          <td class="mono" style="font-size:11px">$${Number(pc.new_price||0).toFixed(0)}</td>
          <td class="mono" style="font-size:11px;color:${(pc.change||0)<0?'var(--positive)':'var(--negative)'}">
            ${(pc.change||0)>0?'+':''}$${Number(pc.change||0).toFixed(0)}
          </td>
        </tr>`).join('')

      const meta = c.metadata || {}
      const tabBtn = (id, label) => `<button class="btn btn-sm ${_uevTab===id?'btn-primary':'btn-default'}" onclick="_uevTab='${id}';_uevRender()">${label}</button>`

      modal.innerHTML = `
        <div class="modal-overlay" onclick="closeModal()" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center">
          <div onclick="event.stopPropagation()" style="background:var(--panel);border-radius:var(--radius);width:720px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.3)">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
              <div>
                <span style="font-weight:700;font-size:15px">${_escHtml(c.canonical_name)}</span>
                <span style="font-size:11px;color:var(--muted);margin-left:8px;text-transform:uppercase">${c.type}</span>
                ${meta.city?`<span style="font-size:11px;color:var(--muted);margin-left:6px">· ${meta.city}${meta.state?', '+meta.state:''}</span>`:''}
              </div>
              <button onclick="closeModal()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer">&times;</button>
            </div>
            <div style="padding:12px 20px;border-bottom:1px solid var(--border);display:flex;gap:4px;flex-shrink:0">
              ${tabBtn('overview','Overview')}
              ${tabBtn('aliases','Names (${data.aliases.length})')}
              ${tabBtn('trades','Trades (${(data.trades.buys||[]).length+(data.trades.sells||[]).length})')}
              ${tabBtn('quotes','Quotes (${(data.mill_quotes||[]).length})')}
              ${tabBtn('changes','Price Moves (${(data.price_changes||[]).length})')}
            </div>
            <div style="padding:16px 20px;overflow-y:auto;flex:1">
              ${_uevTab==='overview' ? `
                <div style="display:grid;gap:12px">
                  <div style="display:grid;grid-template-columns:120px 1fr;gap:6px;font-size:12px">
                    <span style="color:var(--muted)">Canonical ID</span><span class="mono">${c.canonical_id}</span>
                    <span style="color:var(--muted)">Type</span><span>${c.type}</span>
                    ${meta.city?`<span style="color:var(--muted)">Location</span><span>${meta.city}${meta.state?', '+meta.state:''}</span>`:''}
                    ${meta.region?`<span style="color:var(--muted)">Region</span><span>${meta.region}</span>`:''}
                    <span style="color:var(--muted)">Known Names</span><span>${data.aliases.length}</span>
                    <span style="color:var(--muted)">Trades</span><span>${(data.trades.buys||[]).length+(data.trades.sells||[]).length}</span>
                    <span style="color:var(--muted)">MI Quotes</span><span>${(data.mill_quotes||[]).length}</span>
                  </div>
                  ${data.crm.mills.length?`<div style="margin-top:8px"><span style="font-size:11px;color:var(--muted);text-transform:uppercase">CRM Mills</span>${data.crm.mills.map(m=>`<div style="font-size:12px;margin-top:4px">${_escHtml(m.name)} ${m.location?'· '+_escHtml(m.location):''}</div>`).join('')}</div>`:''}
                  ${data.crm.customers.length?`<div style="margin-top:8px"><span style="font-size:11px;color:var(--muted);text-transform:uppercase">CRM Customers</span>${data.crm.customers.map(cu=>`<div style="font-size:12px;margin-top:4px">${_escHtml(cu.name)} ${cu.destination?'· '+_escHtml(cu.destination):''}</div>`).join('')}</div>`:''}
                </div>
              ` : _uevTab==='aliases' ? `
                <div>${aliasRows || '<div style="color:var(--muted);font-size:12px">No aliases</div>'}</div>
              ` : _uevTab==='trades' ? `
                ${tradeRows ? `<table style="width:100%"><thead><tr><th>Date</th><th>Type</th><th>Product</th><th>Volume</th><th>Price</th><th>${c.type==='mill'?'Customer':'Mill'}</th></tr></thead><tbody>${tradeRows}</tbody></table>` : '<div style="color:var(--muted);font-size:12px;text-align:center;padding:20px">No trades found for this entity</div>'}
              ` : _uevTab==='quotes' ? `
                ${quoteRows ? `<table style="width:100%"><thead><tr><th>Date</th><th>Mill</th><th>Product</th><th>Price</th><th>Len</th><th>Trader</th></tr></thead><tbody>${quoteRows}</tbody></table>` : '<div style="color:var(--muted);font-size:12px;text-align:center;padding:20px">No Mill Intel quotes found</div>'}
              ` : _uevTab==='changes' ? `
                ${changeRows ? `<table style="width:100%"><thead><tr><th>Date</th><th>Product</th><th>Old</th><th>New</th><th>Change</th></tr></thead><tbody>${changeRows}</tbody></table>` : '<div style="color:var(--muted);font-size:12px;text-align:center;padding:20px">No price changes recorded</div>'}
              ` : ''}
            </div>
          </div>
        </div>`
    }

    window._uevTab = _uevTab
    window._uevRender = () => { _uevTab = window._uevTab; renderUEV() }
    renderUEV()
  } catch (e) {
    modal.innerHTML = ''
    modal.style.display = 'none'
    showToast('Error loading entity: ' + e.message, 'negative')
  }
}


// ── Entity Resolution Settings Section ───────────────────────────

async function renderEntityResolutionSettings() {
  const container = document.getElementById('er-settings')
  if (!container) return

  container.innerHTML = `<div class="spinner" style="margin:12px auto"></div>`

  try {
    const stats = await erApi('/stats')
    const reviews = await erApi('/review')

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
        <div style="background:var(--bg);padding:12px;border-radius:var(--radius);text-align:center">
          <div style="font-size:20px;font-weight:700;color:var(--accent)">${stats.mill_entities}</div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase">Mill Entities</div>
        </div>
        <div style="background:var(--bg);padding:12px;border-radius:var(--radius);text-align:center">
          <div style="font-size:20px;font-weight:700;color:var(--accent)">${stats.customer_entities}</div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase">Customer Entities</div>
        </div>
        <div style="background:var(--bg);padding:12px;border-radius:var(--radius);text-align:center">
          <div style="font-size:20px;font-weight:700">${stats.total_aliases}</div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase">Total Aliases</div>
        </div>
        <div style="background:var(--bg);padding:12px;border-radius:var(--radius);text-align:center">
          <div style="font-size:20px;font-weight:700;color:${stats.pending_reviews>0?'var(--warn,#f2ba31)':'var(--positive)'}">${stats.pending_reviews}</div>
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase">Pending Reviews</div>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn btn-primary btn-sm" onclick="erRunMigration()">
          ${stats.mill_entities + stats.customer_entities === 0 ? '🚀 Initialize Entity Resolution' : '🔄 Re-scan Data'}
        </button>
        <button class="btn btn-default btn-sm" onclick="erSearchTest()">🔍 Test Fuzzy Search</button>
      </div>

      ${reviews.length ? `
        <div style="margin-top:12px">
          <div style="font-weight:600;font-size:13px;margin-bottom:8px">Pending Reviews (${reviews.length})</div>
          <div style="display:grid;gap:6px">
            ${reviews.map(r => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg);border-radius:var(--radius);border-left:3px solid var(--warn,#f2ba31)">
                <div>
                  <div style="font-size:12px;font-weight:600">${_escHtml(r.input_name)}</div>
                  <div style="font-size:10px;color:var(--muted)">${r.entity_type} · ${r.source_context} · ${r.candidates.length} candidates</div>
                </div>
                <button class="btn btn-sm btn-default" onclick="erReviewItem(${r.id}, '${_escHtml(r.input_name)}', '${r.entity_type}')">Review</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `
  } catch (e) {
    container.innerHTML = `<div style="color:var(--negative);font-size:12px">Error loading entity stats: ${e.message}</div>`
  }
}


async function erRunMigration() {
  if (!confirm('This will scan all existing mills and customers to build the entity resolution database. Continue?')) return
  showToast('Running entity migration...', 'info')

  try {
    // Pass MILL_DIRECTORY from frontend
    const millDir = typeof MILL_DIRECTORY !== 'undefined' ? MILL_DIRECTORY : {}
    const stats = await erApi('/migrate-with-directory', {
      method: 'POST',
      body: { mill_directory: millDir }
    })
    showToast(
      `Migration complete: ${stats.entities_created} entities, ${stats.aliases_created} aliases, ${stats.crm_linked} CRM linked, ${stats.mi_linked} MI linked` +
      (stats.reviews_queued > 0 ? `, ${stats.reviews_queued} need review` : ''),
      'positive'
    )
    renderEntityResolutionSettings()
  } catch (e) {
    showToast('Migration error: ' + e.message, 'negative')
  }
}

async function erSearchTest() {
  const name = prompt('Enter a name to fuzzy search:')
  if (!name) return
  const type = prompt('Type (mill or customer):', 'mill')
  if (!type) return

  try {
    const results = await erApi(`/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(name)}&limit=5`)
    if (!results.length) {
      showToast('No matches found', 'info')
      return
    }
    const msg = results.map(r =>
      `${r.canonical_name} (${(r.score*100).toFixed(0)}%) [${r.aliases.slice(0,2).join(', ')}]`
    ).join('\n')
    alert('Top matches:\n\n' + msg)
  } catch (e) {
    showToast('Search error: ' + e.message, 'negative')
  }
}

async function erReviewItem(reviewId, inputName, entityType) {
  try {
    const reviews = await erApi('/review')
    const review = reviews.find(r => r.id === reviewId)
    if (!review) { showToast('Review not found', 'negative'); return }

    // Enrich candidates
    const enriched = []
    for (const c of review.candidates) {
      const search = await erApi(`/search?type=${entityType}&q=${encodeURIComponent(c.canonical_name)}&limit=1`)
      enriched.push({
        canonical_id: c.canonical_id,
        canonical_name: c.canonical_name,
        score: c.score,
        aliases: search[0]?.aliases || [],
        metadata: search[0]?.metadata || {},
      })
    }

    showEntityReviewModal(
      { input_name: inputName, candidates: enriched, review_id: reviewId },
      () => renderEntityResolutionSettings()
    )
  } catch (e) {
    showToast('Error: ' + e.message, 'negative')
  }
}


// ── Quick Entity Lookup ──────────────────────────────────────────

/**
 * Look up entity by name and open unified view.
 * Used in CRM table buttons.
 */
async function erOpenUnifiedByName(name, type) {
  try {
    const results = await erApi(`/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(name)}&limit=1`)
    if (results.length && results[0].score >= 0.75) {
      showUnifiedEntityView(results[0].canonical_id)
    } else {
      showToast('No entity found — run migration first', 'info')
    }
  } catch (e) {
    showToast('Entity lookup error: ' + e.message, 'negative')
  }
}


// ── Utility ──────────────────────────────────────────────────────

function _escHtml(s) {
  if (!s) return ''
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
