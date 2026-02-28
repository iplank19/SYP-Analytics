// SYP Analytics - Trade CRUD & Blotter Functions
async function saveBuy(id){
  const _btn=document.querySelector('#modal .modal-footer .btn-success');
  btnLoading(_btn);
  try{return await _saveBuyInner(id)}finally{btnLoading(_btn,false)}
}
async function _saveBuyInner(id){
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
  // First normalize to canonical company, then check CRM for existing match
  const millCompany=normalizeMillCompany(rawMill);
  const mill=typeof normalizeMillCRM==='function'?normalizeMillCRM(millCompany):millCompany;
  const origin=document.getElementById('m-origin').value;
  const orderNum=document.getElementById('m-orderNum').value;

  // Save mill to CRM if new (company-level) + entity resolution
  const parseOriginToLoc=(o)=>{
    if(!o)return null;
    const parts=o.split(',').map(s=>s.trim());
    return{city:parts[0]||o,state:parts[1]||'',label:o};
  };
  if(mill&&!S.mills.find(m=>m.name===mill)){
    const loc=parseOriginToLoc(origin);
    const locs=loc?[loc]:[];
    S.mills.push({name:mill,origin:origin,locations:locs,addedDate:today()});
    // Fire-and-forget entity resolution (non-blocking)
    if(typeof resolveEntity==='function')resolveEntity(mill,'mill','trade_entry').catch(()=>{});
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
  
  if(!validateBuyForm()){showToast('Please fix highlighted fields','warn');return}
  // Warn on duplicate order number (different buy) - with fuzzy matching
  if(b.orderNum){
    const normalizedNew=normalizeOrderNum(b.orderNum);
    const dupe=S.buys.find(x=>x.id!==id&&normalizeOrderNum(x.orderNum||x.po)===normalizedNew);
    if(dupe){
      const userInput=prompt(`DUPLICATE ORDER WARNING!\n\nOrder # "${b.orderNum}" appears to match existing buy:\n- Mill: ${dupe.mill||'unknown'}\n- Product: ${dupe.product}\n- Date: ${dupe.date}\n\nType "SAVE" to save anyway, or click Cancel:`);
      if(userInput?.toUpperCase()!=='SAVE'){showToast('Save cancelled - duplicate order','warn');return}
    }
  }
  if(id){
    const existing=S.buys.find(x=>x.id===id);
    if(existing&&!canEdit(existing)){showToast('You can only edit your own trades','warn');return}
    const i=S.buys.findIndex(x=>x.id===id);
    // Admin can reassign trader, otherwise preserve original trader
    const assignedTrader=S.trader==='Admin'?(document.getElementById('m-trader')?.value||existing?.trader||'Ian P'):(existing?.trader||S.trader);
    const oldTrade=existing?{...existing}:null
    if(i>=0)S.buys[i]={...b,id,trader:assignedTrader}
    if(typeof logTradeModified==='function'&&oldTrade)logTradeModified('buy',id,oldTrade,S.buys[i])
  }else{
    b.id=genId();
    S.buys.unshift(b)
    if(typeof setTradeStatus==='function')setTradeStatus(b.id,'buy','draft','New buy created')
    if(typeof logTradeCreated==='function')logTradeCreated('buy',b)
  }

  await saveAllLocal();closeModal();render();
}

async function saveSell(id){
  const _btn=document.querySelector('#modal .modal-footer .btn-success');
  btnLoading(_btn);
  try{return await _saveSellInner(id)}finally{btnLoading(_btn,false)}
}
async function _saveSellInner(id){
  const customer=normalizeCustomerName(document.getElementById('m-cust').value);
  const destination=document.getElementById('m-dest').value;

  // Save customer to CRM if new + entity resolution
  if(customer&&!S.customers.find(c=>c.name===customer)){
    S.customers.push({name:customer,destination:destination,addedDate:today()});
    if(typeof resolveEntity==='function')resolveEntity(customer,'customer','trade_entry').catch(()=>{});
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
  
  if(!validateSellForm()){showToast('Please fix highlighted fields','warn');return}
  // Warn on duplicate order number (different sell) - with fuzzy matching
  if(s.orderNum){
    const normalizedNew=normalizeOrderNum(s.orderNum);
    const dupe=S.sells.find(x=>x.id!==id&&normalizeOrderNum(x.orderNum||x.linkedPO||x.oc)===normalizedNew);
    if(dupe){
      const userInput=prompt(`DUPLICATE ORDER WARNING!\n\nOrder # "${s.orderNum}" appears to match existing sell:\n- Customer: ${dupe.customer||'unknown'}\n- Product: ${dupe.product}\n- Date: ${dupe.date}\n\nType "SAVE" to save anyway, or click Cancel:`);
      if(userInput?.toUpperCase()!=='SAVE'){showToast('Save cancelled - duplicate order','warn');return}
    }
  }
  if(id){
    const existing=S.sells.find(x=>x.id===id);
    if(existing&&!canEdit(existing)){showToast('You can only edit your own trades','warn');return}
    const i=S.sells.findIndex(x=>x.id===id);
    // Admin can reassign trader, otherwise preserve original trader
    const assignedTrader=S.trader==='Admin'?(document.getElementById('m-trader')?.value||existing?.trader||'Ian P'):(existing?.trader||S.trader);
    const oldTrade=existing?{...existing}:null
    if(i>=0)S.sells[i]={...s,id,trader:assignedTrader}
    if(typeof logTradeModified==='function'&&oldTrade)logTradeModified('sell',id,oldTrade,S.sells[i])
  }else{
    s.id=genId();
    S.sells.unshift(s)
    if(typeof setTradeStatus==='function')setTradeStatus(s.id,'sell','draft','New sell created')
    if(typeof logTradeCreated==='function')logTradeCreated('sell',s)
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
  await saveAllLocal();

  // Also POST to backend /api/rl/save
  try{
    const rlRows=[];
    ['west','central','east'].forEach(region=>{
      Object.entries(rl[region]||{}).forEach(([product,price])=>{
        if(typeof price==='number'&&price>0) rlRows.push({region,product,length:'RL',price});
      });
    });
    if(rlRows.length){
      fetch('/api/rl/save',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({date,rows:rlRows})}).catch(()=>{});
    }
  }catch(e){console.warn('RL backend save:',e)}

  closeModal();render();
}

async function saveCust(oldName){
  const _btn=document.querySelector('#modal .modal-footer .btn-success');
  btnLoading(_btn);
  try{return await _saveCustInner(oldName)}finally{btnLoading(_btn,false)}
}
async function _saveCustInner(oldName){
  const locations=[...document.querySelectorAll('.cust-loc')].map(el=>el.value.trim()).filter(Boolean);
  const assignedTrader=S.trader==='Admin'?(document.getElementById('m-trader')?.value||'Ian P'):S.trader;
  const c={name:normalizeCustomerName(document.getElementById('m-name').value),contact:document.getElementById('m-contact')?.value||'',phone:document.getElementById('m-phone')?.value||'',email:document.getElementById('m-email')?.value||'',locations:locations,destination:locations[0]||'',notes:document.getElementById('m-terms')?.value||'',trader:assignedTrader};
  if(!c.name){showToast('Enter name','warn');return}
  try{
    const existing=S.customers.find(x=>x.name===oldName);
    let res;
    if(existing?.id){
      // Update existing customer via API
      c.trader=S.trader==='Admin'?assignedTrader:(existing.trader||S.trader);
      res=await fetch('/api/crm/customers/'+existing.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)});
    }else{
      // Create new customer via API
      res=await fetch('/api/crm/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)});
    }
    if(!res.ok){
      const err=await res.json().catch(()=>({}));
      throw new Error(err.error||'Server error '+res.status);
    }
    // Update local state immediately
    const savedData=await res.json();
    if(existing){
      Object.assign(existing,c,{id:savedData.id||existing.id});
      if(typeof logCRMAction==='function')logCRMAction('update','customer',existing)
    }else{
      const newCust={...c,id:savedData.id}
      S.customers.unshift(newCust);
      if(typeof logCRMAction==='function')logCRMAction('create','customer',newCust)
    }
    await saveAllLocal();
    showToast('Customer saved','positive');
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
      ${S.trader==='Admin'?`<div style="margin-bottom:16px;padding:12px;background:rgba(232,115,74,0.1);border:1px solid #e8734a">
        <div class="form-group" style="margin:0"><label class="form-label" style="color:#e8734a;font-weight:600">🔑 Assign to Trader</label>
        <select id="m-trader" style="width:200px">${TRADERS.map(t=>`<option value="${t}" ${(mill?.trader||'Ian P')===t?'selected':''}>${t}</option>`).join('')}</select></div>
      </div>`:''}
      <div class="form-group"><label class="form-label">Mill Name</label><input type="text" id="m-name" value="${escapeHtml(mill?.name||'')}"></div>
      <div class="form-group">
        <label class="form-label">Locations (City, ST)</label>
        <div id="mill-locations">
          ${locs.length?locs.map((loc,i)=>`<div style="display:flex;gap:4px;margin-bottom:4px"><input type="text" class="mill-loc" value="${escapeHtml(loc||'')}" placeholder="e.g. Warren, AR" style="flex:1"><button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">×</button></div>`).join(''):'<div style="display:flex;gap:4px;margin-bottom:4px"><input type="text" class="mill-loc" placeholder="e.g. Warren, AR" style="flex:1"><button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">×</button></div>'}
        </div>
        <button class="btn btn-default btn-sm" onclick="addMillLocation()" style="margin-top:4px">+ Add Location</button>
      </div>
      <div class="form-group"><label class="form-label">Region</label><select id="m-region"><option value="">Select...</option>${REGIONS.map(r=>`<option value="${r}" ${mill?.region===r?'selected':''}>${r.charAt(0).toUpperCase()+r.slice(1)}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Contact</label><input type="text" id="m-contact" value="${escapeHtml(mill?.contact||'')}"></div>
      <div class="form-group"><label class="form-label">Phone</label><input type="text" id="m-phone" value="${escapeHtml(mill?.phone||'')}"></div>
      <div class="form-group"><label class="form-label">Notes</label><textarea id="m-notes">${escapeHtml(mill?.notes||'')}</textarea></div>
    </div>
    <div class="modal-footer"><button class="btn btn-default" onclick="closeModal()">Cancel</button><button class="btn btn-success" onclick="saveMill('${escapeHtml(mill?.name||'')}')">Save</button></div>
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
  const _btn=document.querySelector('#modal .modal-footer .btn-success');
  btnLoading(_btn);
  try{return await _saveMillInner(oldName)}finally{btnLoading(_btn,false)}
}
async function _saveMillInner(oldName){
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
    let res;
    if(existing?.id){
      // Update existing mill via API
      m.trader=S.trader==='Admin'?assignedTrader:(existing.trader||S.trader);
      res=await fetch('/api/crm/mills/'+existing.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});
    }else{
      // Create new mill via API
      res=await fetch('/api/crm/mills',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});
    }
    if(!res.ok){
      const err=await res.json().catch(()=>({}));
      throw new Error(err.error||'Server error '+res.status);
    }
    // Update local state immediately
    const savedData=await res.json();
    if(existing){
      Object.assign(existing,m,{id:savedData.id||existing.id});
      if(typeof logCRMAction==='function')logCRMAction('update','mill',existing)
    }else{
      const newMill={...m,id:savedData.id}
      S.mills.unshift(newMill);
      if(typeof logCRMAction==='function')logCRMAction('create','mill',newMill)
    }
    await saveAllLocal();
    showToast('Mill saved','positive');
    closeModal();loadCRMData();
  }catch(e){showToast('Error saving mill: '+e.message,'negative')}
}

function editMill(name){showMillModal(name)}
function editCust(name){
  const c=S.customers.find(x=>x.name===name);
  showCustModal(c);
}

async function deleteCust(name){
  showConfirm(`Delete customer "${escapeHtml(name)}"? This won't delete their trades.`,async()=>{
    try{
      const c=S.customers.find(x=>x.name===name);
      if(c&&typeof logCRMAction==='function')logCRMAction('delete','customer',c)
      if(c?.id){const res=await fetch('/api/crm/customers/'+c.id,{method:'DELETE'});if(!res.ok)throw new Error('Server error '+res.status)}
      S.customers=S.customers.filter(x=>x.name!==name);
      await saveAllLocal();
      showToast('Customer deleted','positive');
      loadCRMData();
    }catch(e){showToast('Error deleting customer: '+e.message,'negative')}
  });
}

async function deleteMill(name){
  showConfirm(`Delete mill "${escapeHtml(name)}"? This won't delete their trades.`,async()=>{
    try{
      const m=S.mills.find(x=>x.name===name);
      if(m&&typeof logCRMAction==='function')logCRMAction('delete','mill',m)
      if(m?.id){const res=await fetch('/api/crm/mills/'+m.id,{method:'DELETE'});if(!res.ok)throw new Error('Server error '+res.status)}
      S.mills=S.mills.filter(x=>x.name!==name);
      await saveAllLocal();
      showToast('Mill deleted','positive');
      loadCRMData();
    }catch(e){showToast('Error deleting mill: '+e.message,'negative')}
  });
}

function editBuy(id){showBuyModal(S.buys.find(b=>b.id===id))}
function editSell(id){showSellModal(S.sells.find(s=>s.id===id))}
function dupBuy(id){const b=S.buys.find(x=>x.id===id);if(b)showBuyModal({...b,id:null,date:today()})}
function dupSell(id){const s=S.sells.find(x=>x.id===id);if(s)showSellModal({...s,id:null,date:today()})}
async function delBuy(id){showConfirm('Delete this buy trade?',async()=>{const t=S.buys.find(b=>b.id===id);if(t&&typeof logTradeDeleted==='function')logTradeDeleted('buy',t);S.buys=S.buys.filter(b=>b.id!==id);await saveAllLocal();render()})}
async function delSell(id){showConfirm('Delete this sell trade?',async()=>{const t=S.sells.find(s=>s.id===id);if(t&&typeof logTradeDeleted==='function')logTradeDeleted('sell',t);S.sells=S.sells.filter(s=>s.id!==id);await saveAllLocal();render()})}
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
async function delRL(d){showConfirm('Delete this RL data?',async()=>{S.rl=S.rl.filter(r=>r.date!==d);await saveAllLocal();render()})}

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
function togglePnlSort(col){
  if(!S.pnlSort)S.pnlSort={col:'tradePnl',dir:'desc'};
  if(S.pnlSort.col===col){S.pnlSort.dir=S.pnlSort.dir==='asc'?'desc':'asc'}
  else{S.pnlSort={col,dir:'desc'}}
  render();
}
function toggleCrmSort(col){
  if(!S.crmSort)S.crmSort={col:'name',dir:'asc'};
  if(S.crmSort.col===col){S.crmSort.dir=S.crmSort.dir==='asc'?'desc':'asc'}
  else{S.crmSort={col,dir:'asc'}}
  render();
}
function toggleDashPosSort(col){
  if(!S.dashPosSort)S.dashPosSort={col:'product',dir:'asc'};
  if(S.dashPosSort.col===col){S.dashPosSort.dir=S.dashPosSort.dir==='asc'?'desc':'asc'}
  else{S.dashPosSort={col,dir:'desc'}}
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
          <div><span style="color:var(--muted)">OC:</span> ${escapeHtml(sell.oc||'—')}</div>
          <div><span style="color:var(--muted)">Customer:</span> ${escapeHtml(sell.customer||'—')}</div>
          <div><span style="color:var(--muted)">Product:</span> ${escapeHtml(sell.product||'')} ${escapeHtml(sell.length||'RL')}</div>
          <div><span style="color:var(--muted)">Volume:</span> ${fmtN(sell.volume)} MBF</div>
          <div><span style="color:var(--muted)">Price:</span> ${fmt(sell.price)} DLVD</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Select PO to Cover</label>
        <select id="link-po" style="width:100%">
          <option value="">— Select PO —</option>
          ${availPOs.map(b=>`<option value="${escapeHtml(b.po||'')}">${escapeHtml(b.po||'')} | ${escapeHtml(b.product||'')} ${escapeHtml(b.length||'RL')} | ${escapeHtml(b.mill||'')} | ${fmt(b.price)} | ${fmtN(b.avail)} MBF avail</option>`).join('')}
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
    if(!r.ok)throw new Error('Futures API error: '+r.status);
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
  const rollingBasisVals=historicalBasis.map(h=>h.basis).filter(v=>v!=null&&!isNaN(v));
  const rollingAvg=rollingBasisVals.length?rollingBasisVals.reduce((a,b)=>a+b,0)/rollingBasisVals.length:null;
  const vsAvg=rollingAvg!==null?Math.round(lockedBasis-rollingAvg):null;
  const el=document.getElementById('calc-results');
  if(!el)return;
  el.innerHTML=`
    <div style="padding:12px;background:var(--panel-alt);border:1px solid var(--border)">
      <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Locked Basis</div>
      <div style="font-size:18px;font-weight:700;color:${lockedBasis>=0?'var(--positive)':'var(--negative)'}">$${lockedBasis}/MBF</div>
      <div style="font-size:10px;color:var(--muted)">Sell - Buy</div>
    </div>
    <div style="padding:12px;background:var(--panel-alt);border:1px solid var(--border)">
      <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Net Margin</div>
      <div style="font-size:18px;font-weight:700;color:${netMargin>=0?'var(--positive)':'var(--negative)'}">$${netMargin}/MBF</div>
      <div style="font-size:10px;color:var(--muted)">Basis - Freight - Commission</div>
    </div>
    <div style="padding:12px;background:var(--panel-alt);border:1px solid var(--border)">
      <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Total P&L</div>
      <div style="font-size:18px;font-weight:700;color:${totalPL>=0?'var(--positive)':'var(--negative)'}">$${totalPL.toLocaleString()}</div>
      <div style="font-size:10px;color:var(--muted)">${volume} MBF (${contracts.toFixed(1)} contracts)</div>
    </div>
    <div style="padding:12px;background:var(--panel-alt);border:1px solid var(--border)">
      <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">$/Contract</div>
      <div style="font-size:18px;font-weight:700;color:${perContract>=0?'var(--positive)':'var(--negative)'}">$${perContract.toLocaleString()}</div>
    </div>
    <div style="padding:12px;background:var(--panel-alt);border:1px solid var(--border)">
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
  const rollingBasisVals=historicalBasis.map(h=>h.basis).filter(v=>v!=null&&!isNaN(v));
  const rollingAvg=rollingBasisVals.length?rollingBasisVals.reduce((a,b)=>a+b,0)/rollingBasisVals.length:null;
  const rollingStdDev=rollingBasisVals.length>1?Math.sqrt(rollingBasisVals.reduce((s,v)=>s+Math.pow(v-rollingAvg,2),0)/(rollingBasisVals.length-1)):null;
  const zAtTarget=(rollingAvg!==null&&rollingStdDev&&rollingStdDev>0)?(target-rollingAvg)/rollingStdDev:null;
  const el=document.getElementById('bt-results');
  if(!el)return;
  el.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
      <div style="padding:12px;background:var(--panel-alt);border:1px solid var(--border)">
        <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Basis Move</div>
        <div style="font-size:18px;font-weight:700;color:${basisMove>=0?'var(--positive)':'var(--negative)'}">$${basisMove}/MBF</div>
        <div style="font-size:10px;color:var(--muted)">${direction==='long'?'Target - Entry':'Entry - Target'}</div>
      </div>
      <div style="padding:12px;background:var(--panel-alt);border:1px solid var(--border)">
        <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">P&L per MBF</div>
        <div style="font-size:18px;font-weight:700;color:${plPerMBF>=0?'var(--positive)':'var(--negative)'}">$${plPerMBF.toFixed(2)}</div>
        <div style="font-size:10px;color:var(--muted)">Move - $${commission} commission</div>
      </div>
      <div style="padding:12px;background:var(--panel-alt);border:1px solid var(--border)">
        <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Total P&L</div>
        <div style="font-size:18px;font-weight:700;color:${totalPL>=0?'var(--positive)':'var(--negative)'}">$${totalPL.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--muted)">${volume} MBF</div>
      </div>
      <div style="padding:12px;background:var(--panel-alt);border:1px solid var(--border)">
        <div style="font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:4px">Z-Score at Target</div>
        <div style="font-size:18px;font-weight:700;color:${zAtTarget!==null?(Math.abs(zAtTarget)>=1.5?'var(--negative)':'var(--positive)'):'var(--muted)'}">${zAtTarget!==null?zAtTarget.toFixed(2):'—'}</div>
        <div style="font-size:10px;color:var(--muted)">${zAtTarget!==null?(zAtTarget<=p.zScoreSellThreshold?'SELL ZONE':zAtTarget>=p.zScoreBuyThreshold?'BUY ZONE':'NEUTRAL'):''}</div>
      </div>
    </div>
  `;
}

// ============================================================================
// PHASE 1: SMART ORDER MATCHING ENGINE
// ============================================================================

// Normalize product for comparison (strips whitespace, case-insensitive)
function normalizeProductForMatch(product){
  if(!product)return '';
  return product.toLowerCase().replace(/\s+/g,'').replace(/#/g,'');
}

// Calculate match score between a buy and sell (0-100)
function calcMatchScore(buy, sell){
  if(!buy||!sell)return 0;
  let score=0;
  const config=S.autoMatchConfig||{};
  const volTolerance=config.volumeTolerance||0.2;
  const priceTolerance=config.priceTolerance||20;

  // Product match (40 points max)
  const buyProd=normalizeProductForMatch(buy.product);
  const sellProd=normalizeProductForMatch(sell.product);
  if(buyProd===sellProd){
    score+=40;
  }else if(buyProd.includes(sellProd)||sellProd.includes(buyProd)){
    score+=25; // Partial match
  }

  // Length match (15 points max)
  const buyLen=(buy.length||'RL').toString();
  const sellLen=(sell.length||'RL').toString();
  if(buyLen===sellLen){
    score+=15;
  }else if(buyLen==='RL'||sellLen==='RL'){
    score+=10; // RL matches any length
  }

  // Volume compatibility (25 points max)
  const buyVol=buy.volume||0;
  const sellVol=sell.volume||0;
  const soldFromBuy=getVolumeAlreadySold(buy);
  const availVol=buyVol-soldFromBuy;

  if(availVol>=sellVol){
    score+=25; // Full coverage available
  }else if(availVol>=sellVol*(1-volTolerance)){
    score+=Math.round(25*(availVol/sellVol)); // Partial coverage
  }

  // Date proximity (10 points max) - prefer recent buys for recent sells
  const buyDate=new Date(buy.date||0);
  const sellDate=new Date(sell.date||0);
  const daysDiff=Math.abs((sellDate-buyDate)/(1000*60*60*24));
  if(daysDiff<=7)score+=10;
  else if(daysDiff<=14)score+=7;
  else if(daysDiff<=30)score+=4;

  // Price margin check (10 points max) - ensure profitable match
  const buyPrice=buy.price||0;
  const sellPrice=sell.price||0;
  const freight=sell.freight||0;
  const freightPerMBF=sellVol>0?freight/sellVol:0;
  const margin=sellPrice-freightPerMBF-buyPrice;

  if(margin>priceTolerance)score+=10;
  else if(margin>0)score+=6;
  else if(margin>=-priceTolerance)score+=2;

  return Math.min(100,Math.max(0,score));
}

// Get volume already sold from a buy order
function getVolumeAlreadySold(buy){
  if(!buy)return 0;
  const ord=String(buy.orderNum||buy.po||'').trim();
  if(!ord)return 0;
  return S.sells.filter(s=>{
    const sellOrd=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    return sellOrd===ord&&s.status!=='cancelled';
  }).reduce((sum,s)=>sum+(s.volume||0),0);
}

// Get available volume on a buy order
function getAvailableVolume(buy){
  if(!buy)return 0;
  return(buy.volume||0)-getVolumeAlreadySold(buy);
}

// Calculate margin preview for a potential match
function calcMarginPreview(buy,sell){
  if(!buy||!sell)return null;
  const buyPrice=buy.price||0;
  const sellPrice=sell.price||0;
  const sellVol=sell.volume||0;
  const freight=sell.freight||0;
  const freightPerMBF=sellVol>0?freight/sellVol:0;
  const marginPerMBF=sellPrice-freightPerMBF-buyPrice;
  const totalMargin=marginPerMBF*sellVol;

  return{
    buyPrice,
    sellPrice,
    freightPerMBF:Math.round(freightPerMBF),
    marginPerMBF:Math.round(marginPerMBF),
    totalMargin:Math.round(totalMargin),
    volume:sellVol
  };
}

// Suggest best matches for an unmatched sell (short position)
function suggestMatchesForShort(sell){
  if(!sell)return[];
  const config=S.autoMatchConfig||{};
  const minScore=config.minScore||60;
  const volTolerance=config.volumeTolerance||0.2;

  // Get buys that could cover this sell
  const candidates=S.buys.filter(b=>{
    if(b.status==='cancelled')return false;
    const availVol=getAvailableVolume(b);
    if(availVol<(sell.volume||0)*(1-volTolerance))return false;
    // Product match check
    const buyProd=normalizeProductForMatch(b.product);
    const sellProd=normalizeProductForMatch(sell.product);
    return buyProd===sellProd||buyProd.includes(sellProd)||sellProd.includes(buyProd);
  });

  // Score and rank matches
  const scored=candidates.map(b=>({
    buy:b,
    score:calcMatchScore(b,sell),
    margin:calcMarginPreview(b,sell),
    availableVolume:getAvailableVolume(b)
  })).filter(m=>m.score>=minScore);

  // Sort by score descending, take top 5
  scored.sort((a,b)=>b.score-a.score);
  return scored.slice(0,5);
}

// Auto-match a sell to best available buy
async function autoMatchShort(sellId){
  const sell=S.sells.find(s=>s.id===sellId);
  if(!sell){showToast('Sell not found','warn');return null}

  // Check if already matched
  const ord=String(sell.orderNum||sell.linkedPO||sell.oc||'').trim();
  if(ord){
    const existingBuy=S.buys.find(b=>String(b.orderNum||b.po||'').trim()===ord);
    if(existingBuy){showToast('Already matched to PO '+ord,'info');return null}
  }

  const suggestions=suggestMatchesForShort(sell);
  if(!suggestions.length){showToast('No matching buys found','warn');return null}

  const best=suggestions[0];
  const config=S.autoMatchConfig||{};

  // Auto-confirm if enabled and score is high enough
  if(config.autoConfirm&&best.score>=90){
    return confirmMatch(sellId,best.buy.id);
  }

  return best;
}

// Confirm a match between sell and buy
async function confirmMatch(sellId,buyId){
  const sell=S.sells.find(s=>s.id===sellId);
  const buy=S.buys.find(b=>b.id===buyId);

  if(!sell||!buy){showToast('Trade not found','warn');return false}

  const buyOrd=String(buy.orderNum||buy.po||'').trim();
  if(!buyOrd){showToast('Buy has no order number','warn');return false}

  // Link the sell to the buy's order number
  sell.linkedPO=buyOrd;
  sell.orderNum=buyOrd;
  sell.oc=buyOrd;

  await saveAllLocal();
  showToast(`Matched to PO ${buyOrd}`,'positive');
  render();
  return true;
}

// Get all unmatched sells (short positions)
function getUnmatchedSells(){
  const buyOrders=new Set(
    S.buys.filter(b=>b.status!=='cancelled')
      .map(b=>String(b.orderNum||b.po||'').trim())
      .filter(Boolean)
  );

  return S.sells.filter(s=>{
    if(s.status==='cancelled')return false;
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    return!ord||!buyOrders.has(ord);
  });
}

// Show smart match modal for a sell
function showSmartMatchModal(sellId){
  const sell=S.sells.find(s=>s.id===sellId);
  if(!sell){showToast('Sell not found','warn');return}

  const suggestions=suggestMatchesForShort(sell);

  document.getElementById('modal').innerHTML=`<div class="modal-overlay" onclick="closeModal()"><div class="modal wide" onclick="event.stopPropagation()">
    <div class="modal-header">
      <span class="modal-title info">SMART MATCH SUGGESTIONS</span>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="match-sell-summary" style="background:var(--panel-alt);padding:12px;margin-bottom:16px;border:1px solid var(--info)">
        <div style="font-weight:600;color:var(--info);margin-bottom:8px">SHORT POSITION</div>
        <div class="grid-3" style="font-size:11px">
          <div><span style="color:var(--muted)">Product:</span> ${escapeHtml(sell.product||'')} ${escapeHtml(sell.length||'RL')}</div>
          <div><span style="color:var(--muted)">Volume:</span> ${fmtN(sell.volume)} MBF</div>
          <div><span style="color:var(--muted)">Sell Price:</span> ${fmt(sell.price)} DLVD</div>
          <div><span style="color:var(--muted)">Customer:</span> ${escapeHtml(sell.customer||'—')}</div>
          <div><span style="color:var(--muted)">Destination:</span> ${escapeHtml(sell.destination||'—')}</div>
          <div><span style="color:var(--muted)">Freight:</span> ${fmt(sell.freight||0)}</div>
        </div>
      </div>

      ${suggestions.length?`
        <div style="font-weight:600;margin-bottom:12px">TOP ${suggestions.length} MATCHES</div>
        <div class="match-suggestions">
          ${suggestions.map((s,i)=>`
            <div class="match-card" style="background:var(--panel);border:1px solid ${s.score>=80?'var(--positive)':s.score>=60?'var(--warn)':'var(--border)'};padding:12px;margin-bottom:8px;border-radius:var(--radius)">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <div style="display:flex;align-items:center;gap:8px">
                  <span class="match-rank" style="background:${i===0?'var(--positive)':'var(--panel-alt)'};color:${i===0?'#000':'var(--text)'};padding:2px 8px;font-weight:700;font-size:10px">#${i+1}</span>
                  <span style="font-weight:600">${escapeHtml(s.buy.mill||'Unknown Mill')}</span>
                  <span class="badge badge-${s.score>=80?'success':s.score>=60?'warn':'info'}">${s.score}% MATCH</span>
                </div>
                <button class="btn btn-${i===0?'success':'primary'} btn-sm" onclick="confirmMatch(${sellId},${s.buy.id});closeModal()">
                  ${i===0?'Best Match':'Select'}
                </button>
              </div>
              <div class="grid-2" style="font-size:10px;gap:8px">
                <div>
                  <div><span style="color:var(--muted)">PO:</span> ${escapeHtml(s.buy.orderNum||s.buy.po||'—')}</div>
                  <div><span style="color:var(--muted)">Product:</span> ${escapeHtml(s.buy.product||'')} ${escapeHtml(s.buy.length||'RL')}</div>
                  <div><span style="color:var(--muted)">Buy Price:</span> ${fmt(s.buy.price)} FOB</div>
                  <div><span style="color:var(--muted)">Available:</span> ${fmtN(s.availableVolume)} MBF</div>
                </div>
                <div style="background:var(--bg);padding:8px;border-radius:var(--radius)">
                  <div style="font-weight:600;margin-bottom:4px;color:${s.margin?.marginPerMBF>=0?'var(--positive)':'var(--negative)'}">
                    MARGIN PREVIEW
                  </div>
                  <div><span style="color:var(--muted)">$/MBF:</span> <span class="${s.margin?.marginPerMBF>=0?'positive':'negative'}">${fmt(s.margin?.marginPerMBF||0)}</span></div>
                  <div><span style="color:var(--muted)">Total:</span> <span class="${s.margin?.totalMargin>=0?'positive':'negative'}">${fmt(s.margin?.totalMargin||0)}</span></div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `:`
        <div class="empty-state" style="padding:40px">
          <div style="font-size:32px;margin-bottom:12px">🔍</div>
          <div style="font-weight:600;margin-bottom:8px">No Matching Buys Found</div>
          <div style="color:var(--muted);font-size:11px">
            No POs match this product with available volume.<br>
            Consider creating a new buy order.
          </div>
          <button class="btn btn-success" style="margin-top:16px" onclick="closeModal();showBuyModal({product:'${escapeHtml(sell.product||'')}',length:'${escapeHtml(sell.length||'RL')}'})">
            + Create Buy
          </button>
        </div>
      `}
    </div>
    <div class="modal-footer">
      <button class="btn btn-default" onclick="closeModal()">Cancel</button>
    </div>
  </div></div>`;
}

// ============================================================================
// PHASE 3: EXECUTION PIPELINE FUNCTIONS
// ============================================================================

// Pipeline stage definitions
const PIPELINE_STAGES=[
  {id:'quoted',label:'Quoted',icon:'📝',color:'var(--muted)'},
  {id:'ordered',label:'Ordered',icon:'📋',color:'var(--info)'},
  {id:'confirmed',label:'Confirmed',icon:'✓',color:'var(--accent)'},
  {id:'shipped',label:'Shipped',icon:'🚚',color:'var(--warn)'},
  {id:'delivered',label:'Delivered',icon:'📦',color:'var(--positive)'},
  {id:'settled',label:'Settled',icon:'💰',color:'var(--positive)'}
];

// Get current pipeline stage for a trade
function getPipelineStage(trade){
  if(!trade)return'quoted';
  // Check explicit stage first
  if(trade.pipelineStage)return trade.pipelineStage;
  // Infer from status flags
  if(trade.settled||trade.invoiced)return'settled';
  if(trade.delivered)return'delivered';
  if(trade.shipped)return'shipped';
  if(trade.confirmed)return'confirmed';
  if(trade.orderNum||trade.linkedPO||trade.po)return'ordered';
  return'quoted';
}

// Advance a trade to the next pipeline stage
async function advanceStage(tradeId,tradeType='sell'){
  const trades=tradeType==='sell'?S.sells:S.buys;
  const trade=trades.find(t=>t.id===tradeId);
  if(!trade){showToast('Trade not found','warn');return false}

  const currentStage=getPipelineStage(trade);
  const stageOrder=S.pipelineStages||['quoted','ordered','confirmed','shipped','delivered','settled'];
  const currentIdx=stageOrder.indexOf(currentStage);

  if(currentIdx>=stageOrder.length-1){
    showToast('Already at final stage','info');
    return false;
  }

  const nextStage=stageOrder[currentIdx+1];
  trade.pipelineStage=nextStage;

  // Update legacy flags for compatibility
  if(nextStage==='confirmed')trade.confirmed=true;
  if(nextStage==='shipped')trade.shipped=true;
  if(nextStage==='delivered')trade.delivered=true;
  if(nextStage==='settled')trade.settled=true;

  await saveAllLocal();
  showToast(`Advanced to ${nextStage}`,'positive');
  render();
  return true;
}

// Move trade to specific pipeline stage
async function setStage(tradeId,stage,tradeType='sell'){
  const trades=tradeType==='sell'?S.sells:S.buys;
  const trade=trades.find(t=>t.id===tradeId);
  if(!trade){showToast('Trade not found','warn');return false}

  trade.pipelineStage=stage;

  // Update legacy flags
  trade.confirmed=(['confirmed','shipped','delivered','settled'].includes(stage));
  trade.shipped=(['shipped','delivered','settled'].includes(stage));
  trade.delivered=(['delivered','settled'].includes(stage));
  trade.settled=(stage==='settled');

  await saveAllLocal();
  render();
  return true;
}

// Get trades grouped by pipeline stage
function getTradesByStage(){
  const stages={};
  PIPELINE_STAGES.forEach(s=>stages[s.id]=[]);

  // Process sells with their matched buys
  S.sells.filter(s=>s.status!=='cancelled').forEach(sell=>{
    const stage=getPipelineStage(sell);
    const ord=String(sell.orderNum||sell.linkedPO||sell.oc||'').trim();
    const buy=ord?S.buys.find(b=>String(b.orderNum||b.po||'').trim()===ord):null;

    // Calculate margin if matched
    let margin=null;
    if(buy){
      const freightPerMBF=(sell.volume||0)>0?(sell.freight||0)/(sell.volume||0):0;
      margin=(sell.price||0)-freightPerMBF-(buy.price||0);
    }

    const card={
      id:sell.id,
      type:'sell',
      customer:sell.customer||'Unknown',
      product:sell.product,
      length:sell.length||'RL',
      volume:sell.volume||0,
      sellPrice:sell.price||0,
      buyPrice:buy?.price||null,
      margin,
      mill:buy?.mill||'Unmatched',
      date:sell.date,
      destination:sell.destination,
      daysInStage:calcDaysInStage(sell),
      isMatched:!!buy,
      orderNum:ord
    };

    if(stages[stage])stages[stage].push(card);
  });

  return stages;
}

// Calculate days a trade has been in current stage
function calcDaysInStage(trade){
  const stageDate=trade.stageChangedAt||trade.date;
  if(!stageDate)return 0;
  const now=new Date();
  const then=new Date(stageDate);
  return Math.floor((now-then)/(1000*60*60*24));
}

// Show trade detail (opens edit modal for the trade)
function showTradeDetail(tradeId,tradeType='sell'){
  if(tradeType==='sell'){
    const trade=S.sells.find(s=>String(s.id)===String(tradeId));
    if(trade&&typeof showSellModal==='function'){
      showSellModal(trade);
    }
  }else{
    const trade=S.buys.find(b=>String(b.id)===String(tradeId));
    if(trade&&typeof showBuyModal==='function'){
      showBuyModal(trade);
    }
  }
}

