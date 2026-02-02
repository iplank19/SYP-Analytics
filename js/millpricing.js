// SYP Analytics - Mill Pricing Intake & Analytics
// Manages mill quote database: intake, display, trends, and quote engine integration

// ===== CRUD =====
function addMillQuote(q){
  q.id=q.id||genId();
  q.date=q.date||today();
  q.enteredBy=q.enteredBy||S.trader;
  q.createdAt=q.createdAt||new Date().toISOString();
  q.source=q.source||'manual';
  S.millQuotes.push(q);
  saveAllLocal();
}

async function addMillQuotes(quotes){
  quotes.forEach(q=>{
    q.id=q.id||genId();
    q.date=q.date||today();
    q.enteredBy=q.enteredBy||S.trader;
    q.createdAt=q.createdAt||new Date().toISOString();
    S.millQuotes.push(q);
  });
  await saveAllLocal();
}

function deleteMillQuote(id){
  S.millQuotes=S.millQuotes.filter(q=>q.id!==id);
  saveAllLocal();
  render();
}

function editMillQuote(id,updates){
  const q=S.millQuotes.find(x=>x.id===id);
  if(q){Object.assign(q,updates);saveAllLocal();}
}

// ===== QUERY HELPERS =====

// Get most recent quote per mill+product combo
function getLatestMillQuotes(filters={}){
  const latest={};
  const sorted=[...S.millQuotes].sort((a,b)=>new Date(b.date)-new Date(a.date));
  sorted.forEach(q=>{
    if(filters.mill&&q.mill!==filters.mill)return;
    if(filters.product&&q.product!==filters.product)return;
    if(filters.since){
      const since=new Date(filters.since);
      if(new Date(q.date)<since)return;
    }
    const key=`${q.mill}|${q.product}|${q.length||'RL'}`;
    if(!latest[key])latest[key]=q;
  });
  return Object.values(latest);
}

// Price history for a specific mill+product
function getMillQuoteHistory(mill,product,days=90){
  const cutoff=new Date();
  cutoff.setDate(cutoff.getDate()-days);
  return S.millQuotes
    .filter(q=>q.mill===mill&&q.product===product&&new Date(q.date)>=cutoff)
    .sort((a,b)=>new Date(a.date)-new Date(b.date));
}

// Cheapest current offer for a product
function getBestPrice(product){
  const latest=getLatestMillQuotes({product});
  if(!latest.length)return null;
  return latest.reduce((best,q)=>q.price<best.price?q:best,latest[0]);
}

// Mill x Product grid of latest prices
function getMillPriceMatrix(){
  const latest=getLatestMillQuotes();
  const matrix={};
  const mills=new Set();
  const products=new Set();
  latest.forEach(q=>{
    mills.add(q.mill);
    products.add(q.product);
    if(!matrix[q.mill])matrix[q.mill]={};
    matrix[q.mill][q.product]={price:q.price,date:q.date,volume:q.volume,shipWindow:q.shipWindow};
  });
  return{matrix,mills:[...mills].sort(),products:[...products].sort()};
}

// Lookup for quote engine integration
function getMillCostForProduct(product,origin){
  // Try exact mill match first
  if(origin){
    const latest=getLatestMillQuotes({mill:origin,product});
    if(latest.length)return latest[0].price;
  }
  // Fallback to best price across all mills
  const best=getBestPrice(product);
  return best?best.price:null;
}

// ===== PARSERS =====

// Parse CSV / tab-delimited mill price list
function parseMillQuoteCSV(text){
  const lines=text.trim().split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2)return[];

  // Detect delimiter
  const delim=lines[0].includes('\t')?'\t':',';
  const rows=lines.map(l=>l.split(delim).map(c=>c.trim().replace(/^"|"$/g,'')));

  // Try to detect columns from header
  const header=rows[0].map(h=>h.toLowerCase());
  const colMap={mill:-1,product:-1,price:-1,length:-1,volume:-1,tls:-1,shipWindow:-1,notes:-1,date:-1};

  const millAliases=['mill','supplier','vendor','source','mill name'];
  const productAliases=['product','item','grade','species','size','dimension'];
  const priceAliases=['price','fob','cost','$/mbf','mbf','fob price','fob mill'];
  const lengthAliases=['length','len','lengths'];
  const volumeAliases=['volume','mbf','qty','quantity','avail','available'];
  const tlsAliases=['tls','truckloads','trucks','loads'];
  const shipAliases=['ship','ship window','ship week','timing','availability','avail date'];
  const notesAliases=['notes','note','comments','comment'];
  const dateAliases=['date','quote date','effective'];

  function findCol(aliases){
    for(const alias of aliases){
      const idx=header.findIndex(h=>h===alias||h.includes(alias));
      if(idx>=0)return idx;
    }
    return-1;
  }

  colMap.mill=findCol(millAliases);
  colMap.product=findCol(productAliases);
  colMap.price=findCol(priceAliases);
  colMap.length=findCol(lengthAliases);
  colMap.volume=findCol(volumeAliases);
  colMap.tls=findCol(tlsAliases);
  colMap.shipWindow=findCol(shipAliases);
  colMap.notes=findCol(notesAliases);
  colMap.date=findCol(dateAliases);

  // If we couldn't find mill and product and price columns, try positional guess
  const hasHeaders=colMap.mill>=0||colMap.product>=0||colMap.price>=0;
  if(!hasHeaders){
    // Assume: Mill, Product, Price, [Length], [Volume], [Ship], [Notes]
    colMap.mill=0;
    colMap.product=1;
    colMap.price=2;
    if(rows[0].length>3)colMap.length=3;
    if(rows[0].length>4)colMap.volume=4;
    if(rows[0].length>5)colMap.shipWindow=5;
    if(rows[0].length>6)colMap.notes=6;
  }

  const dataRows=hasHeaders?rows.slice(1):rows.slice(1);
  const quotes=[];

  dataRows.forEach(row=>{
    const mill=colMap.mill>=0?row[colMap.mill]||'':'';
    const product=colMap.product>=0?row[colMap.product]||'':'';
    const priceStr=colMap.price>=0?row[colMap.price]||'':'';
    const price=parseFloat(priceStr.replace(/[$,]/g,''));

    if(!mill&&!product)return;// skip empty rows
    if(isNaN(price)||price<=0)return;// need a valid price

    quotes.push({
      mill:mill,
      product:normalizeMillProduct(product),
      price:price,
      length:colMap.length>=0?row[colMap.length]||'RL':'RL',
      volume:colMap.volume>=0?parseFloat(row[colMap.volume])||0:0,
      tls:colMap.tls>=0?parseInt(row[colMap.tls])||0:0,
      shipWindow:colMap.shipWindow>=0?row[colMap.shipWindow]||'':'',
      notes:colMap.notes>=0?row[colMap.notes]||'':'',
      date:colMap.date>=0?row[colMap.date]||today():today(),
      source:'csv'
    });
  });

  return quotes;
}

// Normalize product strings to match PRODUCTS constant format
function normalizeMillProduct(raw){
  if(!raw)return'';
  const s=raw.trim().toUpperCase();
  // Direct match
  if(PRODUCTS.includes(s.toLowerCase().replace('#','#')))return s;
  // Extract dimension and grade
  const m=s.match(/(\d+)\s*[xX×]\s*(\d+)/);
  if(!m)return raw.trim();
  const dim=m[1]+'x'+m[2];
  // Detect grade
  let grade='#2';// default
  if(/#1|#\s*1|grade\s*1|no\.?\s*1/i.test(s))grade='#1';
  else if(/#3|#\s*3|grade\s*3|no\.?\s*3|utility/i.test(s))grade='#3';
  else if(/msr|machine|stress/i.test(s))grade=' MSR';
  else if(/#2|#\s*2|grade\s*2|no\.?\s*2|std|standard|stud/i.test(s))grade='#2';

  return dim+(grade===' MSR'?' MSR':grade);
}

// Parse tab-delimited paste (from spreadsheet copy)
function parseMillQuotePaste(text){
  // Same as CSV but force tab delimiter
  return parseMillQuoteCSV(text);
}

// ===== AI PARSING =====

async function aiParseMillPriceList(text){
  if(!S.apiKey){
    showToast('Set your Claude API key in Settings first','warn');
    return[];
  }

  const knownMills=[...MILLS,...S.mills.map(m=>m.name)].filter(Boolean);
  const ppu=S.ppu||{'2x4':208,'2x6':128,'2x8':96,'2x10':80,'2x12':64};
  const ppuInfo=Object.entries(ppu).map(([k,v])=>`${k}: ${v} pcs/unit`).join(', ');

  const systemPrompt=`You are a lumber industry data parser. Extract mill pricing quotes from the provided text.

KNOWN MILLS: ${knownMills.join(', ')}
KNOWN PRODUCTS: ${PRODUCTS.join(', ')}
PIECES PER UNIT: ${ppuInfo}

Return a JSON array of quote objects. Each object:
{
  "mill": "exact mill name (match to known mills when possible)",
  "product": "e.g. 2x4#2, 2x6#3, 2x4 MSR",
  "price": 450,
  "length": "RL or specific like 16",
  "volume": 0,
  "tls": 0,
  "shipWindow": "Prompt, W1-W2, Feb, etc.",
  "notes": ""
}

RULES:
- Prices MUST be FOB mill in $/MBF (thousand board feet)
- If prices are given per unit, per piece, per truck, per lineal foot, etc., CONVERT to $/MBF:
  * Per unit pricing: price_per_unit × 1000 / (pcs_per_unit × board_footage_per_piece). Board footage per piece = (thick × wide × length) / 12
  * Per truck pricing: price_per_truck / MBF_per_truck (typically 23 MBF for standard, 20 for MSR/timber)
  * Per piece pricing: price_per_piece × 1000 / board_footage_per_piece
  * Per lineal foot: price_per_LF × 1000 / (thick × wide / 12)
- IMPORTANT: Mill names MUST use format "Company - City" (e.g. "Canfor - DeQuincy", "GP - Gurdon", "PotlatchDeltic - Ola"). The city is the MILL LOCATION, not the company name. Never put a location as the company name.
- Match fuzzy mill names to known mills (e.g. "Canfor DQ" → "Canfor - DeQuincy", "WF Huttig" → "West Fraser - Huttig", "PotlatchDeltic Ola" → "PotlatchDeltic - Ola")
- "GP" = Georgia-Pacific, use "GP - City" format. "WF" = West Fraser. "PLD" or "PD" = PotlatchDeltic.
- If the text names a company and a location separately, combine them: company name goes before the dash, city/location after
- Products should be in format like "2x4#2", "2x6#3", "2x4 MSR"
- Default grade is #2 unless specified otherwise
- If a mill lists multiple products, create one entry per product
- If no ship window mentioned, use "Prompt"
- Volume: if stated in units, convert to MBF. If in trucks, multiply by 23. If not stated, use 0
- TLs: if stated, include. Otherwise 0
- Return ONLY the JSON array, no explanation`;

  const res=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-api-key':S.apiKey,
      'anthropic-version':'2023-06-01',
      'anthropic-dangerous-direct-browser-access':'true'
    },
    body:JSON.stringify({
      model:'claude-sonnet-4-20250514',
      max_tokens:8192,
      system:systemPrompt,
      messages:[{role:'user',content:`Parse the following mill price list into structured quotes:\n\n${text}`}]
    })
  });

  if(!res.ok){
    const err=await res.json().catch(()=>({}));
    throw new Error(err.error?.message||`API error: ${res.status}`);
  }

  const data=await res.json();
  const reply=data.content?.[0]?.text||'';

  let jsonStr=reply;
  const jsonMatch=reply.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if(jsonMatch)jsonStr=jsonMatch[1];
  jsonStr=jsonStr.trim();

  let quotes;
  try{
    quotes=JSON.parse(jsonStr);
  }catch(e){
    // Try to repair truncated JSON
    if(typeof tryRepairTruncatedJSON==='function'){
      quotes=tryRepairTruncatedJSON(jsonStr);
    }
    if(!quotes)throw new Error('AI returned invalid JSON. Raw:\n'+reply.slice(0,500));
  }

  if(!Array.isArray(quotes))throw new Error('AI response is not an array.');
  return quotes.map(q=>({...q,source:'ai',date:today()}));
}

// ===== VIEW RENDERING =====

function renderMillPricing(){
  const c=document.getElementById('content');
  const tab=S.millPricingTab||'intake';

  c.innerHTML=`
    <div class="card" style="margin-bottom:0;border-bottom:none;border-radius:var(--radius) var(--radius) 0 0">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <span class="card-title">MILL PRICING DATABASE</span>
        <div style="display:flex;gap:4px">
          <button class="btn ${tab==='intake'?'btn-primary':''}" onclick="S.millPricingTab='intake';render()" style="font-size:11px;padding:4px 12px">Intake</button>
          <button class="btn ${tab==='current'?'btn-primary':''}" onclick="S.millPricingTab='current';render()" style="font-size:11px;padding:4px 12px">Current Prices</button>
          <button class="btn ${tab==='trends'?'btn-primary':''}" onclick="S.millPricingTab='trends';render()" style="font-size:11px;padding:4px 12px">Trends</button>
          <button class="btn ${tab==='matrix'?'btn-primary':''}" onclick="S.millPricingTab='matrix';render()" style="font-size:11px;padding:4px 12px">Matrix</button>
        </div>
        <span style="color:var(--muted);font-size:11px">${S.millQuotes.length} quotes in database</span>
      </div>
    </div>
    <div id="mp-content" class="card" style="border-radius:0 0 var(--radius) var(--radius);border-top:1px solid var(--border)"></div>
  `;

  if(tab==='intake')renderMPIntake();
  else if(tab==='current')renderMPCurrent();
  else if(tab==='trends')renderMPTrends();
  else if(tab==='matrix')renderMPMatrix();
}

// ===== INTAKE TAB =====

let _mpIntakeMode='upload';// upload|manual|current
let _mpPreviewQuotes=[];

function renderMPIntake(){
  const el=document.getElementById('mp-content');
  const mode=_mpIntakeMode;

  el.innerHTML=`
    <div class="card-body">
      <div style="display:flex;gap:4px;margin-bottom:16px">
        <button class="btn ${mode==='upload'?'btn-primary':''}" onclick="_mpIntakeMode='upload';renderMPIntake()" style="font-size:11px;padding:4px 10px">Upload / Paste</button>
        <button class="btn ${mode==='manual'?'btn-primary':''}" onclick="_mpIntakeMode='manual';renderMPIntake()" style="font-size:11px;padding:4px 10px">Manual Entry</button>
      </div>
      <div id="mp-intake-content"></div>
      ${_mpPreviewQuotes.length?renderMPPreview():''}
    </div>
  `;

  const ic=document.getElementById('mp-intake-content');
  if(mode==='upload')renderMPUpload(ic);
  else if(mode==='manual')renderMPManual(ic);
}

function renderMPManual(el){
  const allMills=[...MILLS,...S.mills.filter(m=>!MILLS.includes(m.name)).map(m=>m.name)].sort();
  const millOpts=allMills.map(m=>`<option value="${m}">${m}</option>`).join('');
  const prodOpts=PRODUCTS.map(p=>`<option value="${p}">${p}</option>`).join('');

  el.innerHTML=`
    <div style="overflow-x:auto">
      <table class="data-table" id="mp-manual-table" style="font-size:11px">
        <thead><tr>
          <th>Mill</th><th>Product</th><th>FOB $/MBF</th><th>Length</th><th>Volume</th><th>TLs</th><th>Ship Window</th><th>Notes</th><th></th>
        </tr></thead>
        <tbody id="mp-manual-rows"></tbody>
      </table>
    </div>
    <div style="margin-top:8px;display:flex;gap:8px">
      <button class="btn" onclick="mpAddManualRow()">+ Add Row</button>
      <button class="btn" onclick="mpAddManualRows(5)">+ Add 5 Rows</button>
      <button class="btn btn-primary" onclick="mpSaveManualRows()">Save All</button>
    </div>
  `;

  // Add initial empty rows
  const tbody=document.getElementById('mp-manual-rows');
  if(tbody&&!tbody.children.length){
    for(let i=0;i<3;i++)mpAddManualRowHTML(tbody,allMills,PRODUCTS);
  }
}

function mpAddManualRow(){
  const tbody=document.getElementById('mp-manual-rows');
  const allMills=[...MILLS,...S.mills.filter(m=>!MILLS.includes(m.name)).map(m=>m.name)].sort();
  mpAddManualRowHTML(tbody,allMills,PRODUCTS);
}

function mpAddManualRows(n){
  for(let i=0;i<n;i++)mpAddManualRow();
}

function mpAddManualRowHTML(tbody,mills,products){
  const tr=document.createElement('tr');
  tr.innerHTML=`
    <td><select class="mp-mill" style="width:160px;padding:4px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
      <option value="">Select...</option>${mills.map(m=>`<option value="${m}">${m}</option>`).join('')}
    </select></td>
    <td><select class="mp-product" style="width:80px;padding:4px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
      <option value="">...</option>${products.map(p=>`<option value="${p}">${p}</option>`).join('')}
    </select></td>
    <td><input type="number" class="mp-price" style="width:70px;padding:4px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)" placeholder="450"></td>
    <td><input type="text" class="mp-length" style="width:50px;padding:4px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)" value="RL"></td>
    <td><input type="number" class="mp-volume" style="width:60px;padding:4px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)" placeholder="0"></td>
    <td><input type="number" class="mp-tls" style="width:40px;padding:4px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)" placeholder="0"></td>
    <td><input type="text" class="mp-ship" style="width:80px;padding:4px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)" placeholder="Prompt"></td>
    <td><input type="text" class="mp-notes" style="width:100px;padding:4px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)"></td>
    <td><button onclick="this.closest('tr').remove()" style="background:none;border:none;color:var(--negative);cursor:pointer;font-size:14px">×</button></td>
  `;
  tbody.appendChild(tr);
}

function mpSaveManualRows(){
  const rows=document.querySelectorAll('#mp-manual-rows tr');
  const quotes=[];
  rows.forEach(tr=>{
    const mill=tr.querySelector('.mp-mill')?.value||'';
    const product=tr.querySelector('.mp-product')?.value||'';
    const price=parseFloat(tr.querySelector('.mp-price')?.value)||0;
    if(!mill||!product||!price)return;
    quotes.push({
      mill,product,price,
      length:tr.querySelector('.mp-length')?.value||'RL',
      volume:parseFloat(tr.querySelector('.mp-volume')?.value)||0,
      tls:parseInt(tr.querySelector('.mp-tls')?.value)||0,
      shipWindow:tr.querySelector('.mp-ship')?.value||'',
      notes:tr.querySelector('.mp-notes')?.value||'',
      source:'manual'
    });
  });
  if(!quotes.length){showToast('No valid rows to save','warn');return;}
  addMillQuotes(quotes).then(()=>{
    showToast(`Saved ${quotes.length} mill quotes`,'positive');
    render();
  });
}

// ===== UNIFIED UPLOAD / PASTE (all go through AI) =====

function renderMPUpload(el){
  el.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div>
        <label class="form-label">Upload File</label>
        <div style="border:2px dashed var(--border);border-radius:var(--radius);padding:24px;text-align:center;cursor:pointer;transition:border-color 0.2s"
             onclick="document.getElementById('mp-file-input').click()"
             ondragover="event.preventDefault();this.style.borderColor='var(--accent)'"
             ondragleave="this.style.borderColor='var(--border)'"
             ondrop="event.preventDefault();this.style.borderColor='var(--border)';mpHandleFileDrop(event)">
          <div style="font-size:24px;margin-bottom:8px">📄</div>
          <div style="font-size:12px;color:var(--text)">Drop file here or click to browse</div>
          <div style="font-size:10px;color:var(--muted);margin-top:4px">PDF, Excel, CSV, or any text file</div>
        </div>
        <input type="file" id="mp-file-input" accept=".pdf,.csv,.xlsx,.xls,.tsv,.txt" onchange="mpHandleFileUpload(this)" style="display:none">
      </div>
      <div>
        <label class="form-label">Or Paste Text</label>
        <textarea id="mp-paste-text" rows="6" style="width:100%;height:calc(100% - 24px);background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:8px;font-family:monospace;font-size:11px;resize:none" placeholder="Paste mill price list, email, spreadsheet data, or any format...

Canfor DQ pricing effective 1/31:
2x4 #2 RL - $445 / 5 units
2x6 #2 RL - $460 / 3 trucks
2x4 #3 RL - $380
All prompt, 5 TL minimum"></textarea>
      </div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn btn-primary" onclick="mpParseAll()" id="mp-ai-btn" ${S.apiKey?'':'disabled'}>Parse with AI</button>
      <span id="mp-ai-status" style="color:var(--muted);font-size:11px"></span>
      ${S.apiKey?'':'<span style="color:var(--warn);font-size:11px">Set API key in Settings first</span>'}
    </div>
    <div style="color:var(--muted);font-size:10px;margin-top:8px">
      AI handles all formats: units, trucks, MBF, mixed formats, emails, PDFs, spreadsheets.
      Prices can be FOB, delivered — AI normalizes everything to FOB mill $/MBF.
    </div>
  `;
}

function mpHandleFileDrop(e){
  const file=e.dataTransfer?.files?.[0];
  if(file)mpProcessFile(file);
}

async function mpHandleFileUpload(input){
  const file=input.files?.[0];
  if(file)mpProcessFile(file);
}

async function mpProcessFile(file){
  const status=document.getElementById('mp-ai-status');
  const setStatus=msg=>{if(status)status.textContent=msg;};

  // PDF — extract text server-side with pdfplumber
  if(file.name.toLowerCase().endsWith('.pdf')){
    setStatus('Extracting text from PDF...');
    const formData=new FormData();
    formData.append('file',file);
    try{
      const res=await fetch('/api/parse-pdf',{method:'POST',body:formData});
      if(!res.ok){
        const err=await res.json().catch(()=>({}));
        throw new Error(err.error||'Server error: '+res.status);
      }
      const data=await res.json();
      let text='';
      // If tables were extracted, format them as tab-delimited for AI
      if(data.tables&&data.tables.length){
        text=data.tables.map(t=>t.rows.map(r=>r.join('\t')).join('\n')).join('\n\n');
      }
      // Also include raw text for context
      if(data.text){
        text=text?(text+'\n\n--- Raw Text ---\n'+data.text):data.text;
      }
      if(!text.trim()){showToast('No text found in PDF','warn');setStatus('');return;}
      // Put extracted text in the paste area and auto-parse
      const ta=document.getElementById('mp-paste-text');
      if(ta)ta.value=text;
      setStatus(`Extracted ${data.pages} pages, ${data.table_count} tables. Parsing with AI...`);
      await mpRunAIParse(text);
    }catch(e){
      showToast('PDF error: '+e.message,'warn');
      setStatus('Error: '+e.message);
    }
    return;
  }

  // Excel — extract rows server-side
  if(file.name.match(/\.xlsx?$/i)){
    setStatus('Extracting data from Excel...');
    const formData=new FormData();
    formData.append('file',file);
    try{
      const res=await fetch('/api/parse-excel',{method:'POST',body:formData});
      if(!res.ok)throw new Error('Server error: '+res.status);
      const data=await res.json();
      if(data.error)throw new Error(data.error);
      if(data.rows&&data.rows.length){
        const text=data.rows.map(r=>r.join('\t')).join('\n');
        const ta=document.getElementById('mp-paste-text');
        if(ta)ta.value=text;
        setStatus(`Extracted ${data.rows.length} rows. Parsing with AI...`);
        await mpRunAIParse(text);
      }else{
        showToast('No data found in Excel file','warn');
        setStatus('');
      }
    }catch(e){
      showToast('Excel error: '+e.message,'warn');
      setStatus('Error: '+e.message);
    }
    return;
  }

  // CSV/TSV/TXT — read as text
  const reader=new FileReader();
  reader.onload=async()=>{
    const text=reader.result;
    const ta=document.getElementById('mp-paste-text');
    if(ta)ta.value=text;
    setStatus('File loaded. Parsing with AI...');
    await mpRunAIParse(text);
  };
  reader.readAsText(file);
}

// Unified parse: always use AI
async function mpParseAll(){
  const text=document.getElementById('mp-paste-text')?.value||'';
  if(!text.trim()){showToast('Upload a file or paste text first','warn');return;}
  await mpRunAIParse(text);
}

async function mpRunAIParse(text){
  if(!S.apiKey){showToast('Set your Claude API key in Settings first','warn');return;}
  const btn=document.getElementById('mp-ai-btn');
  const status=document.getElementById('mp-ai-status');
  if(btn)btn.disabled=true;
  if(status&&!status.textContent.includes('...'))status.textContent='Parsing with AI...';

  try{
    const quotes=await aiParseMillPriceList(text);
    if(!quotes.length){
      showToast('AI found no quotes in text','warn');
      if(status)status.textContent='No quotes found';
      return;
    }
    _mpPreviewQuotes=quotes;
    renderMPIntake();
    showToast(`AI parsed ${quotes.length} quotes — review below`,'positive');
  }catch(e){
    showToast('AI parse error: '+e.message,'warn');
    if(status)status.textContent='Error: '+e.message;
  }finally{
    if(btn)btn.disabled=false;
  }
}

// ===== PREVIEW TABLE =====

function renderMPPreview(){
  const quotes=_mpPreviewQuotes;
  if(!quotes.length)return'';

  const rows=quotes.map((q,i)=>`
    <tr>
      <td><input type="text" value="${q.mill||''}" onchange="_mpPreviewQuotes[${i}].mill=this.value" style="width:150px;padding:3px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)"></td>
      <td><input type="text" value="${q.product||''}" onchange="_mpPreviewQuotes[${i}].product=this.value" style="width:70px;padding:3px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)"></td>
      <td><input type="number" value="${q.price||''}" onchange="_mpPreviewQuotes[${i}].price=parseFloat(this.value)||0" style="width:65px;padding:3px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)"></td>
      <td><input type="text" value="${q.length||'RL'}" onchange="_mpPreviewQuotes[${i}].length=this.value" style="width:40px;padding:3px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)"></td>
      <td><input type="number" value="${q.volume||0}" onchange="_mpPreviewQuotes[${i}].volume=parseFloat(this.value)||0" style="width:50px;padding:3px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)"></td>
      <td><input type="text" value="${q.shipWindow||''}" onchange="_mpPreviewQuotes[${i}].shipWindow=this.value" style="width:70px;padding:3px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)"></td>
      <td><button onclick="_mpPreviewQuotes.splice(${i},1);renderMPIntake()" style="background:none;border:none;color:var(--negative);cursor:pointer">×</button></td>
    </tr>
  `).join('');

  return`
    <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-weight:600;font-size:12px">PREVIEW — ${quotes.length} quotes (editable)</span>
        <div style="display:flex;gap:8px">
          <button class="btn" onclick="_mpPreviewQuotes=[];renderMPIntake()">Discard</button>
          <button class="btn btn-primary" onclick="mpSavePreview()">Save to Database</button>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table class="data-table" style="font-size:11px">
          <thead><tr><th>Mill</th><th>Product</th><th>FOB $</th><th>Len</th><th>Vol</th><th>Ship</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function mpSavePreview(){
  const valid=_mpPreviewQuotes.filter(q=>q.mill&&q.product&&q.price>0);
  if(!valid.length){showToast('No valid quotes to save','warn');return;}
  addMillQuotes(valid).then(()=>{
    showToast(`Saved ${valid.length} mill quotes`,'positive');
    _mpPreviewQuotes=[];
    render();
  });
}

// ===== CURRENT PRICES TAB =====

let _mpFilterMill='';
let _mpFilterProduct='';

function renderMPCurrent(){
  const el=document.getElementById('mp-content');
  const latest=getLatestMillQuotes({
    mill:_mpFilterMill||undefined,
    product:_mpFilterProduct||undefined
  });

  // Get unique mills and products for filters
  const allMills=[...new Set(S.millQuotes.map(q=>q.mill))].sort();
  const allProducts=[...new Set(S.millQuotes.map(q=>q.product))].sort();

  // Find best price per product
  const bestByProduct={};
  latest.forEach(q=>{
    if(!bestByProduct[q.product]||q.price<bestByProduct[q.product])bestByProduct[q.product]=q.price;
  });

  const now=new Date();
  const rows=latest.sort((a,b)=>{
    if(a.product!==b.product)return a.product.localeCompare(b.product);
    return a.price-b.price;
  }).map(q=>{
    const age=Math.floor((now-new Date(q.date))/(1000*60*60*24));
    const isBest=q.price===bestByProduct[q.product];
    const stale=age>3;
    return`<tr style="${stale?'opacity:0.5':''}${isBest?' ;background:rgba(74,158,110,0.08)':''}">
      <td>${q.mill}</td>
      <td><strong>${q.product}</strong></td>
      <td class="mono" style="${isBest?'color:var(--positive);font-weight:600':''}">$${q.price.toLocaleString()}</td>
      <td>${q.length||'RL'}</td>
      <td class="mono">${q.volume?q.volume.toLocaleString():'-'}</td>
      <td>${q.tls||'-'}</td>
      <td>${q.shipWindow||'-'}</td>
      <td style="color:${age===0?'var(--positive)':age<=3?'var(--text)':'var(--muted)'}">${age===0?'Today':age+'d ago'}</td>
      <td>${q.enteredBy||'-'}</td>
      <td><button onclick="deleteMillQuote(${q.id})" style="background:none;border:none;color:var(--negative);cursor:pointer;font-size:12px" title="Delete">×</button></td>
    </tr>`;
  }).join('');

  el.innerHTML=`
    <div class="card-body">
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
        <select onchange="_mpFilterMill=this.value;renderMPCurrent()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
          <option value="">All Mills</option>
          ${allMills.map(m=>`<option value="${m}"${_mpFilterMill===m?' selected':''}>${m}</option>`).join('')}
        </select>
        <select onchange="_mpFilterProduct=this.value;renderMPCurrent()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
          <option value="">All Products</option>
          ${allProducts.map(p=>`<option value="${p}"${_mpFilterProduct===p?' selected':''}>${p}</option>`).join('')}
        </select>
        <span style="color:var(--muted);font-size:11px">${latest.length} current quotes • Green = best price</span>
      </div>
      <div style="overflow-x:auto">
        <table class="data-table" style="font-size:11px">
          <thead><tr>
            <th>Mill</th><th>Product</th><th>FOB $/MBF</th><th>Len</th><th>Vol</th><th>TLs</th><th>Ship</th><th>Age</th><th>By</th><th></th>
          </tr></thead>
          <tbody>${rows||'<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:24px">No mill quotes yet. Use the Intake tab to add some.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ===== TRENDS TAB =====

let _mpTrendProduct='2x4#2';
let _mpTrendDays=90;

function renderMPTrends(){
  const el=document.getElementById('mp-content');
  const allProducts=[...new Set(S.millQuotes.map(q=>q.product))].sort();

  el.innerHTML=`
    <div class="card-body">
      <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
        <select id="mp-trend-product" onchange="_mpTrendProduct=this.value;renderMPTrendChart()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
          ${allProducts.map(p=>`<option value="${p}"${_mpTrendProduct===p?' selected':''}>${p}</option>`).join('')}
          ${allProducts.length===0?'<option value="">No data</option>':''}
        </select>
        <select onchange="_mpTrendDays=parseInt(this.value);renderMPTrendChart()" style="padding:4px 8px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)">
          <option value="30"${_mpTrendDays===30?' selected':''}>30 days</option>
          <option value="90"${_mpTrendDays===90?' selected':''}>90 days</option>
          <option value="180"${_mpTrendDays===180?' selected':''}>180 days</option>
          <option value="365"${_mpTrendDays===365?' selected':''}>1 year</option>
        </select>
      </div>
      <div style="height:350px;position:relative">
        <canvas id="mp-trend-chart"></canvas>
      </div>
      <div id="mp-trend-summary" style="margin-top:16px"></div>
    </div>
  `;

  setTimeout(()=>renderMPTrendChart(),10);
}

function renderMPTrendChart(){
  destroyChart('mpTrend');
  const canvas=document.getElementById('mp-trend-chart');
  if(!canvas)return;

  const product=_mpTrendProduct;
  const days=_mpTrendDays;
  const cutoff=new Date();
  cutoff.setDate(cutoff.getDate()-days);

  // Get all quotes for this product within timeframe
  const quotes=S.millQuotes
    .filter(q=>q.product===product&&new Date(q.date)>=cutoff)
    .sort((a,b)=>new Date(a.date)-new Date(b.date));

  if(!quotes.length){
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#555';
    ctx.font='13px Inter';
    ctx.textAlign='center';
    ctx.fillText('No price history for '+product,canvas.width/2,canvas.height/2);
    return;
  }

  // Group by mill
  const byMill={};
  quotes.forEach(q=>{
    if(!byMill[q.mill])byMill[q.mill]=[];
    byMill[q.mill].push({x:q.date,y:q.price});
  });

  // Generate colors per mill
  const colors=['#5b8af5','#e8734a','#4a9e6e','#e05252','#6e9ecf','#c084fc','#f59e0b','#ec4899','#22d3ee','#a3e635','#fb923c','#818cf8'];
  const datasets=Object.entries(byMill).map(([mill,points],i)=>({
    label:mill,
    data:points,
    borderColor:colors[i%colors.length],
    backgroundColor:colors[i%colors.length]+'20',
    borderWidth:2,
    pointRadius:3,
    pointHoverRadius:5,
    tension:0.3,
    fill:false
  }));

  // Add RL reference line if available
  const rl=S.rl.length?S.rl[S.rl.length-1]:null;
  const rlPrice=rl?.east?.[product]||rl?.central?.[product]||rl?.west?.[product]||null;
  if(rlPrice){
    datasets.push({
      label:'RL Composite',
      data:quotes.length?[{x:quotes[0].date,y:rlPrice},{x:quotes[quotes.length-1].date,y:rlPrice}]:[],
      borderColor:'#888',
      borderDash:[5,5],
      borderWidth:1,
      pointRadius:0,
      fill:false
    });
  }

  const ctx=canvas.getContext('2d');
  window._charts.mpTrend=new Chart(ctx,{
    type:'line',
    data:{datasets},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{mode:'nearest',intersect:false},
      scales:{
        x:{
          type:'category',
          grid:{color:'rgba(255,255,255,0.05)'},
          ticks:{color:'#888',font:{size:10}}
        },
        y:{
          grid:{color:'rgba(255,255,255,0.05)'},
          ticks:{color:'#888',font:{size:10},callback:v=>'$'+v}
        }
      },
      plugins:{
        legend:{
          position:'bottom',
          labels:{color:'#888',font:{size:10},boxWidth:12,padding:8}
        },
        tooltip:{
          callbacks:{
            label:ctx=>ctx.dataset.label+': $'+ctx.parsed.y
          }
        }
      }
    }
  });

  // Summary stats
  const summaryEl=document.getElementById('mp-trend-summary');
  if(summaryEl){
    const prices=quotes.map(q=>q.price);
    const avg=Math.round(prices.reduce((a,b)=>a+b,0)/prices.length);
    const min=Math.min(...prices);
    const max=Math.max(...prices);
    const best=getBestPrice(product);

    summaryEl.innerHTML=`
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div style="background:var(--panel-alt);padding:8px 12px;border-radius:var(--radius);min-width:120px">
          <div style="color:var(--muted);font-size:10px">AVG PRICE</div>
          <div class="mono" style="font-size:14px;font-weight:600">$${avg}</div>
        </div>
        <div style="background:var(--panel-alt);padding:8px 12px;border-radius:var(--radius);min-width:120px">
          <div style="color:var(--muted);font-size:10px">RANGE</div>
          <div class="mono" style="font-size:14px;font-weight:600">$${min} — $${max}</div>
        </div>
        ${best?`<div style="background:rgba(74,158,110,0.1);padding:8px 12px;border-radius:var(--radius);min-width:120px">
          <div style="color:var(--positive);font-size:10px">BEST OFFER</div>
          <div class="mono" style="font-size:14px;font-weight:600;color:var(--positive)">$${best.price} — ${best.mill}</div>
        </div>`:''}
        ${rlPrice?`<div style="background:var(--panel-alt);padding:8px 12px;border-radius:var(--radius);min-width:120px">
          <div style="color:var(--muted);font-size:10px">RL COMPOSITE</div>
          <div class="mono" style="font-size:14px;font-weight:600">$${rlPrice}</div>
        </div>`:''}
      </div>
    `;
  }
}

// ===== MATRIX TAB =====

function renderMPMatrix(){
  const el=document.getElementById('mp-content');
  const{matrix,mills,products}=getMillPriceMatrix();

  if(!mills.length){
    el.innerHTML=`<div class="card-body" style="text-align:center;color:var(--muted);padding:40px">No mill quotes yet. Use the Intake tab to add some.</div>`;
    return;
  }

  // Find best price per product
  const bestByProduct={};
  products.forEach(p=>{
    let best=Infinity;
    mills.forEach(m=>{
      if(matrix[m]?.[p]?.price<best)best=matrix[m][p].price;
    });
    bestByProduct[p]=best;
  });

  const headerCells=products.map(p=>`<th style="writing-mode:vertical-lr;text-align:center;padding:8px 4px;font-size:10px;white-space:nowrap">${p}</th>`).join('');

  const bodyRows=mills.map(m=>{
    const cells=products.map(p=>{
      const d=matrix[m]?.[p];
      if(!d)return'<td style="text-align:center;color:var(--muted)">-</td>';
      const isBest=d.price===bestByProduct[p];
      const age=Math.floor((new Date()-new Date(d.date))/(1000*60*60*24));
      return`<td class="mono" style="text-align:center;${isBest?'color:var(--positive);font-weight:700':''}${age>3?';opacity:0.5':''}" title="${d.shipWindow||''} | ${age}d ago">$${d.price}</td>`;
    }).join('');
    return`<tr><td style="white-space:nowrap;font-weight:500">${m}</td>${cells}</tr>`;
  }).join('');

  el.innerHTML=`
    <div class="card-body">
      <div style="color:var(--muted);font-size:10px;margin-bottom:8px">Latest FOB prices by mill and product. Green = best price. Faded = 3+ days old. Hover for details.</div>
      <div style="overflow-x:auto">
        <table class="data-table" style="font-size:11px">
          <thead><tr><th>Mill</th>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    </div>
  `;
}
