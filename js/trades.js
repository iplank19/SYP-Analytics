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
  let splitProduct=null; // For split loads, use combined product name

  // Check for split load data first (multiple products on same truck)
  const useSplit=document.getElementById('m-useSplit')?.checked;
  if(useSplit){
    const tempTally={};
    const products=[];
    document.querySelectorAll('#split-rows-buy tr').forEach(row=>{
      const prod=row.querySelector('.split-prod')?.value||'';
      const len=row.querySelector('.split-len')?.value||'';
      const vol=parseFloat(row.querySelector('.split-vol')?.value)||0;
      const price=parseFloat(row.querySelector('.split-price')?.value)||0;
      if(prod&&vol>0){
        const key=len?`${prod} ${len}'`:prod;
        tempTally[key]={vol,price};
        tallyTotalVol+=vol;
        tallyTotalVal+=vol*price;
        if(!products.includes(prod))products.push(prod);
      }
    });
    if(Object.keys(tempTally).length>0){
      tally=tempTally;
      splitProduct=products.join(' / '); // Combined product name like "2x10#2 / 2x12#2"
    }
  }
  // Check for tally data (if checkbox is checked OR if RL is selected and tally fields have data)
  else if(useTallyCheckbox||isRL){
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
      const formPPU=parseInt(document.getElementById('m-ppu')?.value)||0;
      ['8','10','12','14','16','18','20'].forEach(len=>{
        const rawPrice=parseFloat(document.getElementById(`tally-price-${len}`)?.value);
        const rawUnits=parseFloat(document.getElementById(`tally-units-${len}`)?.value);
        const tallyPrice=isNaN(rawPrice)?0:rawPrice;
        const units=isNaN(rawUnits)?0:rawUnits;
        // Calculate MBF from units (units-first entry)
        const vol=units>0?calcMBFFromUnits(product,len,units,formPPU||undefined):0;
        if(vol>0||units>0){
          tempTally[len]={vol,price:tallyPrice,units};
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
  
  const rawMill=document.getElementById('m-mill').value;
  const mill=normalizeMillCompany(rawMill);// Store canonical company name
  const origin=document.getElementById('m-origin').value;
  const orderNum=document.getElementById('m-orderNum').value;

  // Save mill to CRM if new (company-level)
  const parseOriginToLoc=(o)=>{
    if(!o)return null;
    const parts=o.split(',').map(s=>s.trim());
    return{city:parts[0]||o,state:parts[1]||'',label:o};
  };
  if(mill&&!S.mills.find(m=>m.name===mill)){
    const loc=parseOriginToLoc(origin);
    const locs=loc?[loc]:[];
    S.mills.push({name:mill,origin:origin,locations:locs,addedDate:today()});
  }else if(mill&&origin){
    // Add origin to mill's locations if new
    const existingMill=S.mills.find(m=>m.name===mill);
    if(existingMill){
      if(!existingMill.origin)existingMill.origin=origin;
      if(!existingMill.locations)existingMill.locations=[];
      if(Array.isArray(existingMill.locations)){
        const originLower=origin.toLowerCase();
        const exists=existingMill.locations.some(l=>
          (typeof l==='string'?l:l.label||'').toLowerCase()===originLower
        );
        if(!exists)existingMill.locations.push(parseOriginToLoc(origin));
      }
    }
  }
  
  const b={
    orderNum:orderNum,
    po:orderNum, // Keep for backward compatibility
    date:normalizeDate(document.getElementById('m-date').value),
    mill:mill,
    origin:normalizeLocation(origin).display || origin,
    region:normalizeRegion(document.getElementById('m-region').value),
    product:normalizeProduct(splitProduct||product), // Use combined product name for split loads
    length:normalizeLength(document.getElementById('m-length').value),
    units:parseFloat(document.getElementById('m-units')?.value)||0,
    ppu:parseInt(document.getElementById('m-ppu')?.value)||0,
    price:normalizePrice(price),
    volume:normalizeVolume(volume), // Use calculated volume
    shipWeek:document.getElementById('m-shipWeek')?.value||'',
    notes:document.getElementById('m-notes').value,
    trader:S.trader==='Admin'?(document.getElementById('m-trader')?.value||'Ian P'):S.trader, // Admin assigns to trader, otherwise current trader
    // Freight lives on the sell (OC) side only
    miles:0,
    rate:0,
    freight:0,
    // MSR fields
    basePrice:isMSR?normalizePrice(document.getElementById('m-basePrice').value):null,
    msrPremium:isMSR?normalizePrice(document.getElementById('m-msrPremium').value):null,
    // Tally
    tally:tally
  };
  
  if(!b.product||!b.price||!b.volume){showToast('Fill required fields (product, price, volume)','warn');return}
  // Warn on duplicate order number (different buy)
  if(b.orderNum){
    const dupe=S.buys.find(x=>x.id!==id&&String(x.orderNum||x.po||'').trim()===b.orderNum.trim());
    if(dupe&&!confirm(`Order # "${b.orderNum}" already exists on a buy from ${dupe.mill||'unknown mill'}. Save anyway?`))return;
  }
  if(id){
    const existing=S.buys.find(x=>x.id===id);
    if(existing&&!canEdit(existing)){showToast('You can only edit your own trades','warn');return}
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
  const customer=normalizeCustomerName(document.getElementById('m-cust').value);
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
  let splitProduct=null;// For split loads, use combined product name

  // Check for split load data first (multiple products on same truck)
  const useSplit=document.getElementById('m-useSplit')?.checked;
  if(useSplit){
    const tempTally={};
    const products=[];
    document.querySelectorAll('#split-rows-sell tr').forEach(row=>{
      const prod=row.querySelector('.split-prod')?.value||'';
      const len=row.querySelector('.split-len')?.value||'';
      const vol=parseFloat(row.querySelector('.split-vol')?.value)||0;
      const price=parseFloat(row.querySelector('.split-price')?.value)||0;
      if(prod&&vol>0){
        const key=len?`${prod} ${len}'`:prod;
        tempTally[key]={vol,price};
        tallyTotalVol+=vol;
        tallyTotalVal+=vol*price;
        if(!products.includes(prod))products.push(prod);
      }
    });
    if(Object.keys(tempTally).length>0){
      tally=tempTally;
      splitProduct=products.join(' / ');// Combined product name like "2x10#2 / 2x12#2"
    }
  }
  // Check for tally data (if checkbox is checked OR if RL is selected and tally fields have data)
  else if(useTallyCheckbox||isRL){
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
      const formPPU=parseInt(document.getElementById('m-ppu')?.value)||0;
      ['8','10','12','14','16','18','20'].forEach(len=>{
        const rawPrice=parseFloat(document.getElementById(`tally-price-${len}`)?.value);
        const rawUnits=parseFloat(document.getElementById(`tally-units-${len}`)?.value);
        const tallyPrice=isNaN(rawPrice)?0:rawPrice;
        const units=isNaN(rawUnits)?0:rawUnits;
        // Calculate MBF from units (units-first entry)
        const vol=units>0?calcMBFFromUnits(product,len,units,formPPU||undefined):0;
        if(vol>0||units>0){
          tempTally[len]={vol,price:tallyPrice,units};
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
    date:normalizeDate(document.getElementById('m-date').value),
    customer:customer,
    destination:normalizeLocation(destination).display || destination,
    region:normalizeRegion(document.getElementById('m-region').value),
    miles:parseFloat(document.getElementById('m-miles').value)||0,
    rate:parseFloat(document.getElementById('m-rate').value)||S.flatRate||3.50,
    product:normalizeProduct(splitProduct||product),// Use combined product name for split loads
    length:normalizeLength(document.getElementById('m-length').value),
    units:parseFloat(document.getElementById('m-units')?.value)||0,
    ppu:parseInt(document.getElementById('m-ppu')?.value)||0,
    price:normalizePrice(price),
    freight:normalizePrice(document.getElementById('m-freight').value),
    volume:normalizeVolume(volume), // Use calculated volume (from tally or field)
    shipWeek:document.getElementById('m-shipWeek')?.value||'',
    notes:document.getElementById('m-notes').value,
    delivered:document.getElementById('m-delivered')?.checked||false,
    trader:S.trader==='Admin'?(document.getElementById('m-trader')?.value||'Ian P'):S.trader, // Admin assigns to trader, otherwise current trader
    // MSR fields
    basePrice:isMSR?normalizePrice(document.getElementById('m-basePrice').value):null,
    msrPremium:isMSR?parseFloat(document.getElementById('m-msrPremium').value)||0:null,
    // Tally
    tally:tally
  };
  
  if(!s.product||!s.price||!s.volume){showToast('Fill required fields (product, price, volume)','warn');return}
  // Warn on duplicate order number (different sell)
  if(s.orderNum){
    const dupe=S.sells.find(x=>x.id!==id&&String(x.orderNum||x.linkedPO||x.oc||'').trim()===s.orderNum.trim());
    if(dupe&&!confirm(`Order # "${s.orderNum}" already exists on a sell to ${dupe.customer||'unknown customer'}. Save anyway?`))return;
  }
  // Save rate as default
  S.flatRate=s.rate;
  if(id){
    const existing=S.sells.find(x=>x.id===id);
    if(existing&&!canEdit(existing)){showToast('You can only edit your own trades','warn');return}
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
  if(!date){showToast('Enter date','warn');return}
  const rl={date,west:{},central:{},east:{}};
  REGIONS.forEach(r=>{['2x4','2x6','2x8','2x10','2x12'].forEach(s=>{const v=parseFloat(document.getElementById(`rl-${r}-${s}`).value);if(v)rl[r][`${s}#2`]=v})});
  const i=S.rl.findIndex(r=>r.date===date);
  if(i>=0)S.rl[i]=rl;else{S.rl.push(rl);S.rl.sort((a,b)=>new Date(a.date)-new Date(b.date))}
  await saveAllLocal();closeModal();render();
}

async function saveCust(oldName){
  const locations=[...document.querySelectorAll('.cust-loc')].map(el=>el.value.trim()).filter(Boolean);
  const assignedTrader=S.trader==='Admin'?(document.getElementById('m-trader')?.value||'Ian P'):S.trader;
  const c={name:normalizeCustomerName(document.getElementById('m-name').value),contact:document.getElementById('m-contact')?.value||'',phone:document.getElementById('m-phone')?.value||'',email:document.getElementById('m-email')?.value||'',locations:locations,destination:locations[0]||'',notes:document.getElementById('m-terms')?.value||'',trader:assignedTrader};
  if(!c.name){showToast('Enter name','warn');return}
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
  }catch(e){showToast('Error saving customer: '+e.message,'negative')}
}

function showMillModal(m=null){
  const mill=m?S.mills.find(x=>x.name===m):null;
  const rawLocs=mill?.locations||[mill?.origin].filter(Boolean);
  const locs=rawLocs.map(l=>typeof l==='string'?l:(l&&l.city?`${l.city}, ${l.state||''}`.trim():''));
  document.getElementById('modal').innerHTML=`<div class="modal-overlay" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()">
    <div class="modal-header"><span class="modal-title positive">${mill?'EDIT':'NEW'} MILL</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      ${S.trader==='Admin'?`<div style="margin-bottom:16px;padding:12px;background:rgba(232,115,74,0.1);border:1px solid #e8734a;border-radius:4px">
        <div class="form-group" style="margin:0"><label class="form-label" style="color:#e8734a;font-weight:600">🔑 Assign to Trader</label>
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
  const locStrings=[...document.querySelectorAll('.mill-loc')].map(el=>el.value.trim()).filter(Boolean);
  const millName=normalizeMillCompany(document.getElementById('m-name').value);
  const locations=locStrings.map(l=>{
    const parts=l.split(',').map(s=>s.trim());
    const city=parts[0]||'';const state=parts[1]||'';
    return {city,state,lat:null,lon:null,name:city?`${millName} - ${city}`:''};
  });
  const assignedTrader=S.trader==='Admin'?(document.getElementById('m-trader')?.value||'Ian P'):S.trader;
  const existing=S.mills.find(x=>x.name===oldName);
  const region=document.getElementById('m-region')?.value||existing?.region||'central';
  const firstLoc=locations[0]||{};
  const m={name:millName,location:locStrings[0]||'',locations,city:firstLoc.city||'',state:firstLoc.state||'',region,contact:document.getElementById('m-contact').value,phone:document.getElementById('m-phone').value,notes:document.getElementById('m-notes').value,trader:assignedTrader};
  if(!m.name){showToast('Enter name','warn');return}
  try{
    if(existing?.id){
      // Update existing mill via API
      m.trader=S.trader==='Admin'?assignedTrader:(existing.trader||S.trader);
      await fetch('/api/crm/mills/'+existing.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});
    }else{
      // Create new mill via API
      await fetch('/api/crm/mills',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});
    }
    closeModal();loadCRMData();
  }catch(e){showToast('Error saving mill: '+e.message,'negative')}
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
  }catch(e){showToast('Error deleting customer: '+e.message,'negative')}
}

async function deleteMill(name){
  if(!confirm(`Delete mill "${name}"? This won't delete their trades.`))return;
  try{
    const m=S.mills.find(x=>x.name===name);
    if(m?.id)await fetch('/api/crm/mills/'+m.id,{method:'DELETE'});
    loadCRMData();
  }catch(e){showToast('Error deleting mill: '+e.message,'negative')}
}

function editBuy(id){showBuyModal(S.buys.find(b=>b.id===id))}
function editSell(id){showSellModal(S.sells.find(s=>s.id===id))}
function dupBuy(id){const b=S.buys.find(x=>x.id===id);if(b)showBuyModal({...b,id:null,date:today()})}
function dupSell(id){const s=S.sells.find(x=>x.id===id);if(s)showSellModal({...s,id:null,date:today()})}
async function delBuy(id){if(!confirm('Delete?'))return;S.buys=S.buys.filter(b=>b.id!==id);await saveAllLocal();render()}
async function delSell(id){if(!confirm('Delete?'))return;S.sells=S.sells.filter(s=>s.id!==id);await saveAllLocal();render()}
async function cancelBuy(id){
  const b=S.buys.find(x=>x.id===id);
  if(!b)return;
  if(b.status==='cancelled'){b.status='active';showToast('Buy reactivated','positive')}
  else{b.status='cancelled';showToast('Buy cancelled','warn')}
  await saveAllLocal();render();
}
async function cancelSell(id){
  const s=S.sells.find(x=>x.id===id);
  if(!s)return;
  if(s.status==='cancelled'){s.status='active';showToast('Sell reactivated','positive')}
  else{s.status='cancelled';showToast('Sell cancelled','warn')}
  await saveAllLocal();render();
}
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
      const currentEl=document.getElementById('blotter-search');
      const curPos=currentEl?currentEl.selectionStart:pos;
      setBlotterFilter('search',currentEl?currentEl.value:val);
      setTimeout(()=>{
        const el=document.getElementById('blotter-search');
        if(el){el.focus();el.setSelectionRange(curPos,curPos);}
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
  if(!po){showToast('Select a PO','warn');return}
  const idx=S.sells.findIndex(s=>s.id===sellId);
  if(idx>=0){
    S.sells[idx].linkedPO=po;
    S.sells[idx].orderNum=po;
    S.sells[idx].oc=po;
    await saveAllLocal();
    closeModal();
    render();
  }
}

// Save futures contract data from the model tab inputs
async function saveFuturesData(){
  const months=['F','H','K','N','U','X'];
  const labels=['Jan','Mar','May','Jul','Sep','Nov'];
  const contracts=[];
  months.forEach((m,i)=>{
    const priceEl=document.getElementById('fut-price-'+m);
    const dateEl=document.getElementById('fut-date-'+m);
    if(priceEl){
      const price=parseFloat(priceEl.value)||0;
      const date=dateEl?dateEl.value:'';
      if(price>0){
        contracts.push({month:labels[i],code:m,price,date});
      }
    }
  });
  S.futuresContracts=contracts;
  // Save params
  const lb=parseInt(document.getElementById('fut-lookback')?.value);
  const zs=parseFloat(document.getElementById('fut-z-sell')?.value);
  const zb=parseFloat(document.getElementById('fut-z-buy')?.value);
  const cm=parseFloat(document.getElementById('fut-commission')?.value);
  if(!isNaN(lb))S.futuresParams.basisLookback=lb;
  if(!isNaN(zs))S.futuresParams.zScoreSellThreshold=zs;
  if(!isNaN(zb))S.futuresParams.zScoreBuyThreshold=zb;
  if(!isNaN(cm))S.futuresParams.commissionPerContract=cm;
  await saveAllLocal();
  render();
}

// Fetch live SYP futures from Yahoo Finance via backend proxy
async function fetchLiveFutures(){
  const statusEl=document.getElementById('futures-fetch-status');
  if(statusEl)statusEl.innerHTML='<span style="color:var(--muted)">Fetching live quotes...</span>';
  try{
    const r=await fetch('/api/futures/quotes');
    const data=await r.json();
    if(!data||!data.contracts||!data.contracts.length){
      if(statusEl)statusEl.innerHTML='<span style="color:var(--negative)">No live data available</span>';
      return;
    }
    // Store live data for charts — persist front month history for daily charts
    S.liveFutures=data;
    if(data.front&&data.front.history){
      S.frontHistory=data.front.history;
      SS('frontHistory',S.frontHistory);
    }
    // Auto-populate contract grid with live prices
    const months=['F','H','K','N','U','X'];
    const labels=['Jan','Mar','May','Jul','Sep','Nov'];
    const contracts=[];
    data.contracts.forEach(c=>{
      contracts.push({month:c.month,code:c.code,price:c.price,date:new Date().toISOString().split('T')[0],year:c.year,symbol:c.symbol,previousClose:c.previousClose,history:c.history||[]});
    });
    S.futuresContracts=contracts;
    await saveAllLocal();
    if(statusEl){
      const front=data.front;
      const change=front&&front.previousClose?front.price-front.previousClose:null;
      statusEl.innerHTML=`<span style="color:var(--positive)">Live quotes loaded</span>`
        +`<span style="margin-left:12px;font-weight:600">Front: $${front?front.price:'—'}</span>`
        +(change!==null?`<span style="margin-left:6px;color:${change>=0?'var(--positive)':'var(--negative)'}">${change>=0?'+':''}${change.toFixed(1)}</span>`:'')
        +`<span style="margin-left:12px;color:var(--muted);font-size:10px">${data.contracts.length} contracts | ${new Date(data.fetched_at).toLocaleTimeString()}</span>`;
    }
    // Render charts with live data
    renderForwardCurveChart();
    renderLivePriceChart();
  }catch(e){
    if(statusEl)statusEl.innerHTML=`<span style="color:var(--negative)">Fetch failed: ${e.message}</span>`;
  }
}

// Mill Direct Hedge Calculator
function calcMillDirectHedge(){
  const buy=parseFloat(document.getElementById('calc-buy')?.value)||0;
  const sell=parseFloat(document.getElementById('calc-sell')?.value)||0;
  const freight=parseFloat(document.getElementById('calc-freight')?.value)||0;
  const volume=parseFloat(document.getElementById('calc-volume')?.value)||22;
  const p=S.futuresParams;
  const commission=p.commissionPerContract||1.50;
  const lockedBasis=sell-buy;
  const netMargin=lockedBasis-freight-commission;
  const totalPL=Math.round(netMargin*volume);
  const contracts=volume/22;
  const perContract=Math.round(totalPL/Math.max(contracts,1));
  // Compare to rolling average basis (uses historical futures prices paired with RL dates)
  const lookback=p.basisLookback||8;
  const historicalBasis=getHistoricalBasis(lookback);
  const rollingBasisVals=historicalBasis.map(h=>h.basis);
  const rollingAvg=rollingBasisVals.length?rollingBasisVals.reduce((a,b)=>a+b,0)/rollingBasisVals.length:null;
  const vsAvg=rollingAvg!==null?Math.round(lockedBasis-rollingAvg):null;
  const el=document.getElementById('calc-results');
  if(!el)return;
  el.innerHTML=`
    <div style="padding:12px;background:var(--panel-alt);border-radius:6px;border:1px solid var(--border)">
      <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Locked Basis</div>
      <div style="font-size:18px;font-weight:700;color:${lockedBasis>=0?'var(--positive)':'var(--negative)'}">$${lockedBasis}/MBF</div>
      <div style="font-size:10px;color:var(--muted)">Sell - Buy</div>
    </div>
    <div style="padding:12px;background:var(--panel-alt);border-radius:6px;border:1px solid var(--border)">
      <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Net Margin</div>
      <div style="font-size:18px;font-weight:700;color:${netMargin>=0?'var(--positive)':'var(--negative)'}">$${netMargin}/MBF</div>
      <div style="font-size:10px;color:var(--muted)">Basis - Freight - Commission</div>
    </div>
    <div style="padding:12px;background:var(--panel-alt);border-radius:6px;border:1px solid var(--border)">
      <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Total P&L</div>
      <div style="font-size:18px;font-weight:700;color:${totalPL>=0?'var(--positive)':'var(--negative)'}">$${totalPL.toLocaleString()}</div>
      <div style="font-size:10px;color:var(--muted)">${volume} MBF (${contracts.toFixed(1)} contracts)</div>
    </div>
    <div style="padding:12px;background:var(--panel-alt);border-radius:6px;border:1px solid var(--border)">
      <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">$/Contract</div>
      <div style="font-size:18px;font-weight:700;color:${perContract>=0?'var(--positive)':'var(--negative)'}">$${perContract.toLocaleString()}</div>
    </div>
    <div style="padding:12px;background:var(--panel-alt);border-radius:6px;border:1px solid var(--border)">
      <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">vs Avg Basis</div>
      <div style="font-size:18px;font-weight:700;color:${vsAvg!==null?(vsAvg>=0?'var(--positive)':'var(--negative)'):'var(--muted)'}">${vsAvg!==null?(vsAvg>=0?'+':'')+vsAvg:'—'}</div>
      <div style="font-size:10px;color:var(--muted)">${rollingAvg!==null?'Avg: $'+Math.round(rollingAvg):'No data'}</div>
    </div>
  `;
}

// Basis Target Calculator
function calcBasisTarget(){
  const entry=parseFloat(document.getElementById('bt-entry')?.value)||0;
  const target=parseFloat(document.getElementById('bt-target')?.value)||0;
  const volume=parseFloat(document.getElementById('bt-volume')?.value)||22;
  const direction=document.getElementById('bt-direction')?.value||'long';
  const p=S.futuresParams;
  const commission=p.commissionPerContract||1.50;
  const basisMove=direction==='long'?(target-entry):(entry-target);
  const plPerMBF=basisMove-commission;
  const totalPL=Math.round(plPerMBF*volume);
  // Z-score at target basis
  const lookback=p.basisLookback||8;
  const historicalBasis=getHistoricalBasis(lookback);
  const rollingBasisVals=historicalBasis.map(h=>h.basis);
  const rollingAvg=rollingBasisVals.length?rollingBasisVals.reduce((a,b)=>a+b,0)/rollingBasisVals.length:null;
  const rollingStdDev=rollingBasisVals.length>1?Math.sqrt(rollingBasisVals.reduce((s,v)=>s+Math.pow(v-rollingAvg,2),0)/(rollingBasisVals.length-1)):null;
  const zAtTarget=(rollingAvg!==null&&rollingStdDev&&rollingStdDev>0)?(target-rollingAvg)/rollingStdDev:null;
  const el=document.getElementById('bt-results');
  if(!el)return;
  el.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
      <div style="padding:12px;background:var(--panel-alt);border-radius:6px;border:1px solid var(--border)">
        <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Basis Move</div>
        <div style="font-size:18px;font-weight:700;color:${basisMove>=0?'var(--positive)':'var(--negative)'}">$${basisMove}/MBF</div>
        <div style="font-size:10px;color:var(--muted)">${direction==='long'?'Target - Entry':'Entry - Target'}</div>
      </div>
      <div style="padding:12px;background:var(--panel-alt);border-radius:6px;border:1px solid var(--border)">
        <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">P&L per MBF</div>
        <div style="font-size:18px;font-weight:700;color:${plPerMBF>=0?'var(--positive)':'var(--negative)'}">$${plPerMBF.toFixed(2)}</div>
        <div style="font-size:10px;color:var(--muted)">Move - $${commission} commission</div>
      </div>
      <div style="padding:12px;background:var(--panel-alt);border-radius:6px;border:1px solid var(--border)">
        <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Total P&L</div>
        <div style="font-size:18px;font-weight:700;color:${totalPL>=0?'var(--positive)':'var(--negative)'}">$${totalPL.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--muted)">${volume} MBF</div>
      </div>
      <div style="padding:12px;background:var(--panel-alt);border-radius:6px;border:1px solid var(--border)">
        <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Z-Score at Target</div>
        <div style="font-size:18px;font-weight:700;color:${zAtTarget!==null?(Math.abs(zAtTarget)>=1.5?'var(--negative)':'var(--positive)'):'var(--muted)'}">${zAtTarget!==null?zAtTarget.toFixed(2):'—'}</div>
        <div style="font-size:10px;color:var(--muted)">${zAtTarget!==null?(zAtTarget<=p.zScoreSellThreshold?'SELL ZONE':zAtTarget>=p.zScoreBuyThreshold?'BUY ZONE':'NEUTRAL'):''}</div>
      </div>
    </div>
  `;
}

