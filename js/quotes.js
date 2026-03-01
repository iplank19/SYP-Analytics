// SYP Analytics - Quote Engine Functions

// ============================================================
// QUICK QUOTE BUILDER FUNCTIONS
// ============================================================

// Parse products from textarea input
function parseQuoteProducts(){
  const input=document.getElementById('qb-products-input');
  if(!input)return;

  const lines=input.value.split('\n').map(l=>l.trim()).filter(Boolean);
  if(!lines.length){
    showToast('Enter some products first','warn');
    return;
  }

  // Clear existing items and create new ones from parsed lines
  S.quoteItems=lines.map(line=>({
    id:genId(),
    product:line,
    selected:true
  }));

  save('quoteItems',S.quoteItems);
  showToast(`Parsed ${lines.length} products`,'positive');
  render();
}

// Main function: Show best costs for all products
// Normalize product string for matching (strip spaces around #, lowercase)
function _qeNormProduct(p){
  return (p||'').toLowerCase().replace(/\s+/g,'').replace(/#/g,'#');
}

// Resolve mill origin city from MILL_DIRECTORY, quote fields, S.mills, or mill name suffix
function _resolveMillOrigin(mill,q){
  // 1. MILL_DIRECTORY lookup (best source)
  const dirEntry=typeof MILL_DIRECTORY!=='undefined'?MILL_DIRECTORY[mill]:null;
  if(dirEntry)return `${dirEntry.city}, ${dirEntry.state}`;

  // 2. Quote record fields (from MI database)
  if(q?.city&&q?.state)return `${q.city}, ${q.state}`;
  if(q?.city)return q.city;

  // 3. S.mills CRM lookup
  const crmMill=S.mills?.find(m=>m.name===mill);
  if(crmMill?.location)return crmMill.location;

  // 4. Fallback: extract city from "Company - City" pattern in mill name
  // e.g. "Mid-South Lumber - Meridian" → try geocoding "Meridian"
  const dashIdx=mill.lastIndexOf(' - ');
  if(dashIdx>0){
    const city=mill.substring(dashIdx+3).trim();
    if(city&&city.length>1&&city!=='Unknown'){
      // Try to find state from MILL_DIRECTORY entries for same company
      const company=mill.substring(0,dashIdx).trim();
      const siblingEntry=typeof MILL_DIRECTORY!=='undefined'?
        Object.entries(MILL_DIRECTORY).find(([k,v])=>k.startsWith(company)&&v.state):null;
      if(siblingEntry)return `${city}, ${siblingEntry[1].state}`;
      // Last resort: just use city name (API can usually geocode "City, State" patterns)
      return city;
    }
  }

  return '';
}

async function showBestCosts(){
  const items=S.quoteItems||[];
  if(!items.length){
    showToast('Add some products first','warn');
    return;
  }

  // Get destination
  const customDest=document.getElementById('qb-custom-dest')?.value?.trim();
  const customerSelect=document.getElementById('qb-customer-select');
  const selectedCustomer=customerSelect?.value?myCustomers().find(c=>c.name===customerSelect.value):null;
  const dest=customDest||selectedCustomer?.locations?.[0]||selectedCustomer?.destination||'';

  if(!dest){
    showToast('Select a customer or enter a destination city','warn');
    return;
  }

  showToast('Fetching best costs...','info');

  for(const item of items){
    const parsed=parseProductString(item.product);
    if(!parsed.base)continue;

    const isMSR=item.product?.toUpperCase().includes('MSR');
    const normBase=_qeNormProduct(parsed.base);

    // 1. Collect ALL candidate quotes from Mill Intel + local
    let candidates=[];

    if(typeof miLoadLatestQuotes==='function'){
      try{
        // Fetch all quotes (no product filter — we normalize client-side)
        const quotes=await miLoadLatestQuotes({});
        quotes.forEach(q=>{
          if(_qeNormProduct(q.product)!==normBase)return;
          // Length filter: prefer exact length match, allow RL only if no exact matches
          if(parsed.length&&parsed.length!=='RL'&&q.length&&q.length!=='RL'&&normalizeLength(q.length)!==parsed.length)return;
          const mill=q.mill_name||q.mill||'';
          const origin=_resolveMillOrigin(mill,q);
          candidates.push({price:q.price,mill,origin,region:q.region||'central',length:q.length||'RL'});
        });
      }catch(e){console.warn('MI lookup failed:',e);}
    }

    // Add local mill quotes as fallback
    if(typeof getLatestMillQuotes==='function'){
      const local=getLatestMillQuotes({});
      local.forEach(q=>{
        if(_qeNormProduct(q.product)!==normBase)return;
        if(parsed.length&&parsed.length!=='RL'&&q.length&&q.length!=='RL'&&normalizeLength(q.length)!==parsed.length)return;
        const mill=q.mill||'';
        // Skip if we already have this mill from MI
        if(candidates.some(c=>c.mill===mill&&c.price===q.price))return;
        const origin=_resolveMillOrigin(mill,q);
        candidates.push({price:q.price,mill,origin,region:q.region||'central',length:q.length||'RL'});
      });
    }

    // Prefer exact-length matches over RL when user wants a specific length
    if(parsed.length&&parsed.length!=='RL'){
      const exact=candidates.filter(c=>normalizeLength(c.length)===parsed.length);
      if(exact.length)candidates=exact;
    }

    if(!candidates.length){
      item.bestMillCost=null;item.bestMill='';item.bestMillOrigin='';
      item.bestMillRegion='central';item.freight=null;item.landed=null;item.miles=null;
      continue;
    }

    // 2. Calculate delivered cost for EACH candidate, pick lowest landed
    let bestLanded=Infinity;
    let bestCandidate=null;
    let bestFreight=null;
    let bestMiles=null;

    for(const c of candidates){
      let miles=null;
      let freight=null;

      if(c.origin&&dest){
        miles=getLaneMiles(c.origin,dest);
        if(!miles){
          try{
            await lookupMileageWithAPI([{origin:c.origin,dest:dest}]);
            miles=getLaneMiles(c.origin,dest);
          }catch(e){}
        }
      }

      if(miles){
        freight=calcFreightPerMBF(miles,c.origin,isMSR);
      }

      const landed=c.price!=null&&freight!=null?Math.round(c.price+freight):null;

      if(landed!=null&&landed<bestLanded){
        bestLanded=landed;
        bestCandidate=c;
        bestFreight=freight;
        bestMiles=miles;
      }else if(landed==null&&!bestCandidate){
        // No freight data yet — track cheapest FOB as fallback
        if(!bestCandidate||c.price<bestCandidate.price){
          bestCandidate=c;
          bestFreight=freight;
          bestMiles=miles;
        }
      }
    }

    if(!bestCandidate)bestCandidate=candidates.reduce((a,b)=>a.price<b.price?a:b);

    const landed=bestCandidate.price!=null&&bestFreight!=null?Math.round(bestCandidate.price+bestFreight):null;

    item.bestMillCost=bestCandidate.price;
    item.bestMill=bestCandidate.mill;
    item.bestMillOrigin=bestCandidate.origin;
    item.bestMillRegion=bestCandidate.region;
    item.freight=bestFreight;
    item.landed=landed;
    item.miles=bestMiles;
  }

  save('quoteItems',S.quoteItems);
  showToast('Costs loaded!','positive');
  render();
}

// Update sell delivered price for an item
function updateQuoteSellDlvd(idx,value){
  if(S.quoteItems[idx]){
    S.quoteItems[idx].sellDlvd=value||null;
    save('quoteItems',S.quoteItems);
    render();
  }
}

// Apply margin to all items that have landed costs
function applyAllMargin(){
  const marginInput=document.getElementById('qb-margin-input');
  const margin=parseFloat(marginInput?.value)||0;
  if(!margin){
    showToast('Enter a margin amount (e.g. 25)','warn');
    return;
  }

  let updated=0;
  S.quoteItems.forEach(item=>{
    if(item.landed){
      item.sellDlvd=Math.round(item.landed+margin);
      updated++;
    }
  });

  if(updated){
    save('quoteItems',S.quoteItems);
    showToast(`Applied $${margin} margin to ${updated} items`,'positive');
    render();
  }else{
    showToast('No items with landed costs to update','warn');
  }
}

// Copy the quick quote to clipboard
function copyQuickQuote(){
  const items=S.quoteItems.filter(i=>i.sellDlvd);
  if(!items.length){
    showToast('No priced items to copy','warn');
    return;
  }

  const customerSelect=document.getElementById('qb-customer-select');
  const customerName=customerSelect?.value||'Customer';
  const customDest=document.getElementById('qb-custom-dest')?.value?.trim();
  const dest=customDest||'';

  let text=`Quote for ${customerName}${dest?' - '+dest:''}\n`;
  text+=`${new Date().toLocaleDateString()}\n\n`;

  items.forEach(item=>{
    text+=`${item.product}: $${item.sellDlvd} delivered\n`;
  });

  text+=`\nAll prices per MBF, delivered.\n`;

  navigator.clipboard.writeText(text).then(()=>{
    showToast('Quote copied!','positive');
  });
}

// ============================================================
// LEGACY FUNCTIONS (kept for compatibility)
// ============================================================

function setQuoteMode(mode){
  S.quoteMode=mode;
  render();
}

function addQuoteItem(isShort=null){
  if(isShort===null)isShort=S.quoteMode==='ai';
  S.quoteItems.push({
    id:genId(),
    product:'',
    origin:'',
    tls:1,
    cost:isShort?null:0,
    fob:0,
    marginAdj:0,
    isShort:isShort,
    selected:true,
    quoteDate:''
  });
  save('quoteItems',S.quoteItems);
  saveCurrentProfileSelections();
  render();
}

function removeQuoteItem(idx){
  S.quoteItems.splice(idx,1);
  save('quoteItems',S.quoteItems);
  saveCurrentProfileSelections();
  render();
}

function updateQuoteItem(idx,field,value){
  if(S.quoteItems[idx]){
    // Normalize values based on field type
    let normalizedValue = value;
    if(field === 'cost' || field === 'fob' || field === 'marginAdj') normalizedValue = normalizePrice(value);
    else if(field === 'tls' || field === 'volume') normalizedValue = normalizeVolume(value);
    else if(field === 'product') normalizedValue = normalizeProduct(value);
    else if(field === 'origin') normalizedValue = normalizeLocation(value).display || value;

    S.quoteItems[idx][field] = normalizedValue;
    save('quoteItems',S.quoteItems);
    saveCurrentProfileSelections();
    // Only re-render stats if needed
    if(field==='cost'||field==='fob'||field==='tls'||field==='selected'||field==='marginAdj'){
      render();
    }
  }
}

function updateQuoteMargin(idx,value){
  if(S.quoteItems[idx]){
    const adj=parseFloat(value)||0;
    const cost=S.quoteItems[idx].cost||0;
    S.quoteItems[idx].marginAdj=adj;
    S.quoteItems[idx].fob=Math.round(cost+adj);
    save('quoteItems',S.quoteItems);
    saveCurrentProfileSelections();
    render();
  }
}

function toggleQuoteItem(idx,checked){
  if(S.quoteItems[idx]){
    S.quoteItems[idx].selected=checked;
    save('quoteItems',S.quoteItems);
    saveCurrentProfileSelections();
    render();
  }
}

function toggleAllQuoteItems(checked){
  S.quoteItems.forEach(i=>i.selected=checked);
  save('quoteItems',S.quoteItems);
  saveCurrentProfileSelections();
  render();
}

// Apply universal profit adder to all selected items
function applyProfitAdder(){
  const input=document.getElementById('profit-adder');
  const adj=parseFloat(input?.value)||0;
  if(adj===0){
    showToast('Enter an amount to adjust (e.g. +20 or -5)','warn');
    return;
  }

  const selectedItems=S.quoteItems.filter(i=>i.selected!==false&&i.fob);
  if(!selectedItems.length){
    showToast('No items with FOB prices to adjust','warn');
    return;
  }

  selectedItems.forEach(item=>{
    item.fob=Math.round((item.fob||0)+adj);
    // Also update marginAdj to reflect the change
    item.marginAdj=(item.marginAdj||0)+adj;
  });

  save('quoteItems',S.quoteItems);
  saveCurrentProfileSelections();

  // Clear input after applying
  if(input)input.value='';

  showToast(`Adjusted ${selectedItems.length} items by ${adj>0?'+':''}$${adj}/MBF`,'positive');
  render();
}

function clearQuoteItems(){
  showConfirm('Clear all quote items?',()=>{
    S.quoteItems=[];
    save('quoteItems',S.quoteItems);
    saveCurrentProfileSelections();
    render();
  });
}

function loadFromInventory(){
  // Load long positions from Risk view into quote items
  const positions={};
  const normLen=l=>String(l||'RL').replace(/'/g,'');
  S.buys.forEach(b=>{
    const len=normLen(b.length);
    const key=`${b.product}|${len}`;
    if(!positions[key])positions[key]={product:b.product,length:len,bought:0,sold:0,cost:0,costVol:0,mill:b.mill};
    positions[key].bought+=b.volume||0;
    positions[key].cost+=(b.price||0)*(b.volume||0);
    positions[key].costVol+=b.volume||0;
  });
  S.sells.forEach(s=>{
    const len=normLen(s.length);
    const key=`${s.product}|${len}`;
    if(positions[key])positions[key].sold+=s.volume||0;
  });
  
  const longPos=Object.values(positions).filter(p=>p.bought>p.sold);
  if(!longPos.length){
    showToast('No long positions to load. Add some buys first.','warn');
    return;
  }
  
  // Convert to quote items
  const mbfPerTL=S.quoteMBFperTL||23;
  longPos.forEach(p=>{
    const netVol=p.bought-p.sold;
    const avgCost=p.costVol>0?Math.round(p.cost/p.costVol):0;
    const tls=Math.ceil(netVol/mbfPerTL);
    // Try to find mill location
    let origin='';
    if(p.mill){
      const mill=S.mills.find(m=>m.name===p.mill);
      if(mill&&mill.location)origin=mill.location;
      else if(mill&&mill.city)origin=mill.city;
    }
    S.quoteItems.push({
      id:genId(),
      product:formatProductLabel(p.product,p.length),
      origin:origin,
      tls:tls,
      cost:avgCost,
      fob:avgCost,
      marginAdj:0,
      isShort:false,
      selected:true,
      quoteDate:''
    });
  });
  
  save('quoteItems',S.quoteItems);
  saveCurrentProfileSelections();
  render();
}

async function loadFromMillQuotes(){
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;

  // Helper to suggest FOB price based on RL spread
  function suggestFOB(cost,product,length,region){
    if(!latestRL)return{fob:Math.round(cost+25),margin:25};
    const parsed=parseProductString(product)||{base:product,length:length};
    const rlPrice=getRLPrice(latestRL,parsed.base,parsed.length||length,region);
    if(rlPrice){
      const spread=rlPrice-cost;
      const margin=spread>0?Math.max(20,Math.round(spread*0.3)):25;
      return{fob:Math.round(cost+margin),margin};
    }
    return{fob:Math.round(cost+25),margin:25};
  }

  // Try Mill Intel DB first (has richer data with city/location)
  let loaded=false;
  if(typeof miLoadLatestQuotes==='function'){
    try{
      const latest=await miLoadLatestQuotes();
      if(latest.length){
        let mills=[];
        try{mills=await miLoadMills();}catch(e){}
        const millLocations={};
        mills.forEach(m=>{
          if(m.location)millLocations[m.name]=m.location;
          else if(m.city)millLocations[m.name]=m.state?m.city+', '+m.state:m.city;
        });

        let added=0;
        latest.forEach(q=>{
          // Build origin as "City, ST" for accurate mileage geocoding
          const qOrigin=q.city&&q.city.includes(',')?q.city:q.city&&q.state?q.city+', '+q.state:q.city||'';
          const origin=millLocations[q.mill_name]||qOrigin||q.mill_name;
          const productLabel=formatProductLabel(q.product,q.length||'RL');
          const exists=S.quoteItems.find(i=>i.product===productLabel&&i.origin===origin);
          if(exists)return;

          // Determine region for RL lookup
          const state=extractState(origin);
          const region=state&&typeof MI_STATE_REGIONS!=='undefined'?MI_STATE_REGIONS[state]||'central':'central';
          const{fob,margin}=suggestFOB(q.price,q.product,q.length,region);

          S.quoteItems.push({
            id:genId(),
            product:productLabel,
            origin:origin,
            tls:q.tls||1,
            cost:q.price,
            fob:fob,
            marginAdj:margin,
            isShort:false,
            selected:true,
            shipWeek:q.ship_window||'',
            quoteDate:q.date||''
          });
          added++;
        });
        if(added){
          save('quoteItems',S.quoteItems);
          saveCurrentProfileSelections();
          render();
          showToast(`Loaded ${added} items with suggested margins`,'positive');
        }else{
          showToast('All mill quote products already in quote items','info');
        }
        loaded=true;
      }
    }catch(e){
      console.warn('Mill Intel DB not available, trying local:',e);
    }
  }

  // Fallback to local mill pricing store
  if(!loaded){
    if(typeof getLatestMillQuotes!=='function'){showToast('Mill pricing not available','warn');return;}
    const latest=getLatestMillQuotes();
    if(!latest.length){showToast('No mill quotes in database. Go to Mill Intake to add some.','warn');return;}
    let added=0;
    latest.forEach(q=>{
      let origin='';
      const mill=S.mills.find(m=>m.name===q.mill);
      if(mill&&mill.location)origin=mill.location;
      const productLabel=formatProductLabel(q.product,q.length||'RL');
      const exists=S.quoteItems.find(i=>i.product===productLabel&&i.origin===origin);
      if(exists)return;

      // Determine region for RL lookup
      const state=extractState(origin||q.mill);
      const region=state&&typeof MI_STATE_REGIONS!=='undefined'?MI_STATE_REGIONS[state]||'central':'central';
      const{fob,margin}=suggestFOB(q.price,q.product,q.length,region);

      S.quoteItems.push({
        id:genId(),
        product:productLabel,
        origin:origin||q.mill,
        tls:q.tls||1,
        cost:q.price,
        fob:fob,
        marginAdj:margin,
        isShort:false,
        selected:true,
        shipWeek:q.shipWindow||'',
        quoteDate:q.date||''
      });
      added++;
    });
    if(added){
      save('quoteItems',S.quoteItems);
      saveCurrentProfileSelections();
      render();
      showToast(`Loaded ${added} items with suggested margins`,'positive');
    }else{
      showToast('All mill quote products already in quote items','info');
    }
  }
}

// Refresh pricing for selected items from Mill Intel or local mill quotes
// Also suggests FOB sell price based on RL spreads
async function refreshPricingForSelected(){
  const selected=S.quoteItems.filter(i=>i.selected!==false);
  if(!selected.length){
    showToast('No items selected to refresh','warn');
    return;
  }

  let updated=0;
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;

  for(const item of selected){
    // Parse product to get base (e.g., "2x4#2") and length (e.g., "16")
    const parsed=parseProductString(item.product);
    if(!parsed.base)continue;

    // Determine region from origin
    let region='central';
    if(item.origin){
      const state=extractState(item.origin);
      if(state&&typeof MI_STATE_REGIONS!=='undefined'){
        region=MI_STATE_REGIONS[state]||'central';
      }
    }

    // Try Mill Intel first
    let bestPrice=null;
    let priceSource='';

    if(typeof miLoadLatestQuotes==='function'){
      try{
        const quotes=await miLoadLatestQuotes({product:parsed.base});
        // Filter by length if specified
        const filtered=quotes.filter(q=>{
          if(!parsed.length||parsed.length==='RL')return true;
          return !q.length||q.length==='RL'||normalizeLength(q.length)===parsed.length;
        });
        if(filtered.length){
          // Find best (cheapest) price, prefer matching origin
          const matchOrigin=filtered.find(q=>
            q.city&&item.origin&&item.origin.toLowerCase().includes(q.city.toLowerCase())
          );
          const best=matchOrigin||filtered.reduce((a,b)=>a.price<b.price?a:b);
          bestPrice=best.price;
          priceSource='MI';
        }
      }catch(e){console.warn('MI lookup failed:',e);}
    }

    // Fallback to local mill quotes
    if(bestPrice===null&&typeof getBestPrice==='function'){
      const local=getBestPrice(parsed.base);
      if(local){
        bestPrice=local.price;
        priceSource='Local';
      }
    }

    if(bestPrice!==null){
      const oldCost=item.cost;
      item.cost=bestPrice;
      item.quoteDate=today();

      // Suggest FOB sell price using RL spread
      let suggestedFOB=bestPrice;
      if(latestRL){
        const rlPrice=getRLPrice(latestRL,parsed.base,parsed.length,region);
        if(rlPrice){
          // Calculate typical spread: RL - mill cost, then add target margin
          // If mill cost is below RL, use (RL - cost) as base margin
          // Add a small buffer (e.g., $5-10) for profit
          const spread=rlPrice-bestPrice;
          const targetMargin=spread>0?Math.max(20,spread*0.3):25; // At least $20 or 30% of spread
          suggestedFOB=Math.round(bestPrice+targetMargin);
        }else{
          // No RL data, default margin
          suggestedFOB=Math.round(bestPrice+25);
        }
      }else{
        suggestedFOB=Math.round(bestPrice+25);
      }

      item.fob=suggestedFOB;
      item.marginAdj=suggestedFOB-bestPrice;
      updated++;
    }
  }

  if(updated){
    save('quoteItems',S.quoteItems);
    saveCurrentProfileSelections();
    render();
    showToast(`Refreshed pricing for ${updated} items with suggested margins`,'positive');
  }else{
    showToast('No pricing found for selected products','warn');
  }
}

// Get mill quote key for deduplication
function getMillQuoteKey(q){
  const prod=normalizeProduct(q.product||'');
  const mill=(q.mill||q.mill_name||'').toLowerCase().trim();
  const len=normalizeLength(q.length);
  return `${mill}|${prod}|${len}`;
}

function addLane(){
  const origin=document.getElementById('lane-origin')?.value?.trim();
  const dest=document.getElementById('lane-dest')?.value?.trim();
  const miles=+document.getElementById('lane-miles')?.value||0;
  
  if(!origin||!dest||!miles){
    showToast('Please fill in origin, destination, and miles','warn');
    return;
  }
  
  // Check if lane exists
  const existing=S.lanes.findIndex(l=>
    l.origin.toLowerCase()===origin.toLowerCase()&&
    l.dest.toLowerCase()===dest.toLowerCase()
  );
  
  if(existing>=0){
    S.lanes[existing].miles=miles;
  }else{
    S.lanes.push({origin,dest,miles,added:new Date().toISOString()});
  }
  
  save('lanes',S.lanes);
  document.getElementById('lane-origin').value='';
  document.getElementById('lane-dest').value='';
  document.getElementById('lane-miles').value='';
  render();
}

// Extract state abbreviation from location string
function extractState(location){
  if(!location)return null;
  const str=location.toUpperCase();
  // Look for common state abbreviations
  const states=['AL','MS','FL','GA','SC','AR','NC','TX','TN','LA','OK','MO','KY','VA','OH','IN','IL'];
  // Try to find at end after comma
  const match=str.match(/,\s*([A-Z]{2})\s*$/);
  if(match&&states.includes(match[1]))return match[1];
  // Try to find as whole word (avoid matching AL in DALLAS, etc.)
  for(const st of states){
    if(str.split(/[\s,]+/).includes(st))return st;
  }
  return null;
}

// Get RL region from origin location
// West: LA, AR, TX
// Central: MS, AL  
// East: NC, SC, FL, GA
function getRegionFromOrigin(origin){
  const state=extractState(origin);
  if(!state)return 'west'; // default
  
  const westStates=['LA','AR','TX'];
  const centralStates=['MS','AL'];
  const eastStates=['NC','SC','FL','GA'];
  
  if(westStates.includes(state))return 'west';
  if(centralStates.includes(state))return 'central';
  if(eastStates.includes(state))return 'east';
  
  return 'west'; // default for unknown states
}

// Update state freight rate
function updateStateRate(state,rate){
  if(!S.stateRates)S.stateRates={};
  S.stateRates[state]=rate||0;
  save('stateRates',S.stateRates);
  render();
}


// Get rate for a state (for display only)
function getStateRate(state){
  if(!S.stateRates)S.stateRates={};
  return S.stateRates[state]||null;
}

function getLaneMiles(origin,dest){
  if(!origin||!dest)return null;
  
  const normOrigin=origin.toLowerCase().trim();
  const normDest=dest.toLowerCase().trim();
  
  // Try exact match first
  let lane=S.lanes.find(l=>
    l.origin.toLowerCase().trim()===normOrigin&&
    l.dest.toLowerCase().trim()===normDest
  );
  
  // Try partial match on city names (also verify state matches if present)
  if(!lane){
    const originCity=normOrigin.split(',')[0].trim();
    const originState=(normOrigin.split(',')[1]||'').trim();
    const destCity=normDest.split(',')[0].trim();
    const destState=(normDest.split(',')[1]||'').trim();
    lane=S.lanes.find(l=>{
      const lo=l.origin.toLowerCase().trim();
      const ld=l.dest.toLowerCase().trim();
      const loCity=lo.split(',')[0].trim();
      const loState=(lo.split(',')[1]||'').trim();
      const ldCity=ld.split(',')[0].trim();
      const ldState=(ld.split(',')[1]||'').trim();
      const originMatch=loCity.includes(originCity)&&(!originState||!loState||originState===loState);
      const destMatch=ldCity.includes(destCity)&&(!destState||!ldState||destState===ldState);
      return originMatch&&destMatch;
    });
  }
  
  return lane?.miles||null;
}

// Calculate freight per MBF using Base + State Rate model
// Formula: (Base + Miles × StateRate) / MBF per TL
function calcFreightPerMBF(miles,origin,isMSR=false){
  if(!miles)return null;

  const mbfPerTL=isMSR?20:(S.quoteMBFperTL||23);
  const originState=extractState(origin);

  // Get state rate - default to reasonable rate if not set
  const stateRate=originState&&S.stateRates?S.stateRates[originState]||2.25:2.25;

  // Base + (Miles × StateRate) - default base to 300
  const base=S.freightBase||300;
  const freightTotal=base+(miles*stateRate);

  const freightPerMBF=Math.round(freightTotal/mbfPerTL);

  // Apply floor
  const floor=S.shortHaulFloor||0;
  return Math.max(floor,freightPerMBF);
}

function toggleQuoteCustomer(idx,checked){
  const customers=S.customers.filter(c=>c.type!=='mill');
  if(customers[idx]){
    // Find actual customer in S.customers and update
    const custName=customers[idx].name;
    const realIdx=S.customers.findIndex(c=>c.name===custName);
    if(realIdx>=0){
      S.customers[realIdx].quoteSelected=checked;
      save('customers',S.customers);
      
      // Also save to current profile
      saveCurrentProfileSelections();
      
      render();
    }
  }
}

function generateQuotePreview(items,customer,destOverride=null){
  if(!items.length)return '<div style="color:var(--muted)">No items selected</div>';
  
  // Get customer destination from CRM locations or use override
  const dest=destOverride||(customer?.locations||[customer?.destination].filter(Boolean))[0]||'TBD';
  
  // Build table rows
  const rows=items.map(item=>{
    const isMSR=item.product?.toUpperCase().includes('MSR')||item.product?.toUpperCase().includes('2400');
    const miles=getLaneMiles(item.origin,dest);
    const frt=calcFreightPerMBF(miles,item.origin,isMSR);
    const dlvd=frt!=null?(item.fob||0)+frt:null;

    return{
      product:item.product||'',
      tls:item.tls||1,
      price:dlvd,
      ship:item.shipWeek||'Prompt',
      isMSR
    };
  });

  // HTML table output
  let html=`
    <div class="quote-table-output">
      <div class="quote-header">
        <div class="quote-title">SYP AVAILABILITY</div>
        <div class="quote-dest">DLVD ${dest}</div>
      </div>
      <table class="quote-output-table">
        <thead>
          <tr><th>Product</th><th>Qty</th><th>Price</th><th>Ship</th></tr>
        </thead>
        <tbody>
          ${rows.map(r=>`<tr class="${r.isMSR?'msr-row':''}">
            <td>${r.product}</td>
            <td class="qty">${r.tls} TL</td>
            <td class="price">${r.price!=null?'$'+r.price:'N/A'}</td>
            <td class="ship">${r.ship}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  return html;
}

// Generate preview for all locations of a single customer
function generateMultiLocationPreview(items,customer){
  if(!items.length)return '<div style="color:var(--muted)">No items selected</div>';
  if(!customer)return '<div style="color:var(--muted)">Select a customer above</div>';
  
  const locs=customer.locations||[customer.destination].filter(Boolean);
  if(!locs.length)return '<div style="color:var(--muted)">No locations for this customer</div>';
  
  // Generate a preview for each location
  const previews=locs.map(dest=>{
    const rows=items.map(item=>{
      const isMSR=item.product?.toUpperCase().includes('MSR')||item.product?.toUpperCase().includes('2400');
      const miles=getLaneMiles(item.origin,dest);
      const frt=calcFreightPerMBF(miles,item.origin,isMSR);
      const dlvd=frt!=null?(item.fob||0)+frt:null;
      return{product:item.product||'',tls:item.tls||1,price:dlvd,ship:item.shipWeek||'Prompt',isMSR};
    });
    
    return`
      <div class="quote-table-output" style="margin-bottom:12px">
        <div class="quote-header">
          <div class="quote-title">SYP AVAILABILITY</div>
          <div class="quote-dest">DLVD ${dest}</div>
        </div>
        <table class="quote-output-table">
          <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Ship</th></tr></thead>
          <tbody>
            ${rows.map(r=>`<tr class="${r.isMSR?'msr-row':''}">
              <td>${r.product}</td>
              <td class="qty">${r.tls} TL</td>
              <td class="price">${r.price!=null?'$'+r.price:'N/A'}</td>
              <td class="ship">${r.ship}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  });
  
  return`<div style="color:var(--muted);font-size:10px;margin-bottom:8px">${customer.name} • ${locs.length} location${locs.length!==1?'s':''}</div>${previews.join('')}`;
}

// Generate plain text version for clipboard
// Generate quote for a specific city (one-off)
function generateSpecificCityQuote(){
  const cityInput=document.getElementById('specific-city');
  const city=cityInput?.value?.trim();
  
  if(!city){
    showToast('Enter a city (e.g. "Cincinnati, OH")','warn');
    return;
  }
  
  S.specificCity=city;
  
  const items=S.quoteItems.filter(i=>i.selected!==false);
  if(!items.length){
    showToast('No items selected','warn');
    return;
  }

  // Check for missing lanes (use getLaneMiles which does fuzzy matching)
  const neededLanes=[];
  items.forEach(item=>{
    if(!item.origin)return;
    const existingMiles=getLaneMiles(item.origin,city);
    if(!existingMiles){
      const key=`${item.origin}|${city}`;
      if(!neededLanes.find(n=>n.key===key)){
        neededLanes.push({key,origin:item.origin,dest:city});
      }
    }
  });
  
  if(neededLanes.length>0){
    // Need to lookup mileage first
    lookupMileageWithAPI(neededLanes).then(failedLanes=>{
      if(failedLanes.length>0){
        showMileageModal(failedLanes,()=>{
          finishSpecificCityQuote(items,city);
        });
      }else{
        finishSpecificCityQuote(items,city);
      }
    });
  }else{
    finishSpecificCityQuote(items,city);
  }
}

function finishSpecificCityQuote(items,city){
  // Save market blurb
  S.marketBlurb=document.getElementById('market-blurb')?.value||'';
  save('marketBlurb',S.marketBlurb);
  
  // Build HTML with blurb
  const html=generateQuoteHTML(items,city,true);
  const text=generateQuoteText(items,null,city,true);
  
  // Copy HTML to clipboard
  const htmlBlob=new Blob([html],{type:'text/html'});
  const textBlob=new Blob([text],{type:'text/plain'});
  
  navigator.clipboard.write([
    new ClipboardItem({
      'text/html':htmlBlob,
      'text/plain':textBlob
    })
  ]).then(()=>{
    showToast(`Quote for ${city} copied to clipboard!`,'positive');
    render();
  }).catch(e=>{
    navigator.clipboard.writeText(text).then(()=>{
      showToast(`Quote for ${city} copied as text`,'positive');
      render();
    });
  });
}

function copyQuoteOutput(){
  const items=S.quoteItems.filter(i=>i.selected!==false);

  // Use single quote customer dropdown
  const custName=S.singleQuoteCustomer||document.getElementById('single-quote-customer')?.value;
  const customer=custName?S.customers.find(c=>c.name===custName):S.customers.filter(c=>c.type!=='mill')[0];

  if(!items.length){
    showToast('No items selected','warn');
    return;
  }

  if(!customer){
    showToast('Select a customer','warn');
    return;
  }

  // Save market blurb
  S.marketBlurb=document.getElementById('market-blurb')?.value||'';
  save('marketBlurb',S.marketBlurb);

  // Get ALL locations for this customer
  const locations=customer?.locations||[customer?.destination].filter(Boolean);
  if(!locations.length)locations.push('TBD');

  // Build HTML tables for ALL locations (with blurb only on first)
  const htmlParts=locations.map((dest,i)=>generateQuoteHTML(items,dest,i===0));
  const html=`<html><body style="font-family:Calibri,Arial,sans-serif;">${htmlParts.map(h=>h.replace(/<\/?html>|<\/?body[^>]*>/gi,'')).join('<br><br>')}</body></html>`;

  // Also build plain text fallback for ALL locations
  const textParts=locations.map((dest,i)=>generateQuoteText(items,customer,dest,i===0));
  const text=textParts.join('\n\n');

  // Copy HTML to clipboard (works in Outlook, Word, etc)
  const blob=new Blob([html],{type:'text/html'});
  const textBlob=new Blob([text],{type:'text/plain'});

  navigator.clipboard.write([
    new ClipboardItem({
      'text/html':blob,
      'text/plain':textBlob
    })
  ]).then(()=>{
    showToast(`Copied ${locations.length} location${locations.length>1?'s':''} to clipboard!`,'positive');
  }).catch(e=>{
    // Fallback to plain text
    navigator.clipboard.writeText(text).then(()=>{
      showToast('Copied as text (HTML copy not supported in this browser)','positive');
    });
  });
}

// Generate HTML table for clipboard (Outlook-friendly)
function generateQuoteHTML(items,dest,includeBlurb=false){
  const blurb=includeBlurb?(S.marketBlurb||''):'';
  const rows=items.map(item=>{
    const isMSR=item.product?.toUpperCase().includes('MSR')||item.product?.toUpperCase().includes('2400');
    const miles=getLaneMiles(item.origin,dest);
    const frt=calcFreightPerMBF(miles,item.origin,isMSR);
    const dlvd=frt!=null?(item.fob||0)+frt:null;

    return{product:item.product||'',tls:item.tls||1,price:dlvd,ship:item.shipWeek||'Prompt'};
  });

  return`<html><body style="font-family:Calibri,Arial,sans-serif;">
${blurb?`<p style="margin-bottom:16px;">${blurb.replace(/\n/g,'<br>')}</p>`:''}
<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;">
  <thead>
    <tr style="background:#1a5f7a;color:white;">
      <th style="padding:8px 12px;text-align:left;border:1px solid #ccc;">Product</th>
      <th style="padding:8px 12px;text-align:center;border:1px solid #ccc;">Qty</th>
      <th style="padding:8px 12px;text-align:right;border:1px solid #ccc;">Price</th>
      <th style="padding:8px 12px;text-align:right;border:1px solid #ccc;">Ship</th>
    </tr>
  </thead>
  <tbody>
    ${rows.map((r,i)=>`<tr style="background:${i%2?'#f5f5f5':'white'};">
      <td style="padding:6px 12px;border:1px solid #ddd;">${r.product}</td>
      <td style="padding:6px 12px;text-align:center;border:1px solid #ddd;">${r.tls} TL</td>
      <td style="padding:6px 12px;text-align:right;border:1px solid #ddd;font-weight:bold;color:#2e7d32;">${r.price!=null?'$'+r.price:'N/A'}</td>
      <td style="padding:6px 12px;text-align:right;border:1px solid #ddd;color:#666;">${r.ship}</td>
    </tr>`).join('')}
  </tbody>
</table>
<p style="font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#666;margin-top:8px;">
  <strong>DLVD ${dest}</strong>
</p>
</body></html>`;
}

// Generate plain text version for clipboard (with optional blurb)
function generateQuoteText(items,customer,destOverride=null,includeBlurb=false){
  if(!items.length)return '';
  
  const dest=destOverride||(customer?.locations||[customer?.destination].filter(Boolean))[0]||'TBD';
  const blurb=includeBlurb?(S.marketBlurb||''):'';
  
  let txt=blurb?blurb+'\n\n':'';
  txt+=`SYP AVAILABILITY\nDLVD ${dest}\n${'─'.repeat(36)}\n`;
  txt+=`${'Product'.padEnd(16)}${'Qty'.padStart(6)}${'Price'.padStart(8)}${'Ship'.padStart(8)}\n`;
  txt+=`${'─'.repeat(36)}\n`;
  
  items.forEach(item=>{
    const isMSR=item.product?.toUpperCase().includes('MSR')||item.product?.toUpperCase().includes('2400');
    const miles=getLaneMiles(item.origin,dest);
    const frt=calcFreightPerMBF(miles,item.origin,isMSR);
    const dlvd=frt!=null?(item.fob||0)+frt:null;

    const prod=(item.product||'').substring(0,15).padEnd(16);
    const qty=`${item.tls||1} TL`.padStart(6);
    const price=(dlvd!=null?`$${dlvd}`:'N/A').padStart(8);
    const ship=(item.shipWeek||'Prompt').padStart(8);
    
    txt+=`${prod}${qty}${price}${ship}\n`;
  });
  
  
  return txt;
}

function generateAllQuotes(){
  const items=S.quoteItems.filter(i=>i.selected!==false);
  const customers=S.customers.filter(c=>c.type!=='mill'&&c.quoteSelected);
  
  if(!items.length){
    showToast('No items selected','warn');
    return;
  }
  if(!customers.length){
    showToast('No customers selected','warn');
    return;
  }
  
  // Find all unique origin→dest pairs needed (check ALL locations per customer)
  const neededLanes=[];
  items.forEach(item=>{
    if(!item.origin)return;
    customers.forEach(cust=>{
      // Get ALL locations for multi-location customers
      const locs=cust.locations||[cust.destination].filter(Boolean);
      
      locs.forEach(dest=>{
        if(!dest)return;
        if(!getLaneMiles(item.origin,dest)){
          const key=`${item.origin}|${dest}`;
          if(!neededLanes.find(n=>n.key===key)){
            neededLanes.push({key,origin:item.origin,dest});
          }
        }
      });
    });
  });
  
  // If missing lanes, try API lookup first, then modal for failures
  if(neededLanes.length>0){
    lookupMileageWithAPI(neededLanes).then(failedLanes=>{
      if(failedLanes.length>0){
        // Show modal for lanes that couldn't be looked up
        showMileageModal(failedLanes,()=>{
          doGenerateQuotes(items,customers);
        });
      }else{
        doGenerateQuotes(items,customers);
      }
    });
  }else{
    doGenerateQuotes(items,customers);
  }
}

// Try to lookup mileage via API, return array of lanes that failed
async function lookupMileageWithAPI(lanes){
  const failedLanes=[];
  const statusEl=document.getElementById('quote-status');
  
  if(statusEl)statusEl.textContent=`Looking up ${lanes.length} lane(s)...`;
  
  // Try server API first, fall back to direct API calls
  try{
    const res=await fetch('/api/mileage/bulk',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({lanes})
    });
    
    if(res.ok){
      const data=await res.json();
      if(data.results){
        data.results.forEach(r=>{
          if(r.miles){
            // Check for fuzzy duplicate before pushing
            const existingIdx=S.lanes.findIndex(l=>{
              const lo=l.origin.toLowerCase().trim(),ld=l.dest.toLowerCase().trim();
              const ro=r.origin.toLowerCase().trim(),rd=r.dest.toLowerCase().trim();
              return (lo===ro||lo.startsWith(ro.split(',')[0])||ro.startsWith(lo.split(',')[0]))&&(ld===rd||ld.startsWith(rd.split(',')[0])||rd.startsWith(ld.split(',')[0]));
            });
            if(existingIdx>=0){
              const old=S.lanes[existingIdx];
              if(old.miles!==r.miles){
                old.miles=r.miles;old.origin=r.origin;old.dest=r.dest;old.added=new Date().toISOString();
              }
            }else{
              S.lanes.push({origin:r.origin,dest:r.dest,miles:r.miles,added:new Date().toISOString()});
            }
          }else{
            failedLanes.push({origin:r.origin,dest:r.dest});
          }
        });
        save('lanes',S.lanes);
        if(statusEl)statusEl.textContent='';
        return failedLanes;
      }
    }
  }catch(e){}
  
  // Fallback: Direct API calls from browser
  for(const lane of lanes){
    if(statusEl)statusEl.textContent=`Looking up ${lane.origin} → ${lane.dest}...`;
    const miles=await getDirectMileage(lane.origin,lane.dest);
    if(miles){
      // Check for fuzzy duplicate before pushing
      const existingIdx=S.lanes.findIndex(l=>{
        const lo=l.origin.toLowerCase().trim(),ld=l.dest.toLowerCase().trim();
        const fo=lane.origin.toLowerCase().trim(),fd=lane.dest.toLowerCase().trim();
        return (lo===fo||lo.startsWith(fo.split(',')[0])||fo.startsWith(lo.split(',')[0]))&&(ld===fd||ld.startsWith(fd.split(',')[0])||fd.startsWith(ld.split(',')[0]));
      });
      if(existingIdx>=0){
        const old=S.lanes[existingIdx];
        if(old.miles!==miles){
          old.miles=miles;old.origin=lane.origin;old.dest=lane.dest;old.added=new Date().toISOString();
        }
      }else{
        S.lanes.push({origin:lane.origin,dest:lane.dest,miles,added:new Date().toISOString()});
      }
    }else{
      failedLanes.push(lane);
    }
    await sleep(600); // Rate limit
  }
  save('lanes',S.lanes);
  
  if(statusEl)statusEl.textContent='';
  return failedLanes;
}

// Direct mileage lookup via free APIs (no backend needed)
async function getDirectMileage(origin,dest){
  try{
    // Step 1: Geocode origin (skip sleep if cached)
    const originCached=geoCache[origin.toLowerCase().trim()];
    const originCoords=await geocodeLocation(origin);
    if(!originCoords)return null;
    if(!originCached)await sleep(500);

    // Step 2: Geocode destination (skip sleep if cached)
    const destCached=geoCache[dest.toLowerCase().trim()];
    const destCoords=await geocodeLocation(dest);
    if(!destCoords)return null;
    if(!destCached)await sleep(300);

    // Step 3: Get driving distance via OSRM
    const coordsStr=`${originCoords.lon},${originCoords.lat};${destCoords.lon},${destCoords.lat}`;
    const routeRes=await fetch(`https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=false`);
    const routeData=await routeRes.json();

    if(routeData.code==='Ok'&&routeData.routes?.length){
      const meters=routeData.routes[0].distance;
      return Math.round(meters/1609.34);
    }
    return null;
  }catch(e){
    console.error('Direct mileage error:',e);
    return null;
  }
}

// Geocode cache
const geoCache={};

async function geocodeLocation(location){
  if(!location)return null;

  const key=location.toLowerCase().trim();
  if(geoCache[key])return geoCache[key];

  try{
    // Request multiple results so we can prefer cities over counties
    const res=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=5&countrycodes=us`,{
      headers:{'User-Agent':'SYP-Analytics/1.0'}
    });
    const data=await res.json();

    if(data?.length){
      // Prefer city/town/village over county - counties often have same name as cities
      const cityTypes=['city','town','village','hamlet','suburb','neighbourhood'];
      const cityResult=data.find(r=>cityTypes.includes(r.type)||cityTypes.includes(r.addresstype));
      const best=cityResult||data[0];

      const coords={lat:parseFloat(best.lat),lon:parseFloat(best.lon)};
      geoCache[key]=coords;
      return coords;
    }
    return null;
  }catch(e){
    console.error('Geocode error:',e);
    return null;
  }
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

// Single mileage lookup via server API (with fallback)
async function getMileageFromAPI(origin,dest){
  // Try server first
  try{
    const res=await fetch('/api/mileage',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({origin,dest})
    });
    
    if(res.ok){
      const data=await res.json();
      if(data.miles)return data.miles;
    }
  }catch(e){}
  
  // Fallback to direct
  return await getDirectMileage(origin,dest);
}

// Show modal for entering missing mileages (fallback)
function showMileageModal(lanes,callback){
  const html=`
    <div class="modal-overlay" onclick="if(event.target===this)closeMileageModal()">
      <div class="modal" style="width:450px">
        <div class="modal-header">
          <span class="modal-title" style="color:var(--warn)">🚚 Enter Mileage</span>
          <button class="modal-close" onclick="closeMileageModal()">×</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom:16px;color:var(--muted);font-size:11px">Auto-lookup failed for these lanes. Enter miles manually:</p>
          <div style="max-height:300px;overflow-y:auto">
            ${lanes.map((l,i)=>`
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px;background:var(--bg)">
                <div style="flex:1;font-size:11px">
                  <div style="color:var(--text)">${l.origin}</div>
                  <div style="color:var(--muted)">→ ${l.dest}</div>
                </div>
                <input type="number" id="lane-mi-${i}" placeholder="miles" style="width:70px;padding:6px;font-size:12px;text-align:right">
                <span style="color:var(--muted);font-size:10px">mi</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-default" onclick="closeMileageModal()">Cancel</button>
          <button class="btn btn-warn" onclick="saveMileagesAndGenerate()">Save & Generate</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal').innerHTML=html;
  
  window._mileageLanes=lanes;
  window._mileageCallback=callback;
  
  setTimeout(()=>{
    const first=document.getElementById('lane-mi-0');
    if(first)first.focus();
  },100);
}

function closeMileageModal(){
  document.getElementById('modal').innerHTML='';
  window._mileageLanes=null;
  window._mileageCallback=null;
}

function saveMileagesAndGenerate(){
  const lanes=window._mileageLanes||[];
  const callback=window._mileageCallback;
  
  lanes.forEach((l,i)=>{
    const input=document.getElementById(`lane-mi-${i}`);
    const miles=input?parseInt(input.value):0;
    if(miles>0){
      S.lanes.push({origin:l.origin,dest:l.dest,miles,added:new Date().toISOString()});
    }
  });
  
  save('lanes',S.lanes);
  closeMileageModal();
  
  if(callback)callback();
}

// Actually generate the quotes after mileage is collected
function doGenerateQuotes(items,customers){
  const statusEl=document.getElementById('quote-status');
  if(statusEl)statusEl.textContent='';
  
  // Save market blurb
  S.marketBlurb=document.getElementById('market-blurb')?.value||'';
  save('marketBlurb',S.marketBlurb);
  
  let allHTML='<html><body style="font-family:Calibri,Arial,sans-serif;">';
  let allText='';
  
  // Add market blurb if present
  if(S.marketBlurb){
    allText+=S.marketBlurb+'\n\n';
    allHTML+=`<p style="margin-bottom:16px;">${S.marketBlurb.replace(/\n/g,'<br>')}</p>`;
  }
  
  let quoteCount=0;
  
  customers.forEach((cust,i)=>{
    // Get all locations for this customer
    const locs=cust.locations||[cust.destination].filter(Boolean);
    
    if(locs.length===0)return;
    
    // Generate quote for each location
    locs.forEach((loc,j)=>{
      if(quoteCount>0){
        allText+='\n\n'+'═'.repeat(40)+'\n\n';
        allHTML+='<hr style="border:none;border-top:2px solid #ccc;margin:20px 0;">';
      }
      
      // Add customer name header if multi-location
      if(locs.length>1){
        allText+=`${cust.name} - ${loc}\n${'─'.repeat(30)}\n`;
        allHTML+=`<p style="font-weight:bold;color:#1a5f7a;margin-bottom:4px;">${cust.name} - ${loc}</p>`;
      }
      
      allText+=generateQuoteText(items,cust,loc);
      allHTML+=generateQuoteHTML(items,loc);
      quoteCount++;
    });
  });
  
  allHTML+='</body></html>';
  
  // Copy HTML to clipboard for Outlook
  const htmlBlob=new Blob([allHTML],{type:'text/html'});
  const textBlob=new Blob([allText],{type:'text/plain'});
  
  navigator.clipboard.write([
    new ClipboardItem({
      'text/html':htmlBlob,
      'text/plain':textBlob
    })
  ]).then(()=>{
    showToast(`Generated ${quoteCount} quotes for ${customers.length} customers!`,'positive');
    render();
  }).catch(e=>{
    // Fallback to plain text
    navigator.clipboard.writeText(allText).then(()=>{
      showToast(`Generated ${quoteCount} quotes (copied as text)`,'positive');
      render();
    });
  });
}

// Create single Outlook draft for first selected customer
function createSingleDraft(){
  const items=S.quoteItems.filter(i=>i.selected!==false);
  
  // Use single quote customer dropdown
  const custName=S.singleQuoteCustomer||document.getElementById('single-quote-customer')?.value;
  const customer=custName?S.customers.find(c=>c.name===custName):null;
  
  if(!items.length){
    showToast('No items selected','warn');
    return;
  }

  if(!customer){
    showToast('Select a customer from the dropdown','warn');
    return;
  }
  
  // Save market blurb
  S.marketBlurb=document.getElementById('market-blurb')?.value||'';
  save('marketBlurb',S.marketBlurb);
  
  const locs=customer?.locations||[customer?.destination].filter(Boolean);
  const dest=locs[0]||'TBD';
  const email=customer?.email||'';
  const customerName=customer?.name||'Customer';
  
  // Check for missing lanes first (use getLaneMiles for fuzzy matching)
  const neededLanes=[];
  items.forEach(item=>{
    if(!item.origin)return;
    if(!getLaneMiles(item.origin,dest)){
      const key=`${item.origin}|${dest}`;
      if(!neededLanes.find(n=>n.key===key)){
        neededLanes.push({key,origin:item.origin,dest});
      }
    }
  });
  
  if(neededLanes.length>0){
    lookupMileageWithAPI(neededLanes).then(failedLanes=>{
      if(failedLanes.length>0){
        showMileageModal(failedLanes,()=>doCreateSingleDraft(items,customer,dest,email,customerName));
      }else{
        doCreateSingleDraft(items,customer,dest,email,customerName);
      }
    });
  }else{
    doCreateSingleDraft(items,customer,dest,email,customerName);
  }
}

function doCreateSingleDraft(items,customer,dest,email,custName){
  // Build HTML for clipboard (for pasting into draft)
  const html=generateQuoteHTML(items,dest,true);
  const text=generateQuoteText(items,customer,dest,true);
  
  // Copy HTML to clipboard first
  const htmlBlob=new Blob([html],{type:'text/html'});
  const textBlob=new Blob([text],{type:'text/plain'});
  
  navigator.clipboard.write([
    new ClipboardItem({
      'text/html':htmlBlob,
      'text/plain':textBlob
    })
  ]).then(()=>{
    // Show alert first so user knows clipboard is ready
    showToast('Quote copied to clipboard! Outlook will open.','positive');
    
    // Now open mailto link
    const subject=encodeURIComponent(`SYP Availability - ${custName}`);
    const mailto=`mailto:${email}?subject=${subject}`;
    window.location.href=mailto;
  }).catch(e=>{
    console.error('Clipboard error:',e);
    // Fallback - just open mailto with text body (mailto has text limit so might truncate)
    showToast('Could not copy formatted table. Opening email with plain text...','warn');
    const subject=encodeURIComponent(`SYP Availability - ${custName}`);
    const encodedBody=encodeURIComponent(text);
    const mailto=`mailto:${email}?subject=${subject}&body=${encodedBody}`;
    window.location.href=mailto;
  });
}

// Check/Uncheck all quote customers
function uncheckAllQuoteCustomers(){
  S.customers.filter(c=>c.type!=='mill').forEach(c=>c.quoteSelected=false);
  save('customers',S.customers);
  saveCurrentProfileSelections();
  render();
}

function checkAllQuoteCustomers(){
  S.customers.filter(c=>c.type!=='mill').forEach(c=>c.quoteSelected=true);
  save('customers',S.customers);
  saveCurrentProfileSelections();
  render();
}

// Save market blurb on change
function saveMarketBlurb(){
  S.marketBlurb=document.getElementById('market-blurb')?.value||'';
  save('marketBlurb',S.marketBlurb);
}

// Quote Profile Management
function switchQuoteProfile(profileId){
  // Save current profile first before switching
  saveCurrentProfileSelections();
  
  S.quoteProfile=profileId;
  save('quoteProfile',profileId);
  
  // Update customer selections and items based on profile
  const profiles=S.quoteProfiles||{default:{name:'Default',customers:[],items:[]}};
  const profile=profiles[profileId];
  
  if(profile){
    // Load customers
    if(profile.customers){
      S.customers.forEach(c=>c.quoteSelected=false);
      profile.customers.forEach(custName=>{
        const cust=S.customers.find(c=>c.name===custName);
        if(cust)cust.quoteSelected=true;
      });
      save('customers',S.customers);
    }
    
    // Load items
    if(profile.items){
      S.quoteItems=JSON.parse(JSON.stringify(profile.items)); // Deep copy
      save('quoteItems',S.quoteItems);
    }
  }
  
  render();
}

function showNewProfileModal(){
  document.getElementById('modal').innerHTML=`
    <div class="modal-overlay" onclick="closeModal()">
      <div class="modal" onclick="event.stopPropagation()" style="width:400px">
        <div class="modal-header">
          <span class="modal-title">New Quote Profile</span>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Profile Name</label>
            <input type="text" id="new-profile-name" placeholder="e.g. Truss Plants, Ohio Customers" style="width:100%;padding:8px">
          </div>
          <p style="font-size:11px;color:var(--muted);margin-top:12px">This will save the current products and customer selections to the new profile. You can modify them later.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-default" onclick="closeModal()">Cancel</button>
          <button class="btn btn-success" onclick="createNewProfile()">Create Profile</button>
        </div>
      </div>
    </div>`;
  setTimeout(()=>document.getElementById('new-profile-name')?.focus(),100);
}

function createNewProfile(){
  const name=document.getElementById('new-profile-name')?.value?.trim();
  if(!name){
    showToast('Enter a profile name','warn');
    return;
  }

  const id=name.toLowerCase().replace(/[^a-z0-9]/g,'-');
  
  if(!S.quoteProfiles)S.quoteProfiles={default:{name:'Default',customers:[],items:[]}};
  
  if(S.quoteProfiles[id]){
    showToast('Profile already exists','warn');
    return;
  }
  
  // Save current profile selections first
  saveCurrentProfileSelections();
  
  // Create new profile with current customers and items
  const selectedCustomers=S.customers.filter(c=>c.quoteSelected).map(c=>c.name);
  const currentItems=JSON.parse(JSON.stringify(S.quoteItems||[])); // Deep copy
  S.quoteProfiles[id]={name,customers:selectedCustomers,items:currentItems};
  save('quoteProfiles',S.quoteProfiles);
  
  // Switch to new profile
  S.quoteProfile=id;
  save('quoteProfile',id);
  
  closeModal();
  render();
}

function editCurrentProfile(){
  const profileId=S.quoteProfile||'default';
  const profiles=S.quoteProfiles||{default:{name:'Default',customers:[],items:[]}};
  const profile=profiles[profileId];
  
  document.getElementById('modal').innerHTML=`
    <div class="modal-overlay" onclick="closeModal()">
      <div class="modal" onclick="event.stopPropagation()" style="width:500px">
        <div class="modal-header">
          <span class="modal-title">Edit Profile: ${profile.name}</span>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Profile Name</label>
            <input type="text" id="edit-profile-name" value="${profile.name}" style="width:100%;padding:8px" ${profileId==='default'?'disabled':''}>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
            <div>
              <label class="form-label">Customers (${profile.customers?.length||0})</label>
              <div style="max-height:150px;overflow-y:auto;border:1px solid var(--border);padding:8px">
                ${profile.customers?.length?profile.customers.map(c=>`<div style="padding:2px 0;font-size:11px">${c}</div>`).join(''):'<div style="color:var(--muted);font-size:11px">No customers</div>'}
              </div>
            </div>
            <div>
              <label class="form-label">Products (${profile.items?.length||0})</label>
              <div style="max-height:150px;overflow-y:auto;border:1px solid var(--border);padding:8px">
                ${profile.items?.length?profile.items.map(i=>`<div style="padding:2px 0;font-size:11px">${i.product||'—'} from ${i.origin||'—'}</div>`).join(''):'<div style="color:var(--muted);font-size:11px">No products</div>'}
              </div>
            </div>
          </div>
          <p style="font-size:11px;color:var(--muted);margin-top:12px">Products and customers are auto-saved when you modify the quote table or recipient selections.</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-default" onclick="closeModal()">Cancel</button>
          <button class="btn btn-success" onclick="saveProfileEdit('${profileId}')">Save</button>
        </div>
      </div>
    </div>`;
}

function saveProfileEdit(profileId){
  const name=document.getElementById('edit-profile-name')?.value?.trim();
  if(!name){
    showToast('Enter a profile name','warn');
    return;
  }

  if(!S.quoteProfiles)S.quoteProfiles={default:{name:'Default',customers:[]}};
  if(S.quoteProfiles[profileId]){
    S.quoteProfiles[profileId].name=name;
    save('quoteProfiles',S.quoteProfiles);
  }
  
  closeModal();
  render();
}

function deleteCurrentProfile(){
  const profileId=S.quoteProfile||'default';
  if(profileId==='default'){
    showToast('Cannot delete default profile','warn');
    return;
  }
  
  showConfirm('Delete profile "'+escapeHtml(S.quoteProfiles[profileId]?.name||'')+'"?',()=>{
    delete S.quoteProfiles[profileId];
    save('quoteProfiles',S.quoteProfiles);
    S.quoteProfile='default';
    save('quoteProfile','default');
    switchQuoteProfile('default');
  });
}

function saveCurrentProfileSelections(){
  const profileId=S.quoteProfile||'default';
  if(!S.quoteProfiles)S.quoteProfiles={default:{name:'Default',customers:[],items:[]}};
  if(!S.quoteProfiles[profileId])S.quoteProfiles[profileId]={name:'Default',customers:[],items:[]};
  
  const selectedCustomers=S.customers.filter(c=>c.quoteSelected).map(c=>c.name);
  const currentItems=JSON.parse(JSON.stringify(S.quoteItems||[])); // Deep copy
  
  S.quoteProfiles[profileId].customers=selectedCustomers;
  S.quoteProfiles[profileId].items=currentItems;
  save('quoteProfiles',S.quoteProfiles);
}

// Override toggleQuoteCustomer to save profile selections
const originalToggleQuoteCustomer=typeof toggleQuoteCustomer==='function'?toggleQuoteCustomer:null;

// AI price selected items using Claude API for smart suggestions

async function generateDailyBriefing(){
  if(!S.apiKey){
    const key=prompt('Enter your Claude API key for AI features:');
    if(!key)return;
    S.apiKey=key;
    save('apiKey',S.apiKey);
  }
  
  const el=document.getElementById('ai-briefing');
  el.innerHTML='<div style="text-align:center;padding:20px"><span style="color:var(--accent)">🤖 Generating briefing...</span></div>';
  
  const a=analytics();
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
  const prevRL=S.rl.length>1?S.rl[S.rl.length-2]:null;
  
  // Build context
  const positions={};
  S.buys.forEach(b=>{const k=b.product;if(!positions[k])positions[k]={b:0,s:0};positions[k].b+=b.volume||0});
  S.sells.forEach(s=>{const k=s.product;if(!positions[k])positions[k]={b:0,s:0};positions[k].s+=s.volume||0});
  const posStr=Object.entries(positions).filter(([k,v])=>v.b!==v.s).map(([k,v])=>`${k}: ${v.b-v.s>0?'long':'short'} ${Math.abs(v.b-v.s)} MBF`).join(', ')||'Flat';
  
  const openBuys=S.buys.filter(b=>!b.shipped);
  const openSells=S.sells.filter(s=>!s.delivered);
  const shorts=S.sells.filter(s=>!s.linkedPO&&!s.orderNum);
  
  let marketContext='No RL data.';
  if(latestRL){
    const chgs=[];
    if(prevRL){
      ['west','central','east'].forEach(r=>{
        const c=latestRL[r]?.['2x4#2'];
        const p=prevRL[r]?.['2x4#2'];
        if(c&&p&&c!==p)chgs.push(`${r} 2x4: ${c>p?'+':''}$${c-p}`);
      });
    }
    marketContext=`Latest RL (${latestRL.date}): West 2x4 $${latestRL.west?.['2x4#2']||'?'}, Central $${latestRL.central?.['2x4#2']||'?'}, East $${latestRL.east?.['2x4#2']||'?'}. ${chgs.length?'WoW: '+chgs.join(', '):''}}`;
  }
  
  const prompt=`You are Ian's trading assistant at Buckeye Pacific (SYP lumber trader). Generate a concise morning briefing.

TODAY: ${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}

MARKET:
${marketContext}

POSITIONS:
${posStr}
Total Inventory: ${a.inv} MBF (${a.inv>0?'long':'short'})
Margin: $${Math.round(a.margin)}/MBF, Total Profit: $${Math.round(a.profit)}

OPERATIONS:
- ${openBuys.length} orders awaiting shipment IN (${openBuys.slice(0,3).map(b=>b.product+' from '+b.mill).join(', ')})
- ${openSells.length} orders to ship OUT (${openSells.slice(0,3).map(s=>s.product+' to '+s.customer).join(', ')})
- ${shorts.length} short positions need coverage

Write a 3-4 paragraph briefing covering:
1. Market outlook (1 sentence on direction/tone)
2. Key actions needed today (be specific)
3. Opportunities or risks to watch

Be direct, no fluff. Use bullet points sparingly. Address Ian directly.`;

  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':S.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:S.aiModel||'claude-sonnet-4-20250514',max_tokens:800,messages:[{role:'user',content:prompt}]})
    });
    const data=await res.json();
    const reply=data.content?.[0]?.text||'Error generating briefing';
    el.innerHTML=`<div style="white-space:pre-wrap">${reply}</div>
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
        <button class="btn btn-default btn-sm" onclick="generateDailyBriefing()">🔄 Refresh</button>
        <button class="btn btn-default btn-sm" onclick="copyBriefing()">📋 Copy</button>
      </div>`;
  }catch(e){
    el.innerHTML=`<div style="color:var(--negative)">Error: ${e.message}</div>`;
  }
}

function copyBriefing(){
  const el=document.getElementById('ai-briefing');
  const text=el?.innerText||'';
  navigator.clipboard.writeText(text);
  showToast('Briefing copied!','positive');
}

// Weekly Report Generator
async function generateWeeklyReport(){
  if(!S.apiKey){
    const key=prompt('Enter your Claude API key:');
    if(!key)return;
    S.apiKey=key;
    save('apiKey',S.apiKey);
  }
  
  const el=document.getElementById('weekly-report');
  el.innerHTML='<div style="text-align:center;padding:20px"><span style="color:var(--accent)">🤖 Generating report...</span></div>';
  
  // Get last 4 weeks of RL data
  const rlData=S.rl.slice(-4);
  if(rlData.length<2){
    el.innerHTML='<div style="color:var(--negative)">Need at least 2 weeks of RL data to generate report.</div>';
    return;
  }
  
  const latest=rlData[rlData.length-1];
  const prev=rlData[rlData.length-2];
  
  // Calculate changes
  const changes=[];
  ['west','central','east'].forEach(region=>{
    ['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2'].forEach(prod=>{
      const curr=latest[region]?.[prod];
      const prevVal=prev[region]?.[prod];
      if(curr&&prevVal){
        changes.push({region,prod,curr,prev:prevVal,chg:curr-prevVal,pct:((curr-prevVal)/prevVal*100).toFixed(1)});
      }
    });
  });
  
  // Trend (4 week)
  const trend4wk={};
  if(rlData.length>=4){
    const oldest=rlData[0];
    ['west','central','east'].forEach(region=>{
      trend4wk[region]=(latest[region]?.['2x4#2']||0)-(oldest[region]?.['2x4#2']||0);
    });
  }
  
  const prompt=`You are a lumber market analyst. Write a professional weekly market report for SYP (Southern Yellow Pine) lumber to send to customers.

LATEST RANDOM LENGTHS (${latest.date}):
West: 2x4 $${latest.west?.['2x4#2']}, 2x6 $${latest.west?.['2x6#2']}, 2x8 $${latest.west?.['2x8#2']}
Central: 2x4 $${latest.central?.['2x4#2']}, 2x6 $${latest.central?.['2x6#2']}
East: 2x4 $${latest.east?.['2x4#2']}, 2x6 $${latest.east?.['2x6#2']}

WEEK-OVER-WEEK CHANGES:
${changes.filter(c=>c.chg!==0).map(c=>`${c.region} ${c.prod}: ${c.chg>0?'+':''}$${c.chg} (${c.pct}%)`).join('\n')}

4-WEEK TREND:
${Object.entries(trend4wk).map(([r,v])=>`${r}: ${v>0?'+':''}$${v}`).join(', ')}

Write a 2-3 paragraph market update that:
1. Summarizes the week's price action
2. Explains likely drivers (demand, supply, seasonal factors)
3. Gives a brief outlook

Tone: Professional but conversational. Written from a trader's perspective.
Sign off as "Ian @ Buckeye Pacific"

Do NOT use bullet points or headers. Write in flowing paragraphs.`;

  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':S.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:S.aiModel||'claude-sonnet-4-20250514',max_tokens:600,messages:[{role:'user',content:prompt}]})
    });
    const data=await res.json();
    const reply=data.content?.[0]?.text||'Error generating report';
    el.innerHTML=`<div style="white-space:pre-wrap;line-height:1.7">${reply}</div>
      <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:8px">
        <button class="btn btn-default btn-sm" onclick="generateWeeklyReport()">🔄 Regenerate</button>
        <button class="btn btn-success btn-sm" onclick="copyWeeklyReport()">📋 Copy</button>
        <button class="btn btn-primary btn-sm" onclick="emailWeeklyReport()">✉️ Email Draft</button>
      </div>`;
  }catch(e){
    el.innerHTML=`<div style="color:var(--negative)">Error: ${e.message}</div>`;
  }
}

function copyWeeklyReport(){
  const el=document.getElementById('weekly-report');
  const text=el?.innerText||'';
  navigator.clipboard.writeText(text);
  showToast('Report copied!','positive');
}

function emailWeeklyReport(){
  const el=document.getElementById('weekly-report');
  const text=el?.innerText||'';
  const subject=encodeURIComponent('SYP Market Update - '+new Date().toLocaleDateString());
  const body=encodeURIComponent(text);
  window.location.href=`mailto:?subject=${subject}&body=${body}`;
}

function refreshFromRL(){
  const rl=S.rl.length?S.rl[S.rl.length-1]:null;
  if(!rl){
    showToast('No RL data available. Import Random Lengths data first.','warn');
    return;
  }
  
  const selected=S.quoteItems.filter(i=>i.selected!==false&&i.product);
  if(!selected.length){
    showToast('No items to update','warn');
    return;
  }
  
  let updated=0;
  selected.forEach(item=>{
    const parsed=parseProductString(item.product);
    const region=getRegionFromOrigin(item.origin);
    const rlPrice=getRLPrice(rl,parsed.base,parsed.length,region);
    
    if(rlPrice){
      // Apply length adjustments
      let adjustment=0;
      const len=parseInt(parsed.length)||0;
      if(len===8)adjustment=-5;
      else if(len===10)adjustment=0;
      else if(len===12)adjustment=5;
      else if(len===14)adjustment=15;
      else if(len===16)adjustment=25;
      else if(len>=18)adjustment=35;
      
      // Short positions price closer to RL
      if(item.isShort)adjustment=Math.min(adjustment,-10);
      
      item.fob=rlPrice+adjustment;
      updated++;
    }
  });
  
  save('quoteItems',S.quoteItems);
  render();
  
  showToast(`Updated ${updated} items from RL print (${rl.date})`,'positive');
}

async function aiPriceSelected(){
  const rl=S.rl.length?S.rl[S.rl.length-1]:null;
  if(!rl){
    showToast('No RL data available. Import RL data first for AI pricing.','warn');
    return;
  }

  // Prompt for API key if not set
  if(!S.apiKey){
    const key=prompt('Enter your Claude API key for smart pricing:\n\n(Get one at console.anthropic.com/settings/keys)\n\nThis will be saved for future use.');
    if(!key){
      showToast('API key required for AI pricing.','warn');
      return;
    }
    S.apiKey=key;
    save('apiKey',S.apiKey);
  }
  
  const selected=S.quoteItems.filter(i=>i.selected!==false&&i.product);
  if(!selected.length){
    showToast('No items selected','warn');
    return;
  }

  // Build context for Claude
  const itemsList=selected.map(item=>{
    const parsed=parseProductString(item.product);
    const region=getRegionFromOrigin(item.origin);
    const rlPrice=getRLPrice(rl,parsed.base,parsed.length,region);
    return`- ${item.product} from ${item.origin} (${region} region), ${item.tls} TL, RL Print: $${rlPrice||'N/A'}, Current Sell: $${item.fob||'not set'}, Is Short: ${item.isShort?'Yes':'No'}`;
  }).join('\n');
  
  const prompt=`You are a lumber pricing assistant for a Southern Yellow Pine trader. Help me set FOB sell prices for these quote items.

Current Random Lengths prices (${rl.date}):
- West (LA, AR, TX): 2x4#2=$${rl.west?.['2x4#2']||'N/A'}, 2x6#2=$${rl.west?.['2x6#2']||'N/A'}
- Central (MS, AL): 2x4#2=$${rl.central?.['2x4#2']||'N/A'}, 2x6#2=$${rl.central?.['2x6#2']||'N/A'}
- East (NC, SC, FL, GA): 2x4#2=$${rl.east?.['2x4#2']||'N/A'}, 2x6#2=$${rl.east?.['2x6#2']||'N/A'}

Items to price:
${itemsList}

${typeof getLatestMillQuotes==='function'&&getLatestMillQuotes().length?`Current Mill Quotes (FOB mill):\n${getLatestMillQuotes().slice(0,20).map(q=>`- ${q.mill}: ${q.product} @ $${q.price} (${q.shipWindow||'unknown timing'})`).join('\n')}\n`:''}
For each item, suggest a competitive FOB sell price considering:
1. The RL print price for that region
2. Typical market dynamics (shorts command 10-20 below print, 8s at print, 10s slight premium, 12+ progressively higher)
3. Length premiums: 8' at/below composite, 10' at composite, 12' +$5-10, 14' +$15-25, 16' +$20-35, 18'+ even higher
4. For short/spec positions, price more aggressively (closer to or at RL)
5. Market is currently ${rl.west?.['2x4#2']>420?'strong - can price higher':'soft - stay competitive'}

Respond with ONLY a JSON array, no explanation:
[{"product":"exact product name","suggestedFOB":000,"reasoning":"brief 5-word max note"}]`;

  try{
    document.body.style.cursor='wait';
    const statusEl=document.getElementById('quote-status');
    if(statusEl)statusEl.textContent='🤖 AI analyzing prices...';
    
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':S.apiKey,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body:JSON.stringify({
        model:S.aiModel||'claude-sonnet-4-20250514',
        max_tokens:2000,
        messages:[{role:'user',content:prompt}]
      })
    });
    
    const data=await res.json();
    document.body.style.cursor='default';
    if(statusEl)statusEl.textContent='';
    
    if(data.error){
      showToast('API Error: '+data.error.message,'negative');
      return;
    }

    const text=data.content?.[0]?.text||'';
    // Extract JSON from response
    const jsonMatch=text.match(/\[[\s\S]*\]/);
    if(jsonMatch){
      const results=JSON.parse(jsonMatch[0]);
      let updated=0;
      
      results.forEach(r=>{
        // Find matching item
        const item=S.quoteItems.find(i=>
          i.product&&i.product.toLowerCase().includes(r.product.toLowerCase().substring(0,8))
        );
        if(item&&r.suggestedFOB){
          item.fob=Math.round(r.suggestedFOB);
          updated++;
        }
      });
      
      save('quoteItems',S.quoteItems);
      saveCurrentProfileSelections();
      render();
      showToast(`AI priced ${updated} items. Review and adjust.`,'positive');
    }else{
      showToast('Could not parse AI response. Try again.','negative');
    }
  }catch(e){
    document.body.style.cursor='default';
    console.error('Claude API error:',e);
    showToast('API error: '+e.message,'negative');
  }
}

function aiPriceAll(){
  // Get latest RL data for pricing reference
  const rl=S.rl.length?S.rl[S.rl.length-1]:null;
  if(!rl){
    showToast('No RL data available. Import RL data first for AI pricing.','warn');
    return;
  }

  S.quoteItems.forEach(item=>{
    if(!item.product)return;
    
    // Parse product string to extract base product and length
    const parsed=parseProductString(item.product);
    const region=getRegionFromOrigin(item.origin);
    const rlPrice=getRLPrice(rl,parsed.base,parsed.length,region);
    
    if(item.isShort){
      // AI Short: estimate cost from RL - typical spread
      const spread=getHistoricalSpread(parsed.base)||(-8);
      const estCost=rlPrice?(rlPrice+spread):item.cost||380;
      const targetMargin=35;
      item.cost=Math.round(estCost);
      item.fob=Math.round(estCost+targetMargin);
      item.rlRef=rlPrice;
    }else{
      // Known cost: suggest FOB based on target margin
      if(item.cost){
        const targetMargin=30;
        item.fob=Math.round(item.cost+targetMargin);
      }else if(rlPrice){
        // No cost entered, use RL as reference
        const spread=getHistoricalSpread(parsed.base)||(-10);
        item.cost=Math.round(rlPrice+spread);
        item.fob=Math.round(item.cost+30);
      }
      item.rlRef=rlPrice;
    }
  });
  
  save('quoteItems',S.quoteItems);
  saveCurrentProfileSelections();
  render();
}

// Parse product string like "2x4 8' #2" or "2x4 #2 16'" into components
function parseProductString(str){
  const s=(str||'').toLowerCase().replace(/['''`]/g,"'");
  let base='2x4#2',length=null,region='west';
  
  // Extract size (2x4, 2x6, etc)
  const sizeMatch=s.match(/(2x4|2x6|2x8|2x10|2x12|4x4|4x6)/);
  const size=sizeMatch?sizeMatch[1]:'2x4';
  
  // Extract grade (#1, #2, #3, #4, MSR, 2400f)
  let grade='#2';
  if(s.includes('#1')||s.includes('no.1')||s.includes('no 1'))grade='#1';
  else if(s.includes('#3')||s.includes('no.3')||s.includes('no 3'))grade='#3';
  else if(s.includes('#4')||s.includes('no.4')||s.includes('no 4'))grade='#4';
  else if(s.includes('msr')||s.includes('2400'))grade='MSR';

  base=grade==='MSR'?size+' MSR':size+grade;
  
  // Extract length - handle multiple formats: "8'", "16'", "8 ft", etc.
  // First try to find a number followed by ' or before #
  const lenMatch=s.match(/(\d{1,2})[']/)||s.match(/\s(\d{1,2})\s*#/)||s.match(/(\d{1,2})\s*ft/)||s.match(/(\d{1,2})\s*foot/);
  if(lenMatch){
    length=lenMatch[1];
  }else if(s.includes('rl')||s.includes('random')||!s.match(/\d{1,2}/)){
    length='RL';
  }else{
    // Try to find standalone number that looks like a length (8,10,12,14,16,18,20)
    const numMatch=s.match(/\b(8|10|12|14|16|18|20)\b/);
    if(numMatch)length=numMatch[1];
  }
  
  return{base,length,region,size,grade};
}

// Get RL price for product, checking specific length first (matches findRLPrice logic)
function getRLPrice(rl,base,length,region){
  if(!rl)return null;
  
  // Normalize length: "16'" -> "16", handle null/RL
  let normLen=(length||'').toString().replace(/[^0-9]/g,'');
  if(!normLen||length==='RL')normLen=null;
  
  // Normalize product: "2x4#2", "2x4 #2" -> "2x4#2"
  let normProd=(base||'').replace(/\s+/g,'');
  if(!normProd.includes('#')&&!normProd.toLowerCase().includes('msr'))normProd+='#2';
  
  // Handle MSR products
  const isMSR=normProd.toLowerCase().includes('msr')||normProd.toLowerCase().includes('2400');
  if(isMSR){
    const baseMatch=normProd.match(/(\d+x\d+)/i);
    if(baseMatch){
      const baseSize=baseMatch[1].toLowerCase();
      // Try #1 grade for MSR base
      if(normLen&&rl.specified_lengths?.[region]?.[baseSize+'#1']?.[normLen]){
        return rl.specified_lengths[region][baseSize+'#1'][normLen];
      }
      if(rl[region]?.[baseSize+'#1'])return rl[region][baseSize+'#1'];
      // Fallback to #2
      if(normLen&&rl.specified_lengths?.[region]?.[baseSize+'#2']?.[normLen]){
        return rl.specified_lengths[region][baseSize+'#2'][normLen];
      }
      if(rl[region]?.[baseSize+'#2'])return rl[region][baseSize+'#2'];
    }
    return null;
  }
  
  // Standard product: try specified lengths first
  if(normLen&&rl.specified_lengths?.[region]?.[normProd]?.[normLen]){
    return rl.specified_lengths[region][normProd][normLen];
  }
  
  // Try with different product key formats
  const prodVariants=[normProd,normProd.toLowerCase(),normProd.toUpperCase()];
  for(const pv of prodVariants){
    if(normLen&&rl.specified_lengths?.[region]?.[pv]?.[normLen]){
      return rl.specified_lengths[region][pv][normLen];
    }
  }
  
  // Fall back to composite price
  if(rl[region]?.[normProd])return rl[region][normProd];
  
  // Try other regions
  for(const r of['west','central','east']){
    if(rl[r]?.[normProd])return rl[r][normProd];
  }
  
  return null;
}

// Get historical spread for a product (how much below RL we typically buy)
function getHistoricalSpread(baseProduct){
  if(!S.buys.length||!S.rl.length)return -8;
  
  const normBase=baseProduct.replace(/\s+/g,'').toLowerCase();
  let totalSpread=0,count=0;
  
  S.buys.forEach(buy=>{
    const buyProd=(buy.product||'').replace(/\s+/g,'').toLowerCase();
    if(!buyProd.includes(normBase.replace('#','')))return;
    
    // Find RL report for this buy date
    const rl=S.rl.slice().reverse().find(r=>new Date(r.date)<=new Date(buy.date));
    if(!rl)return;
    
    const rlPrice=getRLPrice(rl,baseProduct,buy.length,buy.region||'west');
    if(rlPrice&&buy.price){
      totalSpread+=buy.price-rlPrice;
      count++;
    }
  });
  
  return count>0?Math.round(totalSpread/count):-8;
}

// Claude API pricing - smart FOB suggestions
async function aiPriceWithClaude(){
  if(!S.apiKey){
    showToast('Please set your Claude API key in Settings first.','warn');
    return;
  }
  
  const items=S.quoteItems.filter(i=>i.selected!==false);
  if(!items.length){
    showToast('No items selected for AI pricing.','warn');
    return;
  }
  
  // Get latest RL data
  const rl=S.rl.length?S.rl[S.rl.length-1]:null;
  
  // Build context for Claude
  const rlContext=rl?`Current Random Lengths prices (${rl.date}):
West: 2x4#2=$${rl.west?.['2x4#2']||'N/A'}, 2x6#2=$${rl.west?.['2x6#2']||'N/A'}, 2x8#2=$${rl.west?.['2x8#2']||'N/A'}
Central: 2x4#2=$${rl.central?.['2x4#2']||'N/A'}, 2x6#2=$${rl.central?.['2x6#2']||'N/A'}
East: 2x4#2=$${rl.east?.['2x4#2']||'N/A'}, 2x6#2=$${rl.east?.['2x6#2']||'N/A'}`:'No RL data available.';

  // Get historical margins
  const avgMargin=calcAvgHistoricalMargin();
  
  const itemsList=items.map(i=>`- ${i.product} from ${i.origin}, ${i.tls} TL, Cost: $${i.cost||'unknown'}, Current FOB: $${i.fob||'not set'}, Is Short: ${i.isShort?'Yes':'No'}`).join('\n');
  
  const prompt=`You are a lumber pricing assistant for a Southern Yellow Pine trader. Help me set FOB prices for these quote items.

${rlContext}

Historical average margin: $${avgMargin}/MBF

Items to price:
${itemsList}

For each item, suggest an FOB price that:
1. For known-cost items: targets a healthy margin ($25-40/MBF depending on product)
2. For short/spec items: estimates cost from RL print minus typical spread ($5-15 below), then adds margin
3. Considers that specific lengths command premiums (16', 20' are premium vs RL composite)
4. MSR/2400f products typically have $40-80 premium over standard

Respond with JSON only, no explanation:
{"prices": [{"product": "...", "suggestedFOB": 000, "estimatedCost": 000, "reasoning": "brief note"}]}`;

  try{
    document.body.style.cursor='wait';
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':S.apiKey,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body:JSON.stringify({
        model:S.aiModel||'claude-sonnet-4-20250514',
        max_tokens:2000,
        messages:[{role:'user',content:prompt}]
      })
    });
    
    const data=await res.json();
    document.body.style.cursor='default';
    
    if(data.error){
      showToast('API Error: '+data.error.message,'negative');
      return;
    }

    const text=data.content?.[0]?.text||'';
    // Extract JSON from response
    const jsonMatch=text.match(/\{[\s\S]*\}/);
    if(jsonMatch){
      const result=JSON.parse(jsonMatch[0]);
      if(result.prices){
        // Apply suggested prices
        result.prices.forEach(p=>{
          const item=S.quoteItems.find(i=>i.product===p.product||(i.product||'').toLowerCase().includes((p.product||'').toLowerCase().substring(0,8)));
          if(item){
            if(p.suggestedFOB)item.fob=Math.round(p.suggestedFOB);
            if(p.estimatedCost&&item.isShort)item.cost=Math.round(p.estimatedCost);
          }
        });
        save('quoteItems',S.quoteItems);
        saveCurrentProfileSelections();
        render();
        showToast('AI pricing applied! Review and adjust.','positive');
      }
    }else{
      showToast('Could not parse AI response. Using standard pricing.','negative');
      aiPriceAll();
    }
  }catch(e){
    document.body.style.cursor='default';
    console.error('Claude API error:',e);
    showToast('API error: '+e.message,'negative');
    aiPriceAll();
  }
}

// ============================================================
// BUILD TAB — Product x Length Matrix
// ============================================================

function _qePid(p) { return p.replace(/\s+/g, '-') }

function qeGetCheckedCombos() {
  const combos = []
  MI_PRODUCTS.forEach(p => {
    QUOTE_LENGTHS.forEach(l => {
      const cb = document.getElementById(`qe-mx-${_qePid(p)}-${l}`)
      if (cb && cb.checked) combos.push({ product: p, length: l })
    })
  })
  return combos
}

function qeUpdateMatrixHeaders() {
  MI_PRODUCTS.forEach(p => {
    const rowCb = document.getElementById(`qe-mx-row-${_qePid(p)}`)
    if (!rowCb) return
    const checks = QUOTE_LENGTHS.map(l => {
      const cb = document.getElementById(`qe-mx-${_qePid(p)}-${l}`)
      return cb ? cb.checked : false
    })
    rowCb.checked = checks.every(c => c)
    rowCb.indeterminate = !checks.every(c => c) && !checks.every(c => !c)
  })
  QUOTE_LENGTHS.forEach(l => {
    const colCb = document.getElementById(`qe-mx-col-${l}`)
    if (!colCb) return
    const checks = MI_PRODUCTS.map(p => {
      const cb = document.getElementById(`qe-mx-${_qePid(p)}-${l}`)
      return cb ? cb.checked : false
    })
    colCb.checked = checks.every(c => c)
    colCb.indeterminate = !checks.every(c => c) && !checks.every(c => !c)
  })
  const count = qeGetCheckedCombos().length
  const el = document.getElementById('qe-mx-count')
  if (el) {
    const itemCount = (S.quoteItems||[]).length
    if (count > 0) el.textContent = `${count} combo${count !== 1 ? 's' : ''} selected`
    else if (itemCount > 0) el.textContent = `${itemCount} item${itemCount !== 1 ? 's' : ''} in quote`
    else el.textContent = ''
  }
}

function qeToggleRow(product) {
  const rowCb = document.getElementById(`qe-mx-row-${_qePid(product)}`)
  const on = rowCb ? rowCb.checked : true
  QUOTE_LENGTHS.forEach(l => {
    const cb = document.getElementById(`qe-mx-${_qePid(product)}-${l}`)
    if (cb) cb.checked = on
  })
  qeUpdateMatrixHeaders()
}

function qeToggleCol(length) {
  const colCb = document.getElementById(`qe-mx-col-${length}`)
  const on = colCb ? colCb.checked : true
  MI_PRODUCTS.forEach(p => {
    const cb = document.getElementById(`qe-mx-${_qePid(p)}-${length}`)
    if (cb) cb.checked = on
  })
  qeUpdateMatrixHeaders()
}

function qeCellChanged() {
  qeUpdateMatrixHeaders()
}

function qeGetMatrixState() {
  const grid = {}
  MI_PRODUCTS.forEach(p => {
    grid[p] = {}
    QUOTE_LENGTHS.forEach(l => {
      const cb = document.getElementById(`qe-mx-${_qePid(p)}-${l}`)
      grid[p][l] = cb ? cb.checked : false
    })
  })
  return grid
}

function qeSaveTemplate(forCustomer) {
  const grid = qeGetMatrixState()
  const hasAny = Object.values(grid).some(row => Object.values(row).some(v => v))
  if (!hasAny) { showToast('Check at least one cell first', 'warn'); return }

  if (!S.quoteTemplates) S.quoteTemplates = []

  if (forCustomer) {
    const cust = S.qbCustomer
    if (!cust) { showToast('Select a customer first', 'warn'); return }
    const name = prompt('Template name:', cust)
    if (!name) return
    // Remove existing with same name+customer
    S.quoteTemplates = S.quoteTemplates.filter(t => !(t.name === name && t.customer === cust))
    S.quoteTemplates.push({ name, grid, customer: cust })
  } else {
    const name = prompt('Template name:')
    if (!name) return
    if (QUOTE_TEMPLATES[name]) { showToast('Cannot overwrite built-in template', 'warn'); return }
    // Remove existing general template with same name
    S.quoteTemplates = S.quoteTemplates.filter(t => !(t.name === name && !t.customer))
    S.quoteTemplates.push({ name, grid })
  }

  save('quoteTemplates', S.quoteTemplates)
  showToast('Template saved', 'positive')
  render()
}

function qeDeleteTemplate(name, customer) {
  if (!S.quoteTemplates) return
  if (customer) {
    S.quoteTemplates = S.quoteTemplates.filter(t => !(t.name === name && t.customer === customer))
  } else {
    S.quoteTemplates = S.quoteTemplates.filter(t => !(t.name === name && !t.customer))
  }
  if (S.qeBuildTemplate === name) S.qeBuildTemplate = ''
  save('quoteTemplates', S.quoteTemplates)
  showToast('Template deleted', 'info')
  render()
}

function qeAddCustomerLocation() {
  const loc = document.getElementById('qe-add-location-input')
  if (!loc || !loc.value.trim()) { showToast('Enter a city, e.g. "Dallas, TX"', 'warn'); return }
  const dest = loc.value.trim()
  const cust = myCustomers().find(c => c.name === S.qbCustomer)
  if (!cust) return
  if (!cust.locations) cust.locations = []
  cust.locations.unshift(dest)
  save('customers', S.customers)
  if (typeof syncCustomersToServer === 'function') syncCustomersToServer(S.customers)
  S.qbCustomDest = dest
  save('qbCustomDest', S.qbCustomDest)
  showToast(`Location "${dest}" added to ${cust.name}`, 'positive')
  render()
}

function qeApplyTemplate(name) {
  S.qeBuildTemplate = name
  let grid
  if (QUOTE_TEMPLATES[name]) {
    grid = QUOTE_TEMPLATES[name].build()
  } else {
    // Customer-specific first, then general
    const customs = S.quoteTemplates || []
    const match = (S.qbCustomer && customs.find(t => t.name === name && t.customer === S.qbCustomer))
      || customs.find(t => t.name === name)
    if (match) grid = match.grid
    else return
  }
  MI_PRODUCTS.forEach(p => {
    QUOTE_LENGTHS.forEach(l => {
      const cb = document.getElementById(`qe-mx-${_qePid(p)}-${l}`)
      if (cb) cb.checked = !!(grid[p] && grid[p][l])
    })
  })
  qeUpdateMatrixHeaders()

  // Auto-build if customer has destination and no items yet
  const selectedCustomer = S.qbCustomer ? myCustomers().find(c => c.name === S.qbCustomer) : null
  const dest = S.qbCustomDest || selectedCustomer?.locations?.[0] || selectedCustomer?.destination || ''
  if (dest && !(S.quoteItems || []).length) {
    qeBuildFromMatrix()
  }
}

// Apply customer product template to the BUILD matrix
function qeApplyCustomerTemplate() {
  if (!S.qbCustomer) { showToast('Select a customer first', 'warn'); return }
  const grid = getCustomerTemplateGrid(S.qbCustomer)
  if (!grid) { showToast('No template for ' + S.qbCustomer, 'warn'); return }
  S.qeBuildTemplate = '__customer__'
  MI_PRODUCTS.forEach(p => {
    QUOTE_LENGTHS.forEach(l => {
      const cb = document.getElementById(`qe-mx-${_qePid(p)}-${l}`)
      if (cb) cb.checked = !!(grid[p] && grid[p][l])
    })
  })
  qeUpdateMatrixHeaders()
  // Auto-build if customer has destination
  const selectedCustomer = myCustomers().find(c => c.name === S.qbCustomer)
  const dest = S.qbCustomDest || selectedCustomer?.locations?.[0] || selectedCustomer?.destination || ''
  if (dest && !(S.quoteItems || []).length) {
    qeBuildFromMatrix()
  }
}

// Convert matrix selections → S.quoteItems and auto-price
async function qeBuildFromMatrix() {
  const combos = qeGetCheckedCombos()
  if (!combos.length) {
    showToast('Check at least one product/length cell', 'warn')
    return
  }

  // Merge with existing items (don't duplicate)
  const existing = new Set((S.quoteItems || []).map(i => i.product))
  let added = 0

  combos.forEach(c => {
    const label = formatProductLabel(c.product, c.length)
    if (existing.has(label)) return
    S.quoteItems.push({
      id: genId(),
      product: label,
      selected: true,
      shipWeek: '',
      tls: 1,
      notes: ''
    })
    existing.add(label)
    added++
  })

  if (!added) {
    showToast('All selected items already in quote', 'info')
    return
  }

  save('quoteItems', S.quoteItems)
  showToast(`Added ${added} items — fetching pricing...`, 'positive')
  await showBestCosts()
}

// One-click reflow: re-run pricing on all current items
async function qeReflowPricing() {
  if (!(S.quoteItems || []).length) {
    showToast('No items to reprice', 'warn')
    return
  }
  showToast('Reflowing pricing...', 'info')
  await showBestCosts()
}

// Update ship week on an item
function qeUpdateShipWeek(idx, value) {
  if (S.quoteItems[idx]) {
    S.quoteItems[idx].shipWeek = value
    save('quoteItems', S.quoteItems)
  }
}

// Update TLs on an item
function qeUpdateTLs(idx, value) {
  if (S.quoteItems[idx]) {
    S.quoteItems[idx].tls = parseInt(value) || 1
    save('quoteItems', S.quoteItems)
  }
}

// Update notes on an item
function qeUpdateNotes(idx, value) {
  if (S.quoteItems[idx]) {
    S.quoteItems[idx].notes = value
    save('quoteItems', S.quoteItems)
  }
}

// Render the BUILD matrix grid HTML
function qeRenderMatrixHTML() {
  const lengths = QUOTE_LENGTHS
  const gradeGroups = [
    { label: '#1', products: MI_PRODUCTS.filter(p => p.includes('#1')) },
    { label: '#2', products: MI_PRODUCTS.filter(p => p.includes('#2')) },
    { label: '#3', products: MI_PRODUCTS.filter(p => p.includes('#3')) },
    { label: '#4', products: MI_PRODUCTS.filter(p => p.includes('#4')) },
    { label: 'MSR', products: MI_PRODUCTS.filter(p => p.includes('MSR')) },
  ]

  const colHeaders = lengths.map(l =>
    `<th style="text-align:center;padding:3px;font-size:10px;font-weight:600;min-width:28px">
      <div>${l === 'RL' ? 'RL' : l + "'"}</div>
      <input type="checkbox" id="qe-mx-col-${l}" onchange="qeToggleCol('${l}')" style="margin-top:2px">
    </th>`
  ).join('')

  const matrixRows = gradeGroups.map(grp => {
    const groupHeader = `<tr><td colspan="${lengths.length + 1}" style="padding:6px 6px 2px;font-size:10px;font-weight:700;color:var(--muted);border-top:1px solid var(--border)">${grp.label}</td></tr>`
    const rows = grp.products.map(p => {
      const pid = _qePid(p)
      const cells = lengths.map(l =>
        `<td style="text-align:center;padding:3px"><input type="checkbox" id="qe-mx-${pid}-${l}" onchange="qeCellChanged()"></td>`
      ).join('')
      return `<tr>
        <td style="white-space:nowrap;padding:3px 6px;font-size:11px;font-weight:600">
          <label style="cursor:pointer;display:flex;align-items:center;gap:4px">
            <input type="checkbox" id="qe-mx-row-${pid}" onchange="qeToggleRow('${p}')">
            ${formatProductHeader(p)}
          </label>
        </td>
        ${cells}
      </tr>`
    }).join('')
    return groupHeader + rows
  }).join('')

  return `
    <div class="table-wrap">
      <table style="font-size:11px;border-collapse:collapse;width:100%" id="qe-build-matrix">
        <thead>
          <tr>
            <th style="text-align:left;padding:3px 6px;font-size:10px">PRODUCT</th>
            ${colHeaders}
          </tr>
        </thead>
        <tbody>
          ${matrixRows}
        </tbody>
      </table>
    </div>`
}

function calcAvgHistoricalMargin(){
  const buyByOrder={};
  S.buys.forEach(b=>{
    const ord=String(b.orderNum||b.po||'').trim();
    if(ord)buyByOrder[ord]=b;
  });

  let totalMargin=0,count=0;
  S.sells.forEach(s=>{
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    const buy=ord?buyByOrder[ord]:null;
    if(buy){
      const fob=(s.price||0)-(s.volume>0?(s.freight||0)/s.volume:0);
      const cost=buy.price||0;
      totalMargin+=fob-cost;
      count++;
    }
  });

  return count>0?Math.round(totalMargin/count):30;
}

// ============================================================
// CUSTOMER PRICE SHEET (PRICE tab)
// ============================================================

let _psFetching=false;

function renderPriceSheet(container){
  if(!container)return;
  const ps=S.priceSheet||{};
  const customers=myCustomers().filter(c=>c.type!=='mill');
  const rows=ps.rows||[];
  const margin=ps.margin!=null?ps.margin:25;

  // Customer dropdown options
  const custOpts=customers.map(c=>{
    const dest=c.locations?.[0]||c.destination||'';
    return`<option value="${escapeHtml(c.name)}" ${ps.customer===c.name?'selected':''}>${escapeHtml(c.name)}${dest?' — '+escapeHtml(dest):''}</option>`;
  }).join('');

  // Product template buttons
  const templateNames=['History','#2 RL','Studs RL','Wides','Full Grid'];
  const templateBtns=templateNames.map(name=>`<button class="btn btn-default" style="padding:2px 8px;font-size:10px;min-width:0" onclick="psApplyTemplate('${name}')">${name}</button>`).join(' ');

  // Pricing results table
  let tableHTML='';
  if(rows.length){
    const rowsHTML=rows.map((r,i)=>{
      const isShort=r.margin<0;
      const shortStyle=isShort?'background:rgba(243,139,168,0.08);':'';
      const sellColor=isShort?'var(--negative)':'var(--positive)';
      const altHTML=r.alternatives&&r.alternatives.length?`<div style="font-size:9px;color:var(--muted);padding:2px 0 0 8px">${r.alternatives.map(a=>`${a.mill} ${fmt(a.fobPrice)}${a.landedCost!=null?' landed '+fmt(a.landedCost):''}`).join(', ')}</div>`:'';
      return`<tr style="${shortStyle}">
        <td style="font-weight:600">${escapeHtml(r.label||r.product)}</td>
        <td>${escapeHtml(r.bestMill||'--')}</td>
        <td class="right">${r.fob!=null?fmt(r.fob):'--'}</td>
        <td class="right">${r.freight!=null?fmt(r.freight):'--'}</td>
        <td class="right" style="font-weight:600">${r.landed!=null?fmt(r.landed):'--'}</td>
        <td class="right"><input type="number" value="${r.margin}" onchange="psUpdateRowMargin(${i},parseFloat(this.value)||0)" style="width:55px;padding:2px 4px;font-size:11px;text-align:right;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)"></td>
        <td class="right" style="font-weight:bold;color:${sellColor}">${r.sell!=null?fmt(r.sell):'--'}</td>
      </tr>${altHTML?`<tr style="${shortStyle}"><td colspan="7" style="padding:0 0 4px 0">${altHTML}</td></tr>`:''}
      ${isShort?`<tr style="${shortStyle}"><td colspan="7" style="padding:0 0 4px 8px;font-size:9px;color:var(--negative);font-weight:600">SHORT — selling below landed cost</td></tr>`:''}`;
    }).join('');

    tableHTML=`
      <div class="table-wrap" style="margin-top:16px">
        <table style="font-size:11px;width:100%">
          <thead><tr>
            <th>Product</th><th>Best Mill</th><th class="right">FOB</th><th class="right">Freight</th><th class="right">Landed</th><th class="right">Margin</th><th class="right">Sell</th>
          </tr></thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-default" onclick="psCopyToClipboard()">Copy to Clipboard</button>
        <button class="btn btn-primary" onclick="psConvertToSells()">Convert to Sell Orders</button>
      </div>`;
  }else if(ps.lastBuilt){
    tableHTML='<div style="color:var(--muted);margin-top:16px;font-size:12px">No mill pricing data found for selected products. Submit mill quotes in Mill Intel → Intake first.</div>';
  }

  container.innerHTML=`
    <div class="card">
      <div class="card-header"><span class="card-title">CUSTOMER PRICE SHEET</span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:2px">Customer</label>
            <select id="ps-customer" onchange="psSelectCustomer(this.value)" style="width:100%;padding:6px 8px;font-size:11px">
              <option value="">Select customer...</option>
              ${custOpts}
            </select>
          </div>
          <div>
            <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:2px">Destination</label>
            <input type="text" id="ps-destination" placeholder="City, ST" value="${escapeHtml(ps.destination||'')}" style="width:100%;padding:6px 8px;font-size:11px" onchange="S.priceSheet.destination=this.value;save('priceSheet',S.priceSheet)">
          </div>
        </div>

        <div style="margin-bottom:12px">
          <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:4px">Products</label>
          <div style="display:flex;gap:4px;flex-wrap:wrap">${templateBtns}
            <button class="btn btn-default" style="padding:2px 8px;font-size:10px;min-width:0" onclick="psAddCustomProduct()">+ Custom</button>
          </div>
          <div id="ps-product-tags" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px">
            ${(ps.products||[]).map((p,i)=>`<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:var(--accent);color:var(--bg);border-radius:var(--radius);font-size:10px;font-weight:600">${escapeHtml(p)} <button onclick="psRemoveProduct(${i})" style="background:none;border:none;color:var(--bg);cursor:pointer;font-size:12px;padding:0;line-height:1">×</button></span>`).join('')}
          </div>
        </div>

        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="fetchPriceSheet()" ${_psFetching?'disabled':''}>${_psFetching?'<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px"></span>Fetching...':'Fetch Prices'}</button>
          <label style="font-size:10px;color:var(--muted)">Margin $</label>
          <input type="number" id="ps-margin" value="${margin}" style="width:60px;padding:4px;font-size:11px;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:var(--radius)" onchange="S.priceSheet.margin=parseFloat(this.value)||0;save('priceSheet',S.priceSheet)">
          <button class="btn btn-default btn-sm" onclick="psApplyUniformMargin()">Apply All</button>
          <span id="ps-status" style="font-size:10px;color:var(--muted)"></span>
        </div>

        ${tableHTML}
      </div>
    </div>`;
}

function psSelectCustomer(name){
  S.priceSheet.customer=name;
  // Auto-fill destination from customer CRM data
  if(name){
    const cust=myCustomers().find(c=>c.name===name);
    if(cust){
      const dest=cust.locations?.[0]||cust.destination||'';
      if(dest){
        S.priceSheet.destination=dest;
        const destInput=document.getElementById('ps-destination');
        if(destInput) destInput.value=dest;
      }
    }
  }
  save('priceSheet',S.priceSheet);
}

function psApplyTemplate(name){
  let products=[];
  switch(name){
    case 'History':
      if(S.priceSheet.customer){
        const custProducts=getCustomerProducts(S.priceSheet.customer);
        products=custProducts.length?custProducts:['2x4#2','2x6#2'];
      }else{
        showToast('Select a customer first for History template','warn');
        return;
      }
      break;
    case '#2 RL':
      products=MI_PRODUCTS.filter(p=>p.includes('#2'));
      break;
    case 'Studs RL':
      products=MI_PRODUCTS.filter(p=>p.startsWith('2x4')||p.startsWith('2x6'));
      break;
    case 'Wides':
      products=MI_PRODUCTS.filter(p=>p.startsWith('2x8')||p.startsWith('2x10')||p.startsWith('2x12'));
      break;
    case 'Full Grid':
      products=[...MI_PRODUCTS];
      break;
  }
  S.priceSheet.products=products;
  save('priceSheet',S.priceSheet);
  // Re-render just the container
  const container=document.getElementById('ps-container');
  if(container) renderPriceSheet(container);
}

function psAddCustomProduct(){
  const product=prompt('Enter product (e.g. 2x4#2):');
  if(!product||!product.trim())return;
  if(!S.priceSheet.products)S.priceSheet.products=[];
  if(!S.priceSheet.products.includes(product.trim())){
    S.priceSheet.products.push(product.trim());
    save('priceSheet',S.priceSheet);
    const container=document.getElementById('ps-container');
    if(container) renderPriceSheet(container);
  }
}

function psRemoveProduct(idx){
  S.priceSheet.products.splice(idx,1);
  save('priceSheet',S.priceSheet);
  const container=document.getElementById('ps-container');
  if(container) renderPriceSheet(container);
}

async function fetchPriceSheet(){
  const ps=S.priceSheet;
  const destination=document.getElementById('ps-destination')?.value?.trim()||ps.destination||'';
  if(!destination){showToast('Enter a destination (City, ST)','warn');return;}
  if(!ps.products||!ps.products.length){showToast('Select products first','warn');return;}

  ps.destination=destination;
  _psFetching=true;
  const container=document.getElementById('ps-container');
  if(container) renderPriceSheet(container);
  const statusEl=document.getElementById('ps-status');
  if(statusEl) statusEl.textContent='Loading mill data...';

  try{
    // Step 1: Load matrix + mills in parallel (same as miBuildSmartQuote)
    const [matrixData,mills]=await Promise.all([
      miLoadQuoteMatrix('length'),
      miLoadMills()
    ]);

    const millLocations={};
    mills.forEach(m=>{
      if(m.location) millLocations[m.name]=m.location;
      else if(m.city) millLocations[m.name]=m.state?m.city+', '+m.state:m.city;
    });
    const allMills=matrixData.mills||[];

    // Step 2: Collect needed lanes
    const originMap={};
    const neededLanes=[];
    const seenKeys=new Set();

    for(const product of ps.products){
      // Price sheet always uses RL
      const colKey=`${product} RL`;
      for(const mill of allMills){
        const millData=matrixData.matrix[mill];
        if(!millData||!millData[colKey]) continue;
        const q=millData[colKey];
        const qOrigin=q.city&&q.state?q.city+', '+q.state:q.city||'';
        const origin=millLocations[mill]||qOrigin;
        if(!origin) continue;
        originMap[mill]=origin;
        const key=`${origin}|${destination}`;
        if(seenKeys.has(key)) continue;
        seenKeys.add(key);
        const cachedMiles=getLaneMiles(origin,destination);
        if(!cachedMiles) neededLanes.push({key,origin,dest:destination});
      }
    }

    // Step 3: Bulk lookup missing lanes
    if(neededLanes.length>0){
      if(statusEl) statusEl.textContent=`Looking up ${neededLanes.length} lane(s)...`;
      await lookupMileageWithAPI(neededLanes);
    }

    // Step 4: Build price rows
    if(statusEl) statusEl.textContent='Calculating prices...';
    const margin=ps.margin!=null?ps.margin:25;
    const newRows=[];

    for(const product of ps.products){
      const colKey=`${product} RL`;
      const isMSR=(product||'').toUpperCase().includes('MSR');
      const options=[];

      for(const mill of allMills){
        const millData=matrixData.matrix[mill];
        if(!millData||!millData[colKey]) continue;
        const q=millData[colKey];
        const origin=originMap[mill]||(q.city&&q.state?q.city+', '+q.state:q.city||'');
        if(!origin) continue;
        const miles=getLaneMiles(origin,destination);
        const freightPerMBF=miles?calcFreightPerMBF(miles,origin,isMSR):null;
        const landedCost=freightPerMBF!=null?q.price+freightPerMBF:null;
        options.push({mill,origin,fobPrice:q.price,miles,freightPerMBF,landedCost,volume:q.volume||0,shipWindow:q.ship_window||'Prompt',date:q.date});
      }

      // Sort by landed cost (nulls last), then by FOB
      options.sort((a,b)=>{
        if(a.landedCost==null&&b.landedCost==null) return a.fobPrice-b.fobPrice;
        if(a.landedCost==null) return 1;
        if(b.landedCost==null) return -1;
        return a.landedCost-b.landedCost;
      });

      const best=options[0]||null;
      const alts=options.slice(1,3); // top 2 alternatives

      newRows.push({
        product,
        label:formatProductLabel(product,'RL'),
        bestMill:best?best.mill:'',
        fob:best?best.fobPrice:null,
        freight:best?best.freightPerMBF:null,
        landed:best?best.landedCost:null,
        margin,
        sell:best&&best.landedCost!=null?best.landedCost+margin:null,
        alternatives:alts.map(a=>({mill:a.mill,fobPrice:a.fobPrice,landedCost:a.landedCost})),
        shipWindow:best?best.shipWindow:'',
        _options:options
      });
    }

    ps.rows=newRows;
    ps.lastBuilt=new Date().toISOString();
    S.psNewQuotesSince=null; // Clear new-data indicator
    save('priceSheet',S.priceSheet);

    if(statusEl) statusEl.textContent='';
    showToast(`Priced ${newRows.filter(r=>r.fob!=null).length}/${ps.products.length} products`,'positive');
  }catch(e){
    showToast('Price sheet error: '+e.message,'warn');
    if(statusEl) statusEl.textContent='Error: '+e.message;
  }finally{
    _psFetching=false;
    const c2=document.getElementById('ps-container');
    if(c2) renderPriceSheet(c2);
  }
}

function psApplyUniformMargin(){
  const margin=parseFloat(document.getElementById('ps-margin')?.value)||0;
  S.priceSheet.margin=margin;
  (S.priceSheet.rows||[]).forEach(r=>{
    r.margin=margin;
    r.sell=r.landed!=null?r.landed+margin:null;
  });
  save('priceSheet',S.priceSheet);
  const container=document.getElementById('ps-container');
  if(container) renderPriceSheet(container);
}

function psUpdateRowMargin(idx,value){
  const rows=S.priceSheet.rows||[];
  if(!rows[idx]) return;
  rows[idx].margin=value;
  rows[idx].sell=rows[idx].landed!=null?rows[idx].landed+value:null;
  save('priceSheet',S.priceSheet);
  const container=document.getElementById('ps-container');
  if(container) renderPriceSheet(container);
}

function psCopyToClipboard(){
  const ps=S.priceSheet;
  const rows=(ps.rows||[]).filter(r=>r.sell!=null);
  if(!rows.length){showToast('No priced rows to copy','warn');return;}
  const dest=ps.destination||'';
  const customer=ps.customer||'';

  // HTML table for Outlook
  const html=`<html><body style="font-family:Calibri,Arial,sans-serif;">
<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;">
  <thead>
    <tr style="background:#1a5f7a;color:white;">
      <th style="padding:8px 12px;text-align:left;border:1px solid #ccc;">Product</th>
      <th style="padding:8px 12px;text-align:right;border:1px solid #ccc;">Delivered Price</th>
      <th style="padding:8px 12px;text-align:right;border:1px solid #ccc;">Ship</th>
    </tr>
  </thead>
  <tbody>
    ${rows.map((r,i)=>`<tr style="background:${i%2?'#f5f5f5':'white'};">
      <td style="padding:6px 12px;border:1px solid #ddd;">${r.label}</td>
      <td style="padding:6px 12px;text-align:right;border:1px solid #ddd;font-weight:bold;color:${r.margin<0?'#c62828':'#2e7d32'};">$${Math.round(r.sell)}</td>
      <td style="padding:6px 12px;text-align:right;border:1px solid #ddd;color:#666;">${r.shipWindow||'Prompt'}</td>
    </tr>`).join('')}
  </tbody>
</table>
<p style="font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#666;margin-top:8px;">
  <strong>DLVD ${escapeHtml(dest)}</strong>${customer?' — '+escapeHtml(customer):''}
</p>
</body></html>`;

  // Plain text fallback
  const lines=[`SYP Pricing — Delivered: ${dest}${customer?' — '+customer:''}`,''];
  lines.push(['Product','Delivered','Ship'].join('\t'));
  rows.forEach(r=>{lines.push([r.label,'$'+Math.round(r.sell),r.shipWindow||'Prompt'].join('\t'));});
  const shorts=rows.filter(r=>r.margin<0);
  if(shorts.length){lines.push('');lines.push('SHORT items: '+shorts.map(r=>r.label).join(', '));}
  const text=lines.join('\n');

  try{
    const htmlBlob=new Blob([html],{type:'text/html'});
    const textBlob=new Blob([text],{type:'text/plain'});
    navigator.clipboard.write([new ClipboardItem({'text/html':htmlBlob,'text/plain':textBlob})]).then(()=>{
      showToast('Copied! Paste into Outlook for formatted table','positive');
    }).catch(()=>{
      navigator.clipboard.writeText(text).then(()=>showToast('Copied to clipboard','positive'));
    });
  }catch(e){
    navigator.clipboard.writeText(text).then(()=>showToast('Copied to clipboard','positive'));
  }
}

function psConvertToSells(){
  const ps=S.priceSheet;
  const rows=(ps.rows||[]).filter(r=>r.sell!=null);
  if(!rows.length){showToast('No priced rows to convert','warn');return;}
  const customer=ps.customer||'';
  if(!customer){showToast('Select a customer first','warn');return;}

  let created=0;
  rows.forEach(r=>{
    S.sells.push({
      id:genId(),
      customer,
      product:r.product,
      length:'RL',
      price:Math.round(r.sell),
      volume:0,
      date:today(),
      status:'open',
      notes:`Auto from Price Sheet. Mill: ${r.bestMill}, FOB: $${r.fob}, Freight: $${r.freight}, Margin: $${r.margin}`,
      trader:S.trader
    });
    created++;
  });

  save('sells',S.sells);
  showToast(`Created ${created} sell orders for ${customer}`,'positive');
  // Navigate to trading blotter
  S.tradingTab='blotter';SS('tradingTab','blotter');
  go('trading');
}

// Navigate to quote engine (called from mill intake comparison)
function psNavigateWithProducts(products){
  go('quotes');
}
