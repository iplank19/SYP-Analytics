// SYP Mill Intelligence - Intake Module
// Drag/drop, paste, file upload, AI parsing, preview, submit

let _intakeMode = 'upload'; // upload | manual
let _previewQuotes = [];
let _intakeProcessing = false;
let _previewSelected = new Set(); // selected row indices for batch ops

// Auto-save/restore preview from localStorage
function _savePreviewDraft() {
  try { localStorage.setItem('mi_previewDraft', JSON.stringify(_previewQuotes)); } catch {}
}
function _loadPreviewDraft() {
  try {
    const d = localStorage.getItem('mi_previewDraft');
    if (d) { const parsed = JSON.parse(d); if (Array.isArray(parsed) && parsed.length) return parsed; }
  } catch {}
  return null;
}
function _clearPreviewDraft() {
  try { localStorage.removeItem('mi_previewDraft'); } catch {}
}

function renderIntake() {
  const c = document.getElementById('content');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">SUBMIT MILL PRICING</span>
        <div style="display:flex;gap:4px">
          <button class="btn ${_intakeMode==='upload'?'btn-primary':'btn-default'}" onclick="_intakeMode='upload';renderIntake()">Upload / Paste</button>
          <button class="btn ${_intakeMode==='manual'?'btn-primary':'btn-default'}" onclick="_intakeMode='manual';renderIntake()">Manual Entry</button>
        </div>
      </div>
      <div class="card-body">
        <div style="margin-bottom:12px;color:var(--muted);font-size:11px">
          Submitting as <strong style="color:var(--accent)">${S.trader}</strong> — all submitted data is visible to all traders
        </div>
        <div id="intake-content"></div>
        <div id="intake-preview"></div>
      </div>
    </div>
  `;

  if (_intakeMode === 'upload') renderUploadIntake();
  else renderManualIntake();

  // Restore unsaved draft if preview is empty
  if (!_previewQuotes.length) {
    const draft = _loadPreviewDraft();
    if (draft) {
      _previewQuotes = draft;
      showToast(`Restored ${draft.length} unsaved quotes from last session`, 'info');
    }
  }

  if (_previewQuotes.length) renderPreview();
}

function renderUploadIntake() {
  const el = document.getElementById('intake-content');
  el.innerHTML = `
    <div class="grid-2" style="margin-bottom:16px">
      <div>
        <label class="form-label">Upload File</label>
        <div class="drop-zone" id="drop-zone"
             onclick="document.getElementById('file-input').click()"
             ondragover="event.preventDefault();this.classList.add('drag-over')"
             ondragleave="this.classList.remove('drag-over')"
             ondrop="event.preventDefault();this.classList.remove('drag-over');handleFileDrop(event)">
          <div style="font-size:32px;margin-bottom:8px">📄</div>
          <div style="font-size:12px;color:var(--text)">Drop file here or click to browse</div>
          <div style="font-size:10px;color:var(--muted);margin-top:4px">PDF, Excel, CSV, or any text file</div>
        </div>
        <input type="file" id="file-input" accept=".pdf,.csv,.xlsx,.xls,.tsv,.txt" onchange="handleFileUpload(this)" style="display:none">
      </div>
      <div>
        <label class="form-label">Or Paste Text</label>
        <textarea id="paste-text" rows="8" style="width:100%;height:calc(100% - 24px);background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:8px;font-family:monospace;font-size:11px;resize:none" placeholder="Paste mill price list, email, spreadsheet data, or any format...

Canfor DQ pricing effective 1/31:
2x4 #2 RL - $445 / 5 units
2x6 #2 RL - $460 / 3 trucks
2x4 #3 RL - $380
All prompt, 5 TL minimum"></textarea>
      </div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn btn-primary" onclick="parseAll()" id="parse-btn" ${S.apiKey?'':'disabled'}>
        ${_intakeProcessing ? '<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px"></span>Parsing...' : 'Parse with AI'}
      </button>
      <span id="parse-status" style="color:var(--muted);font-size:11px"></span>
      ${S.apiKey?'':'<span style="color:var(--warn);font-size:11px">Set API key in Settings first</span>'}
    </div>
    <div style="color:var(--muted);font-size:10px;margin-top:8px">
      AI handles all formats: units, trucks, MBF, mixed formats, emails, PDFs, spreadsheets. Normalizes everything to FOB mill $/MBF.
    </div>
  `;
}

function renderManualIntake() {
  const el = document.getElementById('intake-content');
  const allMills = [...MILLS];
  // We'll add DB mills async
  el.innerHTML = `
    <div style="overflow-x:auto">
      <table style="font-size:11px">
        <thead><tr>
          <th>Mill</th><th>Product</th><th>FOB $/MBF</th><th>Length</th><th>Volume</th><th>TLs</th><th>Ship Window</th><th>Notes</th><th></th>
        </tr></thead>
        <tbody id="manual-rows"></tbody>
      </table>
    </div>
    <div style="margin-top:8px;display:flex;gap:8px">
      <button class="btn btn-default" onclick="addManualRow()">+ Add Row</button>
      <button class="btn btn-default" onclick="for(let i=0;i<5;i++)addManualRow()">+ Add 5</button>
      <button class="btn btn-primary" onclick="saveManualRows()">Save All</button>
    </div>
  `;
  // Add initial rows
  for (let i = 0; i < 3; i++) addManualRow();

  // Load DB mills for dropdown
  loadMills().then(mills => {
    mills.forEach(m => { if (!allMills.includes(m.name)) allMills.push(m.name); });
    document.querySelectorAll('.manual-mill').forEach(sel => {
      const current = sel.value;
      sel.innerHTML = `<option value="">Select...</option>` + allMills.sort().map(m => `<option value="${m}">${m}</option>`).join('');
      if (current) sel.value = current;
    });
  }).catch(() => {});
}

function addManualRow() {
  const tbody = document.getElementById('manual-rows');
  if (!tbody) return;
  const tr = document.createElement('tr');
  const millOpts = MILLS.sort().map(m => `<option value="${m}">${m}</option>`).join('');
  const prodOpts = PRODUCTS.map(p => `<option value="${p}">${p}</option>`).join('');
  const inputStyle = 'padding:4px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)';
  tr.innerHTML = `
    <td><select class="manual-mill" style="width:160px;${inputStyle}"><option value="">Select...</option>${millOpts}</select></td>
    <td><select class="manual-prod" style="width:80px;${inputStyle}"><option value="">...</option>${prodOpts}</select></td>
    <td><input type="number" class="manual-price" style="width:70px;${inputStyle}" placeholder="450"></td>
    <td><input type="text" class="manual-length" style="width:50px;${inputStyle}" value="RL"></td>
    <td><input type="number" class="manual-vol" style="width:60px;${inputStyle}" placeholder="0"></td>
    <td><input type="number" class="manual-tls" style="width:40px;${inputStyle}" placeholder="0"></td>
    <td><input type="text" class="manual-ship" style="width:80px;${inputStyle}" placeholder="Prompt"></td>
    <td><input type="text" class="manual-notes" style="width:100px;${inputStyle}"></td>
    <td><button onclick="this.closest('tr').remove()" style="background:none;border:none;color:var(--negative);cursor:pointer;font-size:14px">×</button></td>
  `;
  tbody.appendChild(tr);
}

async function saveManualRows() {
  const rows = document.querySelectorAll('#manual-rows tr');
  const quotes = [];
  rows.forEach(tr => {
    const mill = tr.querySelector('.manual-mill')?.value || '';
    const product = tr.querySelector('.manual-prod')?.value || '';
    const price = parseFloat(tr.querySelector('.manual-price')?.value) || 0;
    if (!mill || !product || !price) return;
    quotes.push({
      mill, product, price,
      length: tr.querySelector('.manual-length')?.value || 'RL',
      volume: parseFloat(tr.querySelector('.manual-vol')?.value) || 0,
      tls: parseInt(tr.querySelector('.manual-tls')?.value) || 0,
      shipWindow: tr.querySelector('.manual-ship')?.value || '',
      notes: tr.querySelector('.manual-notes')?.value || '',
      trader: S.trader,
      source: 'manual',
      date: today()
    });
  });
  if (!quotes.length) { showToast('No valid rows to save', 'warn'); return; }
  try {
    await submitQuotes(quotes);
    showToast(`Saved ${quotes.length} mill quotes`, 'positive');
    renderIntake();
  } catch (e) {
    showToast('Save error: ' + e.message, 'warn');
  }
}

// ----- File Handling -----

function handleFileDrop(e) {
  const file = e.dataTransfer?.files?.[0];
  if (file) processFile(file);
}

function handleFileUpload(input) {
  const file = input.files?.[0];
  if (file) processFile(file);
}

async function processFile(file) {
  const status = document.getElementById('parse-status');
  const setStatus = msg => { if (status) status.textContent = msg; };

  if (file.name.toLowerCase().endsWith('.pdf')) {
    setStatus('Extracting text from PDF...');
    try {
      const data = await apiUpload('/api/parse-pdf', file);
      let text = '';
      if (data.tables?.length) {
        text = data.tables.map(t => t.rows.map(r => r.join('\t')).join('\n')).join('\n\n');
      }
      if (data.text) {
        text = text ? (text + '\n\n--- Raw Text ---\n' + data.text) : data.text;
      }
      if (!text.trim()) { showToast('No text found in PDF', 'warn'); setStatus(''); return; }
      const ta = document.getElementById('paste-text');
      if (ta) ta.value = text;
      setStatus(`Extracted ${data.pages} pages, ${data.table_count} tables. Parsing...`);
      await runAIParse(text);
    } catch (e) {
      showToast('PDF error: ' + e.message, 'warn');
      setStatus('Error: ' + e.message);
    }
    return;
  }

  if (file.name.match(/\.xlsx?$/i)) {
    setStatus('Extracting data from Excel...');
    try {
      const data = await apiUpload('/api/parse-excel', file);
      if (data.rows?.length) {
        const text = data.rows.map(r => r.join('\t')).join('\n');
        const ta = document.getElementById('paste-text');
        if (ta) ta.value = text;
        const sheetInfo = data.sheet_count ? `${data.sheet_count} sheets, ` : '';
        setStatus(`Extracted ${sheetInfo}${data.count} rows. Parsing with AI...`);
        await runAIParse(text);
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

  // CSV/TXT — read as text
  const reader = new FileReader();
  reader.onload = async () => {
    const text = reader.result;
    const ta = document.getElementById('paste-text');
    if (ta) ta.value = text;
    setStatus('File loaded. Parsing...');
    await runAIParse(text);
  };
  reader.readAsText(file);
}

async function parseAll() {
  const text = document.getElementById('paste-text')?.value || '';
  if (!text.trim()) { showToast('Upload a file or paste text first', 'warn'); return; }
  await runAIParse(text);
}

async function runAIParse(text) {
  if (!S.apiKey) { showToast('Set your Claude API key in Settings first', 'warn'); return; }
  const btn = document.getElementById('parse-btn');
  const status = document.getElementById('parse-status');
  _intakeProcessing = true;
  if (btn) btn.disabled = true;
  if (btn) btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px"></span>Parsing...';
  if (status && !status.textContent.includes('...')) status.textContent = 'Parsing with AI...';

  try {
    const quotes = await aiParseMillPriceList(text);
    if (!quotes.length) {
      showToast('AI found no quotes in text', 'warn');
      if (status) status.textContent = 'No quotes found';
      return;
    }
    // Post-process: fill in missing cities from mill name, normalize mill names
    for (const q of quotes) {
      q.mill = normalizeMillName(q.mill);
      if (!q.city && q.mill) {
        q.city = inferMillCity(q.mill);
      }
      // Default length to RL if missing/empty
      if (!q.length) q.length = 'RL';
    }
    _previewQuotes = quotes;
    _previewSelected = new Set();
    _savePreviewDraft();
    renderIntake();
    showToast(`AI parsed ${quotes.length} quotes — review below (auto-saved)`, 'positive');
  } catch (e) {
    showToast('AI parse error: ' + e.message, 'warn');
    if (status) status.textContent = 'Error: ' + e.message;
  } finally {
    _intakeProcessing = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Parse with AI'; }
  }
}

// ----- Preview Table -----

function renderPreview() {
  const el = document.getElementById('intake-preview');
  if (!el || !_previewQuotes.length) return;
  const inputStyle = 'padding:3px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)';
  const allSelected = _previewSelected.size === _previewQuotes.length && _previewQuotes.length > 0;

  const rows = _previewQuotes.map((q, i) => `
    <tr style="${_previewSelected.has(i)?'background:rgba(91,138,245,0.08)':''}">
      <td><input type="checkbox" ${_previewSelected.has(i)?'checked':''} onchange="togglePreviewRow(${i},this.checked)" style="accent-color:var(--accent)"></td>
      <td><input type="text" value="${q.mill||''}" onchange="_previewQuotes[${i}].mill=this.value;_savePreviewDraft()" style="width:150px;${inputStyle}"></td>
      <td><input type="text" value="${q.product||''}" onchange="_previewQuotes[${i}].product=this.value;_savePreviewDraft()" style="width:70px;${inputStyle}"></td>
      <td><input type="number" value="${q.price||''}" onchange="_previewQuotes[${i}].price=parseFloat(this.value)||0;_savePreviewDraft()" style="width:65px;${inputStyle}"></td>
      <td><input type="text" value="${q.length||'RL'}" onchange="_previewQuotes[${i}].length=this.value;_savePreviewDraft()" style="width:40px;${inputStyle}"></td>
      <td><input type="number" value="${q.volume||0}" onchange="_previewQuotes[${i}].volume=parseFloat(this.value)||0;_savePreviewDraft()" style="width:50px;${inputStyle}"></td>
      <td><input type="number" value="${q.tls||0}" onchange="_previewQuotes[${i}].tls=parseInt(this.value)||0;_savePreviewDraft()" style="width:35px;${inputStyle}"></td>
      <td><input type="text" value="${q.shipWindow||''}" onchange="_previewQuotes[${i}].shipWindow=this.value;_savePreviewDraft()" style="width:70px;${inputStyle}"></td>
      <td><input type="text" value="${q.city||''}" onchange="_previewQuotes[${i}].city=this.value;_savePreviewDraft()" style="width:90px;${inputStyle}" placeholder="City, ST"></td>
      <td><button onclick="_previewQuotes.splice(${i},1);_previewSelected.delete(${i});_savePreviewDraft();renderIntake()" style="background:none;border:none;color:var(--negative);cursor:pointer">×</button></td>
    </tr>
  `).join('');

  const selCount = _previewSelected.size;

  el.innerHTML = `
    <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
        <span style="font-weight:600;font-size:12px;color:var(--accent)">PREVIEW — ${_previewQuotes.length} quotes (editable, auto-saved)</span>
        <div style="display:flex;gap:8px;align-items:center">
          ${selCount > 0 ? `<button class="btn btn-sm btn-danger" onclick="deleteSelectedPreview()">Delete ${selCount} selected</button>` : ''}
          <button class="btn btn-default" onclick="_previewQuotes=[];_previewSelected=new Set();_clearPreviewDraft();renderIntake()">Discard All</button>
          <button class="btn btn-primary" onclick="savePreview()">Save to Database</button>
        </div>
      </div>
      <div style="overflow-x:auto;max-height:60vh;overflow-y:auto">
        <table style="font-size:11px">
          <thead style="position:sticky;top:0;z-index:1"><tr>
            <th><input type="checkbox" ${allSelected?'checked':''} onchange="toggleAllPreview(this.checked)" style="accent-color:var(--accent)"></th>
            <th>Mill</th><th>Product</th><th>FOB $</th><th>Len</th><th>Vol</th><th>TLs</th><th>Ship</th><th>Location</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function togglePreviewRow(idx, checked) {
  if (checked) _previewSelected.add(idx);
  else _previewSelected.delete(idx);
  renderPreview();
}

function toggleAllPreview(checked) {
  _previewSelected = checked ? new Set(_previewQuotes.map((_, i) => i)) : new Set();
  renderPreview();
}

function deleteSelectedPreview() {
  if (!_previewSelected.size) return;
  const indices = [..._previewSelected].sort((a, b) => b - a); // reverse order for splice safety
  indices.forEach(i => _previewQuotes.splice(i, 1));
  _previewSelected = new Set();
  _savePreviewDraft();
  renderIntake();
  showToast(`Deleted ${indices.length} rows`, 'info');
}

async function savePreview() {
  const valid = _previewQuotes.filter(q => q.mill && q.product && q.price > 0);
  if (!valid.length) { showToast('No valid quotes to save', 'warn'); return; }
  try {
    const result = await submitQuotes(valid);
    showToast(`Saved ${result.created} mill quotes to database`, 'positive');
    _previewQuotes = [];
    _previewSelected = new Set();
    _clearPreviewDraft();
    renderIntake();
  } catch (e) {
    showToast('Save error: ' + e.message, 'warn');
  }
}
