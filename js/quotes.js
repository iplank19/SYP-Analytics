// SYP Analytics - Quote Engine Functions
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
    isShort:isShort,
    selected:true
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
    S.quoteItems[idx][field]=value;
    save('quoteItems',S.quoteItems);
    saveCurrentProfileSelections();
    // Only re-render stats if needed
    if(field==='cost'||field==='fob'||field==='tls'||field==='selected'){
      render();
    }
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

function clearQuoteItems(){
  if(confirm('Clear all quote items?')){
    S.quoteItems=[];
    save('quoteItems',S.quoteItems);
    saveCurrentProfileSelections();
    render();
  }
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
    alert('No long positions to load. Add some buys first.');
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
      product:`${p.product} ${p.length!=='RL'?p.length+"'":'RL'}`,
      origin:origin,
      tls:tls,
      cost:avgCost,
      fob:avgCost+30,
      isShort:false,
      selected:true
    });
  });
  
  save('quoteItems',S.quoteItems);
  saveCurrentProfileSelections();
  render();
}

async function loadFromMillQuotes(){
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
          const exists=S.quoteItems.find(i=>i.product===q.product&&i.origin===origin);
          if(exists)return;
          S.quoteItems.push({
            id:genId(),
            product:q.product,
            origin:origin,
            tls:q.tls||1,
            cost:q.price,
            fob:q.price+30,
            isShort:false,
            selected:true,
            shipWeek:q.ship_window||''
          });
          added++;
        });
        if(added){
          save('quoteItems',S.quoteItems);
          saveCurrentProfileSelections();
          render();
          showToast(`Loaded ${added} items from Mill Intel DB`,'positive');
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
      const exists=S.quoteItems.find(i=>i.product===q.product&&i.origin===origin);
      if(exists)return;
      S.quoteItems.push({
        id:genId(),
        product:q.product+(q.length&&q.length!=='RL'?' '+q.length+"'":''),
        origin:origin||q.mill,
        tls:q.tls||1,
        cost:q.price,
        fob:q.price+30,
        isShort:false,
        selected:true,
        shipWeek:q.shipWindow||''
      });
      added++;
    });
    if(added){
      save('quoteItems',S.quoteItems);
      saveCurrentProfileSelections();
      render();
      showToast(`Loaded ${added} items from mill quotes`,'positive');
    }else{
      showToast('All mill quote products already in quote items','info');
    }
  }
}

function addLane(){
  const origin=document.getElementById('lane-origin')?.value?.trim();
  const dest=document.getElementById('lane-dest')?.value?.trim();
  const miles=+document.getElementById('lane-miles')?.value||0;
  
  if(!origin||!dest||!miles){
    alert('Please fill in origin, destination, and miles');
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
  // Try to find anywhere
  for(const st of states){
    if(str.includes(st))return st;
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

// Calculate freight for a destination using state-based rates (legacy)
function calcFreightForDest(dest,miles){
  const state=extractState(dest);
  const stateRate=state&&S.stateRates?S.stateRates[state]||0:0;
  const mbfPerTL=S.quoteMSRFootage?20:(S.quoteMBFperTL||23);
  const base=S.freightBase||0;
  return Math.round((base+(miles*stateRate))/mbfPerTL);
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
  
  // Try partial match on city names
  if(!lane){
    const originCity=normOrigin.split(',')[0].trim();
    const destCity=normDest.split(',')[0].trim();
    lane=S.lanes.find(l=>
      l.origin.toLowerCase().includes(originCity)&&
      l.dest.toLowerCase().includes(destCity)
    );
  }
  
  return lane?.miles||null;
}

// Calculate freight per MBF using Base + State Rate model
// Formula: (Base + Miles × StateRate) / MBF per TL
function calcFreightPerMBF(miles,origin,isMSR=false){
  if(!miles)return 0;
  
  const mbfPerTL=isMSR?20:(S.quoteMBFperTL||23);
  const originState=extractState(origin);
  
  // Get state rate (required)
  const stateRate=originState&&S.stateRates?S.stateRates[originState]||0:0;
  
  // Base + (Miles × StateRate)
  const base=S.freightBase||0;
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
    const dlvd=(item.fob||0)+frt;
    
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
            <td class="price">$${r.price}</td>
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
      const dlvd=(item.fob||0)+frt;
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
              <td class="price">$${r.price}</td>
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
    alert('Enter a city (e.g. "Cincinnati, OH")');
    return;
  }
  
  S.specificCity=city;
  
  const items=S.quoteItems.filter(i=>i.selected!==false);
  if(!items.length){
    alert('No items selected');
    return;
  }
  
  // Check for missing lanes
  const neededLanes=[];
  items.forEach(item=>{
    if(!item.origin)return;
    const existing=S.lanes.find(l=>
      l.origin.toLowerCase().trim()===item.origin.toLowerCase().trim()&&
      l.dest.toLowerCase().trim()===city.toLowerCase().trim()
    );
    if(!existing){
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
    alert(`Quote for ${city} copied to clipboard! Paste into Outlook for formatted table.`);
    render();
  }).catch(e=>{
    navigator.clipboard.writeText(text).then(()=>{
      alert(`Quote for ${city} copied as text`);
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
    alert('No items selected');
    return;
  }

  if(!customer){
    alert('Select a customer');
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
    alert(`Copied ${locations.length} location${locations.length>1?'s':''} to clipboard! Paste into Outlook for formatted tables.`);
  }).catch(e=>{
    // Fallback to plain text
    navigator.clipboard.writeText(text).then(()=>{
      alert('Copied as text (HTML copy not supported in this browser)');
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
    const dlvd=(item.fob||0)+frt;
    
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
      <td style="padding:6px 12px;text-align:right;border:1px solid #ddd;font-weight:bold;color:#2e7d32;">$${r.price}</td>
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
    const dlvd=(item.fob||0)+frt;
    
    const prod=(item.product||'').substring(0,15).padEnd(16);
    const qty=`${item.tls||1} TL`.padStart(6);
    const price=`$${dlvd}`.padStart(8);
    const ship=(item.shipWeek||'Prompt').padStart(8);
    
    txt+=`${prod}${qty}${price}${ship}\n`;
  });
  
  
  return txt;
}

function generateAllQuotes(){
  const items=S.quoteItems.filter(i=>i.selected!==false);
  const customers=S.customers.filter(c=>c.type!=='mill'&&c.quoteSelected);
  
  if(!items.length){
    alert('No items selected');
    return;
  }
  if(!customers.length){
    alert('No customers selected');
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
        
        // Check if lane exists
        const existing=S.lanes.find(l=>
          l.origin.toLowerCase().trim()===item.origin.toLowerCase().trim()&&
          l.dest.toLowerCase().trim()===dest.toLowerCase().trim()
        );
        
        if(!existing){
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
            S.lanes.push({origin:r.origin,dest:r.dest,miles:r.miles,added:new Date().toISOString()});
            console.log(`✓ ${r.origin} → ${r.dest}: ${r.miles} mi`);
          }else{
            failedLanes.push({origin:r.origin,dest:r.dest});
          }
        });
        save('lanes',S.lanes);
        if(statusEl)statusEl.textContent='';
        return failedLanes;
      }
    }
  }catch(e){
    console.log('Server API not available, trying direct lookup...');
  }
  
  // Fallback: Direct API calls from browser
  for(const lane of lanes){
    if(statusEl)statusEl.textContent=`Looking up ${lane.origin} → ${lane.dest}...`;
    const miles=await getDirectMileage(lane.origin,lane.dest);
    if(miles){
      S.lanes.push({origin:lane.origin,dest:lane.dest,miles,added:new Date().toISOString()});
      console.log(`✓ ${lane.origin} → ${lane.dest}: ${miles} mi`);
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
    const res=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1&countrycodes=us`,{
      headers:{'User-Agent':'SYP-Analytics/1.0'}
    });
    const data=await res.json();
    
    if(data?.length){
      const coords={lat:parseFloat(data[0].lat),lon:parseFloat(data[0].lon)};
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
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px;background:var(--bg);border-radius:4px">
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
    alert(`Generated ${quoteCount} quotes for ${customers.length} customers!\nPaste into Outlook for formatted tables.`);
    render();
  }).catch(e=>{
    // Fallback to plain text
    navigator.clipboard.writeText(allText).then(()=>{
      alert(`Generated ${quoteCount} quotes (copied as text)`);
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
    alert('No items selected');
    return;
  }
  
  if(!customer){
    alert('Select a customer from the dropdown');
    return;
  }
  
  // Save market blurb
  S.marketBlurb=document.getElementById('market-blurb')?.value||'';
  save('marketBlurb',S.marketBlurb);
  
  const locs=customer?.locations||[customer?.destination].filter(Boolean);
  const dest=locs[0]||'TBD';
  const email=customer?.email||'';
  const customerName=customer?.name||'Customer';
  
  // Check for missing lanes first
  const neededLanes=[];
  items.forEach(item=>{
    if(!item.origin)return;
    const existing=S.lanes.find(l=>
      l.origin.toLowerCase().trim()===item.origin.toLowerCase().trim()&&
      l.dest.toLowerCase().trim()===dest.toLowerCase().trim()
    );
    if(!existing){
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
    alert('Quote copied to clipboard!\n\nOutlook will open - paste (Ctrl+V) into the email body.');
    
    // Now open mailto link
    const subject=encodeURIComponent(`SYP Availability - ${custName}`);
    const mailto=`mailto:${email}?subject=${subject}`;
    window.location.href=mailto;
  }).catch(e=>{
    console.error('Clipboard error:',e);
    // Fallback - just open mailto with text body (mailto has text limit so might truncate)
    alert('Could not copy formatted table. Opening email with plain text...');
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
    alert('Enter a profile name');
    return;
  }
  
  const id=name.toLowerCase().replace(/[^a-z0-9]/g,'-');
  
  if(!S.quoteProfiles)S.quoteProfiles={default:{name:'Default',customers:[],items:[]}};
  
  if(S.quoteProfiles[id]){
    alert('Profile already exists');
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
              <div style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;padding:8px">
                ${profile.customers?.length?profile.customers.map(c=>`<div style="padding:2px 0;font-size:11px">${c}</div>`).join(''):'<div style="color:var(--muted);font-size:11px">No customers</div>'}
              </div>
            </div>
            <div>
              <label class="form-label">Products (${profile.items?.length||0})</label>
              <div style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:4px;padding:8px">
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
    alert('Enter a profile name');
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
    alert('Cannot delete default profile');
    return;
  }
  
  if(!confirm(`Delete profile "${S.quoteProfiles[profileId]?.name}"?`))return;
  
  delete S.quoteProfiles[profileId];
  save('quoteProfiles',S.quoteProfiles);
  
  S.quoteProfile='default';
  save('quoteProfile','default');
  
  switchQuoteProfile('default');
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
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:800,messages:[{role:'user',content:prompt}]})
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
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:600,messages:[{role:'user',content:prompt}]})
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
    alert('No RL data available. Import Random Lengths data first.');
    return;
  }
  
  const selected=S.quoteItems.filter(i=>i.selected!==false&&i.product);
  if(!selected.length){
    alert('No items to update');
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
  
  alert(`Updated ${updated} items from RL print (${rl.date})`);
}

async function aiPriceSelected(){
  const rl=S.rl.length?S.rl[S.rl.length-1]:null;
  if(!rl){
    alert('No RL data available. Import Random Lengths data first for AI pricing.');
    return;
  }
  
  // Prompt for API key if not set
  if(!S.apiKey){
    const key=prompt('Enter your Claude API key for smart pricing:\n\n(Get one at console.anthropic.com/settings/keys)\n\nThis will be saved for future use.');
    if(!key){
      alert('API key required for AI pricing.');
      return;
    }
    S.apiKey=key;
    save('apiKey',S.apiKey);
  }
  
  const selected=S.quoteItems.filter(i=>i.selected!==false&&i.product);
  if(!selected.length){
    alert('No items selected');
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
        model:'claude-sonnet-4-20250514',
        max_tokens:2000,
        messages:[{role:'user',content:prompt}]
      })
    });
    
    const data=await res.json();
    document.body.style.cursor='default';
    if(statusEl)statusEl.textContent='';
    
    if(data.error){
      alert('API Error: '+data.error.message);
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
      alert(`AI priced ${updated} items. Review and adjust as needed.`);
    }else{
      alert('Could not parse AI response. Try again.');
    }
  }catch(e){
    document.body.style.cursor='default';
    console.error('Claude API error:',e);
    alert('API error: '+e.message);
  }
}

function aiPriceAll(){
  // Get latest RL data for pricing reference
  const rl=S.rl.length?S.rl[S.rl.length-1]:null;
  if(!rl){
    alert('No RL data available. Import Random Lengths data first for AI pricing.');
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
  
  // Extract grade (#1, #2, #3, MSR, 2400f)
  let grade='#2';
  if(s.includes('#1')||s.includes('no.1')||s.includes('no 1'))grade='#1';
  else if(s.includes('#3')||s.includes('no.3')||s.includes('no 3'))grade='#3';
  else if(s.includes('msr')||s.includes('2400'))grade='MSR';
  
  base=size+grade;
  
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
    alert('Please set your Claude API key in Settings first.');
    return;
  }
  
  const items=S.quoteItems.filter(i=>i.selected!==false);
  if(!items.length){
    alert('No items selected for AI pricing.');
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
        model:'claude-sonnet-4-20250514',
        max_tokens:2000,
        messages:[{role:'user',content:prompt}]
      })
    });
    
    const data=await res.json();
    document.body.style.cursor='default';
    
    if(data.error){
      alert('API Error: '+data.error.message);
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
        alert('AI pricing applied! Review and adjust as needed.');
      }
    }else{
      alert('Could not parse AI response. Using standard pricing instead.');
      aiPriceAll();
    }
  }catch(e){
    document.body.style.cursor='default';
    console.error('Claude API error:',e);
    alert('API error: '+e.message+'. Using standard pricing instead.');
    aiPriceAll();
  }
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
