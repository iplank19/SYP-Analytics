// SYP Analytics - Modal Functions
// MODALS
function closeModal(){document.getElementById('modal').innerHTML=''}

// Global keyboard shortcuts
document.addEventListener('keydown',e=>{
  // Escape to close modal
  if(e.key==='Escape'){
    const modal=document.getElementById('modal');
    if(modal&&modal.innerHTML){
      closeModal();
      e.preventDefault();
    }
  }
});

function showBuyModal(b=null){
  // Build product list from RL data + defaults
  const rlProducts=new Set(PRODUCTS);
  S.rl.forEach(r=>{
    ['west','central','east'].forEach(reg=>{
      if(r[reg])Object.keys(r[reg]).forEach(p=>rlProducts.add(p));
      if(r.specified_lengths?.[reg])Object.keys(r.specified_lengths[reg]).forEach(p=>rlProducts.add(p));
      if(r.timbers?.[reg])Object.keys(r.timbers[reg]).forEach(p=>rlProducts.add(p));
    });
  });
  ['2x4#1','2x4#2','2x4#3','2x6#1','2x6#2','2x6#3','2x8#2','2x8#3','2x10#2','2x10#3','2x12#2','2x12#3','4x4#2','4x6','6x6','2x4 MSR','2x6 MSR','2x8 MSR','2x10 MSR','2x12 MSR','2x4 2400f','2x6 2400f','2x8 2400f','2x10 2400f'].forEach(p=>rlProducts.add(p));
  const prodList=[...rlProducts].sort();
  
  // Build mill list from CRM + defaults
  const millList=[...new Set([...MILLS,...S.mills.map(m=>m.name),...S.buys.map(x=>x.mill).filter(Boolean)])].sort();
  
  // Build origin location list from CRM and previous buys
  const origins=[...new Set([...S.mills.filter(m=>m.origin).map(m=>m.origin),...S.buys.map(x=>x.origin).filter(Boolean)])].sort();
  
  // Check if editing MSR or RL product
  const isMSR=b?.product?.toUpperCase().includes('MSR')||b?.product?.toUpperCase().includes('2400');
  const isRL=b?.length==='RL'||b?.tally;
  
  // Get sells without matching buys (shorts that need covering) - normalize order numbers
  const buyOrders=new Set(S.buys.map(x=>String(x.orderNum||x.po||'').trim()).filter(Boolean));
  const uncoveredSells=S.sells.filter(s=>{
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    return ord && !buyOrders.has(ord);
  });
  
  document.getElementById('modal').innerHTML=`<div class="modal-overlay" onclick="closeModal()"><div class="modal wide" onclick="event.stopPropagation()">
    <div class="modal-header"><span class="modal-title positive">${b?'EDIT':'NEW'} BUY</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      ${S.trader==='Admin'?`<div style="margin-bottom:16px;padding:12px;background:rgba(232,115,74,0.1);border:1px solid #e8734a;border-radius:4px">
        <div class="form-group" style="margin:0"><label class="form-label" style="color:#e8734a;font-weight:600">🔑 Assign to Trader</label>
        <select id="m-trader" style="width:200px">${TRADERS.map(t=>`<option value="${t}" ${(b?.trader||'Ian P')===t?'selected':''}>${t}</option>`).join('')}</select></div>
      </div>`:''}
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Order #</label>
          <input type="text" id="m-orderNum" value="${b?.orderNum||b?.po||''}" placeholder="e.g. 70123" list="order-list-buy" onchange="onBuyOrderChange()">
          <datalist id="order-list-buy">${uncoveredSells.map(s=>{const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();return`<option value="${ord}">${ord} - ${s.product} ${s.length||'RL'} to ${s.customer} (SHORT)</option>`}).join('')}</datalist>
        </div>
        <div class="form-group"><label class="form-label">Date</label><input type="date" id="m-date" value="${b?.date||today()}"></div>
        <div class="form-group"><label class="form-label">Mill</label><input type="text" id="m-mill" value="${b?.mill||''}" list="mill-list" placeholder="Type or select..." onchange="autoFillOrigin()"><datalist id="mill-list">${millList.map(m=>`<option value="${m}">`).join('')}</datalist></div>
        <div class="form-group"><label class="form-label">Origin (City, ST)</label><input type="text" id="m-origin" value="${b?.origin||''}" list="origin-list" placeholder="e.g. Warren, AR"><datalist id="origin-list">${origins.map(o=>`<option value="${o}">`).join('')}</datalist></div>
        <div class="form-group"><label class="form-label">Region</label><select id="m-region" onchange="toggleBuyOptions()">${REGIONS.map(r=>`<option value="${r}" ${b?.region===r?'selected':''}>${r.charAt(0).toUpperCase()+r.slice(1)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Product</label><input type="text" id="m-product" value="${b?.product||''}" list="prod-list" placeholder="e.g. 2x4#2, 2x6 MSR" onchange="toggleBuyOptions();calcBuyVolume()"><datalist id="prod-list">${prodList.map(p=>`<option value="${p}">`).join('')}</datalist></div>
        <div class="form-group"><label class="form-label">Length</label><select id="m-length" onchange="toggleBuyOptions();calcBuyVolume()"><option value="">Select...</option><option value="8" ${b?.length==='8'?'selected':''}>8'</option><option value="10" ${b?.length==='10'?'selected':''}>10'</option><option value="12" ${b?.length==='12'?'selected':''}>12'</option><option value="14" ${b?.length==='14'?'selected':''}>14'</option><option value="16" ${b?.length==='16'?'selected':''}>16'</option><option value="18" ${b?.length==='18'?'selected':''}>18'</option><option value="20" ${b?.length==='20'?'selected':''}>20'</option><option value="RL" ${b?.length==='RL'?'selected':''}>RL (Random)</option></select></div>
        <div class="form-group"><label class="form-label">Units</label><input type="number" id="m-units" value="${b?.units||''}" placeholder="Tallies" onchange="calcBuyVolume()"></div>
        <div class="form-group"><label class="form-label">Volume (MBF)</label><input type="number" id="m-volume" value="${b?.volume||''}"></div>
      </div>

      <!-- SPLIT LOAD SECTION FOR BUY -->
      <div style="margin-top:16px;padding:16px;background:var(--panel-alt);border:1px solid var(--info)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-weight:600;color:var(--info)">SPLIT LOAD (Multiple Products)</div>
          <label style="font-size:11px"><input type="checkbox" id="m-useSplit" ${b?.tally&&Object.keys(b.tally).some(k=>/[a-zA-Z]/.test(k))?'checked':''} onchange="toggleBuySplit()"> Enable</label>
        </div>
        <div id="split-grid-buy" style="display:${b?.tally&&Object.keys(b.tally).some(k=>/[a-zA-Z]/.test(k))?'block':'none'}">
          <div style="font-size:10px;color:var(--muted);margin-bottom:8px">For mixed loads (e.g. 2x10 + 2x12 on same truck). Prices are FOB $/MBF.</div>
          <table style="width:100%;font-size:11px" id="split-table-buy">
            <thead><tr><th>Product</th><th>Length</th><th>Units</th><th>MBF</th><th>$/MBF</th><th>Value</th><th></th></tr></thead>
            <tbody id="split-rows-buy">
              ${b?.tally&&Object.keys(b.tally).some(k=>/[a-zA-Z]/.test(k))?Object.entries(b.tally).map(([key,v],i)=>{
                const parts=key.match(/^(\S+)\s+(\d+)'?$/);
                const prod=parts?parts[1]:key;
                const len=parts?parts[2]:'';
                return`<tr data-split-row="${i}">
                  <td><input type="text" class="split-prod" value="${prod}" style="width:60px" list="prod-list" onchange="calcBuySplitRowVol(this);calcBuySplitTotal()"></td>
                  <td><input type="text" class="split-len" value="${len}" style="width:40px" onchange="calcBuySplitRowVol(this);calcBuySplitTotal()"></td>
                  <td><input type="number" class="split-units" value="${v.units||''}" style="width:45px" onchange="calcBuySplitRowVol(this);calcBuySplitTotal()"></td>
                  <td><input type="number" class="split-vol" value="${v.vol||''}" style="width:50px" onchange="calcBuySplitTotal()"></td>
                  <td><input type="number" class="split-price" value="${v.price||''}" style="width:60px" onchange="calcBuySplitTotal()"></td>
                  <td class="split-val right">—</td>
                  <td><button class="btn btn-default btn-sm" onclick="removeBuySplitRow(this)" style="padding:2px 6px">×</button></td>
                </tr>`;
              }).join(''):`<tr data-split-row="0">
                <td><input type="text" class="split-prod" value="" style="width:60px" list="prod-list" placeholder="2x10#2" onchange="calcBuySplitRowVol(this);calcBuySplitTotal()"></td>
                <td><input type="text" class="split-len" value="" style="width:40px" placeholder="16" onchange="calcBuySplitRowVol(this);calcBuySplitTotal()"></td>
                <td><input type="number" class="split-units" value="" style="width:45px" placeholder="Units" onchange="calcBuySplitRowVol(this);calcBuySplitTotal()"></td>
                <td><input type="number" class="split-vol" value="" style="width:50px" placeholder="MBF" onchange="calcBuySplitTotal()"></td>
                <td><input type="number" class="split-price" value="" style="width:60px" placeholder="$/MBF" onchange="calcBuySplitTotal()"></td>
                <td class="split-val right">—</td>
                <td><button class="btn btn-default btn-sm" onclick="removeBuySplitRow(this)" style="padding:2px 6px">×</button></td>
              </tr>`}
            </tbody>
            <tfoot>
              <tr><td colspan="7"><button class="btn btn-default btn-sm" onclick="addBuySplitRow()" style="width:100%">+ Add Product</button></td></tr>
              <tr style="font-weight:bold;border-top:2px solid var(--border)"><td colspan="3">Total</td><td id="buy-split-total-vol">—</td><td id="buy-split-avg-price">—</td><td id="buy-split-total-val">—</td><td></td></tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div id="msr-section" style="margin-top:16px;padding:16px;background:var(--panel-alt);border:1px solid var(--accent);display:${isMSR&&!isRL?'block':'none'}">
        <div style="font-weight:600;color:var(--accent);margin-bottom:12px">MSR/2400 PRICING (Premium over #1)</div>
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Base #1 (from RL)</label><input type="number" id="m-basePrice" value="${b?.basePrice||''}" readonly style="opacity:0.7"></div>
          <div class="form-group"><label class="form-label">Your Price</label><input type="number" id="m-price" value="${b?.price||''}" placeholder="$/MBF" onchange="calcMSRPremium()" onkeyup="calcMSRPremium()"></div>
          <div class="form-group"><label class="form-label">= Premium</label><input type="number" id="m-msrPremium" value="${b?.msrPremium||''}" readonly style="font-weight:bold;color:var(--accent)"></div>
        </div>
        <div id="msr-source" style="font-size:10px;color:var(--muted);margin-top:8px"></div>
      </div>
      
      <div id="standard-price" style="margin-top:16px;display:${isMSR||isRL?'none':'block'}">
        <div class="form-group"><label class="form-label">Price ($/MBF FOB)</label><input type="number" id="m-price-std" value="${b?.price||''}"></div>
      </div>
      
      <div id="rl-tally-section" style="margin-top:16px;padding:16px;background:var(--panel-alt);border:1px solid var(--warn);display:${isRL?'block':'none'}">
        <div style="font-weight:600;color:var(--warn);margin-bottom:12px">${isMSR?'MSR/2400 RL TALLY (Per-Length with #1 Base)':'RL TALLY (Per-Length Pricing)'}</div>
        <div style="margin-bottom:8px"><label><input type="checkbox" id="m-useTally" ${b?.tally?'checked':''} onchange="toggleTally()"> Use per-length tally</label></div>
        <div id="tally-grid" style="display:${b?.tally?'block':'none'}">
          ${(()=>{
            // Detect mixed-product tally (keys contain product names, not just numbers)
            const tallyKeys=b?.tally?Object.keys(b.tally):[];
            const hasMixedKeys=tallyKeys.some(k=>/[a-zA-Z]/.test(k));
            if(hasMixedKeys){
              // Mixed-product tally: show custom rows from actual keys
              return`<table style="width:100%;font-size:11px"><thead><tr><th>Item</th><th>MBF</th><th>$/MBF</th><th>Value</th></tr></thead><tbody>
                ${tallyKeys.map((key,ki)=>`<tr>
                  <td style="font-weight:600">${key}</td>
                  <td><input type="number" id="tally-vol-mixed-${ki}" data-tkey="${key}" value="${b.tally[key]?.vol||''}" style="width:60px" onchange="calcMixedTallyTotal()"></td>
                  <td><input type="number" id="tally-price-mixed-${ki}" data-tkey="${key}" value="${b.tally[key]?.price||''}" style="width:70px" onchange="calcMixedTallyTotal()"></td>
                  <td id="tally-val-mixed-${ki}" class="right">—</td>
                </tr>`).join('')}
              </tbody><tfoot><tr style="font-weight:bold;border-top:2px solid var(--border)"><td>Total</td><td id="tally-total-vol">—</td><td id="tally-avg-price">—</td><td id="tally-total-val">—</td></tr></tfoot></table>`;
            }
            // Standard length-only tally
            return`<table style="width:100%;font-size:11px"><thead><tr><th>Length</th><th>MBF</th><th id="tally-price-header">${isMSR?'Your $/MBF':'$/MBF'}</th><th id="tally-base-header" style="display:${isMSR?'table-cell':'none'}">Base #1</th><th id="tally-prem-header" style="display:${isMSR?'table-cell':'none'}">Premium</th><th>Value</th></tr></thead><tbody>
            ${['8','10','12','14','16','18','20'].map(len=>`<tr>
              <td>${len}'</td>
              <td><input type="number" id="tally-vol-${len}" value="${b?.tally?.[len]?.vol||''}" style="width:60px" onchange="calcTallyTotal()"></td>
              <td><input type="number" id="tally-price-${len}" value="${b?.tally?.[len]?.price||''}" style="width:70px" onchange="calcTallyTotal()"></td>
              <td id="tally-base-${len}" class="right" style="display:${isMSR?'table-cell':'none'};color:var(--muted)">—</td>
              <td id="tally-prem-${len}" class="right" style="display:${isMSR?'table-cell':'none'};color:var(--accent)">—</td>
              <td id="tally-val-${len}" class="right">—</td>
            </tr>`).join('')}
          </tbody><tfoot><tr style="font-weight:bold;border-top:2px solid var(--border)"><td>Total</td><td id="tally-total-vol">—</td><td id="tally-avg-price">—</td><td id="tally-avg-base" style="display:${isMSR?'table-cell':'none'}">—</td><td id="tally-avg-prem" style="display:${isMSR?'table-cell':'none'}">—</td><td id="tally-total-val">—</td></tr></tfoot></table>`;
          })()}
        </div>
      </div>
      
      <div style="margin-top:12px;padding:8px 12px;background:var(--panel-alt);border:1px solid var(--border);font-size:10px;color:var(--muted)">
        Freight is entered on the sell (OC) side and applies to the matched trade.
      </div>
      
      <div class="form-group" style="margin-top:12px"><label class="form-label">Notes</label><textarea id="m-notes">${b?.notes||''}</textarea></div>
    </div>
    <div class="modal-footer"><button class="btn btn-default" onclick="closeModal()">Cancel</button><button class="btn btn-success" onclick="saveBuy(${b?.id||'null'})">Save</button></div>
  </div></div>`;
  
  toggleBuyOptions();
  if(b?.tally)calcTallyTotal();
  calcBuyFreight();
}

function autoFillOrigin(){
  const mill=document.getElementById('m-mill')?.value;
  const originInput=document.getElementById('m-origin');
  const originList=document.getElementById('origin-list');
  
  if(mill){
    const crmMill=S.mills.find(m=>m.name===mill);
    if(crmMill){
      // Get mill's locations
      const locs=crmMill.locations||[crmMill.origin].filter(Boolean);
      
      // Update datalist with mill locations first  
      if(originList&&locs.length){
        const allOrigins=[...new Set([...locs,...S.mills.filter(m=>m.origin).map(m=>m.origin),...S.buys.map(x=>x.origin).filter(Boolean)])].sort();
        originList.innerHTML=allOrigins.map(o=>`<option value="${o}">`).join('');
      }
      
      // Auto-fill first location if origin is empty
      if(locs.length&&!originInput.value){
        originInput.value=locs[0];
      }
      
      // Also set region if available
      if(crmMill.region&&!document.getElementById('m-region').value){
        document.getElementById('m-region').value=crmMill.region;
      }
    }
  }
}

// QUICK ENTRY GRID FOR QUOTE ENGINE
let qeRowCount=0;

function showQuickEntryModal(){
  // Build product list from RL data + defaults
  const rlProducts=new Set(PRODUCTS);
  S.rl.forEach(r=>{
    ['west','central','east'].forEach(reg=>{
      if(r[reg])Object.keys(r[reg]).forEach(p=>rlProducts.add(p));
      if(r.specified_lengths?.[reg])Object.keys(r.specified_lengths[reg]).forEach(p=>rlProducts.add(p));
      if(r.timbers?.[reg])Object.keys(r.timbers[reg]).forEach(p=>rlProducts.add(p));
    });
  });
  ['2x4#1','2x4#2','2x4#3','2x6#1','2x6#2','2x6#3','2x8#2','2x8#3','2x10#2','2x10#3','2x12#2','2x12#3','4x4#2','4x6','6x6','2x4 MSR','2x6 MSR','2x8 MSR','2x10 MSR','2x12 MSR','2x4 2400f','2x6 2400f','2x8 2400f','2x10 2400f'].forEach(p=>rlProducts.add(p));
  const prodList=[...rlProducts].sort();

  // Build origin location list from CRM mills and lanes
  const defaultOrigins=['Warren, AR','Gurdon, AR','Camden, AR','Monticello, AR','Clarendon, NC','Huttig, AR','DeQuincy, LA'];
  const origins=[...new Set([...defaultOrigins,...S.mills.filter(m=>m.origin).map(m=>m.origin),...S.lanes.map(l=>l.origin),...(S.quoteItems||[]).map(i=>i.origin).filter(Boolean)])].sort();

  // Get last used origin from existing quote items
  const lastItem=(S.quoteItems||[])[0];
  const defaultOrigin=lastItem?.origin||'Warren, AR';

  qeRowCount=0;

  document.getElementById('modal').innerHTML=`<div class="modal-overlay" onclick="closeModal()"><div class="modal extra-wide" onclick="event.stopPropagation()">
    <div class="modal-header"><span class="modal-title" style="color:var(--warn)">QUICK ENTRY - Quote Items</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body" style="overflow-x:auto">
      <div style="margin-bottom:12px;padding:8px 12px;background:var(--panel-alt);border-radius:4px;font-size:11px;color:var(--muted)">
        Tab through cells to enter multiple products quickly. Product format: <span style="color:var(--accent)">2x4 #2 16'</span> or <span style="color:var(--accent)">2x6#2</span> (length optional)
      </div>
      <datalist id="qe-origin-list">${origins.map(o=>`<option value="${o}">`).join('')}</datalist>
      <datalist id="qe-prod-list">${prodList.map(p=>`<option value="${p}">`).join('')}</datalist>
      <table class="quick-entry-table">
        <thead>
          <tr>
            <th style="width:180px">Product</th>
            <th style="width:50px">Length</th>
            <th style="width:130px">Origin</th>
            <th style="width:70px">Ship Wk</th>
            <th style="width:50px">TLs</th>
            <th style="width:80px">Sell $</th>
            <th style="width:50px">Short?</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody id="quick-entry-rows">
        </tbody>
      </table>
      <div class="qe-actions">
        <div class="qe-actions-left">
          <button class="btn btn-default" onclick="addQuickEntryRow()">+ Add Row</button>
          <button class="btn btn-default" onclick="addQuickEntryRows(5)">+ Add 5 Rows</button>
        </div>
        <div class="qe-status" id="qe-status">0 rows with data</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-default" onclick="closeModal()">Cancel</button>
      <button class="btn btn-success" onclick="saveQuickEntry()">Save All</button>
    </div>
  </div></div>`;

  // Add 10 starting rows
  for(let i=0;i<10;i++){
    addQuickEntryRow(defaultOrigin);
  }

  // Focus first product input
  setTimeout(()=>{
    const firstInput=document.getElementById('qe-product-0');
    if(firstInput)firstInput.focus();
  },100);
}

function addQuickEntryRow(defaultOrigin='Warren, AR'){
  const idx=qeRowCount++;
  const tbody=document.getElementById('quick-entry-rows');

  const row=document.createElement('tr');
  row.id=`qe-row-${idx}`;
  row.innerHTML=`
    <td><input type="text" id="qe-product-${idx}" list="qe-prod-list" placeholder="2x4 #2" tabindex="${idx*7+1}" onchange="updateQeStatus()"></td>
    <td><select id="qe-length-${idx}" tabindex="${idx*7+2}">
      <option value="">--</option>
      <option value="8">8'</option>
      <option value="10">10'</option>
      <option value="12">12'</option>
      <option value="14">14'</option>
      <option value="16" selected>16'</option>
      <option value="18">18'</option>
      <option value="20">20'</option>
      <option value="RL">RL</option>
    </select></td>
    <td><input type="text" id="qe-origin-${idx}" list="qe-origin-list" placeholder="City, ST" value="${defaultOrigin}" tabindex="${idx*7+3}"></td>
    <td><input type="text" id="qe-shipweek-${idx}" placeholder="W1" style="text-align:center" tabindex="${idx*7+4}"></td>
    <td><input type="number" id="qe-tls-${idx}" value="1" min="1" style="text-align:center;width:45px" tabindex="${idx*7+5}"></td>
    <td><input type="number" id="qe-fob-${idx}" placeholder="425" tabindex="${idx*7+6}" onchange="updateQeStatus()"></td>
    <td style="text-align:center"><input type="checkbox" id="qe-short-${idx}" tabindex="${idx*7+7}"></td>
    <td><button class="qe-row-btn remove" onclick="removeQuickEntryRow(${idx})" title="Remove row">×</button></td>
  `;
  tbody.appendChild(row);
}

function addQuickEntryRows(count){
  const lastOrigin=document.getElementById(`qe-origin-${qeRowCount-1}`)?.value||'Warren, AR';
  for(let i=0;i<count;i++){
    addQuickEntryRow(lastOrigin);
  }
}

function removeQuickEntryRow(idx){
  const row=document.getElementById(`qe-row-${idx}`);
  if(row)row.remove();
  updateQeStatus();
}

function updateQeStatus(){
  let count=0;
  const rows=document.getElementById('quick-entry-rows')?.children||[];
  for(const row of rows){
    const idx=row.id.replace('qe-row-','');
    const product=document.getElementById(`qe-product-${idx}`)?.value;
    if(product)count++;
  }
  const status=document.getElementById('qe-status');
  if(status)status.textContent=`${count} row${count!==1?'s':''} with data`;
}

function saveQuickEntry(){
  const rows=document.getElementById('quick-entry-rows')?.children||[];
  let savedCount=0;

  for(const row of rows){
    const idx=row.id.replace('qe-row-','');

    // Get all values
    const baseProduct=document.getElementById(`qe-product-${idx}`)?.value?.trim()||'';
    const length=document.getElementById(`qe-length-${idx}`)?.value||'';
    const origin=document.getElementById(`qe-origin-${idx}`)?.value?.trim()||'';
    const shipWeek=document.getElementById(`qe-shipweek-${idx}`)?.value?.trim()||'';
    const tls=parseInt(document.getElementById(`qe-tls-${idx}`)?.value)||1;
    const fob=parseFloat(document.getElementById(`qe-fob-${idx}`)?.value)||0;
    const isShort=document.getElementById(`qe-short-${idx}`)?.checked||false;

    // Skip empty rows (no product)
    if(!baseProduct)continue;

    // Build full product string with length if provided
    let product=baseProduct;
    if(length&&!baseProduct.includes("'")){
      product=`${baseProduct} ${length}'`;
    }

    // Create quote item object (matching existing structure)
    const item={
      id:genId(),
      product:product,
      origin:origin,
      shipWeek:shipWeek,
      tls:tls,
      cost:isShort?null:0,
      fob:fob,
      isShort:isShort,
      selected:true
    };

    S.quoteItems.push(item);
    savedCount++;
  }

  if(savedCount===0){
    alert('No valid rows to save. Enter at least one product.');
    return;
  }

  save('quoteItems',S.quoteItems);
  saveCurrentProfileSelections();
  closeModal();
  render();

  // Show brief success message
  const msg=document.createElement('div');
  msg.style.cssText='position:fixed;top:20px;right:20px;background:var(--positive);color:#fff;padding:12px 20px;border-radius:4px;font-size:12px;z-index:9999;animation:fadeIn 0.2s';
  msg.textContent=`Added ${savedCount} quote item${savedCount!==1?'s':''}`;
  document.body.appendChild(msg);
  setTimeout(()=>msg.remove(),2000);
}

function autoFillDest(){
  const cust=document.getElementById('m-cust')?.value;
  const destInput=document.getElementById('m-dest');
  const destList=document.getElementById('dest-list');
  
  if(cust){
    const crmCust=S.customers.find(c=>c.name===cust);
    if(crmCust){
      // Get customer's locations
      const locs=crmCust.locations||[crmCust.destination].filter(Boolean);
      
      // Update datalist with customer locations first
      if(destList&&locs.length){
        const allDests=[...new Set([...locs,...S.customers.filter(c=>c.destination).map(c=>c.destination),...S.sells.map(x=>x.destination).filter(Boolean)])].sort();
        destList.innerHTML=allDests.map(d=>`<option value="${d}">`).join('');
      }
      
      // Auto-fill first location if dest is empty
      if(locs.length&&!destInput.value){
        destInput.value=locs[0];
      }
    }
  }
}

// When selecting an order # in buy modal (covering a short)
function onBuyOrderChange(){
  const orderNum=document.getElementById('m-orderNum')?.value;
  if(!orderNum)return;
  
  // Find matching sell (short to cover) - normalize to string
  const orderNumStr=String(orderNum).trim();
  const sell=S.sells.find(s=>String(s.orderNum||s.linkedPO||s.oc||'').trim()===orderNumStr);
  if(sell){
    // Auto-fill product, length, volume, region from the sell
    if(sell.product&&!document.getElementById('m-product').value){
      document.getElementById('m-product').value=sell.product;
    }
    if(sell.length){
      document.getElementById('m-length').value=sell.length;
    }
    if(sell.volume&&!document.getElementById('m-volume').value){
      document.getElementById('m-volume').value=sell.volume;
    }
    if(sell.region){
      document.getElementById('m-region').value=sell.region;
    }
    toggleBuyOptions();
  }
}

// When selecting an order # in sell modal (selling against a long)
function onSellOrderChange(){
  const orderNum=document.getElementById('m-orderNum')?.value;
  if(!orderNum)return;
  
  // Find matching buy (long to sell against) - normalize to string
  const orderNumStr=String(orderNum).trim();
  const buy=S.buys.find(b=>String(b.orderNum||b.po||'').trim()===orderNumStr);
  if(buy){
    // Auto-fill product, length, region from the buy
    if(buy.product&&!document.getElementById('m-product').value){
      document.getElementById('m-product').value=buy.product;
    }
    if(buy.length){
      document.getElementById('m-length').value=buy.length;
    }
    if(buy.region){
      document.getElementById('m-region').value=buy.region;
    }
    // Calculate available volume
    const orderSold={};
    S.sells.forEach(s=>{
      const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
      if(ord)orderSold[ord]=(orderSold[ord]||0)+(s.volume||0);
    });
    const avail=(buy.volume||0)-(orderSold[orderNumStr]||0);
    if(avail>0&&!document.getElementById('m-volume').value){
      document.getElementById('m-volume').value=avail;
    }
    toggleSellOptions();
  }
}

// Sell against a long position from Risk view
function sellPosition(product, length, volume){
  // Find ALL buys with this product/length that have available volume
  const orderSold={};
  S.sells.forEach(s=>{
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    if(ord)orderSold[ord]=(orderSold[ord]||0)+(s.volume||0);
  });
  
  // Normalize product for matching (remove spaces, lowercase)
  const normProd=p=>(p||'').toLowerCase().replace(/\s+/g,'');
  const targetProd=normProd(product);
  const targetLen=String(length||'RL').replace(/'/g,'');
  
  // Find all buys for this product/length with available volume
  const matchingBuys=S.buys.filter(b=>{
    if(normProd(b.product)!==targetProd)return false;
    const buyLen=String(b.length||'RL').replace(/'/g,'');
    if(targetLen && buyLen!==targetLen)return false;
    const ord=String(b.orderNum||b.po||'').trim();
    if(!ord)return false;
    const sold=orderSold[ord]||0;
    return (b.volume||0)-sold>0;
  });
  
  // Use first matching buy
  const matchingBuy=matchingBuys[0];
  const orderNum=matchingBuy?String(matchingBuy.orderNum||matchingBuy.po||'').trim():'';
  
  // Show modal with pre-filled data
  showSellModal({
    orderNum:orderNum,
    linkedPO:orderNum,
    product:product,
    length:length==='RL'?'RL':String(length).replace(/'/g,''),
    volume:matchingBuy?(matchingBuy.volume-(orderSold[orderNum]||0)):volume,
    region:matchingBuy?.region||'west'
  });
  
  // Alert if no matching buys found or multiple options
  if(matchingBuys.length===0){
    setTimeout(()=>alert(`No orders with available volume found for ${product} ${length}. Make sure your buys have Order #s assigned.`),100);
  }else if(matchingBuys.length>1){
    setTimeout(()=>alert(`Multiple orders found for ${product} ${length}. Please verify the correct Order # from the dropdown.`),100);
  }
}

// Cover a short position from Risk view  
function coverPosition(product, length, volume){
  // Find a sell (short) with this product/length that needs covering
  const buyOrders=new Set(S.buys.map(b=>String(b.orderNum||b.po||'').trim()).filter(Boolean));
  
  // Normalize product for matching
  const normProd=p=>(p||'').toLowerCase().replace(/\s+/g,'');
  const targetProd=normProd(product);
  const targetLen=String(length||'RL').replace(/'/g,'');
  
  const matchingSell=S.sells.find(s=>{
    if(normProd(s.product)!==targetProd)return false;
    const sellLen=String(s.length||'RL').replace(/'/g,'');
    if(targetLen && sellLen!==targetLen)return false;
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    return ord && !buyOrders.has(ord);
  });
  
  const orderNum=matchingSell?String(matchingSell.orderNum||matchingSell.linkedPO||matchingSell.oc||'').trim():'';
  
  showBuyModal({
    orderNum:orderNum,
    po:orderNum,
    product:product,
    length:length==='RL'?'RL':length,
    volume:volume,
    region:matchingSell?.region||'west'
  });
  
  if(!matchingSell){
    setTimeout(()=>{
      alert(`No uncovered short orders found for ${product} ${length}. Make sure your sells have Order #s assigned, or select from the dropdown.`);
    },100);
  }
}

function coverSell(sellId){
  // Find the sell by ID and open buy modal to cover it
  const sell=S.sells.find(s=>s.id===sellId);
  if(!sell){
    alert('Sell not found');
    return;
  }

  const orderNum=String(sell.orderNum||sell.linkedPO||sell.oc||'').trim();

  showBuyModal({
    orderNum:orderNum,
    po:orderNum,
    product:sell.product||'',
    length:sell.length||'RL',
    volume:sell.volume||0,
    region:sell.region||'west'
  });
}

function toggleBuyOptions(){
  const product=document.getElementById('m-product')?.value||'';
  const length=document.getElementById('m-length')?.value||'';
  const region=document.getElementById('m-region')?.value||'west';
  const isMSR=product.toUpperCase().includes('MSR')||product.toUpperCase().includes('2400');
  const isRL=length==='RL';
  
  // Show/hide sections based on product type and length
  document.getElementById('msr-section').style.display=(isMSR&&!isRL)?'block':'none';
  document.getElementById('standard-price').style.display=(isMSR||isRL)?'none':'block';
  document.getElementById('rl-tally-section').style.display=isRL?'block':'none';
  
  // Update tally header for MSR
  if(isRL){
    const priceHeader=document.getElementById('tally-price-header');
    const baseHeader=document.getElementById('tally-base-header');
    const premHeader=document.getElementById('tally-prem-header');
    const avgBase=document.getElementById('tally-avg-base');
    const avgPrem=document.getElementById('tally-avg-prem');
    
    if(priceHeader)priceHeader.textContent=isMSR?'Your $/MBF':'$/MBF';
    ['8','10','12','14','16','18','20'].forEach(len=>{
      const baseEl=document.getElementById(`tally-base-${len}`);
      const premEl=document.getElementById(`tally-prem-${len}`);
      if(baseEl)baseEl.style.display=isMSR?'table-cell':'none';
      if(premEl)premEl.style.display=isMSR?'table-cell':'none';
    });
    if(baseHeader)baseHeader.style.display=isMSR?'table-cell':'none';
    if(premHeader)premHeader.style.display=isMSR?'table-cell':'none';
    if(avgBase)avgBase.style.display=isMSR?'table-cell':'none';
    if(avgPrem)avgPrem.style.display=isMSR?'table-cell':'none';
    
    // Recalculate tally to show base prices
    if(isMSR)calcTallyTotal();
  }
  
  // Auto-fill #1 base price for single-length MSR products
  if(isMSR&&!isRL&&S.rl.length>0){
    const latestRL=S.rl[S.rl.length-1];
    const baseMatch=product.match(/(\d+x\d+)/i);
    if(baseMatch){
      const baseSize=baseMatch[1].toLowerCase();
      const normLen=length.replace(/[^0-9]/g,'');
      let basePrice=null;
      let source='';
      
      // Try specified lengths first with #1
      if(normLen&&latestRL.specified_lengths?.[region]?.[baseSize+'#1']?.[normLen]){
        basePrice=latestRL.specified_lengths[region][baseSize+'#1'][normLen];
        source=`${baseSize}#1 @ ${normLen}'`;
      }
      // Try specified lengths with #2 as fallback
      else if(normLen&&latestRL.specified_lengths?.[region]?.[baseSize+'#2']?.[normLen]){
        basePrice=latestRL.specified_lengths[region][baseSize+'#2'][normLen];
        source=`${baseSize}#2 @ ${normLen}'`;
      }
      // Try composite #1
      else if(latestRL[region]?.[baseSize+'#1']){
        basePrice=latestRL[region][baseSize+'#1'];
        source=`${baseSize}#1 composite`;
      }
      // Try composite #2
      else if(latestRL[region]?.[baseSize+'#2']){
        basePrice=latestRL[region][baseSize+'#2'];
        source=`${baseSize}#2 composite`;
      }
      
      if(basePrice){
        document.getElementById('m-basePrice').value=basePrice;
        calcMSRPremium();
        const srcInfo=document.getElementById('msr-source');
        if(srcInfo)srcInfo.textContent=`RL ${latestRL.date} | ${region} | ${source} = ${fmt(basePrice)}`;
      }
    }
  }
}

function calcMSRPremium(){
  const base=parseFloat(document.getElementById('m-basePrice')?.value)||0;
  const price=parseFloat(document.getElementById('m-price')?.value)||0;
  const premium=price-base;
  document.getElementById('m-msrPremium').value=premium>0?premium:0;
}

function toggleTally(){
  const useTally=document.getElementById('m-useTally')?.checked;
  document.getElementById('tally-grid').style.display=useTally?'block':'none';
}

function calcTallyTotal(){
  const product=document.getElementById('m-product')?.value||'';
  const region=document.getElementById('m-region')?.value||'west';
  const isMSR=product.toUpperCase().includes('MSR')||product.toUpperCase().includes('2400');
  const baseMatch=product.match(/(\d+x\d+)/i);
  const baseSize=baseMatch?baseMatch[1].toLowerCase():'2x4';
  
  // Get latest RL for base prices
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
  
  let totalVol=0,totalVal=0,totalBaseVal=0;
  ['8','10','12','14','16','18','20'].forEach(len=>{
    const vol=parseFloat(document.getElementById(`tally-vol-${len}`)?.value)||0;
    const price=parseFloat(document.getElementById(`tally-price-${len}`)?.value)||0;
    const val=vol*price;
    document.getElementById(`tally-val-${len}`).textContent=val>0?fmt(Math.round(val)):'—';
    totalVol+=vol;
    totalVal+=val;
    
    // For MSR, show base #1 price for each length
    if(isMSR&&latestRL){
      let basePrice=null;
      // Try #1 first
      if(latestRL.specified_lengths?.[region]?.[baseSize+'#1']?.[len]){
        basePrice=latestRL.specified_lengths[region][baseSize+'#1'][len];
      }
      // Fall back to #2
      else if(latestRL.specified_lengths?.[region]?.[baseSize+'#2']?.[len]){
        basePrice=latestRL.specified_lengths[region][baseSize+'#2'][len];
      }
      
      const baseEl=document.getElementById(`tally-base-${len}`);
      const premEl=document.getElementById(`tally-prem-${len}`);
      if(baseEl&&basePrice){
        baseEl.textContent=fmt(basePrice);
        if(premEl&&price>0){
          const prem=price-basePrice;
          premEl.textContent=(prem>=0?'+':'')+fmt(prem);
          premEl.style.color=prem>=0?'var(--accent)':'var(--negative)';
        }else if(premEl){
          premEl.textContent='—';
        }
        totalBaseVal+=basePrice*vol;
      }else if(baseEl){
        baseEl.textContent='—';
        if(premEl)premEl.textContent='—';
      }
    }
  });
  
  document.getElementById('tally-total-vol').textContent=totalVol>0?fmtN(totalVol):'—';
  document.getElementById('tally-avg-price').textContent=totalVol>0?fmt(Math.round(totalVal/totalVol)):'—';
  document.getElementById('tally-total-val').textContent=totalVal>0?fmt(Math.round(totalVal)):'—';
  
  // MSR averages
  if(isMSR){
    const avgBaseEl=document.getElementById('tally-avg-base');
    const avgPremEl=document.getElementById('tally-avg-prem');
    if(avgBaseEl&&totalVol>0&&totalBaseVal>0){
      const avgBase=totalBaseVal/totalVol;
      avgBaseEl.textContent=fmt(Math.round(avgBase));
      if(avgPremEl){
        const avgPrem=(totalVal/totalVol)-avgBase;
        avgPremEl.textContent=(avgPrem>=0?'+':'')+fmt(Math.round(avgPrem));
      }
    }
  }
  
  // Update main volume and price fields
  if(totalVol>0){
    document.getElementById('m-volume').value=fmtN(totalVol);
    document.getElementById('m-price-std').value=Math.round(totalVal/totalVol);
    // For MSR RL, also update the hidden price field
    if(isMSR){
      document.getElementById('m-price').value=Math.round(totalVal/totalVol);
      // Store weighted avg base price
      if(totalBaseVal>0){
        document.getElementById('m-basePrice').value=Math.round(totalBaseVal/totalVol);
        calcMSRPremium();
      }
    }
  }
}

function calcMixedTallyTotal(){
  let totalVol=0,totalVal=0;
  let i=0;
  while(true){
    const volEl=document.getElementById(`tally-vol-mixed-${i}`);
    const priceEl=document.getElementById(`tally-price-mixed-${i}`);
    const valEl=document.getElementById(`tally-val-mixed-${i}`);
    if(!volEl)break;
    const vol=parseFloat(volEl.value)||0;
    const price=parseFloat(priceEl?.value)||0;
    const val=vol*price;
    if(valEl)valEl.textContent=val>0?fmt(Math.round(val)):'—';
    totalVol+=vol;
    totalVal+=val;
    i++;
  }
  const volTotalEl=document.getElementById('tally-total-vol');
  const avgEl=document.getElementById('tally-avg-price');
  const valTotalEl=document.getElementById('tally-total-val');
  if(volTotalEl)volTotalEl.textContent=totalVol>0?fmtN(totalVol):'—';
  if(avgEl)avgEl.textContent=totalVol>0?fmt(Math.round(totalVal/totalVol)):'—';
  if(valTotalEl)valTotalEl.textContent=totalVal>0?fmt(Math.round(totalVal)):'—';
  if(totalVol>0){
    document.getElementById('m-volume').value=fmtN(totalVol);
    document.getElementById('m-price-std').value=Math.round(totalVal/totalVol);
  }
}

// SELL MODAL FUNCTIONS (mirror of buy functions)
function toggleSellOptions(){
  const product=document.getElementById('m-product')?.value||'';
  const length=document.getElementById('m-length')?.value||'';
  const region=document.getElementById('m-region')?.value||'west';
  const isMSR=product.toUpperCase().includes('MSR')||product.toUpperCase().includes('2400');
  const isRL=length==='RL';
  
  // Show/hide sections based on product type and length
  const msrSection=document.getElementById('msr-section-sell');
  const stdPrice=document.getElementById('standard-price-sell');
  const rlTally=document.getElementById('rl-tally-section-sell');
  
  if(msrSection)msrSection.style.display=(isMSR&&!isRL)?'block':'none';
  if(stdPrice)stdPrice.style.display=(isMSR||isRL)?'none':'block';
  if(rlTally)rlTally.style.display=isRL?'block':'none';
  
  // Update tally header for MSR
  if(isRL){
    const priceHeader=document.getElementById('tally-price-header-sell');
    const baseHeader=document.getElementById('tally-base-header-sell');
    const premHeader=document.getElementById('tally-prem-header-sell');
    const avgBase=document.getElementById('tally-avg-base');
    const avgPrem=document.getElementById('tally-avg-prem');
    
    if(priceHeader)priceHeader.textContent=isMSR?'Your $/MBF':'$/MBF DLVD';
    ['8','10','12','14','16','18','20'].forEach(len=>{
      const baseEl=document.getElementById(`tally-base-${len}`);
      const premEl=document.getElementById(`tally-prem-${len}`);
      if(baseEl)baseEl.style.display=isMSR?'table-cell':'none';
      if(premEl)premEl.style.display=isMSR?'table-cell':'none';
    });
    if(baseHeader)baseHeader.style.display=isMSR?'table-cell':'none';
    if(premHeader)premHeader.style.display=isMSR?'table-cell':'none';
    if(avgBase)avgBase.style.display=isMSR?'table-cell':'none';
    if(avgPrem)avgPrem.style.display=isMSR?'table-cell':'none';
    
    // Recalculate tally to show base prices
    if(isMSR)calcSellTallyTotal();
  }
  
  // Auto-fill #1 base price for single-length MSR products
  if(isMSR&&!isRL&&S.rl.length>0){
    const latestRL=S.rl[S.rl.length-1];
    const baseMatch=product.match(/(\d+x\d+)/i);
    if(baseMatch){
      const baseSize=baseMatch[1].toLowerCase();
      const normLen=length.replace(/[^0-9]/g,'');
      let basePrice=null;
      let source='';
      
      // Try specified lengths first with #1
      if(normLen&&latestRL.specified_lengths?.[region]?.[baseSize+'#1']?.[normLen]){
        basePrice=latestRL.specified_lengths[region][baseSize+'#1'][normLen];
        source=`${baseSize}#1 @ ${normLen}'`;
      }
      // Try specified lengths with #2 as fallback
      else if(normLen&&latestRL.specified_lengths?.[region]?.[baseSize+'#2']?.[normLen]){
        basePrice=latestRL.specified_lengths[region][baseSize+'#2'][normLen];
        source=`${baseSize}#2 @ ${normLen}'`;
      }
      // Try composite #1
      else if(latestRL[region]?.[baseSize+'#1']){
        basePrice=latestRL[region][baseSize+'#1'];
        source=`${baseSize}#1 composite`;
      }
      // Try composite #2
      else if(latestRL[region]?.[baseSize+'#2']){
        basePrice=latestRL[region][baseSize+'#2'];
        source=`${baseSize}#2 composite`;
      }
      
      if(basePrice){
        document.getElementById('m-basePrice').value=basePrice;
        calcSellMSRPremium();
        const srcInfo=document.getElementById('msr-source-sell');
        if(srcInfo)srcInfo.textContent=`RL ${latestRL.date} | ${region} | ${source} = ${fmt(basePrice)}`;
      }
    }
  }
  
  updateSellCalc();
}

function calcSellMSRPremium(){
  const base=parseFloat(document.getElementById('m-basePrice')?.value)||0;
  const price=parseFloat(document.getElementById('m-price')?.value)||0;
  const freight=parseFloat(document.getElementById('m-freight')?.value)||0;
  const volume=parseFloat(document.getElementById('m-volume')?.value)||0;
  const freightPerMBF=volume>0?freight/volume:0;
  // Premium is DLVD price minus freight minus base
  const fob=price-freightPerMBF;
  const premium=fob-base;
  document.getElementById('m-msrPremium').value=Math.round(premium);
}

function toggleSellTally(){
  const useTally=document.getElementById('m-useTally')?.checked;
  const tallyGrid=document.getElementById('tally-grid-sell');
  if(tallyGrid)tallyGrid.style.display=useTally?'block':'none';
}

// Split load functions for multiple products on same truck
function toggleSellSplit(){
  const useSplit=document.getElementById('m-useSplit')?.checked;
  const splitGrid=document.getElementById('split-grid-sell');
  if(splitGrid)splitGrid.style.display=useSplit?'block':'none';
  // If enabling split, disable single product/volume fields
  if(useSplit){
    document.getElementById('m-product').disabled=true;
    document.getElementById('m-product').style.opacity='0.5';
    document.getElementById('m-length').disabled=true;
    document.getElementById('m-length').style.opacity='0.5';
    document.getElementById('m-volume').disabled=true;
    document.getElementById('m-volume').style.opacity='0.5';
  }else{
    document.getElementById('m-product').disabled=false;
    document.getElementById('m-product').style.opacity='1';
    document.getElementById('m-length').disabled=false;
    document.getElementById('m-length').style.opacity='1';
    document.getElementById('m-volume').disabled=false;
    document.getElementById('m-volume').style.opacity='1';
  }
}

function addSplitRow(){
  const tbody=document.getElementById('split-rows-sell');
  const rowCount=tbody.querySelectorAll('tr').length;
  const tr=document.createElement('tr');
  tr.dataset.splitRow=rowCount;
  tr.innerHTML=`
    <td><input type="text" class="split-prod" value="" style="width:60px" list="prod-list" placeholder="2x10#2" onchange="calcSplitRowVol(this);calcSplitTotal()"></td>
    <td><input type="text" class="split-len" value="" style="width:40px" placeholder="16" onchange="calcSplitRowVol(this);calcSplitTotal()"></td>
    <td><input type="number" class="split-units" value="" style="width:45px" placeholder="Units" onchange="calcSplitRowVol(this);calcSplitTotal()"></td>
    <td><input type="number" class="split-vol" value="" style="width:50px" placeholder="MBF" onchange="calcSplitTotal()"></td>
    <td><input type="number" class="split-price" value="" style="width:60px" placeholder="$/MBF" onchange="calcSplitTotal()"></td>
    <td class="split-val right">—</td>
    <td><button class="btn btn-default btn-sm" onclick="removeSplitRow(this)" style="padding:2px 6px">×</button></td>
  `;
  tbody.appendChild(tr);
}

function removeSplitRow(btn){
  const row=btn.closest('tr');
  const tbody=document.getElementById('split-rows-sell');
  if(tbody.querySelectorAll('tr').length>1){
    row.remove();
    calcSplitTotal();
  }else{
    showToast('Need at least one product row','warn');
  }
}

function calcSplitTotal(){
  let totalVol=0,totalVal=0;
  document.querySelectorAll('#split-rows-sell tr').forEach(row=>{
    const vol=parseFloat(row.querySelector('.split-vol')?.value)||0;
    const price=parseFloat(row.querySelector('.split-price')?.value)||0;
    const val=vol*price;
    const valCell=row.querySelector('.split-val');
    if(valCell)valCell.textContent=val>0?fmt(Math.round(val)):'—';
    totalVol+=vol;
    totalVal+=val;
  });
  document.getElementById('split-total-vol').textContent=totalVol>0?fmtN(totalVol):'—';
  document.getElementById('split-avg-price').textContent=totalVol>0?fmt(Math.round(totalVal/totalVol)):'—';
  document.getElementById('split-total-val').textContent=totalVal>0?fmt(Math.round(totalVal)):'—';
  // Update main volume field
  if(totalVol>0){
    document.getElementById('m-volume').value=Math.round(totalVol*100)/100;
    updateSellCalc();
    calcFlatFreight();
  }
}

// Buy split load functions (multiple products on same truck)
function toggleBuySplit(){
  const useSplit=document.getElementById('m-useSplit')?.checked;
  const splitGrid=document.getElementById('split-grid-buy');
  if(splitGrid)splitGrid.style.display=useSplit?'block':'none';
  // If enabling split, disable single product/volume fields
  if(useSplit){
    document.getElementById('m-product').disabled=true;
    document.getElementById('m-product').style.opacity='0.5';
    document.getElementById('m-length').disabled=true;
    document.getElementById('m-length').style.opacity='0.5';
    document.getElementById('m-volume').disabled=true;
    document.getElementById('m-volume').style.opacity='0.5';
  }else{
    document.getElementById('m-product').disabled=false;
    document.getElementById('m-product').style.opacity='1';
    document.getElementById('m-length').disabled=false;
    document.getElementById('m-length').style.opacity='1';
    document.getElementById('m-volume').disabled=false;
    document.getElementById('m-volume').style.opacity='1';
  }
}

function addBuySplitRow(){
  const tbody=document.getElementById('split-rows-buy');
  const rowCount=tbody.querySelectorAll('tr').length;
  const tr=document.createElement('tr');
  tr.dataset.splitRow=rowCount;
  tr.innerHTML=`
    <td><input type="text" class="split-prod" value="" style="width:60px" list="prod-list" placeholder="2x10#2" onchange="calcBuySplitRowVol(this);calcBuySplitTotal()"></td>
    <td><input type="text" class="split-len" value="" style="width:40px" placeholder="16" onchange="calcBuySplitRowVol(this);calcBuySplitTotal()"></td>
    <td><input type="number" class="split-units" value="" style="width:45px" placeholder="Units" onchange="calcBuySplitRowVol(this);calcBuySplitTotal()"></td>
    <td><input type="number" class="split-vol" value="" style="width:50px" placeholder="MBF" onchange="calcBuySplitTotal()"></td>
    <td><input type="number" class="split-price" value="" style="width:60px" placeholder="$/MBF" onchange="calcBuySplitTotal()"></td>
    <td class="split-val right">—</td>
    <td><button class="btn btn-default btn-sm" onclick="removeBuySplitRow(this)" style="padding:2px 6px">×</button></td>
  `;
  tbody.appendChild(tr);
}

function removeBuySplitRow(btn){
  const row=btn.closest('tr');
  const tbody=document.getElementById('split-rows-buy');
  if(tbody.querySelectorAll('tr').length>1){
    row.remove();
    calcBuySplitTotal();
  }else{
    showToast('Need at least one product row','warn');
  }
}

function calcBuySplitTotal(){
  let totalVol=0,totalVal=0;
  document.querySelectorAll('#split-rows-buy tr').forEach(row=>{
    const vol=parseFloat(row.querySelector('.split-vol')?.value)||0;
    const price=parseFloat(row.querySelector('.split-price')?.value)||0;
    const val=vol*price;
    const valCell=row.querySelector('.split-val');
    if(valCell)valCell.textContent=val>0?fmt(Math.round(val)):'—';
    totalVol+=vol;
    totalVal+=val;
  });
  document.getElementById('buy-split-total-vol').textContent=totalVol>0?fmtN(totalVol):'—';
  document.getElementById('buy-split-avg-price').textContent=totalVol>0?fmt(Math.round(totalVal/totalVol)):'—';
  document.getElementById('buy-split-total-val').textContent=totalVal>0?fmt(Math.round(totalVal)):'—';
  // Update main volume field
  if(totalVol>0){
    document.getElementById('m-volume').value=Math.round(totalVol*100)/100;
  }
}

// Auto-calc MBF from units for main Buy form
function calcBuyVolume(){
  const product=document.getElementById('m-product')?.value||'';
  const lengthStr=document.getElementById('m-length')?.value||'';
  const units=parseFloat(document.getElementById('m-units')?.value)||0;
  if(!product||!lengthStr||lengthStr==='RL'||!units)return;
  const mbf=calcMBFFromUnits(product,lengthStr,units);
  if(mbf>0)document.getElementById('m-volume').value=mbf;
}

// Auto-calc MBF from units for main Sell form
function calcSellVolume(){
  const product=document.getElementById('m-product')?.value||'';
  const lengthStr=document.getElementById('m-length')?.value||'';
  const units=parseFloat(document.getElementById('m-units')?.value)||0;
  if(!product||!lengthStr||lengthStr==='RL'||!units)return;
  const mbf=calcMBFFromUnits(product,lengthStr,units);
  if(mbf>0){
    document.getElementById('m-volume').value=mbf;
    updateSellCalc();
    calcFlatFreight();
  }
}

// Auto-calc MBF for a split row (Sell)
function calcSplitRowVol(el){
  const row=el.closest('tr');
  const prod=row.querySelector('.split-prod')?.value||'';
  const len=row.querySelector('.split-len')?.value||'';
  const units=parseFloat(row.querySelector('.split-units')?.value)||0;
  if(!prod||!len||!units)return;
  const mbf=calcMBFFromUnits(prod,len,units);
  if(mbf>0)row.querySelector('.split-vol').value=mbf;
}

// Auto-calc MBF for a split row (Buy)
function calcBuySplitRowVol(el){
  const row=el.closest('tr');
  const prod=row.querySelector('.split-prod')?.value||'';
  const len=row.querySelector('.split-len')?.value||'';
  const units=parseFloat(row.querySelector('.split-units')?.value)||0;
  if(!prod||!len||!units)return;
  const mbf=calcMBFFromUnits(prod,len,units);
  if(mbf>0)row.querySelector('.split-vol').value=mbf;
}

// Shared MBF calculation from product, length, units
function calcMBFFromUnits(product,lengthStr,units){
  const lengthFt=parseFloat(lengthStr);
  if(!lengthFt)return 0;
  // Parse dimension from product (e.g. "2x4#2" -> thick=2, wide=4)
  const dimMatch=product.match(/(\d+)x(\d+)/i);
  if(!dimMatch)return 0;
  const thick=parseInt(dimMatch[1]);
  const wide=parseInt(dimMatch[2]);
  // Timbers (4x4, 4x6, 6x6) = flat 20 MBF per unit
  if(thick>=4)return Math.round(units*20*100)/100;
  // Pieces per unit by dimension
  const PCS_PER_UNIT={'2x4':208,'2x6':128,'2x8':96,'2x10':80,'2x12':64};
  const dim=`${thick}x${wide}`;
  const pcsPerUnit=PCS_PER_UNIT[dim];
  if(!pcsPerUnit)return 0;
  // Calculate MBF
  const totalPieces=units*pcsPerUnit;
  const bfPerPiece=(thick*wide*lengthFt)/12;
  return Math.round(totalPieces*bfPerPiece/1000*100)/100;
}

function calcSellTallyTotal(){
  const product=document.getElementById('m-product')?.value||'';
  const region=document.getElementById('m-region')?.value||'west';
  const isMSR=product.toUpperCase().includes('MSR')||product.toUpperCase().includes('2400');
  const baseMatch=product.match(/(\d+x\d+)/i);
  const baseSize=baseMatch?baseMatch[1].toLowerCase():'2x4';
  
  // Get latest RL for base prices
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
  
  let totalVol=0,totalVal=0,totalBaseVal=0;
  ['8','10','12','14','16','18','20'].forEach(len=>{
    const vol=parseFloat(document.getElementById(`tally-vol-${len}`)?.value)||0;
    const price=parseFloat(document.getElementById(`tally-price-${len}`)?.value)||0;
    const val=vol*price;
    document.getElementById(`tally-val-${len}`).textContent=val>0?fmt(Math.round(val)):'—';
    totalVol+=vol;
    totalVal+=val;
    
    // For MSR, show base #1 price for each length
    if(isMSR&&latestRL){
      let basePrice=null;
      // Try #1 first
      if(latestRL.specified_lengths?.[region]?.[baseSize+'#1']?.[len]){
        basePrice=latestRL.specified_lengths[region][baseSize+'#1'][len];
      }
      // Fall back to #2
      else if(latestRL.specified_lengths?.[region]?.[baseSize+'#2']?.[len]){
        basePrice=latestRL.specified_lengths[region][baseSize+'#2'][len];
      }
      
      const baseEl=document.getElementById(`tally-base-${len}`);
      const premEl=document.getElementById(`tally-prem-${len}`);
      if(baseEl&&basePrice){
        baseEl.textContent=fmt(basePrice);
        if(premEl&&price>0){
          const prem=price-basePrice;
          premEl.textContent=(prem>=0?'+':'')+fmt(prem);
          premEl.style.color=prem>=0?'var(--accent)':'var(--negative)';
        }else if(premEl){
          premEl.textContent='—';
        }
        totalBaseVal+=basePrice*vol;
      }else if(baseEl){
        baseEl.textContent='—';
        if(premEl)premEl.textContent='—';
      }
    }
  });
  
  document.getElementById('tally-total-vol').textContent=totalVol>0?fmtN(totalVol):'—';
  document.getElementById('tally-avg-price').textContent=totalVol>0?fmt(Math.round(totalVal/totalVol)):'—';
  document.getElementById('tally-total-val').textContent=totalVal>0?fmt(Math.round(totalVal)):'—';
  
  // MSR averages
  if(isMSR){
    const avgBaseEl=document.getElementById('tally-avg-base');
    const avgPremEl=document.getElementById('tally-avg-prem');
    if(avgBaseEl&&totalVol>0&&totalBaseVal>0){
      const avgBase=totalBaseVal/totalVol;
      avgBaseEl.textContent=fmt(Math.round(avgBase));
      if(avgPremEl){
        const avgPrem=(totalVal/totalVol)-avgBase;
        avgPremEl.textContent=(avgPrem>=0?'+':'')+fmt(Math.round(avgPrem));
      }
    }
  }
  
  // Update main volume and price fields
  if(totalVol>0){
    document.getElementById('m-volume').value=fmtN(totalVol);
    const avgPrice=Math.round(totalVal/totalVol);
    const stdPriceEl=document.getElementById('m-price-std');
    if(stdPriceEl)stdPriceEl.value=avgPrice;
    // For MSR RL, also update the main price field
    if(isMSR){
      document.getElementById('m-price').value=avgPrice;
      // Store weighted avg base price
      if(totalBaseVal>0){
        document.getElementById('m-basePrice').value=Math.round(totalBaseVal/totalVol);
        calcSellMSRPremium();
      }
    }
  }
  
  updateSellCalc();
}

function showSellModal(s=null){
  // Build product list from RL data + defaults
  const rlProducts=new Set(PRODUCTS);
  S.rl.forEach(r=>{
    ['west','central','east'].forEach(reg=>{
      if(r[reg])Object.keys(r[reg]).forEach(p=>rlProducts.add(p));
      if(r.specified_lengths?.[reg])Object.keys(r.specified_lengths[reg]).forEach(p=>rlProducts.add(p));
      if(r.timbers?.[reg])Object.keys(r.timbers[reg]).forEach(p=>rlProducts.add(p));
    });
  });
  ['2x4#1','2x4#2','2x4#3','2x6#1','2x6#2','2x6#3','2x8#2','2x8#3','2x10#2','2x10#3','2x12#2','2x12#3','4x4#2','4x6','6x6','2x4 MSR','2x6 MSR','2x8 MSR','2x10 MSR','2x12 MSR','2x4 2400f','2x6 2400f','2x8 2400f','2x10 2400f'].forEach(p=>rlProducts.add(p));
  const prodList=[...rlProducts].sort();
  
  // Build destination list from CRM and previous sells
  const dests=[...new Set([...S.customers.flatMap(c=>c.locations||[c.destination]).filter(Boolean),...S.sells.map(x=>x.destination).filter(Boolean)])].sort();
  
  // Customer list from CRM
  const custList=[...new Set([...S.customers.map(c=>c.name),...S.sells.map(x=>x.customer).filter(Boolean)])].sort();
  
  // Get available buys (with volume remaining) - using orderNum, normalized to strings
  const orderSold={};
  S.sells.filter(x=>x.id!==s?.id).forEach(x=>{
    const ord=String(x.orderNum||x.linkedPO||x.oc||'').trim();
    if(ord)orderSold[ord]=(orderSold[ord]||0)+(x.volume||0);
  });
  const availBuys=S.buys.map(b=>{
    const ord=String(b.orderNum||b.po||'').trim();
    const sold=orderSold[ord]||0;
    const avail=(b.volume||0)-sold;
    return{...b,ord,sold,avail};
  }).filter(b=>b.ord&&b.avail>0);
  
  // Check if editing MSR or RL product
  const isMSR=s?.product?.toUpperCase().includes('MSR')||s?.product?.toUpperCase().includes('2400');
  const isRL=s?.length==='RL'||s?.tally;
  
  document.getElementById('modal').innerHTML=`<div class="modal-overlay" onclick="closeModal()"><div class="modal wide" onclick="event.stopPropagation()">
    <div class="modal-header"><span class="modal-title">${s?'EDIT':'NEW'} SELL</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      ${S.trader==='Admin'?`<div style="margin-bottom:16px;padding:12px;background:rgba(232,115,74,0.1);border:1px solid #e8734a;border-radius:4px">
        <div class="form-group" style="margin:0"><label class="form-label" style="color:#e8734a;font-weight:600">🔑 Assign to Trader</label>
        <select id="m-trader" style="width:200px">${TRADERS.map(t=>`<option value="${t}" ${(s?.trader||'Ian P')===t?'selected':''}>${t}</option>`).join('')}</select></div>
      </div>`:''}
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Order #</label>
          <input type="text" id="m-orderNum" value="${s?.orderNum||s?.linkedPO||s?.oc||''}" placeholder="e.g. 70123" list="order-list-sell" onchange="onSellOrderChange();updateSellCalc()">
          <datalist id="order-list-sell">${availBuys.map(b=>`<option value="${b.ord}">${b.ord} - ${b.product} ${b.length||'RL'} from ${b.mill} | ${fmtN(b.avail)} MBF avail</option>`).join('')}</datalist>
        </div>
        <div class="form-group"><label class="form-label">Date</label><input type="date" id="m-date" value="${s?.date||today()}"></div>
        <div class="form-group"><label class="form-label">Customer</label><input type="text" id="m-cust" value="${s?.customer||''}" list="cust-list" placeholder="Type or select..." onchange="autoFillDest()"><datalist id="cust-list">${custList.map(c=>`<option value="${c}">`).join('')}</datalist></div>
        <div class="form-group"><label class="form-label">Destination (City, ST)</label><input type="text" id="m-dest" value="${s?.destination||''}" list="dest-list" placeholder="e.g. Cincinnati, OH"><datalist id="dest-list">${dests.map(d=>`<option value="${d}">`).join('')}</datalist></div>
        <div class="form-group"><label class="form-label">Region</label><select id="m-region" onchange="toggleSellOptions()">${REGIONS.map(r=>`<option value="${r}" ${s?.region===r?'selected':''}>${r.charAt(0).toUpperCase()+r.slice(1)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Product</label><input type="text" id="m-product" value="${s?.product||''}" list="prod-list" placeholder="e.g. 2x4#2, 2x6 MSR" onchange="toggleSellOptions();calcSellVolume()"><datalist id="prod-list">${prodList.map(p=>`<option value="${p}">`).join('')}</datalist></div>
        <div class="form-group"><label class="form-label">Length</label><select id="m-length" onchange="toggleSellOptions();calcSellVolume()"><option value="">Select...</option><option value="8" ${s?.length==='8'?'selected':''}>8'</option><option value="10" ${s?.length==='10'?'selected':''}>10'</option><option value="12" ${s?.length==='12'?'selected':''}>12'</option><option value="14" ${s?.length==='14'?'selected':''}>14'</option><option value="16" ${s?.length==='16'?'selected':''}>16'</option><option value="18" ${s?.length==='18'?'selected':''}>18'</option><option value="20" ${s?.length==='20'?'selected':''}>20'</option><option value="RL" ${s?.length==='RL'?'selected':''}>RL (Random)</option></select></div>
        <div class="form-group"><label class="form-label">Units</label><input type="number" id="m-units" value="${s?.units||''}" placeholder="Tallies" onchange="calcSellVolume()"></div>
        <div class="form-group"><label class="form-label">Volume (MBF)</label><input type="number" id="m-volume" value="${s?.volume||''}" onchange="updateSellCalc();calcFlatFreight()"></div>
      </div>

      <!-- SPLIT LOAD SECTION -->
      <div style="margin-top:16px;padding:16px;background:var(--panel-alt);border:1px solid var(--info)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-weight:600;color:var(--info)">SPLIT LOAD (Multiple Products)</div>
          <label style="font-size:11px"><input type="checkbox" id="m-useSplit" ${s?.tally&&Object.keys(s.tally).some(k=>/[a-zA-Z]/.test(k))?'checked':''} onchange="toggleSellSplit()"> Enable</label>
        </div>
        <div id="split-grid-sell" style="display:${s?.tally&&Object.keys(s.tally).some(k=>/[a-zA-Z]/.test(k))?'block':'none'}">
          <div style="font-size:10px;color:var(--muted);margin-bottom:8px">For mixed loads (e.g. 2x10 + 2x12 on same truck). Prices are DLVD $/MBF.</div>
          <table style="width:100%;font-size:11px" id="split-table-sell">
            <thead><tr><th>Product</th><th>Length</th><th>Units</th><th>MBF</th><th>$/MBF</th><th>Value</th><th></th></tr></thead>
            <tbody id="split-rows-sell">
              ${s?.tally&&Object.keys(s.tally).some(k=>/[a-zA-Z]/.test(k))?Object.entries(s.tally).map(([key,v],i)=>{
                const parts=key.match(/^(\S+)\s+(\d+)'?$/);
                const prod=parts?parts[1]:key;
                const len=parts?parts[2]:'';
                return`<tr data-split-row="${i}">
                  <td><input type="text" class="split-prod" value="${prod}" style="width:60px" list="prod-list" onchange="calcSplitRowVol(this);calcSplitTotal()"></td>
                  <td><input type="text" class="split-len" value="${len}" style="width:40px" onchange="calcSplitRowVol(this);calcSplitTotal()"></td>
                  <td><input type="number" class="split-units" value="${v.units||''}" style="width:45px" onchange="calcSplitRowVol(this);calcSplitTotal()"></td>
                  <td><input type="number" class="split-vol" value="${v.vol||''}" style="width:50px" onchange="calcSplitTotal()"></td>
                  <td><input type="number" class="split-price" value="${v.price||''}" style="width:60px" onchange="calcSplitTotal()"></td>
                  <td class="split-val right">—</td>
                  <td><button class="btn btn-default btn-sm" onclick="removeSplitRow(this)" style="padding:2px 6px">×</button></td>
                </tr>`;
              }).join(''):`<tr data-split-row="0">
                <td><input type="text" class="split-prod" value="" style="width:60px" list="prod-list" placeholder="2x10#2" onchange="calcSplitRowVol(this);calcSplitTotal()"></td>
                <td><input type="text" class="split-len" value="" style="width:40px" placeholder="16" onchange="calcSplitRowVol(this);calcSplitTotal()"></td>
                <td><input type="number" class="split-units" value="" style="width:45px" placeholder="Units" onchange="calcSplitRowVol(this);calcSplitTotal()"></td>
                <td><input type="number" class="split-vol" value="" style="width:50px" placeholder="MBF" onchange="calcSplitTotal()"></td>
                <td><input type="number" class="split-price" value="" style="width:60px" placeholder="$/MBF" onchange="calcSplitTotal()"></td>
                <td class="split-val right">—</td>
                <td><button class="btn btn-default btn-sm" onclick="removeSplitRow(this)" style="padding:2px 6px">×</button></td>
              </tr>`}
            </tbody>
            <tfoot>
              <tr><td colspan="7"><button class="btn btn-default btn-sm" onclick="addSplitRow()" style="width:100%">+ Add Product</button></td></tr>
              <tr style="font-weight:bold;border-top:2px solid var(--border)"><td colspan="3">Total</td><td id="split-total-vol">—</td><td id="split-avg-price">—</td><td id="split-total-val">—</td><td></td></tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div id="msr-section-sell" style="margin-top:16px;padding:16px;background:var(--panel-alt);border:1px solid var(--accent);display:${isMSR&&!isRL?'block':'none'}">
        <div style="font-weight:600;color:var(--accent);margin-bottom:12px">MSR/2400 PRICING (Premium over #1)</div>
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Base #1 (from RL)</label><input type="number" id="m-basePrice" value="${s?.basePrice||''}" readonly style="opacity:0.7"></div>
          <div class="form-group"><label class="form-label">Your DLVD Price</label><input type="number" id="m-price" value="${s?.price||''}" placeholder="$/MBF DLVD" onchange="calcSellMSRPremium();updateSellCalc()" onkeyup="calcSellMSRPremium();updateSellCalc()"></div>
          <div class="form-group"><label class="form-label">= Premium (pre-freight)</label><input type="number" id="m-msrPremium" value="${s?.msrPremium||''}" readonly style="font-weight:bold;color:var(--accent)"></div>
        </div>
        <div id="msr-source-sell" style="font-size:10px;color:var(--muted);margin-top:8px"></div>
      </div>
      
      <div id="standard-price-sell" style="margin-top:16px;display:${isMSR||isRL?'none':'block'}">
        <div class="form-group"><label class="form-label">DLVD Price ($/MBF)</label><input type="number" id="m-price-std" value="${s?.price||''}" onchange="updateSellCalc()" onkeyup="updateSellCalc()"></div>
      </div>
      
      <div id="rl-tally-section-sell" style="margin-top:16px;padding:16px;background:var(--panel-alt);border:1px solid var(--warn);display:${isRL?'block':'none'}">
        <div style="font-weight:600;color:var(--warn);margin-bottom:12px">${isMSR?'MSR/2400 RL TALLY (Per-Length with #1 Base)':'RL TALLY (Per-Length Pricing)'}</div>
        <div style="margin-bottom:8px"><label><input type="checkbox" id="m-useTally" ${s?.tally?'checked':''} onchange="toggleSellTally()"> Use per-length tally</label></div>
        <div id="tally-grid-sell" style="display:${s?.tally?'block':'none'}">
          ${(()=>{
            const tallyKeys=s?.tally?Object.keys(s.tally):[];
            const hasMixedKeys=tallyKeys.some(k=>/[a-zA-Z]/.test(k));
            if(hasMixedKeys){
              return`<table style="width:100%;font-size:11px"><thead><tr><th>Item</th><th>MBF</th><th>$/MBF DLVD</th><th>Value</th></tr></thead><tbody>
                ${tallyKeys.map((key,ki)=>`<tr>
                  <td style="font-weight:600">${key}</td>
                  <td><input type="number" id="tally-vol-mixed-${ki}" data-tkey="${key}" value="${s.tally[key]?.vol||''}" style="width:60px" onchange="calcMixedTallyTotal()"></td>
                  <td><input type="number" id="tally-price-mixed-${ki}" data-tkey="${key}" value="${s.tally[key]?.price||''}" style="width:70px" onchange="calcMixedTallyTotal()"></td>
                  <td id="tally-val-mixed-${ki}" class="right">—</td>
                </tr>`).join('')}
              </tbody><tfoot><tr style="font-weight:bold;border-top:2px solid var(--border)"><td>Total</td><td id="tally-total-vol">—</td><td id="tally-avg-price">—</td><td id="tally-total-val">—</td></tr></tfoot></table>`;
            }
            return`<table style="width:100%;font-size:11px"><thead><tr><th>Length</th><th>MBF</th><th id="tally-price-header-sell">${isMSR?'Your $/MBF':'$/MBF DLVD'}</th><th id="tally-base-header-sell" style="display:${isMSR?'table-cell':'none'}">Base #1</th><th id="tally-prem-header-sell" style="display:${isMSR?'table-cell':'none'}">Premium</th><th>Value</th></tr></thead><tbody>
            ${['8','10','12','14','16','18','20'].map(len=>`<tr>
              <td>${len}'</td>
              <td><input type="number" id="tally-vol-${len}" value="${s?.tally?.[len]?.vol||''}" style="width:60px" onchange="calcSellTallyTotal()"></td>
              <td><input type="number" id="tally-price-${len}" value="${s?.tally?.[len]?.price||''}" style="width:70px" onchange="calcSellTallyTotal()"></td>
              <td id="tally-base-${len}" class="right" style="display:${isMSR?'table-cell':'none'};color:var(--muted)">—</td>
              <td id="tally-prem-${len}" class="right" style="display:${isMSR?'table-cell':'none'};color:var(--accent)">—</td>
              <td id="tally-val-${len}" class="right">—</td>
            </tr>`).join('')}
          </tbody><tfoot><tr style="font-weight:bold;border-top:2px solid var(--border)"><td>Total</td><td id="tally-total-vol">—</td><td id="tally-avg-price">—</td><td id="tally-avg-base" style="display:${isMSR?'table-cell':'none'}">—</td><td id="tally-avg-prem" style="display:${isMSR?'table-cell':'none'}">—</td><td id="tally-total-val">—</td></tr></tfoot></table>`;
          })()}
        </div>
      </div>
      
      <div style="margin-top:16px;padding:16px;background:var(--panel-alt);border:1px solid var(--border)">
        <div style="font-weight:600;color:var(--warn);margin-bottom:12px">FREIGHT (FLAT RATE PER LOAD)</div>
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Miles</label><div style="display:flex;gap:4px"><input type="number" id="m-miles" value="${s?.miles||''}" style="flex:1" onchange="calcFlatFreight()"><button class="btn btn-default btn-sm" onclick="calcMileage()">🔍</button></div></div>
          <div class="form-group"><label class="form-label">Rate ($/mile)</label><input type="number" id="m-rate" value="${s?.rate||S.flatRate||3.50}" step="0.01" onchange="calcFlatFreight()"></div>
          <div class="form-group"><label class="form-label">Freight ($/load)</label><input type="number" id="m-freight" value="${s?.freight||''}" onchange="updateSellCalc()"></div>
          <div class="form-group"><label class="form-label">$/MBF</label><input type="text" id="m-freightMBF" value="" readonly style="opacity:0.7"></div>
        </div>
        <div id="mileage-status" style="font-size:10px;color:var(--muted);margin-top:8px"></div>
      </div>
      
      <div id="sell-calc" style="margin-top:16px;padding:16px;background:var(--bg);border:1px solid var(--border)"></div>
      <div class="form-group" style="margin-top:12px"><label class="form-label">Notes</label><textarea id="m-notes">${s?.notes||''}</textarea></div>
      <div style="margin-top:12px"><label><input type="checkbox" id="m-delivered" ${s?.delivered?'checked':''}> Delivered</label></div>
    </div>
    <div class="modal-footer"><button class="btn btn-default" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveSell(${s?.id||'null'})">Save</button></div>
  </div></div>`;
  
  toggleSellOptions();
  updateSellCalc();
  calcFlatFreight();
}

function onPOChange(){
  const poNum=document.getElementById('m-linkedPO')?.value;
  if(poNum){
    const buy=S.buys.find(b=>b.po===poNum);
    if(buy){
      if(!document.getElementById('m-product').value)document.getElementById('m-product').value=buy.product||'';
      const lenEl=document.getElementById('m-length');
      if(lenEl&&!lenEl.value)lenEl.value=buy.length||'';
      if(!document.getElementById('m-region')?.value)document.getElementById('m-region').value=buy.region||'west';
      toggleSellOptions();
    }
  }
  updateSellCalc();
}

// Create PO from OC modal - saves the current OC first, then opens buy modal
async function createPOFromOC(){
  // First save the current sell
  const product=document.getElementById('m-product')?.value||'';
  const isMSR=product.toUpperCase().includes('MSR')||product.toUpperCase().includes('2400');
  const useTally=document.getElementById('m-useTally')?.checked;
  
  let price=0;
  if(isMSR||useTally){
    price=parseFloat(document.getElementById('m-price')?.value)||0;
  }else{
    price=parseFloat(document.getElementById('m-price-std')?.value)||0;
  }
  
  let tally=null;
  if(useTally){
    tally={};
    ['8','10','12','14','16','18','20'].forEach(len=>{
      const vol=parseFloat(document.getElementById(`tally-vol-${len}`)?.value)||0;
      const tallyPrice=parseFloat(document.getElementById(`tally-price-${len}`)?.value)||0;
      if(vol>0)tally[len]={vol,price:tallyPrice};
    });
  }
  
  const customer=document.getElementById('m-cust')?.value||'';
  const destination=document.getElementById('m-dest')?.value||'';
  const oc=document.getElementById('m-oc')?.value||'';
  
  if(!oc){alert('Enter OC # first');return}
  if(!product||!price){alert('Enter product and price first');return}
  
  // Save customer to CRM if new
  if(customer&&!S.customers.find(c=>c.name===customer)){
    S.customers.push({name:customer,destination:destination,addedDate:today()});
  }
  
  const s={
    id:genId(),
    oc:oc,
    linkedPO:'', // Will be linked when PO is created
    date:document.getElementById('m-date')?.value||today(),
    customer:customer,
    destination:destination,
    region:document.getElementById('m-region')?.value||'west',
    miles:parseFloat(document.getElementById('m-miles')?.value)||0,
    rate:parseFloat(document.getElementById('m-rate')?.value)||S.flatRate||3.50,
    product:product,
    length:document.getElementById('m-length')?.value||'',
    price:price,
    freight:parseFloat(document.getElementById('m-freight')?.value)||0,
    volume:parseFloat(document.getElementById('m-volume')?.value)||0,
    notes:document.getElementById('m-notes')?.value||'',
    delivered:document.getElementById('m-delivered')?.checked||false,
    basePrice:isMSR?parseFloat(document.getElementById('m-basePrice')?.value)||0:null,
    msrPremium:isMSR?parseFloat(document.getElementById('m-msrPremium')?.value)||0:null,
    tally:tally
  };
  
  S.sells.unshift(s);
  S.pendingOCId=s.id; // Store the sell ID so we can link it when PO is saved
  await saveAllLocal();
  
  // Now open buy modal with pre-filled data
  showBuyModal({
    product:s.product,
    length:s.length,
    volume:s.volume,
    region:s.region,
    date:s.date
  });
}

// Create OC from PO modal - saves the current PO first, then opens sell modal linked to it
async function createOCFromPO(){
  // First save the current buy
  const product=document.getElementById('m-product')?.value||'';
  const isMSR=product.toUpperCase().includes('MSR')||product.toUpperCase().includes('2400');
  const useTally=document.getElementById('m-useTally')?.checked;
  
  let price=0;
  if(isMSR){
    price=parseFloat(document.getElementById('m-price')?.value)||0;
  }else{
    price=parseFloat(document.getElementById('m-price-std')?.value)||0;
  }
  
  let tally=null;
  if(useTally){
    tally={};
    ['8','10','12','14','16','18','20'].forEach(len=>{
      const vol=parseFloat(document.getElementById(`tally-vol-${len}`)?.value)||0;
      const tallyPrice=parseFloat(document.getElementById(`tally-price-${len}`)?.value)||0;
      if(vol>0)tally[len]={vol,price:tallyPrice};
    });
  }
  
  const mill=document.getElementById('m-mill')?.value||'';
  const origin=document.getElementById('m-origin')?.value||'';
  const po=document.getElementById('m-po')?.value||'';
  
  if(!po){alert('Enter PO # first');return}
  if(!product||!price){alert('Enter product and price first');return}
  
  // Save mill to CRM if new
  if(mill&&!S.mills.find(m=>m.name===mill)){
    S.mills.push({name:mill,origin:origin,addedDate:today()});
  }
  
  const b={
    id:genId(),
    po:po,
    date:document.getElementById('m-date')?.value||today(),
    mill:mill,
    origin:origin,
    region:document.getElementById('m-region')?.value||'west',
    product:product,
    length:document.getElementById('m-length')?.value||'',
    price:price,
    volume:parseFloat(document.getElementById('m-volume')?.value)||0,
    notes:document.getElementById('m-notes')?.value||'',
    basePrice:isMSR?parseFloat(document.getElementById('m-basePrice')?.value)||0:null,
    msrPremium:isMSR?parseFloat(document.getElementById('m-msrPremium')?.value)||0:null,
    tally:tally
  };
  
  S.buys.unshift(b);
  await saveAllLocal();

  // Now open sell modal with pre-filled data linked to this PO
  showSellModal({
    linkedPO:po,
    product:b.product,
    length:b.length,
    volume:b.volume,
    region:b.region,
    date:b.date
  });
}

// Common city coordinates for lumber trading (lat, lon)
const CITY_COORDS={
  // Arkansas
  'warren, ar':[33.6126,-92.0646],'monticello, ar':[33.6290,-91.7910],'leola, ar':[34.1723,-92.5879],'dierks, ar':[34.1193,-94.0166],'huttig, ar':[33.0451,-92.1810],
  // Louisiana
  'dequincy, la':[30.4502,-93.4332],'urbana, ar':[33.1404,-92.7596],'leland, ms':[33.4054,-90.8976],
  // Texas
  'dallas, tx':[32.7767,-96.7970],'houston, tx':[29.7604,-95.3698],'austin, tx':[30.2672,-97.7431],
  // Georgia
  'atlanta, ga':[33.7490,-84.3880],'savannah, ga':[32.0809,-81.0912],'macon, ga':[32.8407,-83.6324],
  // Florida
  'jacksonville, fl':[30.3322,-81.6557],'tampa, fl':[27.9506,-82.4572],'orlando, fl':[28.5383,-81.3792],'graceville, fl':[30.9566,-85.5163],'bristol, fl':[30.4313,-84.9755],
  // Tennessee
  'nashville, tn':[36.1627,-86.7816],'memphis, tn':[35.1495,-90.0490],'knoxville, tn':[35.9606,-83.9207],'chattanooga, tn':[35.0456,-85.3097],
  // North Carolina
  'charlotte, nc':[35.2271,-80.8431],'raleigh, nc':[35.7796,-78.6382],
  // South Carolina
  'charleston, sc':[32.7765,-79.9311],'columbia, sc':[34.0007,-81.0348],'georgetown, sc':[33.3768,-79.2945],
  // Alabama
  'birmingham, al':[33.5207,-86.8025],'montgomery, al':[32.3792,-86.3077],'mobile, al':[30.6954,-88.0399],
  // Mississippi
  'jackson, ms':[32.2988,-90.1848],'gulfport, ms':[30.3674,-89.0928],'clarendon, ar':[34.6931,-91.3137],'camden, ar':[33.5843,-92.8343],
  // Ohio
  'cincinnati, oh':[39.1031,-84.5120],'columbus, oh':[39.9612,-82.9988],'cleveland, oh':[41.4993,-81.6944],'dayton, oh':[39.7589,-84.1916],
  // Indiana
  'indianapolis, in':[39.7684,-86.1581],'fort wayne, in':[41.0793,-85.1394],
  // Illinois
  'chicago, il':[41.8781,-87.6298],'springfield, il':[39.7817,-89.6501],
  // Kentucky
  'louisville, ky':[38.2527,-85.7585],'lexington, ky':[38.0406,-84.5037],
  // Missouri
  'st louis, mo':[38.6270,-90.1994],'kansas city, mo':[39.0997,-94.5786],
  // Virginia
  'richmond, va':[37.5407,-77.4360],'norfolk, va':[36.8508,-76.2859],
  // Oklahoma
  'oklahoma city, ok':[35.4676,-97.5164],'tulsa, ok':[36.1540,-95.9928]
};

function calcMileage(){
  const poNum=document.getElementById('m-linkedPO')?.value;
  const buy=poNum?S.buys.find(b=>b.po===poNum):null;
  const origin=(buy?.origin||'').toLowerCase().trim();
  const dest=(document.getElementById('m-dest')?.value||'').toLowerCase().trim();
  const statusEl=document.getElementById('mileage-status');
  
  if(!origin||!dest){
    if(statusEl)statusEl.innerHTML='<span style="color:var(--muted)">Select PO (origin) and enter destination to lookup miles</span>';
    return;
  }
  
  // Try to find coordinates
  const findCoords=(place)=>{
    // Exact match
    if(CITY_COORDS[place])return CITY_COORDS[place];
    // Partial match
    for(const[key,coords] of Object.entries(CITY_COORDS)){
      if(place.includes(key.split(',')[0])||key.includes(place.split(',')[0])){
        return coords;
      }
    }
    return null;
  };
  
  const originCoords=findCoords(origin);
  const destCoords=findCoords(dest);
  
  if(!originCoords||!destCoords){
    if(statusEl)statusEl.innerHTML=`<span style="color:var(--warn)">Location not in database. Enter miles manually or add to CRM.</span>`;
    return;
  }
  
  // Haversine formula
  const R=3959;
  const dLat=(destCoords[0]-originCoords[0])*Math.PI/180;
  const dLon=(destCoords[1]-originCoords[1])*Math.PI/180;
  const a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(originCoords[0]*Math.PI/180)*Math.cos(destCoords[0]*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
  const c=2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  const straightLine=R*c;
  const roadMiles=Math.round(straightLine*1.25); // Road factor ~1.25x straight line
  
  document.getElementById('m-miles').value=roadMiles;
  if(statusEl)statusEl.innerHTML=`<span style="color:var(--positive)">✓ ${buy?.origin} → ${document.getElementById('m-dest')?.value} ≈ ${roadMiles} mi</span>`;
  calcFlatFreight();
}

function calcFlatFreight(){
  const miles=parseFloat(document.getElementById('m-miles')?.value)||0;
  const rate=parseFloat(document.getElementById('m-rate')?.value)||0;
  const volume=parseFloat(document.getElementById('m-volume')?.value)||0;
  
  if(miles>0&&rate>0){
    const flatFreight=Math.round(miles*rate);
    document.getElementById('m-freight').value=flatFreight;
  }
  
  const freight=parseFloat(document.getElementById('m-freight')?.value)||0;
  if(freight>0&&volume>0){
    document.getElementById('m-freightMBF').value='$'+Math.round(freight/volume)+'/MBF';
  }else{
    document.getElementById('m-freightMBF').value='';
  }
  updateSellCalc();
}

// Buy freight functions (for DLVD buys / covering shorts)
function calcBuyFreight(){
  const miles=parseFloat(document.getElementById('m-miles')?.value)||0;
  const rate=parseFloat(document.getElementById('m-rate')?.value)||S.flatRate||3.50;
  const volume=parseFloat(document.getElementById('m-volume')?.value)||0;
  
  if(miles>0&&rate>0){
    const flatFreight=Math.round(miles*rate);
    document.getElementById('m-freight').value=flatFreight;
  }
  
  const freight=parseFloat(document.getElementById('m-freight')?.value)||0;
  const freightMBFEl=document.getElementById('m-freightMBF');
  if(freightMBFEl){
    if(freight>0&&volume>0){
      freightMBFEl.value='$'+Math.round(freight/volume)+'/MBF';
    }else{
      freightMBFEl.value='';
    }
  }
}

function calcBuyMileage(){
  const origin=document.getElementById('m-origin')?.value?.toLowerCase().trim();
  // For buy mileage, we'd need a destination - for now just show a message
  const statusEl=document.getElementById('buy-mileage-status');
  if(statusEl){
    statusEl.innerHTML='<span style="color:var(--muted)">Enter miles manually or use flat rate × miles</span>';
  }
}

function updateSellCalc(){
  const orderNum=document.getElementById('m-orderNum')?.value;
  const product=document.getElementById('m-product')?.value||'';
  const isMSR=product.toUpperCase().includes('MSR')||product.toUpperCase().includes('2400');
  const useTally=document.getElementById('m-useTally')?.checked;
  
  // Get price from appropriate field
  let sellPrice;
  if(isMSR||useTally){
    sellPrice=parseFloat(document.getElementById('m-price')?.value)||0;
  }else{
    sellPrice=parseFloat(document.getElementById('m-price-std')?.value)||parseFloat(document.getElementById('m-price')?.value)||0;
  }
  
  const sellFreight=parseFloat(document.getElementById('m-freight')?.value)||0; // flat rate per load
  const volume=parseFloat(document.getElementById('m-volume')?.value)||0;
  const sellFrtPerMBF=volume>0?sellFreight/volume:0;
  const fob=sellPrice-sellFrtPerMBF;
  
  // Find matching buy by orderNum - normalize to string for comparison
  const orderNumStr=String(orderNum||'').trim();
  const buy=orderNumStr?S.buys.find(b=>String(b.orderNum||b.po||'').trim()===orderNumStr):null;
  
  const buyPrice=buy?.price||0;

  const margin=fob-buyPrice;
  const totalProfit=margin*volume;
  const marginPct=buyPrice>0?(margin/buyPrice)*100:0;
  
  const calcDiv=document.getElementById('sell-calc');
  if(!calcDiv)return;
  
  // Also update freight/MBF display
  const freightMBFEl=document.getElementById('m-freightMBF');
  if(freightMBFEl&&volume>0&&sellFreight>0){
    freightMBFEl.value='$'+Math.round(sellFrtPerMBF)+'/MBF';
  }
  
  if(!buy){
    // Short position - no matching buy
    calcDiv.innerHTML=`
      <div style="font-weight:600;color:var(--negative);margin-bottom:12px">⚠️ SHORT POSITION (No matching Buy)</div>
      <table style="width:100%;font-size:11px">
        <tr><td style="color:var(--muted)">Sell Price (DLVD)</td><td class="right accent">${fmt(sellPrice)}/MBF</td></tr>
        <tr><td style="color:var(--muted)">- Freight (${fmt(sellFreight)} ÷ ${volume?fmtN(volume):'?'} MBF)</td><td class="right warn">${volume>0?fmt(Math.round(sellFrtPerMBF)):'—'}/MBF</td></tr>
        <tr style="border-top:1px solid var(--border)"><td style="font-weight:600">FOB Price</td><td class="right bold">${volume>0?fmt(Math.round(fob)):'—'}/MBF</td></tr>
        <tr><td style="font-weight:600">Total Value</td><td class="right bold">${volume>0?fmt(Math.round(fob*volume)):'—'}</td></tr>
      </table>
      <div style="margin-top:12px;padding:8px;background:rgba(239,68,68,0.1);border:1px solid var(--negative);font-size:10px;color:var(--negative)">
        This is a short sale - create a Buy with the same Order # to match.
      </div>
    `;
    return;
  }
  
  calcDiv.innerHTML=`
    <div style="font-weight:600;color:var(--accent);margin-bottom:12px">PROFIT CALCULATION</div>
    <table style="width:100%;font-size:11px">
      <tr><td style="color:var(--muted)">Buy Price (FOB)</td><td class="right">${fmt(buyPrice)}/MBF</td></tr>
      <tr><td colspan="2" style="height:8px"></td></tr>
      <tr><td style="color:var(--muted)">Sell Price (DLVD)</td><td class="right accent">${fmt(sellPrice)}/MBF</td></tr>
      <tr><td style="color:var(--muted)">- Freight (${fmt(sellFreight)} ÷ ${volume?fmtN(volume):'?'} MBF)</td><td class="right warn">${volume>0?fmt(Math.round(sellFrtPerMBF)):'—'}/MBF</td></tr>
      <tr style="border-top:1px solid var(--border)"><td style="font-weight:600">Sell FOB</td><td class="right bold">${volume>0?fmt(Math.round(fob)):'—'}/MBF</td></tr>
      <tr><td colspan="2" style="height:8px"></td></tr>
      <tr style="background:var(--panel)"><td style="font-weight:600">MARGIN (FOB - Buy)</td><td class="right ${margin>=0?'positive':'negative'} bold">${volume>0?fmt(Math.round(margin)):'—'}/MBF (${marginPct.toFixed(1)}%)</td></tr>
      <tr style="background:var(--panel)"><td style="font-weight:600">TOTAL PROFIT</td><td class="right ${totalProfit>=0?'positive':'negative'} bold">${volume>0?fmt(Math.round(totalProfit)):'—'}</td></tr>
    </table>
  `;
}

function showRLModal(){
  document.getElementById('modal').innerHTML=`<div class="modal-overlay" onclick="closeModal()"><div class="modal wide" onclick="event.stopPropagation()">
    <div class="modal-header"><span class="modal-title">ADD RL DATA</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-group" style="margin-bottom:20px;max-width:200px"><label class="form-label">Report Date</label><input type="date" id="rl-date"></div>
      ${REGIONS.map(r=>`<div style="margin-bottom:20px"><div style="color:var(--${r==='west'?'accent':r==='central'?'warn':'info'});font-weight:600;margin-bottom:8px;text-transform:uppercase">${r}</div><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">${['2x4','2x6','2x8','2x10','2x12'].map(s=>`<div class="form-group"><label class="form-label">${s}#2</label><input type="number" id="rl-${r}-${s}"></div>`).join('')}</div></div>`).join('')}
    </div>
    <div class="modal-footer"><button class="btn btn-default" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveRL()">Save</button></div>
  </div></div>`;
}

let parsedRL=null;
function showParseModal(){
  document.getElementById('modal').innerHTML=`<div class="modal-overlay" onclick="closeModal()"><div class="modal wide" onclick="event.stopPropagation()">
    <div class="modal-header"><span class="modal-title warn">📄 IMPORT RANDOM LENGTHS PDF</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <p style="color:var(--muted);margin-bottom:16px">Upload your Random Lengths PDF. Claude will read it directly and extract all SYP prices.</p>
      ${!S.apiKey?'<div style="background:rgba(239,68,68,0.2);border:1px solid var(--negative);padding:12px;margin-bottom:16px;color:var(--negative)">⚠️ Add your Claude API key in Settings first.</div>':''}
      <div style="display:flex;gap:12px;margin-bottom:16px">
        <button class="btn btn-warn" onclick="document.getElementById('pdf-file').click()" ${!S.apiKey?'disabled':''}>📁 Choose PDF File</button>
        <input type="file" id="pdf-file" accept=".pdf" style="display:none" onchange="loadPDFDirect(event)">
        <span id="pdf-filename" style="color:var(--muted);align-self:center"></span>
      </div>
      <div id="ai-loading" style="display:none;color:var(--accent);margin-bottom:12px">🤖 Claude is reading the PDF and extracting prices... (this may take 10-20 seconds)</div>
      <div id="parse-result"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-default" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="save-parse-btn" onclick="saveParsedRL()" disabled>Save to Database</button></div>
  </div></div>`;
}

async function loadPDFDirect(event){
  const file=event.target.files[0];
  if(!file)return;
  if(!S.apiKey){alert('Add API key in Settings first');return}
  
  document.getElementById('pdf-filename').textContent=file.name;
  document.getElementById('ai-loading').style.display='block';
  document.getElementById('parse-result').innerHTML='';
  
  try{
    // Convert PDF to base64
    const arrayBuffer=await file.arrayBuffer();
    const base64=btoa(new Uint8Array(arrayBuffer).reduce((data,byte)=>data+String.fromCharCode(byte),''));
    
    const prompt=`This is a Random Lengths lumber price report PDF. Extract ALL Southern Yellow Pine (SYP) prices from these sections:

**PAGE 6 - FRAMING LUMBER, Specified Lengths:**
For EACH region (West, Central, East), extract prices for BOTH grades:
- #1 grade: 2x4#1, 2x6#1, 2x8#1, 2x10#1, 2x12#1 (sometimes labeled as "2x4 #1" or just the first row of each size)
- #2 grade: 2x4#2, 2x6#2, 2x8#2, 2x10#2, 2x12#2 (sometimes labeled as "2x4 #2" or second row)

Extract by length: 8', 10', 12', 14', 16', 18', 20' (and 22', 24' for Central/East if available)

**PAGE 7 - FRAMING LUMBER Composite:**
- Southern Pine column: West, Cent, East prices for 2x4, 2x6, 2x8, 2x10, 2x12
- Also #3 grades if shown: 2x4#3, 2x6#3, etc.

**PAGE 9 - SOUTHERN PINE, KILN DRIED Regional:**
- Timbers: 4x4#2, 4x6, 6x6 by lengths for West and East

Return a JSON object with this structure:
{
  "date": "2026-01-17",
  "specified_lengths": {
    "west": {
      "2x4#1": {"8": 430, "10": 395, "12": 395, "14": 400, "16": 465, "18": 445, "20": 450},
      "2x6#1": {"8": 405, "10": 420, "12": 450, "14": 445, "16": 460, "18": 410, "20": 420},
      "2x8#1": {"8": 360, "10": 365, "12": 375, "14": 350, "16": 390, "18": 345, "20": 355},
      "2x10#1": {"8": 350, "10": 370, "12": 380, "14": 355, "16": 365, "18": 325, "20": 400},
      "2x12#1": {"8": 460, "10": 450, "12": 435, "14": 415, "16": 360, "18": 550, "20": null},
      "2x4#2": {"8": 415, "10": 385, "12": 385, "14": 395, "16": 425, "18": 405, "20": 415},
      "2x6#2": {"8": 390, "10": 415, "12": 430, "14": 430, "16": 440, "18": 395, "20": 385},
      "2x8#2": {"8": 310, "10": 290, "12": 330, "14": 340, "16": 365, "18": 315, "20": 340},
      "2x10#2": {"8": 295, "10": 300, "12": 305, "14": 300, "16": 320, "18": 265, "20": 285},
      "2x12#2": {"8": 370, "10": 410, "12": 430, "14": 375, "16": 395, "18": 315, "20": 375}
    },
    "central": {
      "2x4#1": {"8": 445, "10": 425, "12": 430, "14": 475, "16": 480, "18": 475, "20": 475},
      "2x6#1": {"8": 435, "10": 435, "12": 450, "14": 450, "16": 475, "18": 430, "20": 475},
      "2x8#1": {"8": 405, "10": 400, "12": 425, "14": 390, "16": 400, "18": 405, "20": 415},
      "2x10#1": {"8": 425, "10": 465, "12": 465, "14": 430, "16": 445, "18": 405, "20": 435},
      "2x12#1": {"8": 320, "10": 385, "12": 385, "14": 400, "16": 405, "18": null, "20": null},
      "2x4#2": {"8": 430, "10": 390, "12": 405, "14": 420, "16": 445, "18": 415, "20": 420},
      "2x6#2": {"8": 400, "10": 410, "12": 410, "14": 415, "16": 425, "18": 395, "20": 400},
      "2x8#2": {"8": 320, "10": 385, "12": 385, "14": 385, "16": 400, "18": 405, "20": 415},
      "2x10#2": {"8": 310, "10": 325, "12": 315, "14": 320, "16": 325, "18": 300, "20": 300},
      "2x12#2": {"8": 300, "10": 350, "12": 420, "14": 360, "16": 365, "18": 290, "20": 305}
    },
    "east": {
      "2x4#1": {"8": 490, "10": 455, "12": 445, "14": 525, "16": 550, "18": 460, "20": 500},
      "2x6#1": {"8": 455, "10": 455, "12": 470, "14": 455, "16": 495, "18": 475, "20": 480},
      "2x8#1": {"8": 460, "10": 440, "12": 450, "14": 395, "16": 455, "18": 440, "20": 480},
      "2x10#1": {"8": 520, "10": 505, "12": 480, "14": 375, "16": 480, "18": 485, "20": 575},
      "2x12#1": {"8": 470, "10": 425, "12": 430, "14": 475, "16": 535, "18": 450, "20": null},
      "2x4#2": {"8": 475, "10": 440, "12": 450, "14": 395, "16": 455, "18": 475, "20": null},
      "2x6#2": {"8": 460, "10": 440, "12": 450, "14": 395, "16": 455, "18": 475, "20": 480},
      "2x8#2": {"8": 435, "10": 490, "12": 460, "14": 375, "16": 480, "18": 485, "20": 575},
      "2x10#2": {"8": 520, "10": 505, "12": 480, "14": 375, "16": 480, "18": 485, "20": 575},
      "2x12#2": {"8": 355, "10": 375, "12": 360, "14": 360, "16": 385, "18": 325, "20": 375}
    }
  },
  "composite": {
    "west": {"2x4": 404, "2x6": 428, "2x8": 339, "2x10": 295, "2x12": 389, "2x4#3": 370, "2x6#3": 315},
    "central": {"2x4": 417, "2x6": 410, "2x8": 315, "2x10": 315, "2x12": 350, "2x4#3": 345, "2x6#3": 355},
    "east": {"2x4": 470, "2x6": 458, "2x8": 355, "2x10": 380, "2x12": 400, "2x4#3": 395, "2x6#3": 353}
  },
  "timbers": {
    "west": {
      "4x4#2": {"8": 495, "10": 470, "12": 450, "14": 420, "16": 500},
      "4x6": {"8": 465, "10": null, "12": 495, "14": 445, "16": 465},
      "6x6": {"8": 595, "10": 580, "12": 575, "14": 515, "16": 605}
    },
    "east": {
      "4x4#2": {"8": 490, "10": 475, "12": 435, "14": 410, "16": 495},
      "4x6": {"8": 470, "10": 450, "12": 490, "14": 450, "16": 465},
      "6x6": {"8": 550, "10": 600, "12": 540, "14": 475, "16": 585}
    }
  }
}

IMPORTANT: 
- Extract BOTH #1 AND #2 grades for 2x4, 2x6, 2x8, 2x10, 2x12 in specified_lengths
- In the PDF, #1 is typically the FIRST row for each size, #2 is the SECOND row
- Look carefully at the table headers - they show "#1" and "#2" or "& Btr" for grade 1
- Use null for any missing/blank cells
- Prices shown as ranges like "380-390" should use the midpoint (385)
- The date should be the publication date from the report header
- Return ONLY the JSON object, no other text`;


    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':S.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:4096,
        messages:[{
          role:'user',
          content:[
            {type:'document',source:{type:'base64',media_type:'application/pdf',data:base64}},
            {type:'text',text:prompt}
          ]
        }]
      })
    });
    
    const data=await res.json();
    document.getElementById('ai-loading').style.display='none';
    
    if(data.error){
      document.getElementById('parse-result').innerHTML=`<div class="parsed-preview" style="color:var(--negative)">API Error: ${data.error.message}</div>`;
      return;
    }
    
    const reply=data.content?.[0]?.text||'';
    console.log('AI Response:',reply);
    
    // Extract JSON from response
    const jsonMatch=reply.match(/\{[\s\S]*\}/);
    if(!jsonMatch){
      document.getElementById('parse-result').innerHTML=`<div class="parsed-preview" style="color:var(--negative)">Could not parse AI response:<br><pre style="font-size:10px;margin-top:8px;white-space:pre-wrap">${reply}</pre></div>`;
      return;
    }
    
    parsedRL=JSON.parse(jsonMatch[0]);
    
    // Count prices
    let specCount=0,compCount=0,timbCount=0;
    if(parsedRL.specified_lengths){
      ['west','central','east'].forEach(r=>{
        if(parsedRL.specified_lengths[r]){
          Object.values(parsedRL.specified_lengths[r]).forEach(prod=>{
            specCount+=Object.values(prod).filter(v=>v!==null).length;
          });
        }
      });
    }
    if(parsedRL.composite){
      ['west','central','east'].forEach(r=>{
        if(parsedRL.composite[r])compCount+=Object.values(parsedRL.composite[r]).filter(v=>v!==null).length;
      });
    }
    if(parsedRL.timbers){
      ['west','east'].forEach(r=>{
        if(parsedRL.timbers[r]){
          Object.values(parsedRL.timbers[r]).forEach(prod=>{
            timbCount+=Object.values(prod).filter(v=>v!==null).length;
          });
        }
      });
    }
    
    const totalCount=specCount+compCount+timbCount;
    
    if(totalCount===0){
      document.getElementById('parse-result').innerHTML=`<div class="parsed-preview" style="color:var(--negative)">AI could not find SYP prices.<br><br>Raw response:<pre style="font-size:10px;margin-top:8px;white-space:pre-wrap">${reply}</pre></div>`;
      document.getElementById('save-parse-btn').disabled=true;
      return;
    }
    
    // Build preview
    let preview=`<div class="parsed-preview" style="max-height:400px;overflow:auto">
      <div style="color:var(--positive);margin-bottom:12px">✓ Found ${totalCount} prices (Specified: ${specCount}, Composite: ${compCount}, Timbers: ${timbCount})</div>
      <div style="margin-bottom:16px"><label class="form-label">Report Date</label><input type="date" id="parsed-date" value="${parsedRL.date||today()}" style="margin-left:8px"></div>`;
    
    // Composite preview
    if(compCount>0){
      preview+=`<div style="font-weight:600;color:var(--accent);margin:12px 0 8px">COMPOSITE PRICES</div>
        <table style="width:100%;font-size:10px;margin-bottom:16px">
        <tr><th>Product</th><th class="right">West</th><th class="right">Central</th><th class="right">East</th></tr>
        ${['2x4','2x6','2x8','2x10','2x12','2x4#3','2x6#3'].map(p=>`<tr><td>${p}</td><td class="right">${parsedRL.composite?.west?.[p]?'$'+parsedRL.composite.west[p]:'—'}</td><td class="right">${parsedRL.composite?.central?.[p]?'$'+parsedRL.composite.central[p]:'—'}</td><td class="right">${parsedRL.composite?.east?.[p]?'$'+parsedRL.composite.east[p]:'—'}</td></tr>`).join('')}
        </table>`;
    }
    
    // Specified lengths preview (abbreviated)
    if(specCount>0){
      preview+=`<div style="font-weight:600;color:var(--warn);margin:12px 0 8px">SPECIFIED LENGTHS (sample - West 2x4#2)</div>`;
      const sample=parsedRL.specified_lengths?.west?.['2x4#2']||parsedRL.specified_lengths?.west?.['2x4']||{};
      preview+=`<table style="width:100%;font-size:10px;margin-bottom:16px">
        <tr>${Object.keys(sample).map(l=>`<th class="right">${l}'</th>`).join('')}</tr>
        <tr>${Object.values(sample).map(v=>`<td class="right">${v?'$'+v:'—'}</td>`).join('')}</tr>
      </table>`;
    }
    
    // Timbers preview
    if(timbCount>0){
      preview+=`<div style="font-weight:600;color:var(--info);margin:12px 0 8px">TIMBERS (4x4, 4x6, 6x6)</div>
        <div style="color:var(--muted);font-size:10px">West: ${Object.keys(parsedRL.timbers?.west||{}).join(', ')||'None'}</div>
        <div style="color:var(--muted);font-size:10px">East: ${Object.keys(parsedRL.timbers?.east||{}).join(', ')||'None'}</div>`;
    }
    
    preview+=`</div>`;
    
    document.getElementById('parse-result').innerHTML=preview;
    document.getElementById('save-parse-btn').disabled=false;
    
  }catch(err){
    document.getElementById('ai-loading').style.display='none';
    document.getElementById('parse-result').innerHTML=`<div class="parsed-preview" style="color:var(--negative)">Error: ${err.message}<br><br>Try again or check your API key.</div>`;
  }
}

function parseText(){aiParsePDF(document.getElementById('pdf-text')?.value||'')}
async function aiParsePDF(text){if(text)alert('Please use the PDF upload button instead.')}

async function saveParsedRL(){
  if(!parsedRL)return;
  parsedRL.date=document.getElementById('parsed-date').value;
  if(!parsedRL.date){alert('Enter a date');return}
  
  // Convert new format to also include simple west/central/east for backward compatibility
  if(parsedRL.composite){
    if(!parsedRL.west)parsedRL.west={};
    if(!parsedRL.central)parsedRL.central={};
    if(!parsedRL.east)parsedRL.east={};
    ['west','central','east'].forEach(r=>{
      if(parsedRL.composite[r]){
        Object.entries(parsedRL.composite[r]).forEach(([k,v])=>{
          if(v!==null){
            // Normalize key format: 2x4 -> 2x4#2, 2x4#3 stays as is
            const key=k.includes('#')?k:k+'#2';
            parsedRL[r][key]=v;
          }
        });
      }
    });
  }
  
  const i=S.rl.findIndex(r=>r.date===parsedRL.date);
  if(i>=0)S.rl[i]=parsedRL;else{S.rl.push(parsedRL);S.rl.sort((a,b)=>new Date(a.date)-new Date(b.date))}
  await saveAllLocal();closeModal();render();
}

// ==================== CSV ORDER IMPORT ====================

function showImportModal(){
  document.getElementById('modal').innerHTML=`<div class="modal-overlay" onclick="closeModal()"><div class="modal wide" onclick="event.stopPropagation()">
    <div class="modal-header"><span class="modal-title">📥 IMPORT ORDERS</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body" id="import-body">
      <div style="padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div>
            <div style="font-size:14px;font-weight:600">Import Orders</div>
            <div style="font-size:11px;color:var(--muted)">Paste any text — CSV, emails, order confirmations, or free-form descriptions.</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <label class="form-label" style="margin:0;font-size:10px;white-space:nowrap">Order Date</label>
            <input type="date" id="import-date" value="${today()}" style="padding:4px 8px;font-size:11px">
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button id="import-mode-ai" class="btn btn-primary btn-sm" onclick="setImportMode('ai')" style="font-size:10px">AI Parser</button>
          <button id="import-mode-csv" class="btn btn-default btn-sm" onclick="setImportMode('csv')" style="font-size:10px">Classic CSV</button>
        </div>
        <div id="import-ai-section">
          <textarea id="import-text" placeholder="Paste orders here — CSV data, email text, order confirmations, or free-form descriptions...&#10;&#10;Examples:&#10;• CSV rows with headers&#10;• &quot;Sold 5 units 2x4#2 10' to ABC Lumber at $580, buying from XYZ Mill at $450&quot;&#10;• Forwarded order confirmation emails&#10;• Any structured or unstructured order data" style="width:100%;height:200px;font-family:monospace;font-size:11px;padding:12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);resize:vertical"></textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
            <div style="display:flex;align-items:center;gap:8px">
              <input type="file" id="import-file-ai" accept=".csv,.txt" style="display:none" onchange="loadFileToTextarea(event)">
              <button class="btn btn-default btn-sm" onclick="document.getElementById('import-file-ai').click()" style="font-size:10px">📎 Load File</button>
              <span style="font-size:9px;color:var(--muted)">Or load a CSV/text file into the editor</span>
            </div>
            <button class="btn btn-primary" onclick="processAIImport()" style="padding:8px 24px;font-size:12px">Parse with AI</button>
          </div>
        </div>
        <div id="import-csv-section" style="display:none">
          <div style="text-align:center;padding:40px 20px;border:2px dashed var(--border);border-radius:8px">
            <div style="font-size:12px;color:var(--muted);margin-bottom:16px">Upload a CSV file in the standard order format</div>
            <input type="file" id="import-file" accept=".csv" style="display:none" onchange="processCSVImport(event)">
            <button class="btn btn-primary" onclick="document.getElementById('import-file').click()" style="padding:10px 28px;font-size:12px">Choose CSV File</button>
          </div>
        </div>
      </div>
    </div>
  </div></div>`;
  window._importMode='ai';
}

function setImportMode(mode){
  window._importMode=mode;
  const aiBtn=document.getElementById('import-mode-ai');
  const csvBtn=document.getElementById('import-mode-csv');
  const aiSection=document.getElementById('import-ai-section');
  const csvSection=document.getElementById('import-csv-section');
  if(mode==='ai'){
    aiBtn.className='btn btn-primary btn-sm';
    csvBtn.className='btn btn-default btn-sm';
    aiSection.style.display='';
    csvSection.style.display='none';
  }else{
    aiBtn.className='btn btn-default btn-sm';
    csvBtn.className='btn btn-primary btn-sm';
    aiSection.style.display='none';
    csvSection.style.display='';
  }
}

function loadFileToTextarea(event){
  const file=event.target.files[0];
  if(!file)return;
  file.text().then(text=>{
    document.getElementById('import-text').value=text;
  });
}

async function processCSVImport(event){
  const file=event.target.files[0];
  if(!file)return;
  try{
    const csvText=await file.text();
    const orders=parseOrderCSV(csvText);
    window._importOrders=orders;
    showImportPreview(orders);
  }catch(e){
    document.getElementById('import-body').innerHTML=`<div style="text-align:center;padding:40px;color:var(--negative)">
      <div style="font-size:14px;font-weight:600;margin-bottom:8px">Parse Error</div>
      <div style="font-size:11px">${e.message}</div>
      <button class="btn btn-default" onclick="showImportModal()" style="margin-top:16px">Try Again</button>
    </div>`;
  }
}

async function processAIImport(){
  const text=(document.getElementById('import-text')?.value||'').trim();
  if(!text){alert('Paste some order text first.');return}
  if(!S.apiKey){alert('Add your Anthropic API key in Settings first.');return}

  const body=document.getElementById('import-body');
  const parseBtn=body.querySelector('.btn-primary:last-child');
  const origBtnText=parseBtn?parseBtn.textContent:'';
  if(parseBtn){parseBtn.disabled=true;parseBtn.textContent='Parsing...';}

  // Show loading state
  const loadingEl=document.createElement('div');
  loadingEl.id='ai-import-loading';
  loadingEl.style.cssText='text-align:center;padding:20px;color:var(--muted);font-size:12px';
  loadingEl.innerHTML='<div style="margin-bottom:8px">AI is parsing your orders...</div><div class="spinner" style="margin:0 auto"></div>';
  const textarea=document.getElementById('import-text');
  if(textarea)textarea.parentNode.insertBefore(loadingEl,textarea.nextSibling);

  try{
    const orders=await parseOrdersWithAI(text);
    window._importOrders=orders;
    showImportPreview(orders);
  }catch(e){
    const loadEl=document.getElementById('ai-import-loading');
    if(loadEl)loadEl.remove();
    if(parseBtn){parseBtn.disabled=false;parseBtn.textContent=origBtnText;}
    document.getElementById('import-body').innerHTML=`<div style="text-align:center;padding:40px;color:var(--negative)">
      <div style="font-size:14px;font-weight:600;margin-bottom:8px">AI Parse Error</div>
      <div style="font-size:11px;max-height:200px;overflow:auto;text-align:left;background:var(--surface);padding:12px;border-radius:6px;margin-bottom:16px;white-space:pre-wrap;font-family:monospace">${e.message.replace(/</g,'&lt;')}</div>
      <div style="display:flex;gap:8px;justify-content:center">
        <button class="btn btn-default" onclick="showImportModal()" style="font-size:11px">Try Again</button>
        <button class="btn btn-default" onclick="setImportMode('csv');showImportModal()" style="font-size:11px">Use Classic CSV</button>
      </div>
    </div>`;
  }
}

function showImportPreview(orders){
  const matched=orders.filter(o=>o.status==='matched').length;
  const short_=orders.filter(o=>o.status==='short').length;
  const long_=orders.filter(o=>o.status==='long').length;
  const importDate=document.getElementById('import-date')?.value||today();

  // Check for existing orders in the system
  const existingSellOrders=new Set(S.sells.map(s=>String(s.orderNum)));
  const existingBuyOrders=new Set(S.buys.map(b=>String(b.orderNum)));

  const statusBadge=s=>({matched:'<span class="badge badge-success">MATCHED</span>',short:'<span class="badge badge-negative">SHORT</span>',long:'<span class="badge badge-pending">LONG</span>'}[s]||s);
  const existsBadge=(orderNum,hasSell,hasBuy)=>{
    const sellExists=existingSellOrders.has(String(orderNum));
    const buyExists=existingBuyOrders.has(String(orderNum));
    if(sellExists&&buyExists)return'<span class="badge" style="background:var(--muted);color:var(--bg)">BOTH EXIST</span>';
    if(sellExists&&hasSell)return'<span class="badge" style="background:#6366f1;color:white">SELL EXISTS</span>';
    if(buyExists&&hasBuy)return'<span class="badge" style="background:#6366f1;color:white">BUY EXISTS</span>';
    return'';
  };

  const body=document.getElementById('import-body');
  body.innerHTML=`
    <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
      <div class="kpi" style="flex:1;min-width:100px"><div class="kpi-label">TOTAL ORDERS</div><div class="kpi-value">${orders.length}</div></div>
      <div class="kpi" style="flex:1;min-width:100px"><div class="kpi-label">MATCHED</div><div class="kpi-value" style="color:var(--positive)">${matched}</div></div>
      <div class="kpi" style="flex:1;min-width:100px"><div class="kpi-label">SHORT</div><div class="kpi-value" style="color:var(--negative)">${short_}</div></div>
      <div class="kpi" style="flex:1;min-width:100px"><div class="kpi-label">LONG</div><div class="kpi-value" style="color:var(--warn)">${long_}</div></div>
    </div>
    <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
      <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer">
        <input type="checkbox" id="import-all" checked onchange="toggleImportAll(this.checked)"> Select All
      </label>
      <span style="font-size:10px;color:var(--muted)">Date: ${importDate}</span>
    </div>
    <div style="max-height:400px;overflow:auto">
      <table>
        <thead><tr>
          <th style="width:30px"></th>
          <th>Order #</th>
          <th>Status</th>
          <th>Seller</th>
          <th>Customer</th>
          <th>Buyer</th>
          <th>Mill</th>
          <th>Product</th>
          <th>Units</th>
          <th>MBF</th>
          <th>Sell $</th>
          <th>Buy $</th>
          <th style="width:50px"></th>
        </tr></thead>
        <tbody>
          ${orders.map((o,i)=>{
            const sell=o.sell||{};
            const buy=o.buy||{};
            const items=sell.items||buy.items||[];
            const totalUnits=items.reduce((s,it)=>s+(it.units||0),0);
            const totalMBF=Math.round(items.reduce((s,it)=>s+(it.volume||0),0)*100)/100;
            const sellPrices=[...new Set((sell.items||[]).map(it=>it.price).filter(p=>p>0))].map(p=>'$'+p).join(', ');
            const buyPrices=[...new Set((buy.items||[]).map(it=>it.price).filter(p=>p>0))].map(p=>'$'+p).join(', ');
            const uniqueProds=new Set(items.map(it=>it.product).filter(Boolean));
            const isMixed=uniqueProds.size>1;
            const lenSummary=items.length>1?'RL ('+items.length+')':items[0]?.length+"'"||'—';
            const itemBreakdown=isMixed?items.map(it=>`${it.product} ${it.length}' ${it.units}u`).join(', '):'';
            const needsEdit=o.status==='short'||o.status==='long'||!sellPrices||!buyPrices;
            // Check if order already exists
            const sellExists=existingSellOrders.has(String(o.orderNum));
            const buyExists=existingBuyOrders.has(String(o.orderNum));
            const hasSell=!!o.sell;
            const hasBuy=!!o.buy;
            const fullyExists=(hasSell&&sellExists&&!hasBuy)||(hasBuy&&buyExists&&!hasSell)||(hasSell&&sellExists&&hasBuy&&buyExists);
            const partialExists=(hasSell&&sellExists&&hasBuy&&!buyExists)||(hasBuy&&buyExists&&hasSell&&!sellExists);
            const existsInfo=existsBadge(o.orderNum,hasSell,hasBuy);
            return`<tr${isMixed?' style="border-left:3px solid var(--warn)"':''}${needsEdit&&!fullyExists?' style="background:rgba(255,193,7,0.1)"':''}${fullyExists?' style="background:rgba(99,102,241,0.1);opacity:0.6"':''}>
              <td><input type="checkbox" class="import-check" data-idx="${i}" ${fullyExists?'':'checked'}${fullyExists?' title="Already imported"':''}></td>
              <td style="font-weight:600">${o.orderNum}</td>
              <td>${statusBadge(o.status)}${existsInfo?' '+existsInfo:''}</td>
              <td>${sell.trader?TRADER_MAP[sell.trader]||sell.trader:'—'}</td>
              <td style="font-size:10px">${sell.customer||'—'}</td>
              <td>${buy.trader?TRADER_MAP[buy.trader]||buy.trader:'—'}</td>
              <td style="font-size:10px">${buy.mill||'—'}</td>
              <td>${sell.product||buy.product||'—'} <span style="color:var(--muted);font-size:9px">${lenSummary}</span>${isMixed?`<div style="font-size:9px;color:var(--warn);margin-top:2px">${itemBreakdown}</div>`:''}</td>
              <td style="text-align:right">${totalUnits}</td>
              <td style="text-align:right;font-weight:600">${totalMBF}</td>
              <td>${sellPrices||'<span style="color:var(--negative)">—</span>'}</td>
              <td>${buyPrices||'<span style="color:var(--negative)">—</span>'}</td>
              <td><button class="btn btn-default btn-sm" onclick="editImportOrder(${i})" title="Edit order details">✏️</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:16px;display:flex;justify-content:flex-end;gap:8px">
      <button class="btn btn-default" onclick="closeModal()">Cancel</button>
      <button class="btn btn-success" onclick="showFreightStep()">Next: Freight →</button>
    </div>`;
}

// Edit a single order in the import preview
function editImportOrder(idx){
  const orders=window._importOrders;
  if(!orders||!orders[idx])return;
  const o=orders[idx];
  const sell=o.sell||{};
  const buy=o.buy||{};
  const items=sell.items||buy.items||[];
  const firstItem=items[0]||{};

  // Get traders list for dropdowns
  const traderOptions=Object.entries(TRADER_MAP).map(([full,short])=>`<option value="${full}">${short}</option>`).join('');

  const body=document.getElementById('import-body');
  body.innerHTML=`
    <div style="margin-bottom:16px">
      <div style="font-weight:600;font-size:14px">Edit Order #${o.orderNum}</div>
      <div style="font-size:10px;color:var(--muted)">Fill in missing details before importing</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
      <!-- SELL SIDE -->
      <div class="card" style="padding:16px">
        <div style="font-weight:600;margin-bottom:12px;color:var(--negative)">SELL SIDE</div>
        <div class="form-group">
          <label class="form-label">Seller</label>
          <select id="edit-seller" class="form-control">
            <option value="">Select trader...</option>
            ${traderOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Customer</label>
          <input type="text" id="edit-customer" class="form-control" value="${sell.customer||''}" placeholder="Customer name">
        </div>
        <div class="form-group">
          <label class="form-label">Destination (City, State)</label>
          <input type="text" id="edit-destination" class="form-control" value="${sell.destination||''}" placeholder="e.g. Dallas, TX">
        </div>
        <div class="form-group">
          <label class="form-label">Sell Price ($/MBF)</label>
          <input type="number" id="edit-sell-price" class="form-control" value="${firstItem.price||''}" placeholder="e.g. 580">
        </div>
      </div>
      <!-- BUY SIDE -->
      <div class="card" style="padding:16px">
        <div style="font-weight:600;margin-bottom:12px;color:var(--positive)">BUY SIDE</div>
        <div class="form-group">
          <label class="form-label">Buyer</label>
          <select id="edit-buyer" class="form-control">
            <option value="">Select trader...</option>
            ${traderOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Mill</label>
          <input type="text" id="edit-mill" class="form-control" value="${buy.mill||''}" placeholder="Mill name">
        </div>
        <div class="form-group">
          <label class="form-label">Origin (City, State)</label>
          <input type="text" id="edit-origin" class="form-control" value="${buy.origin||''}" placeholder="e.g. Gurdon, AR">
        </div>
        <div class="form-group">
          <label class="form-label">Buy Price ($/MBF)</label>
          <input type="number" id="edit-buy-price" class="form-control" value="${(buy.items&&buy.items[0]?.price)||''}" placeholder="e.g. 515">
        </div>
      </div>
    </div>
    <!-- PRODUCT INFO -->
    <div class="card" style="padding:16px;margin-top:16px">
      <div style="font-weight:600;margin-bottom:12px">PRODUCT INFO</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Product</label>
          <input type="text" id="edit-product" class="form-control" list="product-list" placeholder="e.g. 2x4#2" onchange="calcImportVolume()">
          <datalist id="product-list">
            <option value="2x4#1">
            <option value="2x4#2">
            <option value="2x4#3">
            <option value="2x6#1">
            <option value="2x6#2">
            <option value="2x6#3">
            <option value="2x8#1">
            <option value="2x8#2">
            <option value="2x10#1">
            <option value="2x10#2">
            <option value="2x12#1">
            <option value="2x12#2">
            <option value="4x4">
            <option value="4x6">
            <option value="6x6">
          </datalist>
        </div>
        <div class="form-group">
          <label class="form-label">Length</label>
          <input type="text" id="edit-length" class="form-control" list="length-list" placeholder="e.g. 16" onchange="calcImportVolume()">
          <datalist id="length-list">
            <option value="8">
            <option value="10">
            <option value="12">
            <option value="14">
            <option value="16">
            <option value="18">
            <option value="20">
            <option value="RL">
          </datalist>
        </div>
        <div class="form-group">
          <label class="form-label">Units (Tallies)</label>
          <input type="number" id="edit-units" class="form-control" value="${firstItem.units||''}" placeholder="e.g. 11" onchange="calcImportVolume()">
        </div>
        <div class="form-group">
          <label class="form-label">Volume (MBF)</label>
          <input type="number" id="edit-volume" class="form-control" value="${firstItem.volume||''}" placeholder="Auto-calc or enter" step="0.01">
        </div>
      </div>
    </div>
    <div style="margin-top:16px;display:flex;justify-content:flex-end;gap:8px">
      <button class="btn btn-default" onclick="showImportPreview(window._importOrders)">← Back</button>
      <button class="btn btn-primary" onclick="saveImportOrderEdit(${idx})">Save Changes</button>
    </div>`;

  // Set current values in fields
  if(sell.trader)document.getElementById('edit-seller').value=sell.trader;
  if(buy.trader)document.getElementById('edit-buyer').value=buy.trader;
  if(firstItem.product)document.getElementById('edit-product').value=firstItem.product;
  if(firstItem.length)document.getElementById('edit-length').value=firstItem.length;
}

// Auto-calculate MBF from product, length, and units
function calcImportVolume(){
  const product=document.getElementById('edit-product')?.value||'';
  const lengthStr=document.getElementById('edit-length')?.value||'';
  const units=parseFloat(document.getElementById('edit-units')?.value)||0;

  if(!product||!lengthStr||lengthStr==='RL'||!units)return;

  const lengthFt=parseFloat(lengthStr);
  if(!lengthFt)return;

  // Parse dimension from product (e.g. "2x4#2" -> thick=2, wide=4)
  const dimMatch=product.match(/(\d+)x(\d+)/i);
  if(!dimMatch)return;

  const thick=parseInt(dimMatch[1]);
  const wide=parseInt(dimMatch[2]);

  // Pieces per unit by dimension
  const PCS_PER_UNIT={'2x4':208,'2x6':128,'2x8':96,'2x10':80,'2x12':64};
  const dim=`${thick}x${wide}`;
  const pcsPerUnit=PCS_PER_UNIT[dim];

  // Timbers (4x4, 4x6, 6x6) = flat 20 MBF
  if(thick>=4){
    document.getElementById('edit-volume').value='20';
    return;
  }

  if(!pcsPerUnit)return;

  // Calculate MBF
  const totalPieces=units*pcsPerUnit;
  const bfPerPiece=(thick*wide*lengthFt)/12;
  const mbf=Math.round(totalPieces*bfPerPiece/1000*100)/100;

  document.getElementById('edit-volume').value=mbf;
}

// Save edits to an import order
function saveImportOrderEdit(idx){
  const orders=window._importOrders;
  if(!orders||!orders[idx])return;

  const seller=document.getElementById('edit-seller').value;
  const customer=document.getElementById('edit-customer').value;
  const destination=document.getElementById('edit-destination').value;
  const sellPrice=parseFloat(document.getElementById('edit-sell-price').value)||0;

  const buyer=document.getElementById('edit-buyer').value;
  const mill=document.getElementById('edit-mill').value;
  const origin=document.getElementById('edit-origin').value;
  const buyPrice=parseFloat(document.getElementById('edit-buy-price').value)||0;

  const product=document.getElementById('edit-product').value;
  const length=document.getElementById('edit-length').value;
  const units=parseFloat(document.getElementById('edit-units').value)||0;
  const volume=parseFloat(document.getElementById('edit-volume').value)||0;

  // Determine region from destination/origin
  const WEST_STATES=new Set(['TX','AR','LA','OK','NM','CO','AZ','UT','NV','CA','OR','WA','ID','MT','WY']);
  const EAST_STATES=new Set(['NC','SC','GA','FL','VA','MD','DE','NJ','NY','PA','CT','MA','ME','NH','VT','RI','WV','DC']);
  const getRegion=loc=>{
    const st=(loc||'').split(',').pop()?.trim().toUpperCase()||'';
    if(WEST_STATES.has(st))return 'west';
    if(EAST_STATES.has(st))return 'east';
    return 'central';
  };

  const item={product,length,price:sellPrice,volume,units,buyPrice};

  // Build/update sell side
  if(customer||seller){
    orders[idx].sell={
      trader:seller,
      customer:customer,
      destination:destination,
      product:product,
      region:getRegion(destination),
      items:[{product,length,price:sellPrice,volume,units}]
    };
  }

  // Build/update buy side
  if(mill||buyer){
    orders[idx].buy={
      trader:buyer||seller,
      mill:mill,
      origin:origin,
      product:product,
      region:getRegion(origin),
      items:[{product,length,price:buyPrice,volume,units}]
    };
  }

  // Update status
  const hasSell=orders[idx].sell&&orders[idx].sell.customer;
  const hasBuy=orders[idx].buy&&orders[idx].buy.mill;
  if(hasSell&&hasBuy)orders[idx].status='matched';
  else if(hasSell)orders[idx].status='short';
  else if(hasBuy)orders[idx].status='long';

  showToast('Order updated','success');
  showImportPreview(orders);
}

function toggleImportAll(checked){
  document.querySelectorAll('.import-check').forEach(cb=>cb.checked=checked);
}

async function showFreightStep(){
  const orders=window._importOrders;
  if(!orders||!orders.length){showToast('No orders','warn');return}
  const checked=new Set();
  document.querySelectorAll('.import-check:checked').forEach(cb=>checked.add(parseInt(cb.dataset.idx)));
  if(!checked.size){showToast('No orders selected','warn');return}

  // Save checked set for confirmImportOrders
  window._importChecked=checked;

  const matchedOrders=orders.map((o,i)=>({...o,idx:i})).filter(o=>checked.has(o.idx)&&o.status==='matched');
  if(!matchedOrders.length){
    // No matched orders — skip freight, go straight to import
    confirmImportOrders();
    return;
  }

  const body=document.getElementById('import-body');
  body.innerHTML=`
    <div style="margin-bottom:12px">
      <div style="font-weight:600;font-size:13px;margin-bottom:4px">Freight Entry — ${matchedOrders.length} Matched Orders</div>
      <div style="font-size:10px;color:var(--muted)">Mileage is being looked up automatically. Enter freight per load ($).</div>
    </div>
    <div style="max-height:450px;overflow:auto">
      <table>
        <thead><tr>
          <th>Order #</th>
          <th>Origin</th>
          <th>Destination</th>
          <th>Product</th>
          <th>MBF</th>
          <th>Miles</th>
          <th>Freight $</th>
        </tr></thead>
        <tbody>
          ${matchedOrders.map(o=>{
            const sell=o.sell||{};
            const buy=o.buy||{};
            const items=sell.items||buy.items||[];
            const totalMBF=Math.round(items.reduce((s,it)=>s+(it.volume||0),0)*100)/100;
            return`<tr>
              <td style="font-weight:600">${o.orderNum}</td>
              <td style="font-size:10px">${buy.origin||'—'}</td>
              <td style="font-size:10px">${sell.destination||'—'}</td>
              <td>${sell.product||buy.product||'—'}</td>
              <td style="text-align:right">${totalMBF}</td>
              <td style="text-align:right"><span id="miles-${o.orderNum}" class="miles-val" style="color:var(--muted)">...</span></td>
              <td><input type="number" id="freight-${o.orderNum}" class="freight-input" data-order="${o.orderNum}" style="width:80px;padding:4px 6px;text-align:right" placeholder="0" min="0" step="1"></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center">
      <button class="btn btn-default btn-sm" onclick="showImportPreview(window._importOrders)">← Back</button>
      <div style="display:flex;gap:8px">
        <button class="btn btn-default" onclick="closeModal()">Cancel</button>
        <button class="btn btn-success" onclick="confirmImportOrders()">Import All</button>
      </div>
    </div>`;

  // Auto-lookup mileage for each matched order
  for(const o of matchedOrders){
    const origin=(o.buy?.origin||'').trim();
    const dest=(o.sell?.destination||'').trim();
    const milesEl=document.getElementById('miles-'+o.orderNum);
    if(!origin||!dest){
      if(milesEl)milesEl.textContent='N/A';
      continue;
    }
    try{
      const miles=await getMileageFromAPI(origin,dest);
      if(milesEl){
        if(miles){
          milesEl.textContent=miles;
          milesEl.style.color='var(--text)';
          milesEl.style.fontWeight='600';
          // Auto-calc freight suggestion: base + (miles × stateRate) from origin
          const originState=(o.buy?.origin||'').split(',').pop()?.trim().toUpperCase()||'';
          const stateRate=originState&&S.stateRates?S.stateRates[originState]||0:0;
          const freightTotal=Math.round((S.freightBase||0)+(miles*stateRate));
          const freightInput=document.getElementById('freight-'+o.orderNum);
          if(freightInput&&!freightInput.value)freightInput.value=freightTotal;
        }else{
          milesEl.textContent='??';
          milesEl.style.color='var(--warn)';
        }
      }
    }catch(e){
      if(milesEl){milesEl.textContent='err';milesEl.style.color='var(--negative)'}
    }
  }
}

async function confirmImportOrders(){
  const orders=window._importOrders;
  if(!orders||!orders.length){showToast('No orders to import','warn');return}
  const importDate=document.getElementById('import-date')?.value||today();

  // Use saved checked set from freight step, or read checkboxes if still on preview
  let checked=window._importChecked;
  if(!checked){
    checked=new Set();
    document.querySelectorAll('.import-check:checked').forEach(cb=>checked.add(parseInt(cb.dataset.idx)));
  }
  if(!checked.size){showToast('No orders selected','warn');return}

  // Read freight values from freight step inputs
  const freightByOrder={};
  document.querySelectorAll('.freight-input').forEach(el=>{
    const ord=el.dataset.order;
    if(ord)freightByOrder[ord]=parseFloat(el.value)||0;
  });
  // Read looked-up miles
  const milesByOrder={};
  document.querySelectorAll('.miles-val').forEach(el=>{
    const ord=el.id?.replace('miles-','');
    const val=parseInt(el.textContent);
    if(ord&&!isNaN(val))milesByOrder[ord]=val;
  });

  let buyCount=0,sellCount=0,skipSell=0,skipBuy=0;

  // Check for existing orders to avoid duplicates
  const existingSellOrders=new Set(S.sells.map(s=>String(s.orderNum)));
  const existingBuyOrders=new Set(S.buys.map(b=>String(b.orderNum)));

  orders.forEach((o,i)=>{
    if(!checked.has(i))return;
    const mapTrader=name=>{const m=TRADER_MAP[name];if(m)return m;if(TRADERS.includes(name))return name;return'Admin';};

    const orderFreight=freightByOrder[String(o.orderNum)]||0;
    const orderMiles=milesByOrder[String(o.orderNum)]||0;

    // Check if sides already exist
    const sellAlreadyExists=existingSellOrders.has(String(o.orderNum));
    const buyAlreadyExists=existingBuyOrders.has(String(o.orderNum));

    // Helper: build tally key — use "product len" if mixed widths, just "len" if single product
    function tallyKey(items,it){
      const prods=new Set(items.map(x=>x.product).filter(Boolean));
      return prods.size>1?`${it.product||''} ${it.length}'`:it.length;
    }

    // Build sell (skip if already exists)
    if(o.sell&&!sellAlreadyExists){
      const items=o.sell.items||[];
      let tally=null,totalVol=0,totalVal=0;
      if(items.length>1){
        tally={};
        items.forEach(it=>{
          const vol=Math.round((it.volume||0)*100)/100;
          if(vol>0){
            const key=tallyKey(items,it);
            if(tally[key]){tally[key].vol+=vol;tally[key].price=it.price||tally[key].price}
            else{tally[key]={vol,price:it.price||0}}
            totalVol+=vol;
            totalVal+=(vol*(it.price||0));
          }
        });
      }else if(items.length===1){
        totalVol=Math.round((items[0].volume||0)*100)/100;
        totalVal=totalVol*(items[0].price||0);
      }
      totalVol=Math.round(totalVol*100)/100;
      const avgPrice=totalVol>0?Math.round(totalVal/totalVol):0;

      const sell={
        id:genId(),
        orderNum:String(o.orderNum),
        linkedPO:String(o.orderNum),
        oc:String(o.orderNum),
        date:importDate,
        customer:o.sell.customer||'',
        destination:o.sell.destination||'',
        region:o.sell.region||'',
        miles:orderMiles,
        rate:S.flatRate||3.50,
        product:o.sell.product||'',
        length:items.length===1?items[0].length:'RL',
        price:avgPrice,
        freight:orderFreight,
        volume:totalVol,
        notes:'CSV Import',
        delivered:false,
        trader:mapTrader(o.sell.trader),
        tally:tally
      };
      // Import sell if it has volume OR if it has a customer (shorts with pending product info)
      if(sell.volume>0||sell.customer){S.sells.unshift(sell);sellCount++}
    }else if(o.sell&&sellAlreadyExists){skipSell++}

    // Build buy (skip if already exists)
    if(o.buy&&!buyAlreadyExists){
      const items=o.buy.items||[];
      let tally=null,totalVol=0;
      if(items.length>1){
        tally={};
        items.forEach(it=>{
          const vol=Math.round((it.volume||0)*100)/100;
          if(vol>0){
            const key=tallyKey(items,it);
            if(tally[key]){tally[key].vol+=vol;tally[key].price=it.price||tally[key].price}
            else{tally[key]={vol,price:it.price||0}}
            totalVol+=vol;
          }
        });
      }else if(items.length===1){
        totalVol=Math.round((items[0].volume||0)*100)/100;
      }
      totalVol=Math.round(totalVol*100)/100;

      const buy={
        id:genId(),
        orderNum:String(o.orderNum),
        po:String(o.orderNum),
        date:importDate,
        mill:o.buy.mill||'',
        origin:o.buy.origin||'',
        region:o.buy.region||'',
        product:o.buy.product||'',
        length:items.length===1?items[0].length:'RL',
        price:totalVol>0?Math.round(items.reduce((s,it)=>s+(it.volume||0)*(it.price||0),0)/totalVol):0,
        volume:totalVol,
        notes:'CSV Import',
        trader:mapTrader(o.buy.trader),
        miles:0,
        rate:S.flatRate||3.50,
        freight:0,
        tally:tally
      };
      // Import buy if it has volume OR if it has a mill (longs with pending product info)
      if(buy.volume>0||buy.mill){S.buys.unshift(buy);buyCount++}
    }else if(o.buy&&buyAlreadyExists){skipBuy++}
  });

  // Auto-add new customers and mills to CRM for each trader
  const newCustomers=new Map();// name → {destination, trader}
  const newMills=new Map();// name → {origin, trader}
  orders.forEach((o,i)=>{
    if(!checked.has(i))return;
    const mapTrader=name=>{const m=TRADER_MAP[name];if(m)return m;if(TRADERS.includes(name))return name;return'Admin';};
    if(o.sell&&o.sell.customer){
      const trader=mapTrader(o.sell.trader);
      const name=o.sell.customer;
      if(!S.customers.find(c=>c.name===name)&&!newCustomers.has(name)){
        newCustomers.set(name,{name,destination:o.sell.destination||'',trader,contact:'',phone:'',email:'',locations:[o.sell.destination||''].filter(Boolean),notes:''});
      }
    }
    if(o.buy&&o.buy.mill){
      const trader=mapTrader(o.buy.trader);
      const name=o.buy.mill;
      if(!S.mills.find(m=>m.name===name)&&!newMills.has(name)){
        newMills.set(name,{name,location:o.buy.origin||'',trader,contact:'',phone:'',email:'',products:[o.buy.origin||''].filter(Boolean),notes:''});
      }
    }
  });
  // Add to local state
  newCustomers.forEach(c=>{S.customers.push(c)});
  newMills.forEach(m=>{S.mills.push(m)});
  // Sync to server
  if(newCustomers.size&&typeof syncCustomersToServer==='function')syncCustomersToServer([...newCustomers.values()]);
  if(newMills.size&&typeof syncMillsToServer==='function')syncMillsToServer([...newMills.values()]);

  migrateTraderNames();
  await saveAllLocal();
  window._importOrders=null;
  window._importChecked=null;
  closeModal();
  render();
  let msg=`Imported ${sellCount} sells and ${buyCount} buys`;
  if(newCustomers.size)msg+=`, ${newCustomers.size} new customers`;
  if(newMills.size)msg+=`, ${newMills.size} new mills`;
  if(skipSell||skipBuy)msg+=` (skipped ${skipSell+skipBuy} duplicates)`;
  showToast(msg,'positive');

  // Auto-push to cloud so all trader profiles get the imported trades
  if(typeof cloudSync==='function'){
    try{
      const r=await cloudSync('push');
      if(r.success)showToast('Synced to cloud','positive');
    }catch(e){console.warn('Auto cloud push after import failed:',e)}
  }
}

// ==================== CRM FUNCTIONS ====================
