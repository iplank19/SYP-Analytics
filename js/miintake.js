// SYP Analytics - Mill Intel Intake Module
// Drag/drop, paste, file upload, AI parsing, preview, submit

let _miIntakeMode = 'upload';
let _miPreviewQuotes = [];
let _miIntakeProcessing = false;
let _miPreviewSelected = new Set();
let _miNewMills = [];

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
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">SUBMIT MILL PRICING</span>
        <div style="display:flex;gap:4px">
          <button class="btn ${_miIntakeMode==='upload'?'btn-primary':'btn-default'}" onclick="_miIntakeMode='upload';renderMiIntake()">Upload / Paste</button>
          <button class="btn ${_miIntakeMode==='manual'?'btn-primary':'btn-default'}" onclick="_miIntakeMode='manual';renderMiIntake()">Manual Entry</button>
        </div>
      </div>
      <div class="card-body">
        <div style="margin-bottom:12px;color:var(--muted);font-size:11px">
          Submitting as <strong style="color:var(--accent)">${S.trader}</strong> — all submitted data is visible to all traders
        </div>
        <div id="mi-intake-content"></div>
        <div id="mi-intake-preview"></div>
      </div>
    </div>
  `;

  if (_miIntakeMode === 'upload') miRenderUploadIntake();
  else miRenderManualIntake();

  if (!_miPreviewQuotes.length) {
    const draft = _miLoadPreviewDraft();
    if (draft) {
      _miPreviewQuotes = draft;
      showToast(`Restored ${draft.length} unsaved quotes from last session`, 'info');
    }
  }

  if (_miPreviewQuotes.length) miRenderPreview();
}

function miRenderUploadIntake() {
  const el = document.getElementById('mi-intake-content');
  el.innerHTML = `
    <div class="grid-2" style="margin-bottom:16px">
      <div>
        <label class="form-label">Upload File</label>
        <div class="drop-zone" id="mi-drop-zone"
             onclick="document.getElementById('mi-file-input').click()"
             ondragover="event.preventDefault();this.classList.add('drag-over')"
             ondragleave="this.classList.remove('drag-over')"
             ondrop="event.preventDefault();this.classList.remove('drag-over');miHandleFileDrop(event)">
          <div style="font-size:32px;margin-bottom:8px">📄</div>
          <div style="font-size:12px;color:var(--text)">Drop file here or click to browse</div>
          <div style="font-size:10px;color:var(--muted);margin-top:4px">PDF, Excel, CSV, or any text file</div>
        </div>
        <input type="file" id="mi-file-input" accept=".pdf,.csv,.xlsx,.xls,.tsv,.txt" onchange="miHandleFileUpload(this)" style="display:none">
      </div>
      <div>
        <label class="form-label">Or Paste Text</label>
        <textarea id="mi-paste-text" rows="8" style="width:100%;height:calc(100% - 24px);background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:8px;font-family:var(--mono,monospace);font-size:11px;resize:none" placeholder="Paste mill price list, email, spreadsheet data...

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

function miRenderManualIntake() {
  const el = document.getElementById('mi-intake-content');
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
    showToast(`Saved ${quotes.length} mill quotes`, 'positive');
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
        const text = data.rows.map(r => r.join('\t')).join('\n');
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
  const btn = document.getElementById('mi-parse-btn');
  const status = document.getElementById('mi-parse-status');
  _miIntakeProcessing = true;
  if (btn) btn.disabled = true;
  if (btn) btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px"></span>Parsing...';
  if (status && !status.textContent.includes('...')) status.textContent = 'Parsing with AI...';

  try {
    const quotes = await miAiParseMillPriceList(text);
    if (!quotes.length) {
      showToast('AI found no quotes in text', 'warn');
      if (status) status.textContent = 'No quotes found';
      return;
    }
    for (const q of quotes) {
      q.mill = miNormalizeMillName(q.mill);
      if (!q.city && q.mill) q.city = miInferMillCity(q.mill);
      if (!q.length) q.length = 'RL';
    }
    _miPreviewQuotes = quotes;
    _miPreviewSelected = new Set();
    // Detect new/unknown mills
    const parsedMills=[...new Set(quotes.map(q=>q.mill).filter(Boolean))];
    const knownSet=new Set([...MILLS,...Object.keys(MILL_DIRECTORY),...S.mills.map(m=>m.name)]);
    _miNewMills=parsedMills.filter(m=>!knownSet.has(m));
    _miSavePreviewDraft();
    renderMiIntake();
    if(_miNewMills.length){
      showToast(`⚠️ ${_miNewMills.length} new mill(s) detected: ${_miNewMills.join(', ')}`, 'warn');
    }
    showToast(`AI parsed ${quotes.length} quotes — review below (auto-saved)`, 'positive');
  } catch (e) {
    showToast('AI parse error: ' + e.message, 'warn');
    if (status) status.textContent = 'Error: ' + e.message;
  } finally {
    _miIntakeProcessing = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Parse with AI'; }
  }
}

function miRenderPreview() {
  const el = document.getElementById('mi-intake-preview');
  if (!el || !_miPreviewQuotes.length) return;
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
      <td><button onclick="_miPreviewQuotes.splice(${i},1);_miPreviewSelected.delete(${i});_miSavePreviewDraft();renderMiIntake()" style="background:none;border:none;color:var(--negative);cursor:pointer">×</button></td>
    </tr>
  `).join('');

  const selCount = _miPreviewSelected.size;

  const newMillBanner=_miNewMills.length?`
    <div style="margin-top:20px;padding:10px 14px;background:rgba(242,186,49,0.1);border:1px solid rgba(242,186,49,0.3);border-radius:var(--radius);font-size:11px;margin-bottom:8px">
      <div style="font-weight:600;color:var(--warn,#f2ba31);margin-bottom:6px">⚠️ New mills detected — not in your directory:</div>
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
    <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px">
      ${newMillBanner}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
        <span style="font-weight:600;font-size:12px;color:var(--accent)">PREVIEW — ${_miPreviewQuotes.length} quotes (editable, auto-saved)</span>
        <div style="display:flex;gap:8px;align-items:center">
          ${selCount > 0 ? `<button class="btn btn-sm btn-danger" onclick="miDeleteSelectedPreview()">Delete ${selCount} selected</button>` : ''}
          <button class="btn btn-default" onclick="_miPreviewQuotes=[];_miPreviewSelected=new Set();_miClearPreviewDraft();renderMiIntake()">Discard All</button>
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
    </div>
  `;
}

function miTogglePreviewRow(idx, checked) {
  if (checked) _miPreviewSelected.add(idx);
  else _miPreviewSelected.delete(idx);
  miRenderPreview();
}

function miToggleAllPreview(checked) {
  _miPreviewSelected = checked ? new Set(_miPreviewQuotes.map((_, i) => i)) : new Set();
  miRenderPreview();
}

function miDeleteSelectedPreview() {
  if (!_miPreviewSelected.size) return;
  const indices = [..._miPreviewSelected].sort((a, b) => b - a);
  indices.forEach(i => _miPreviewQuotes.splice(i, 1));
  _miPreviewSelected = new Set();
  _miSavePreviewDraft();
  renderMiIntake();
  showToast(`Deleted ${indices.length} rows`, 'info');
}

async function miSavePreview() {
  const valid = _miPreviewQuotes.filter(q => q.mill && q.product && q.price > 0);
  if (!valid.length) { showToast('No valid quotes to save', 'warn'); return; }
  try {
    const result = await miSubmitQuotes(valid);
    showToast(`Saved ${result.created} mill quotes to database`, 'positive');
    _miPreviewQuotes = [];
    _miPreviewSelected = new Set();
    _miNewMills = [];
    _miClearPreviewDraft();
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
      showToast(`Added "${company}" to CRM`, 'positive');
      miRenderPreview();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Failed to add mill', 'warn');
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'warn');
  }
}
