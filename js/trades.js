// SYP Analytics - Trade CRUD & Blotter Functions
async function saveBuy(id){
  const product=document.getElementById('m-product').value;
  const isMSR=product.toUpperCase().includes('MSR')||product.toUpperCase().includes('2400');
  const lengthVal=document.getElementById('m-length').value;
  const isRL=lengthVal==='RL';
  const useTallyCheckbox=document.getElementById('m-useTally')?.checked;
  
  // Build tally and calculate totals
  let tally=null;
  let tallyTotalVol=0;
  let tallyTotalVal=0;
  
  // Check for tally data (if checkbox is checked OR if RL is selected and tally fields have data)
  if(useTallyCheckbox||isRL){
    const tempTally={};
    // Check for mixed-product tally rows first
    let mi=0;
    while(document.getElementById(`tally-vol-mixed-${mi}`)){
      const el=document.getElementById(`tally-vol-mixed-${mi}`);
      const pEl=document.getElementById(`tally-price-mixed-${mi}`);
      const key=el.dataset.tkey||`item-${mi}`;
      const rawVol=parseFloat(el.value);
      const rawPrice=parseFloat(pEl?.value);
      const vol=isNaN(rawVol)?0:rawVol;
      const tallyPrice=isNaN(rawPrice)?0:rawPrice;
      if(vol>0){
        tempTally[key]={vol,price:tallyPrice};
        tallyTotalVol+=vol;
        tallyTotalVal+=vol*tallyPrice;
      }
      mi++;
    }
    // Standard length rows (only if no mixed rows found)
    if(mi===0){
      ['8','10','12','14','16','18','20'].forEach(len=>{
        const rawVol=parseFloat(document.getElementById(`tally-vol-${len}`)?.value);
        const rawPrice=parseFloat(document.getElementById(`tally-price-${len}`)?.value);
        const vol=isNaN(rawVol)?0:rawVol;
        const tallyPrice=isNaN(rawPrice)?0:rawPrice;
        if(vol>0){
          tempTally[len]={vol,price:tallyPrice};
          tallyTotalVol+=vol;
          tallyTotalVal+=vol*tallyPrice;
        }
      });
    }
    if(Object.keys(tempTally).length>0){
      tally=tempTally;
    }
  }

  // Get price/volume from appropriate field, or calculate from tally
  let price, volume;
  if(tally&&tallyTotalVol>0){
    // Use tally totals - this takes priority
    price=tallyTotalVol>0?Math.round(tallyTotalVal/tallyTotalVol):0;
    volume=tallyTotalVol;
  }else if(isMSR){
    price=parseFloat(document.getElementById('m-price').value)||0;
    volume=parseFloat(document.getElementById('m-volume').value)||0;
  }else{
    price=parseFloat(document.getElementById('m-price-std').value)||0;
    volume=parseFloat(document.getElementById('m-volume').value)||0;
  }
  
  const mill=document.getElementById('m-mill').value;
  const origin=document.getElementById('m-origin').value;
  const orderNum=document.getElementById('m-orderNum').value;
  
  // Save mill to CRM if new
  if(mill&&!S.mills.find(m=>m.name===mill)){
    S.mills.push({name:mill,origin:origin,addedDate:today()});
  }else if(mill&&origin){
    // Update origin if mill exists
    const existingMill=S.mills.find(m=>m.name===mill);
    if(existingMill&&!existingMill.origin){existingMill.origin=origin}
  }
  
  const b={
    orderNum:orderNum,
    po:orderNum, // Keep for backward compatibility
    date:document.getElementById('m-date').value,
    mill:mill,
    origin:origin,
    region:document.getElementById('m-region').value,
    product:product,
    length:document.getElementById('m-length').value,
    price:price,
    volume:volume, // Use calculated volume
    notes:document.getElementById('m-notes').value,
    trader:S.trader==='Admin'?(document.getElementById('m-trader')?.value||'Ian P'):S.trader, // Admin assigns to trader, otherwise current trader
    // Freight lives on the sell (OC) side only
    miles:0,
    rate:0,
    freight:0,
    // MSR fields
    basePrice:isMSR?parseFloat(document.getElementById('m-basePrice').value)||0:null,
    msrPremium:isMSR?parseFloat(document.getElementById('m-msrPremium').value)||0:null,
    // Tally
    tally:tally
  };
  
  if(!b.product||!b.price||!b.volume){alert('Fill required fields (product, price, volume)');return}
  if(id){
    const existing=S.buys.find(x=>x.id===id);
    if(existing&&!canEdit(existing)){alert('You can only edit your own trades');return}
    const i=S.buys.findIndex(x=>x.id===id);
    // Admin can reassign trader, otherwise preserve original trader
    const assignedTrader=S.trader==='Admin'?(document.getElementById('m-trader')?.value||existing?.trader||'Ian P'):(existing?.trader||S.trader);
    if(i>=0)S.buys[i]={...b,id,trader:assignedTrader}
  }else{
    b.id=genId();
    S.buys.unshift(b)
  }

  await saveAllLocal();closeModal();render();
}

async function saveSell(id){
  const customer=document.getElementById('m-cust').value;
  const destination=document.getElementById('m-dest').value;
  
  // Save customer to CRM if new
  if(customer&&!S.customers.find(c=>c.name===customer)){
    S.customers.push({name:customer,destination:destination,addedDate:today()});
  }else if(customer&&destination){
    // Update destination if customer exists
    const existing=S.customers.find(c=>c.name===customer);
    if(existing&&!existing.destination){existing.destination=destination}
  }
  
  const product=document.getElementById('m-product').value;
  const isMSR=product.toUpperCase().includes('MSR')||product.toUpperCase().includes('2400');
  const lengthVal=document.getElementById('m-length').value;
  const isRL=lengthVal==='RL';
  const useTallyCheckbox=document.getElementById('m-useTally')?.checked;
  
  // Build tally and calculate totals
  let tally=null;
  let tallyTotalVol=0;
  let tallyTotalVal=0;
  
  // Check for tally data (if checkbox is checked OR if RL is selected and tally fields have data)
  if(useTallyCheckbox||isRL){
    const tempTally={};
    // Check for mixed-product tally rows first
    let mi=0;
    while(document.getElementById(`tally-vol-mixed-${mi}`)){
      const el=document.getElementById(`tally-vol-mixed-${mi}`);
      const pEl=document.getElementById(`tally-price-mixed-${mi}`);
      const key=el.dataset.tkey||`item-${mi}`;
      const rawVol=parseFloat(el.value);
      const rawPrice=parseFloat(pEl?.value);
      const vol=isNaN(rawVol)?0:rawVol;
      const tallyPrice=isNaN(rawPrice)?0:rawPrice;
      if(vol>0){
        tempTally[key]={vol,price:tallyPrice};
        tallyTotalVol+=vol;
        tallyTotalVal+=vol*tallyPrice;
      }
      mi++;
    }
    // Standard length rows (only if no mixed rows found)
    if(mi===0){
      ['8','10','12','14','16','18','20'].forEach(len=>{
        const rawVol=parseFloat(document.getElementById(`tally-vol-${len}`)?.value);
        const rawPrice=parseFloat(document.getElementById(`tally-price-${len}`)?.value);
        const vol=isNaN(rawVol)?0:rawVol;
        const tallyPrice=isNaN(rawPrice)?0:rawPrice;
        if(vol>0){
          tempTally[len]={vol,price:tallyPrice};
          tallyTotalVol+=vol;
          tallyTotalVal+=vol*tallyPrice;
        }
      });
    }
    if(Object.keys(tempTally).length>0){
      tally=tempTally;
    }
  }

  // Get price from appropriate field, or calculate from tally
  let price;
  let volume;
  if(tally&&tallyTotalVol>0){
    // Use tally totals - this takes priority
    price=tallyTotalVol>0?Math.round(tallyTotalVal/tallyTotalVol):0;
    volume=tallyTotalVol;
  }else if(isMSR){
    price=parseFloat(document.getElementById('m-price').value)||0;
    volume=parseFloat(document.getElementById('m-volume').value)||0;
  }else{
    price=parseFloat(document.getElementById('m-price-std').value)||0;
    volume=parseFloat(document.getElementById('m-volume').value)||0;
  }
  
  const orderNum=document.getElementById('m-orderNum').value;
  
  const s={
    orderNum:orderNum,
    linkedPO:orderNum, // Keep for backward compatibility
    oc:orderNum, // Keep for backward compatibility
    date:document.getElementById('m-date').value,
    customer:customer,
    destination:destination,
    region:document.getElementById('m-region').value,
    miles:parseFloat(document.getElementById('m-miles').value)||0,
    rate:parseFloat(document.getElementById('m-rate').value)||S.flatRate||3.50,
    product:product,
    length:document.getElementById('m-length').value,
    price:price,
    freight:parseFloat(document.getElementById('m-freight').value)||0,
    volume:volume, // Use calculated volume (from tally or field)
    notes:document.getElementById('m-notes').value,
    delivered:document.getElementById('m-delivered')?.checked||false,
    trader:S.trader==='Admin'?(document.getElementById('m-trader')?.value||'Ian P'):S.trader, // Admin assigns to trader, otherwise current trader
    // MSR fields
    basePrice:isMSR?parseFloat(document.getElementById('m-basePrice').value)||0:null,
    msrPremium:isMSR?parseFloat(document.getElementById('m-msrPremium').value)||0:null,
    // Tally
    tally:tally
  };
  
  if(!s.product||!s.price||!s.volume){alert('Fill required fields (product, price, volume)');return}
  // Save rate as default
  S.flatRate=s.rate;
  if(id){
    const existing=S.sells.find(x=>x.id===id);
    if(existing&&!canEdit(existing)){alert('You can only edit your own trades');return}
    const i=S.sells.findIndex(x=>x.id===id);
    // Admin can reassign trader, otherwise preserve original trader
    const assignedTrader=S.trader==='Admin'?(document.getElementById('m-trader')?.value||existing?.trader||'Ian P'):(existing?.trader||S.trader);
    if(i>=0)S.sells[i]={...s,id,trader:assignedTrader}
  }else{
    s.id=genId();
    S.sells.unshift(s)
  }
  await saveAllLocal();closeModal();render();
}

async function saveRL(){
  const date=document.getElementById('rl-date').value;
  if(!date){alert('Enter date');return}
  const rl={date,west:{},central:{},east:{}};
  REGIONS.forEach(r=>{['2x4','2x6','2x8','2x10','2x12'].forEach(s=>{const v=parseFloat(document.getElementById(`rl-${r}-${s}`).value);if(v)rl[r][`${s}#2`]=v})});
  const i=S.rl.findIndex(r=>r.date===date);
  if(i>=0)S.rl[i]=rl;else{S.rl.push(rl);S.rl.sort((a,b)=>new Date(a.date)-new Date(b.date))}
  await saveAllLocal();closeModal();render();
}

async function saveCust(oldName){
  const locations=[...document.querySelectorAll('.cust-loc')].map(el=>el.value.trim()).filter(Boolean);
  const assignedTrader=S.trader==='Admin'?(document.getElementById('m-trader')?.value||'Ian P'):S.trader;
  const c={name:document.getElementById('m-name').value,contact:document.getElementById('m-contact')?.value||'',phone:document.getElementById('m-phone')?.value||'',email:document.getElementById('m-email')?.value||'',locations:locations,destination:locations[0]||'',notes:document.getElementById('m-terms')?.value||'',trader:assignedTrader};
  if(!c.name){alert('Enter name');return}
  try{
    const existing=S.customers.find(x=>x.name===oldName);
    if(existing?.id){
      // Update existing customer via API
      c.trader=S.trader==='Admin'?assignedTrader:(existing.trader||S.trader);
      await fetch('/api/crm/customers/'+existing.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)});
    }else{
      // Create new customer via API
      await fetch('/api/crm/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)});
    }
    closeModal();loadCRMData();
  }catch(e){alert('Error saving customer: '+e.message)}
}

function showMillModal(m=null){
  const mill=m?S.mills.find(x=>x.name===m):null;
  const locs=mill?.locations||[mill?.origin].filter(Boolean);
  document.getElementById('modal').innerHTML=`<div class="modal-overlay" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header"><span class="modal-title positive">${mill?'EDIT':'NEW'} MILL</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      ${S.trader==='Admin'?`<div style="margin-bottom:16px;padding:12px;background:rgba(245,166,35,0.1);border:1px solid #f5a623;border-radius:4px">
        <div class="form-group" style="margin:0"><label class="form-label" style="color:#f5a623;font-weight:600">🔑 Assign to Trader</label>
        <select id="m-trader" style="width:200px">${TRADERS.map(t=>`<option value="${t}" ${(mill?.trader||'Ian P')===t?'selected':''}>${t}</option>`).join('')}</select></div>
      </div>`:''}
      <div class="form-group"><label class="form-label">Mill Name</label><input type="text" id="m-name" value="${mill?.name||''}"></div>
      <div class="form-group">
        <label class="form-label">Locations (City, ST)</label>
        <div id="mill-locations">
          ${locs.length?locs.map((loc,i)=>`<div style="display:flex;gap:4px;margin-bottom:4px"><input type="text" class="mill-loc" value="${loc}" placeholder="e.g. Warren, AR" style="flex:1"><button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">×</button></div>`).join(''):'<div style="display:flex;gap:4px;margin-bottom:4px"><input type="text" class="mill-loc" placeholder="e.g. Warren, AR" style="flex:1"><button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">×</button></div>'}
        </div>
        <button class="btn btn-default btn-sm" onclick="addMillLocation()" style="margin-top:4px">+ Add Location</button>
      </div>
      <div class="form-group"><label class="form-label">Region</label><select id="m-region"><option value="">Select...</option>${REGIONS.map(r=>`<option value="${r}" ${mill?.region===r?'selected':''}>${r.charAt(0).toUpperCase()+r.slice(1)}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Contact</label><input type="text" id="m-contact" value="${mill?.contact||''}"></div>
      <div class="form-group"><label class="form-label">Phone</label><input type="text" id="m-phone" value="${mill?.phone||''}"></div>
      <div class="form-group"><label class="form-label">Notes</label><textarea id="m-notes">${mill?.notes||''}</textarea></div>
    </div>
    <div class="modal-footer"><button class="btn btn-default" onclick="closeModal()">Cancel</button><button class="btn btn-success" onclick="saveMill('${mill?.name||''}')">Save</button></div>
  </div></div>`;
}

function addMillLocation(){
  const container=document.getElementById('mill-locations');
  const div=document.createElement('div');
  div.style='display:flex;gap:4px;margin-bottom:4px';
  div.innerHTML=`<input type="text" class="mill-loc" placeholder="e.g. Warren, AR" style="flex:1"><button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">×</button>`;
  container.appendChild(div);
}

async function saveMill(oldName){
  const locations=[...document.querySelectorAll('.mill-loc')].map(el=>el.value.trim()).filter(Boolean);
  const assignedTrader=S.trader==='Admin'?(document.getElementById('m-trader')?.value||'Ian P'):S.trader;
  const m={name:document.getElementById('m-name').value,location:locations[0]||'',products:locations,contact:document.getElementById('m-contact').value,phone:document.getElementById('m-phone').value,notes:document.getElementById('m-notes').value,trader:assignedTrader};
  if(!m.name){alert('Enter name');return}
  try{
    const existing=S.mills.find(x=>x.name===oldName);
    if(existing?.id){
      // Update existing mill via API
      m.trader=S.trader==='Admin'?assignedTrader:(existing.trader||S.trader);
      await fetch('/api/crm/mills/'+existing.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});
    }else{
      // Create new mill via API
      await fetch('/api/crm/mills',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});
    }
    closeModal();loadCRMData();
  }catch(e){alert('Error saving mill: '+e.message)}
}

function editMill(name){showMillModal(name)}
function editCust(name){
  const c=S.customers.find(x=>x.name===name);
  showCustModal(c);
}

async function deleteCust(name){
  if(!confirm(`Delete customer "${name}"? This won't delete their trades.`))return;
  try{
    const c=S.customers.find(x=>x.name===name);
    if(c?.id)await fetch('/api/crm/customers/'+c.id,{method:'DELETE'});
    loadCRMData();
  }catch(e){alert('Error deleting customer: '+e.message)}
}

async function deleteMill(name){
  if(!confirm(`Delete mill "${name}"? This won't delete their trades.`))return;
  try{
    const m=S.mills.find(x=>x.name===name);
    if(m?.id)await fetch('/api/crm/mills/'+m.id,{method:'DELETE'});
    loadCRMData();
  }catch(e){alert('Error deleting mill: '+e.message)}
}

function editBuy(id){showBuyModal(S.buys.find(b=>b.id===id))}
function editSell(id){showSellModal(S.sells.find(s=>s.id===id))}
function dupBuy(id){const b=S.buys.find(x=>x.id===id);if(b)showBuyModal({...b,id:null,date:today()})}
function dupSell(id){const s=S.sells.find(x=>x.id===id);if(s)showSellModal({...s,id:null,date:today()})}
async function delBuy(id){if(!confirm('Delete?'))return;S.buys=S.buys.filter(b=>b.id!==id);await saveAllLocal();render()}
async function delSell(id){if(!confirm('Delete?'))return;S.sells=S.sells.filter(s=>s.id!==id);await saveAllLocal();render()}
async function delRL(d){if(!confirm('Delete?'))return;S.rl=S.rl.filter(r=>r.date!==d);await saveAllLocal();render()}

// Blotter sorting and filtering
function setBlotterFilter(key,val){
  if(!S.blotterFilter)S.blotterFilter={};
  S.blotterFilter[key]=val;
  render();
}
function handleBlotterSearch(e){
  // Debounced search - wait for Enter or 300ms pause
  const val=e.target.value;
  const pos=e.target.selectionStart;
  if(e.key==='Enter'){
    setBlotterFilter('search',val);
    setTimeout(()=>{
      const el=document.getElementById('blotter-search');
      if(el){el.focus();el.setSelectionRange(pos,pos);}
    },10);
  }else if(e.key==='Escape'){
    e.target.value='';
    setBlotterFilter('search','');
  }else{
    clearTimeout(window._blotterSearchTimeout);
    window._blotterSearchTimeout=setTimeout(()=>{
      setBlotterFilter('search',val);
      setTimeout(()=>{
        const el=document.getElementById('blotter-search');
        if(el){el.focus();el.setSelectionRange(pos+1,pos+1);}
      },10);
    },300);
  }
}
function clearBlotterFilters(){
  S.blotterFilter={};
  render();
}

// Benchmark filters and sorting
function setBenchFilter(key,val){
  if(!S.benchFilter)S.benchFilter={};
  S.benchFilter[key]=val;
  render();
}
function toggleBenchSort(col){
  if(!S.benchSort)S.benchSort={col:'date',dir:'desc'};
  if(S.benchSort.col===col){
    S.benchSort.dir=S.benchSort.dir==='asc'?'desc':'asc';
  }else{
    S.benchSort={col,dir:col==='diff'?'asc':'desc'};
  }
  render();
}

// Product view filters and sorting
function setProdFilter(key,val){
  if(!S.prodFilter)S.prodFilter={};
  S.prodFilter[key]=val;
  render();
}
function toggleProdSort(col){
  if(!S.prodSort)S.prodSort={col:'profit',dir:'desc'};
  if(S.prodSort.col===col){
    S.prodSort.dir=S.prodSort.dir==='asc'?'desc':'asc';
  }else{
    S.prodSort={col,dir:'desc'};
  }
  render();
}
function showProductDetail(product){
  S.selectedProduct=S.selectedProduct===product?null:product;
  render();
}
function toggleSort(col){
  if(!S.blotterSort)S.blotterSort={col:'date',dir:'desc'};
  if(S.blotterSort.col===col){
    S.blotterSort.dir=S.blotterSort.dir==='asc'?'desc':'asc';
  }else{
    S.blotterSort.col=col;
    S.blotterSort.dir='desc';
  }
  render();
}

// Link short OC to PO
function linkShortToPO(sellId){
  const sell=S.sells.find(s=>s.id===sellId);
  if(!sell)return;
  
  // Get available POs that match product
  const availPOs=S.buys.map(b=>{
    const soldVol=S.sells.filter(x=>x.linkedPO===b.po&&x.id!==sellId).reduce((sum,x)=>sum+(x.volume||0),0);
    const avail=(b.volume||0)-soldVol;
    return{...b,soldVol,avail};
  }).filter(b=>b.po&&b.avail>0);
  
  document.getElementById('modal').innerHTML=`<div class="modal-overlay" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header"><span class="modal-title warn">LINK SHORT TO PO</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div style="margin-bottom:16px;padding:12px;background:var(--panel-alt);border:1px solid var(--border)">
        <div style="font-weight:600;margin-bottom:8px">Short Position:</div>
        <div style="font-size:12px">
          <div><span style="color:var(--muted)">OC:</span> ${sell.oc||'—'}</div>
          <div><span style="color:var(--muted)">Customer:</span> ${sell.customer||'—'}</div>
          <div><span style="color:var(--muted)">Product:</span> ${sell.product} ${sell.length||'RL'}</div>
          <div><span style="color:var(--muted)">Volume:</span> ${fmtN(sell.volume)} MBF</div>
          <div><span style="color:var(--muted)">Price:</span> ${fmt(sell.price)} DLVD</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Select PO to Cover</label>
        <select id="link-po" style="width:100%">
          <option value="">— Select PO —</option>
          ${availPOs.map(b=>`<option value="${b.po}">${b.po} | ${b.product} ${b.length||'RL'} | ${b.mill} | ${fmt(b.price)} | ${fmtN(b.avail)} MBF avail</option>`).join('')}
        </select>
      </div>
      ${availPOs.length===0?'<div style="color:var(--negative);font-size:11px;margin-top:8px">No POs with available volume. Create a buy first.</div>':''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-default" onclick="closeModal()">Cancel</button>
      <button class="btn btn-success" onclick="confirmLinkShort(${sellId})" ${availPOs.length===0?'disabled':''}>Link PO</button>
    </div>
  </div></div>`;
}

async function confirmLinkShort(sellId){
  const po=document.getElementById('link-po').value;
  if(!po){alert('Select a PO');return}
  const idx=S.sells.findIndex(s=>s.id===sellId);
  if(idx>=0){
    S.sells[idx].linkedPO=po;
    await saveAllLocal();
    closeModal();
    render();
  }
}

