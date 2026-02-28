// SYP Analytics - Mill Intel Intake Module
// Drag/drop, paste, file upload, AI parsing, inline editing, submit, comparison
// State machine: ready → parsing → editing → comparison

let _miIntakeMode = 'upload';
let _miIntakeState = 'ready'; // ready | parsing | editing | comparison
let _miPreviewQuotes = [];
let _miIntakeProcessing = false;
let _miPreviewSelected = new Set();
let _miNewMills = [];
let _miParseProgress = {pct:0, msg:''};
let _miLastSavedQuotes = []; // for post-submit comparison

// Post-parse volume sanity validation — fixes common AI parsing errors
function _miValidateVolume(q) {
  if (!q) return;
  const product = (q.product || '').toLowerCase();
  const dim = product.match(/(\d+)x(\d+)/);

  // If volume looks like a piece count (matches PPU table), it was likely misread
  if (dim) {
    const key = `${dim[1]}x${dim[2]}`;
    const ppu = MI_PPU[key];
    if (ppu && q.volume === ppu) {
      // Volume matches pieces-per-unit — AI confused PPU for volume
      console.warn(`MI: Volume ${q.volume} matches PPU for ${key}, resetting to 0`);
      q.volume = 0;
    }
  }

  // If tls > 0 and volume is 0, calculate volume from tls
  if (q.tls > 0 && (!q.volume || q.volume === 0)) {
    q.volume = Math.round(q.tls * 23 * 10) / 10;
  }

  // If tls is 0 but volume is exactly 23 (single truckload), set tls=1
  if (q.tls === 0 && q.volume === 23) {
    q.tls = 1;
  }

  // Cap sanity: volume > 500 MBF per line item is suspicious
  if (q.volume > 500) {
    console.warn(`MI: Suspiciously high volume ${q.volume} MBF for ${q.product} at ${q.mill}`);
    q.notes = (q.notes || '') + ` [Volume ${q.volume} MBF flagged for review]`;
  }

  // Ensure numeric types
  q.volume = parseFloat(q.volume) || 0;
  q.tls = parseInt(q.tls) || 0;
  q.price = parseFloat(q.price) || 0;
}

function _miSavePreviewDraft() {
  try { localStorage.setItem('mi_previewDraft', JSON.stringify(_miPreviewQuotes)); } catch {}
}
function _miLoadPreviewDraft() {
  try {
    const d = localStorage.getItem('mi_previewDraft');
    if (d) { const parsed = JSON.parse(d); if (Array.isArray(parsed) && parsed.length) return parsed; }
  } catch {}
  return null;
}
function _miClearPreviewDraft() {
  try { localStorage.removeItem('mi_previewDraft'); } catch {}
}

function renderMiIntake() {
  const c = document.getElementById('content');

  // Check for restored draft → go to editing state
  if (_miIntakeState === 'ready' && !_miPreviewQuotes.length) {
    const draft = _miLoadPreviewDraft();
    if (draft) {
      _miPreviewQuotes = draft;
      _miIntakeState = 'editing';
      showToast(`Restored ${draft.length} unsaved quotes from last session`, 'info');
    }
  }
  if (_miIntakeState === 'ready' && _miPreviewQuotes.length) {
    _miIntakeState = 'editing';
  }

  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">SUBMIT MILL PRICING</span>
        ${_miIntakeState === 'ready' ? `<div style="display:flex;gap:4px">
          <button class="btn ${_miIntakeMode==='upload'?'btn-primary':'btn-default'}" onclick="_miIntakeMode='upload';renderMiIntake()">Upload / Paste</button>
          <button class="btn ${_miIntakeMode==='manual'?'btn-primary':'btn-default'}" onclick="_miIntakeMode='manual';renderMiIntake()">Manual Entry</button>
        </div>` : _miIntakeState === 'editing' ? `<div style="display:flex;gap:4px">
          <button class="btn btn-default btn-sm" onclick="_miIntakeState='ready';_miPreviewQuotes=[];_miPreviewSelected=new Set();_miClearPreviewDraft();_miNewMills=[];renderMiIntake()">Start Over</button>
        </div>` : _miIntakeState === 'comparison' ? `<div style="display:flex;gap:4px">
          <button class="btn btn-default btn-sm" onclick="_miIntakeState='ready';_miLastSavedQuotes=[];renderMiIntake()">Submit More</button>
        </div>` : ''}
      </div>
      <div class="card-body">
        <div style="margin-bottom:12px;color:var(--muted);font-size:11px">
          Submitting as <strong style="color:var(--accent)">${S.trader}</strong> — all submitted data is visible to all traders
        </div>
        <div id="mi-intake-area"></div>
      </div>
    </div>
  `;

  const area = document.getElementById('mi-intake-area');

  switch (_miIntakeState) {
    case 'ready':
      if (_miIntakeMode === 'upload') miRenderUploadIntake(area);
      else miRenderManualIntake(area);
      break;
    case 'parsing':
      miRenderParsingProgress(area);
      break;
    case 'editing':
      miRenderEditingState(area);
      break;
    case 'comparison':
      miRenderPostSubmitComparison(area);
      break;
  }
}

function miRenderUploadIntake(el) {
  if (!el) el = document.getElementById('mi-intake-area');
  el.innerHTML = `
    <div class="grid-2" style="margin-bottom:16px">
      <div>
        <label class="form-label">Upload File</label>
        <div class="drop-zone" id="mi-drop-zone"
             onclick="document.getElementById('mi-file-input').click()"
             ondragenter="event.preventDefault();event.stopPropagation();this.classList.add('drag-over')"
             ondragover="event.preventDefault();event.stopPropagation()"
             ondragleave="if(event.currentTarget===this&&!this.contains(event.relatedTarget))this.classList.remove('drag-over')"
             ondrop="event.preventDefault();event.stopPropagation();this.classList.remove('drag-over');miHandleFileDrop(event)">
          <div style="font-size:32px;margin-bottom:8px;pointer-events:none">📄</div>
          <div style="font-size:12px;color:var(--text);pointer-events:none">Drop file here or click to browse</div>
          <div style="font-size:10px;color:var(--muted);margin-top:4px;pointer-events:none">PDF, Excel, CSV, or any text file</div>
        </div>
        <input type="file" id="mi-file-input" accept=".pdf,.csv,.xlsx,.xls,.tsv,.txt" onchange="miHandleFileUpload(this)" style="display:none">
      </div>
      <div>
        <label class="form-label">Or Paste Text</label>
        <textarea id="mi-paste-text" rows="8"
          ondragenter="event.preventDefault();event.stopPropagation()"
          ondragover="event.preventDefault();event.stopPropagation()"
          ondrop="event.preventDefault();event.stopPropagation();if(event.dataTransfer.files.length){miProcessFile(event.dataTransfer.files[0])}"
          style="width:100%;height:calc(100% - 24px);background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:8px;font-family:var(--mono,monospace);font-size:11px;resize:none" placeholder="Paste mill price list, email, spreadsheet data...

Canfor DQ pricing effective 1/31:
2x4 #2 RL - $445 / 5 units
2x6 #2 RL - $460 / 3 trucks
2x4 #3 RL - $380
All prompt, 5 TL minimum"></textarea>
      </div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn btn-primary" onclick="miParseAll()" id="mi-parse-btn" ${S.apiKey?'':'disabled'}>
        ${_miIntakeProcessing ? '<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px"></span>Parsing...' : 'Parse with AI'}
      </button>
      <span id="mi-parse-status" style="color:var(--muted);font-size:11px"></span>
      ${S.apiKey?'':'<span style="color:var(--warn);font-size:11px">Set API key in Settings first</span>'}
    </div>
    <div style="color:var(--muted);font-size:10px;margin-top:8px">
      AI handles all formats: units, trucks, MBF, mixed formats, emails, PDFs, spreadsheets.
    </div>
  `;
}

function miRenderManualIntake(el) {
  if (!el) el = document.getElementById('mi-intake-area');
  const allMills = [...MILL_COMPANIES];
  el.innerHTML = `
    <div style="overflow-x:auto">
      <table style="font-size:11px">
        <thead><tr>
          <th>Mill</th><th>Product</th><th>FOB $/MBF</th><th>Length</th><th>Volume</th><th>TLs</th><th>Ship Window</th><th>Notes</th><th></th>
        </tr></thead>
        <tbody id="mi-manual-rows"></tbody>
      </table>
    </div>
    <div style="margin-top:8px;display:flex;gap:8px">
      <button class="btn btn-default" onclick="miAddManualRow()">+ Add Row</button>
      <button class="btn btn-default" onclick="for(let i=0;i<5;i++)miAddManualRow()">+ Add 5</button>
      <button class="btn btn-primary" onclick="miSaveManualRows()">Save All</button>
    </div>
  `;
  for (let i = 0; i < 3; i++) miAddManualRow();

  miLoadMills().then(mills => {
    mills.forEach(m => { if (!allMills.includes(m.name)) allMills.push(m.name); });
    document.querySelectorAll('.mi-manual-mill').forEach(sel => {
      const current = sel.value;
      sel.innerHTML = `<option value="">Select...</option>` + allMills.sort().map(m => `<option value="${m}">${m}</option>`).join('');
      if (current) sel.value = current;
    });
  }).catch(() => {});
}

function miRenderParsingProgress(el) {
  if (!el) el = document.getElementById('mi-intake-area');
  const pct = _miParseProgress.pct || 0;
  const msg = _miParseProgress.msg || 'Parsing with AI...';
  el.innerHTML = `
    <div style="text-align:center;padding:40px 20px">
      <div style="width:100%;max-width:400px;margin:0 auto 16px">
        <div style="background:var(--border);border-radius:var(--radius);height:8px;overflow:hidden">
          <div style="background:var(--accent);height:100%;width:${pct}%;transition:width 0.3s ease;border-radius:var(--radius)"></div>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text);font-weight:500">${msg}</div>
      <div style="font-size:10px;color:var(--muted);margin-top:4px">This may take a moment for large files</div>
    </div>
  `;
}

function _miUpdateParseProgress(pct, msg) {
  _miParseProgress = {pct, msg};
  if (_miIntakeState === 'parsing') {
    const el = document.getElementById('mi-intake-area');
    if (el) miRenderParsingProgress(el);
  }
}

function miRenderEditingState(el) {
  if (!el) el = document.getElementById('mi-intake-area');
  if (!_miPreviewQuotes.length) { _miIntakeState = 'ready'; renderMiIntake(); return; }

  const inputStyle = 'padding:3px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)';
  const allSelected = _miPreviewSelected.size === _miPreviewQuotes.length && _miPreviewQuotes.length > 0;

  const rows = _miPreviewQuotes.map((q, i) => `
    <tr style="${_miPreviewSelected.has(i)?'background:rgba(91,138,245,0.08)':''}">
      <td><input type="checkbox" ${_miPreviewSelected.has(i)?'checked':''} onchange="miTogglePreviewRow(${i},this.checked)" style="accent-color:var(--accent)"></td>
      <td><input type="text" value="${q.mill||''}" onchange="_miPreviewQuotes[${i}].mill=this.value;_miSavePreviewDraft()" style="width:150px;${inputStyle}"></td>
      <td><input type="text" value="${q.product||''}" onchange="_miPreviewQuotes[${i}].product=this.value;_miSavePreviewDraft()" style="width:70px;${inputStyle}"></td>
      <td><input type="number" value="${q.price||''}" onchange="_miPreviewQuotes[${i}].price=parseFloat(this.value)||0;_miSavePreviewDraft()" style="width:65px;${inputStyle}"></td>
      <td><input type="text" value="${q.length||'RL'}" onchange="_miPreviewQuotes[${i}].length=this.value;_miSavePreviewDraft()" style="width:40px;${inputStyle}"></td>
      <td><input type="number" value="${q.volume||0}" onchange="_miPreviewQuotes[${i}].volume=parseFloat(this.value)||0;_miSavePreviewDraft()" style="width:50px;${inputStyle}"></td>
      <td><input type="number" value="${q.tls||0}" onchange="_miPreviewQuotes[${i}].tls=parseInt(this.value)||0;_miSavePreviewDraft()" style="width:35px;${inputStyle}"></td>
      <td><input type="text" value="${q.shipWindow||''}" onchange="_miPreviewQuotes[${i}].shipWindow=this.value;_miSavePreviewDraft()" style="width:70px;${inputStyle}"></td>
      <td><input type="text" value="${q.city||''}" onchange="_miPreviewQuotes[${i}].city=this.value;_miSavePreviewDraft()" style="width:90px;${inputStyle}" placeholder="City, ST"></td>
      <td><button onclick="_miPreviewQuotes.splice(${i},1);_miPreviewSelected.delete(${i});_miSavePreviewDraft();miRenderEditingState()" style="background:none;border:none;color:var(--negative);cursor:pointer">×</button></td>
    </tr>
  `).join('');

  const selCount = _miPreviewSelected.size;

  const newMillBanner=_miNewMills.length?`
    <div style="padding:10px 14px;background:rgba(242,186,49,0.1);border:1px solid rgba(242,186,49,0.3);border-radius:var(--radius);font-size:11px;margin-bottom:12px">
      <div style="font-weight:600;color:var(--warn,#f2ba31);margin-bottom:6px">New mills detected — not in your directory:</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${_miNewMills.map(m=>{
        const q=_miPreviewQuotes.find(qq=>qq.mill===m);
        const city=q?.city||'';
        return`<span style="display:inline-flex;align-items:center;gap:6px;padding:3px 8px;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius)">
          <strong>${m}</strong>${city?` <span style="color:var(--muted)">${city}</span>`:''}
          <button class="btn btn-sm btn-primary" style="padding:1px 8px;font-size:10px" onclick="miAddNewMillToCRM('${m.replace(/'/g,"\\'")}','${city.replace(/'/g,"\\'")}')">+ CRM</button>
        </span>`;
      }).join('')}</div>
    </div>`:'';

  el.innerHTML = `
    ${newMillBanner}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
      <span style="font-weight:600;font-size:12px;color:var(--accent)">${_miPreviewQuotes.length} quotes (editable, auto-saved)</span>
      <div style="display:flex;gap:8px;align-items:center">
        ${selCount > 0 ? `<button class="btn btn-sm btn-danger" onclick="miDeleteSelectedPreview()">Delete ${selCount} selected</button>` : ''}
        <button class="btn btn-default btn-sm" onclick="miAddIntakeRow()">+ Add Row</button>
        <button class="btn btn-default" onclick="_miPreviewQuotes=[];_miPreviewSelected=new Set();_miClearPreviewDraft();_miIntakeState='ready';renderMiIntake()">Discard All</button>
        <button class="btn btn-primary" onclick="miSavePreview()">Save to Database</button>
      </div>
    </div>
    <div style="overflow-x:auto;max-height:60vh;overflow-y:auto">
      <table style="font-size:11px">
        <thead style="position:sticky;top:0;z-index:1"><tr>
          <th><input type="checkbox" ${allSelected?'checked':''} onchange="miToggleAllPreview(this.checked)" style="accent-color:var(--accent)"></th>
          <th>Mill</th><th>Product</th><th>FOB $</th><th>Len</th><th>Vol</th><th>TLs</th><th>Ship</th><th>Location</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function miRenderPostSubmitComparison(el) {
  if (!el) el = document.getElementById('mi-intake-area');
  const quotes = _miLastSavedQuotes;
  if (!quotes.length) { _miIntakeState = 'ready'; renderMiIntake(); return; }

  // Group by product, find best (lowest) price per product
  const byProduct = {};
  quotes.forEach(q => {
    const key = q.product || 'unknown';
    if (!byProduct[key]) byProduct[key] = [];
    byProduct[key].push(q);
  });

  // Also include existing mill quotes for comparison
  (S.millQuotes || []).forEach(q => {
    const key = q.product || '';
    if (!key || !byProduct[key]) return; // only for products we just submitted
    // Don't duplicate quotes we just saved (same mill+product+date)
    const isDup = byProduct[key].some(bq => bq.mill === q.mill && bq.date === q.date);
    if (!isDup) byProduct[key].push(q);
  });

  const products = Object.keys(byProduct).sort();
  const uniqueProducts = [...new Set(quotes.map(q => q.product).filter(Boolean))];

  const compRows = products.map(product => {
    const mills = byProduct[product].sort((a, b) => (a.price || 999) - (b.price || 999));
    const best = mills[0];
    const rest = mills.slice(1, 4);
    const bestLabel = `<span style="color:var(--positive);font-weight:bold">${best.mill} ${fmt(best.price)}</span> <span style="font-size:9px;color:var(--muted)">(BEST)</span>`;
    const altLabels = rest.map(m => {
      const diff = m.price - best.price;
      return `<span style="color:var(--muted)">${m.mill} ${fmt(m.price)} <span style="font-size:9px">(+$${diff})</span></span>`;
    }).join(' | ');
    return `<tr>
      <td style="font-weight:600;white-space:nowrap">${product}</td>
      <td>${bestLabel}</td>
      <td>${altLabels||'<span style="color:var(--muted);font-size:10px">no alternatives</span>'}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div style="padding:16px 0">
      <div style="font-weight:600;font-size:14px;color:var(--positive);margin-bottom:12px">
        Saved ${quotes.length} quotes — Comparison:
      </div>
      <div style="overflow-x:auto">
        <table style="font-size:11px;width:100%">
          <thead><tr><th>Product</th><th>Best Price</th><th>Alternatives</th></tr></thead>
          <tbody>${compRows}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="psNavigateWithProducts(${JSON.stringify(uniqueProducts).replace(/"/g,'&quot;')})">Price These for a Customer</button>
        <button class="btn btn-default" onclick="_miIntakeState='ready';_miLastSavedQuotes=[];renderMiIntake()">Submit More Quotes</button>
      </div>
    </div>
  `;
}

function miAddIntakeRow() {
  _miPreviewQuotes.push({mill:'',product:'',price:0,length:'RL',volume:0,tls:0,shipWindow:'Prompt',city:'',notes:''});
  _miSavePreviewDraft();
  miRenderEditingState();
}

function miAddManualRow() {
  const tbody = document.getElementById('mi-manual-rows');
  if (!tbody) return;
  const tr = document.createElement('tr');
  const millOpts = MILL_COMPANIES.map(m => `<option value="${m}">${m}</option>`).join('');
  const prodOpts = MI_PRODUCTS.map(p => `<option value="${p}">${p}</option>`).join('');
  const inputStyle = 'padding:4px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)';
  tr.innerHTML = `
    <td><select class="mi-manual-mill" style="width:160px;${inputStyle}"><option value="">Select...</option>${millOpts}</select></td>
    <td><select class="mi-manual-prod" style="width:80px;${inputStyle}"><option value="">...</option>${prodOpts}</select></td>
    <td><input type="number" class="mi-manual-price" style="width:70px;${inputStyle}" placeholder="450"></td>
    <td><input type="text" class="mi-manual-length" style="width:50px;${inputStyle}" value="RL"></td>
    <td><input type="number" class="mi-manual-vol" style="width:60px;${inputStyle}" placeholder="0"></td>
    <td><input type="number" class="mi-manual-tls" style="width:40px;${inputStyle}" placeholder="0"></td>
    <td><input type="text" class="mi-manual-ship" style="width:80px;${inputStyle}" placeholder="Prompt"></td>
    <td><input type="text" class="mi-manual-notes" style="width:100px;${inputStyle}"></td>
    <td><button onclick="this.closest('tr').remove()" style="background:none;border:none;color:var(--negative);cursor:pointer;font-size:14px">×</button></td>
  `;
  tbody.appendChild(tr);
}

async function miSaveManualRows() {
  const rows = document.querySelectorAll('#mi-manual-rows tr');
  const quotes = [];
  rows.forEach(tr => {
    const mill = tr.querySelector('.mi-manual-mill')?.value || '';
    const product = tr.querySelector('.mi-manual-prod')?.value || '';
    const price = parseFloat(tr.querySelector('.mi-manual-price')?.value) || 0;
    if (!mill || !product || !price) return;
    quotes.push({
      mill, product, price,
      length: tr.querySelector('.mi-manual-length')?.value || 'RL',
      volume: parseFloat(tr.querySelector('.mi-manual-vol')?.value) || 0,
      tls: parseInt(tr.querySelector('.mi-manual-tls')?.value) || 0,
      shipWindow: tr.querySelector('.mi-manual-ship')?.value || 'Prompt',
      notes: tr.querySelector('.mi-manual-notes')?.value || '',
      trader: S.trader, source: 'manual', date: today()
    });
  });
  if (!quotes.length) { showToast('No valid rows to save', 'warn'); return; }
  try {
    await miSubmitQuotes(quotes);
    S.psNewQuotesSince = new Date().toISOString();
    showToast(`Saved ${quotes.length} mill quotes`, 'positive');
    _miLastSavedQuotes = quotes;
    _miIntakeState = 'comparison';
    renderMiIntake();
  } catch (e) {
    showToast('Save error: ' + e.message, 'warn');
  }
}

function miHandleFileDrop(e) {
  const file = e.dataTransfer?.files?.[0];
  if (file) miProcessFile(file);
}

function miHandleFileUpload(input) {
  const file = input.files?.[0];
  if (file) miProcessFile(file);
}

async function miProcessFile(file) {
  const status = document.getElementById('mi-parse-status');
  const setStatus = msg => { if (status) status.textContent = msg; };

  if (file.name.toLowerCase().endsWith('.pdf')) {
    setStatus('Extracting text from PDF...');
    try {
      const data = await miApiUpload('/api/parse-pdf', file);
      let text = '';
      if (data.tables?.length) text = data.tables.map(t => t.rows.map(r => r.join('\t')).join('\n')).join('\n\n');
      if (data.text) text = text ? (text + '\n\n--- Raw Text ---\n' + data.text) : data.text;

      // Scanned PDF — no text but has page images → use Claude vision
      if (!text.trim() && data.images?.length) {
        setStatus(`Scanned PDF detected (${data.images.length} page(s)). Parsing with AI vision...`);
        const ta = document.getElementById('mi-paste-text');
        if (ta) ta.value = '[Scanned PDF — sent to AI vision for parsing]';
        await miRunAIParseImages(data.images);
        return;
      }

      if (!text.trim()) { showToast('No text found in PDF', 'warn'); setStatus(''); return; }
      const ta = document.getElementById('mi-paste-text');
      if (ta) ta.value = text;
      setStatus(`Extracted ${data.pages} pages, ${data.table_count} tables. Parsing...`);
      await miRunAIParse(text);
    } catch (e) {
      showToast('PDF error: ' + e.message, 'warn');
      setStatus('Error: ' + e.message);
    }
    return;
  }

  if (file.name.match(/\.xlsx?$/i)) {
    setStatus('Extracting data from Excel...');
    try {
      const data = await miApiUpload('/api/parse-excel', file);
      if (data.rows?.length) {
        const rawText = data.rows.map(r => r.join('\t')).join('\n');
        // Prepend filename so AI knows the mill company (e.g. "Binderholz Offer Sheet_PINE.xlsx")
        const text = `[Source file: ${file.name}]\n${rawText}`;
        const ta = document.getElementById('mi-paste-text');
        if (ta) ta.value = text;
        const sheetInfo = data.sheet_count ? `${data.sheet_count} sheets, ` : '';
        setStatus(`Extracted ${sheetInfo}${data.count} rows. Parsing with AI...`);
        await miRunAIParse(text);
      } else {
        showToast('No data found in Excel file', 'warn');
        setStatus('');
      }
    } catch (e) {
      showToast('Excel error: ' + e.message, 'warn');
      setStatus('Error: ' + e.message);
    }
    return;
  }

  const reader = new FileReader();
  reader.onload = async () => {
    const text = reader.result;
    const ta = document.getElementById('mi-paste-text');
    if (ta) ta.value = text;
    setStatus('File loaded. Parsing...');
    await miRunAIParse(text);
  };
  reader.readAsText(file);
}

async function miParseAll() {
  const text = document.getElementById('mi-paste-text')?.value || '';
  if (!text.trim()) { showToast('Upload a file or paste text first', 'warn'); return; }
  await miRunAIParse(text);
}

async function miRunAIParse(text) {
  if (!S.apiKey) { showToast('Set your Claude API key in Settings first', 'warn'); return; }

  // Transition to parsing state
  _miIntakeProcessing = true;
  _miIntakeState = 'parsing';
  _miUpdateParseProgress(15, 'Sending to AI for parsing...');
  renderMiIntake();

  try {
    _miUpdateParseProgress(30, 'AI is analyzing the price list...');
    const quotes = await miAiParseMillPriceList(text);
    _miUpdateParseProgress(80, `Found ${quotes.length} quotes. Normalizing...`);

    if (!quotes.length) {
      showToast('AI found no quotes in text', 'warn');
      _miIntakeState = 'ready';
      renderMiIntake();
      return;
    }
    for (const q of quotes) {
      q.mill = miNormalizeMillName(q.mill);
      if (q.mill) {
        const dirCity = miInferMillCity(q.mill);
        if (dirCity) q.city = dirCity;
        else if (!q.city) q.city = '';
      }
      if (!q.length) q.length = 'RL';
      _miValidateVolume(q);
    }
    _miUpdateParseProgress(95, 'Done! Loading editor...');

    _miPreviewQuotes = quotes;
    _miPreviewSelected = new Set();
    const parsedMills=[...new Set(quotes.map(q=>q.mill).filter(Boolean))];
    const knownSet=new Set([...MILLS,...Object.keys(MILL_DIRECTORY),...S.mills.map(m=>m.name)]);
    _miNewMills=parsedMills.filter(m=>!knownSet.has(m));
    _miSavePreviewDraft();

    // Transition to editing state
    _miIntakeState = 'editing';
    renderMiIntake();

    if(_miNewMills.length){
      showToast(`${_miNewMills.length} new mill(s) detected: ${_miNewMills.join(', ')}`, 'warn');
    }
    showToast(`AI parsed ${quotes.length} quotes — edit and save below`, 'positive');
  } catch (e) {
    showToast('AI parse error: ' + e.message, 'warn');
    _miIntakeState = 'ready';
    renderMiIntake();
  } finally {
    _miIntakeProcessing = false;
  }
}

// Vision-based parsing for scanned PDFs (page images → Claude vision API)
async function miRunAIParseImages(images) {
  if (!S.apiKey) { showToast('Set your Claude API key in Settings first', 'warn'); return; }

  _miIntakeProcessing = true;
  _miIntakeState = 'parsing';
  _miUpdateParseProgress(15, `Parsing ${images.length} scanned page(s) with AI vision...`);
  renderMiIntake();

  try {
    _miUpdateParseProgress(30, 'AI is reading scanned pages...');
    const quotes = await miAiParseImages(images);
    _miUpdateParseProgress(80, `Found ${quotes.length} quotes. Normalizing...`);

    if (!quotes.length) {
      showToast('AI found no quotes in scanned PDF', 'warn');
      _miIntakeState = 'ready';
      renderMiIntake();
      return;
    }
    for (const q of quotes) {
      q.mill = miNormalizeMillName(q.mill);
      if (q.mill) {
        const dirCity = miInferMillCity(q.mill);
        if (dirCity) q.city = dirCity;
        else if (!q.city) q.city = '';
      }
      if (!q.length) q.length = 'RL';
      _miValidateVolume(q);
    }
    _miUpdateParseProgress(95, 'Done! Loading editor...');

    _miPreviewQuotes = quotes;
    _miPreviewSelected = new Set();
    const parsedMills=[...new Set(quotes.map(q=>q.mill).filter(Boolean))];
    const knownSet=new Set([...MILLS,...Object.keys(MILL_DIRECTORY),...S.mills.map(m=>m.name)]);
    _miNewMills=parsedMills.filter(m=>!knownSet.has(m));
    _miSavePreviewDraft();

    _miIntakeState = 'editing';
    renderMiIntake();

    if(_miNewMills.length){
      showToast(`${_miNewMills.length} new mill(s) detected: ${_miNewMills.join(', ')}`, 'warn');
    }
    showToast(`AI parsed ${quotes.length} quotes from scanned PDF — edit and save below`, 'positive');
  } catch (e) {
    showToast('AI vision parse error: ' + e.message, 'warn');
    _miIntakeState = 'ready';
    renderMiIntake();
  } finally {
    _miIntakeProcessing = false;
  }
}

function miRenderPreview() {
  // Legacy compat — redirect to editing state render
  miRenderEditingState();
}

function miTogglePreviewRow(idx, checked) {
  if (checked) _miPreviewSelected.add(idx);
  else _miPreviewSelected.delete(idx);
  miRenderEditingState();
}

function miToggleAllPreview(checked) {
  _miPreviewSelected = checked ? new Set(_miPreviewQuotes.map((_, i) => i)) : new Set();
  miRenderEditingState();
}

function miDeleteSelectedPreview() {
  if (!_miPreviewSelected.size) return;
  const indices = [..._miPreviewSelected].sort((a, b) => b - a);
  indices.forEach(i => _miPreviewQuotes.splice(i, 1));
  _miPreviewSelected = new Set();
  _miSavePreviewDraft();
  miRenderEditingState();
  showToast(`Deleted ${indices.length} rows`, 'info');
}

async function miSavePreview() {
  const valid = _miPreviewQuotes.filter(q => q.mill && q.product && q.price > 0);
  if (!valid.length) { showToast('No valid quotes to save', 'warn'); return; }
  try {
    const result = await miSubmitQuotes(valid);
    showToast(`Saved ${result.created} mill quotes to database`, 'positive');
    // Set new-data indicator for price sheet
    S.psNewQuotesSince = new Date().toISOString();
    _miLastSavedQuotes = valid;
    _miPreviewQuotes = [];
    _miPreviewSelected = new Set();
    _miNewMills = [];
    _miClearPreviewDraft();
    // Transition to comparison state
    _miIntakeState = 'comparison';
    renderMiIntake();
  } catch (e) {
    showToast('Save error: ' + e.message, 'warn');
  }
}

async function miAddNewMillToCRM(millName, city) {
  const company = typeof extractMillCompany === 'function' ? extractMillCompany(millName) : millName;
  const cityParts = city.split(',').map(s=>s.trim());
  const millCity = cityParts[0] || '';
  const millState = (cityParts[1] || '').toUpperCase();
  const region = 'central'; // Backend will set correct region via find_or_create_crm_mill
  const loc = millCity ? [{city: millCity, state: millState, label: city, name: millName}] : [];
  try {
    const res = await fetch('/api/crm/mills', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: company, city: millCity, state: millState, region, location: city, locations: JSON.stringify(loc), trader: S.trader || 'Unknown'})
    });
    if (res.ok) {
      _miNewMills = _miNewMills.filter(m => m !== millName);
      if (!S.mills.find(m => m.name === company)) {
        S.mills.push({name: company, origin: city, locations: loc, addedDate: today()});
      }
      // Fire-and-forget entity resolution
      if(typeof resolveEntity==='function')resolveEntity(company,'mill','mill_quote').catch(()=>{});
      showToast(`Added "${company}" to CRM`, 'positive');
      miRenderEditingState();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Failed to add mill', 'warn');
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'warn');
  }
}
