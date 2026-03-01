// SYP Analytics - PO Analysis Module
// Historical purchase order analysis with interactive price trend charts
// Modeled after standalone product-price-trends.html prototype

// ============================================================
// CSV PARSING
// ============================================================

// RFC 4180 CSV line parser — handles quoted fields with embedded commas
function parseCSVLine(line){
  const fields=[];let field='',inQuotes=false
  for(let i=0;i<line.length;i++){
    const ch=line[i]
    if(inQuotes){
      if(ch==='"'&&line[i+1]==='"'){field+='"';i++}
      else if(ch==='"')inQuotes=false
      else field+=ch
    }else{
      if(ch==='"')inQuotes=true
      else if(ch===','){fields.push(field.trim());field=''}
      else field+=ch
    }
  }
  fields.push(field.trim())
  return fields
}

// Parse closed trades CSV → array of PO records
function parseClosedTradesCSV(text){
  const lines=text.split(/\r?\n/).filter(l=>l.trim())
  if(lines.length<2)return[]
  const header=parseCSVLine(lines[0])
  const col=(name)=>{
    const n=name.toLowerCase().replace(/[^a-z0-9]/g,'')
    return header.findIndex(h=>h.toLowerCase().replace(/[^a-z0-9]/g,'').includes(n))
  }
  const iOrder=col('Order')
  const iDoc=col('Doc')
  const iSupplier=col('SupplierCustomer')
  const iTrader=col('Trader')
  const iPartner=col('Tradingpartner')
  const iOrderDate=col('Orderdate')
  const iShipFrom=col('Shipfrom')
  const iDept=col('Department')
  const iFreight=col('Totalfreight')
  const iProduct=col('Product')
  const iPrice=col('Price')
  const iShipDate=col('Shipdate')
  const iShipStatus=col('Shipstatus')
  const iOrderType=col('Ordertype')
  const iShipMethod=col('Shipmethod')

  const rows=[]
  for(let i=1;i<lines.length;i++){
    const f=parseCSVLine(lines[i])
    if(!f.length||f.length<5)continue
    const doc=(f[iDoc]||'').trim().toUpperCase()
    if(doc!=='PO')continue
    // Only SYP department
    const dept=(f[iDept]||'').trim()
    if(dept&&!dept.toLowerCase().includes('syp'))continue

    const rawProduct=f[iProduct]||''
    const parsed=parsePOProduct(rawProduct)
    const price=parsePOPrice(f[iPrice]||'')
    const orderDate=parsePODate(f[iOrderDate]||'')
    const traderRaw=(f[iTrader]||'').trim()
    const traderName=traderRaw.replace(/\s*\([^)]*\)\s*$/,'').trim()
    const trader=normalizeTrader(traderName)||traderName
    const supplierRaw=(f[iSupplier]||'').trim()
    const supplier=supplierRaw.replace(/\s*\(\d+\)\s*$/,'').trim()
    const location=(f[iShipFrom]||'').trim()

    rows.push({
      orderNum:(f[iOrder]||'').trim(),
      doc:doc,
      date:orderDate,
      mill:supplier,
      partner:(f[iPartner]||'').trim(),
      origin:location,
      region:guessRegion(location),
      product:parsed.product,
      length:parsed.length,
      species:parsed.species,
      price:price,
      freight:parsePOPrice(f[iFreight]||''),
      trader:trader,
      shipDate:parsePODate(f[iShipDate]||''),
      shipStatus:(f[iShipStatus]||'').trim(),
      shipMethod:(f[iShipMethod]||'').trim(),
      orderType:(f[iOrderType]||'').trim(),
      rawProduct:rawProduct,
      source:'csv'
    })
  }
  return rows
}

// ============================================================
// PRODUCT PARSING
// ============================================================

// Parse CSV product: "K.D. SYP 2400 F - MSR,2 X 8 12'" or "K.D. SYP #2,2 X 4 14'"
// The CSV embeds a comma between grade descriptor and dimension+length
function parsePOProduct(raw){
  if(!raw)return{product:'',length:'',species:'SYP'}
  let s=raw.trim()
  let species='SYP'
  if(/\bSPF\b/i.test(s))species='SPF'
  else if(/\bDFIR\b/i.test(s))species='DFIR'

  // Split on comma to separate grade part from dimension+length
  const commaIdx=s.indexOf(',')
  let gradePart=commaIdx>=0?s.slice(0,commaIdx):s
  let dimPart=commaIdx>=0?s.slice(commaIdx+1):''

  // Extract grade from first part
  let grade='#2' // default
  if(/#\s*1\b/.test(gradePart))grade='#1'
  else if(/#\s*2\b/.test(gradePart))grade='#2'
  else if(/#\s*3\b/.test(gradePart))grade='#3'
  else if(/#\s*4\b/.test(gradePart))grade='#4'
  else if(/MSR|2400\s*F/i.test(gradePart))grade=' MSR'
  else if(/Dense\s*Sel/i.test(gradePart))grade='#1'
  else if(/Prime/i.test(gradePart))grade='#1'

  // Extract dimension from dim part: "2 X 8 12'"
  const dimMatch=dimPart.match(/(\d+)\s*[xX×]\s*(\d+)/)
  const thick=dimMatch?parseInt(dimMatch[1]):0
  const wide=dimMatch?parseInt(dimMatch[2]):0

  // Extract length after dimension
  let length=''
  if(dimMatch){
    const after=dimPart.slice(dimMatch.index+dimMatch[0].length).trim()
    const lenMatch=after.match(/^(\d+)\s*[''′]?\s*$/)
    if(lenMatch)length=lenMatch[1]
    else if(/^R\/?L\b/i.test(after))length='RL'
  }

  if(!thick||!wide){
    // Fallback: try the whole string
    const fm=s.match(/(\d+)\s*[xX×]\s*(\d+)/)
    if(fm){
      const product=normalizeProduct(fm[1]+'x'+fm[2]+grade)
      const lm=s.match(/(\d+)\s*[''′]\s*$/)
      return{product,length:normalizeLength(lm?lm[1]:''),species}
    }
    return{product:s,length:'',species}
  }

  const product=normalizeProduct(thick+'x'+wide+grade)
  return{product,length:normalizeLength(length),species}
}

function parsePOPrice(raw){
  if(!raw)return 0
  const s=String(raw).replace(/[$,MBF\s]/gi,'').trim()
  const n=parseFloat(s)
  return isNaN(n)?0:Math.round(n*100)/100
}

function parsePODate(raw){
  if(!raw)return''
  const s=raw.trim()
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if(m)return`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s
  return s
}

function guessRegion(origin){
  if(!origin)return'central'
  const s=origin.toUpperCase()
  const westStates=['WA','OR','CA','ID','MT','NV','UT','AZ','CO','WY','NM']
  const eastStates=['VA','NC','SC','GA','FL','MD','DE','NJ','NY','PA','CT','MA','NH','ME','VT','RI','WV','OH','MI','IN']
  for(const st of westStates){if(s.includes(', '+st)||s.endsWith(' '+st))return'west'}
  for(const st of eastStates){if(s.includes(', '+st)||s.endsWith(' '+st))return'east'}
  return'central'
}

// ============================================================
// DATA MERGE & FILTER
// ============================================================

function getPOAnalysisData(filters){
  const history=(S.poHistory||[]).map(r=>({...r,source:r.source||'csv'}))
  // Map S.buys into same format
  const blotter=(S.buys||[]).map(b=>({
    orderNum:normalizeOrderNum(b.orderNum||b.po||''),
    doc:'PO',
    date:b.date||'',
    mill:b.mill||'',
    partner:'',
    origin:b.origin||'',
    region:b.region||'central',
    product:b.product||'',
    length:b.length||'',
    species:'SYP',
    price:parseFloat(b.price)||0,
    freight:parseFloat(b.freight)||0,
    trader:b.trader||'',
    shipDate:b.shipWeek||'',
    source:'blotter'
  }))
  // Merge; dedup by orderNum (blotter wins)
  const byKey=new Map()
  for(const r of history){const k=r.orderNum||'';if(k)byKey.set(k,r);else byKey.set('h_'+Math.random(),r)}
  for(const r of blotter){if(r.orderNum)byKey.set(r.orderNum,r);else byKey.set('b_'+Math.random(),r)}
  let all=[...byKey.values()]

  if(filters){
    if(filters.products&&filters.products.length)all=all.filter(r=>filters.products.includes(r.product))
    if(filters.locations&&filters.locations.length)all=all.filter(r=>filters.locations.includes(r.origin))
    if(filters.region&&filters.region!=='all')all=all.filter(r=>r.region===filters.region)
    if(filters.trader&&filters.trader!=='all')all=all.filter(r=>r.trader===filters.trader)
    if(filters.lengths&&filters.lengths.length)all=all.filter(r=>filters.lengths.includes(r.length))
  }
  all.sort((a,b)=>(a.date||'').localeCompare(b.date||''))
  return all
}

// ============================================================
// AGGREGATION
// ============================================================

function aggregatePOSeries(records,agg){
  // Group by product → {product: {bucketKey: {sum,count,trades}}}
  const series={}
  for(const r of records){
    if(!r.date||!r.price||!r.product)continue
    const key=_poaBucketKey(r.date,agg)
    if(!key)continue
    if(!series[r.product])series[r.product]={}
    if(!series[r.product][key])series[r.product][key]={sum:0,count:0,trades:[]}
    series[r.product][key].sum+=r.price
    series[r.product][key].count++
    series[r.product][key].trades.push({date:r.date,price:r.price,mill:r.supplier||r.mill||'',order:r.orderNum||'',vol:r.volume||0,origin:r.origin||''})
  }
  return series
}

function _poaBucketKey(dateStr,agg){
  if(!dateStr||dateStr.length<7)return null
  const d=new Date(dateStr+'T00:00:00')
  if(isNaN(d))return null
  const y=d.getFullYear(),m=d.getMonth()
  if(agg==='weekly'){
    const mon=new Date(d)
    mon.setDate(d.getDate()-((d.getDay()+6)%7))
    return mon.toISOString().slice(0,10)
  }
  if(agg==='quarterly')return`${y}-${String(Math.floor(m/3)*3+1).padStart(2,'0')}-01`
  return`${y}-${String(m+1).padStart(2,'0')}-01`
}

// ============================================================
// RL BENCHMARK & SPREAD
// ============================================================

// Standalone RL price lookup (mirrors findRLPrice from analytics.js)
function _poaRLPrice(rl,product,region,length){
  if(!rl||!product)return null
  const reg=region||'central'
  const normLen=(length||'').replace(/[^0-9]/g,'')
  let normProd=(product||'').replace(/\s+/g,'')
  const isMSR=/MSR|2400/i.test(normProd)
  if(isMSR){
    const base=(normProd.match(/(\d+x\d+)/)||[])[1]
    if(!base)return null
    if(normLen&&rl.specified_lengths?.[reg]?.[base+'#1']?.[normLen])return rl.specified_lengths[reg][base+'#1'][normLen]
    return rl[reg]?.[base+'#1']||rl.composite?.[reg]?.[base+'#1']||rl[reg]?.[base+'#2']||null
  }
  if(!normProd.includes('#'))normProd+='#2'
  if(normLen&&rl.specified_lengths?.[reg]?.[normProd]?.[normLen])return rl.specified_lengths[reg][normProd][normLen]
  if(rl[reg]?.[normProd])return rl[reg][normProd]
  const base=normProd.replace(/#\d/,'')
  return rl.composite?.[reg]?.[base]||rl[reg]?.[base]||null
}

// Find closest RL entry on or before a given date
function _poaClosestRL(date){
  if(!S.rl||!S.rl.length||!date)return null
  let best=null
  for(const rl of S.rl){
    if(rl.date<=date)best=rl
    else break
  }
  return best
}

// Build RL benchmark series: {product: {bucketKey: avgPrice}}
// For each PO record, look up the RL price for its product/region/length/date, then bucket
// regionOverride: if set, use this region for all lookups instead of per-record r.region
function _aggregateRLSeries(records,agg,regionOverride){
  const series={}
  for(const r of records){
    if(!r.date||!r.product)continue
    const key=_poaBucketKey(r.date,agg)
    if(!key)continue
    const rl=_poaClosestRL(r.date)
    if(!rl)continue
    const rlPrice=_poaRLPrice(rl,r.product,regionOverride||r.region,r.length)
    if(!rlPrice)continue
    if(!series[r.product])series[r.product]={}
    if(!series[r.product][key])series[r.product][key]={sum:0,count:0}
    series[r.product][key].sum+=rlPrice
    series[r.product][key].count++
  }
  return series
}

// Build spread series: {product: {bucketKey: {sum, count}}} where sum = PO price - RL price
function _aggregateSpreadSeries(records,agg,regionOverride){
  const series={}
  for(const r of records){
    if(!r.date||!r.price||!r.product)continue
    const key=_poaBucketKey(r.date,agg)
    if(!key)continue
    const rl=_poaClosestRL(r.date)
    if(!rl)continue
    const rlPrice=_poaRLPrice(rl,r.product,regionOverride||r.region,r.length)
    if(!rlPrice)continue
    if(!series[r.product])series[r.product]={}
    if(!series[r.product][key])series[r.product][key]={sum:0,count:0}
    series[r.product][key].sum+=(r.price-rlPrice)
    series[r.product][key].count++
  }
  return series
}

// ============================================================
// MULTI-SELECT TAG PICKER
// ============================================================

// State for open multi-selects (non-persisted UI state)
let _poaOpenSelect=null

function _poaMultiSelect(id,label,items,selected,counts){
  const selSet=new Set(selected)
  const tagHTML=selected.length
    ?selected.map((item,i)=>{
      const color=_PO_COLORS[i%_PO_COLORS.length]
      const short=item.length>35?item.slice(0,32)+'...':item
      return`<span style="background:${color};color:#fff;padding:2px 8px;border-radius:12px;font-size:11px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap">${short}<span style="cursor:pointer;opacity:0.8;font-size:13px" onclick="event.stopPropagation();_poaToggleItem('${id}','${item.replace(/'/g,"\\'")}')">×</span></span>`
    }).join(' ')
    :`<span style="color:var(--muted);font-size:12px">${label}</span>`
  const isOpen=_poaOpenSelect===id
  const optionsHTML=items.map(item=>{
    const isSel=selSet.has(item)
    const count=counts[item]||0
    return`<div style="padding:5px 10px;cursor:pointer;font-size:12px;display:flex;justify-content:space-between;${isSel?'background:rgba(137,180,250,0.15);':''}" onmouseover="this.style.background='rgba(137,180,250,0.2)'" onmouseout="this.style.background='${isSel?'rgba(137,180,250,0.15)':''}'" onclick="event.stopPropagation();_poaToggleItem('${id}','${item.replace(/'/g,"\\'")}')"><span>${item}</span><span style="color:var(--muted);font-size:10px">${count}</span></div>`
  }).join('')

  return`<div class="control-group" style="position:relative">
    <label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">${label}</label>
    <div onclick="event.stopPropagation();_poaOpenDropdown('${id}')" style="min-width:220px;min-height:32px;padding:4px 8px;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;display:flex;flex-wrap:wrap;gap:4px;align-items:center">${tagHTML}</div>
    ${isOpen?`<div id="poa-dd-${id}" style="position:absolute;top:100%;left:0;right:0;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);max-height:280px;overflow-y:auto;z-index:100;margin-top:4px;box-shadow:0 8px 24px rgba(0,0,0,0.4)">
      <input type="text" id="poa-search-${id}" placeholder="Search..." oninput="_poaFilterDropdown('${id}')" onclick="event.stopPropagation()" style="width:100%;padding:6px 10px;border:none;border-bottom:1px solid var(--border);background:var(--panel);color:var(--fg);font-size:12px;outline:none">
      <div id="poa-opts-${id}">${optionsHTML}</div>
    </div>`:''}
  </div>`
}

function _poaOpenDropdown(id){
  _poaOpenSelect=_poaOpenSelect===id?null:id
  render()
  if(_poaOpenSelect===id)setTimeout(()=>{const el=document.getElementById('poa-search-'+id);if(el)el.focus()},10)
}

const _POA_FILTER_MAP={'po-products':'products','po-locations':'locations','po-lengths':'lengths'}
function _poaToggleItem(id,item){
  if(!S.poFilters)S.poFilters={}
  const key=_POA_FILTER_MAP[id]||id
  const arr=S.poFilters[key]||[]
  const idx=arr.indexOf(item)
  if(idx>=0)arr.splice(idx,1);else arr.push(item)
  S.poFilters[key]=[...arr]
  SS('poFilters',S.poFilters)
  _poaOpenSelect=null
  render()
}

function _poaFilterDropdown(id){
  // Client-side filter of dropdown options (handled by re-render, but for speed do DOM filter)
  const input=document.getElementById('poa-search-'+id)
  if(!input)return
  const q=input.value.toLowerCase()
  const opts=document.getElementById('poa-opts-'+id)
  if(!opts)return
  for(const child of opts.children){
    const text=child.textContent.toLowerCase()
    child.style.display=text.includes(q)?'':'none'
  }
}

// Close dropdown on outside click
document.addEventListener('click',()=>{if(_poaOpenSelect){_poaOpenSelect=null;render()}})

// ============================================================
// VIEW RENDERER
// ============================================================

const _PO_COLORS=['#58a6ff','#3fb950','#f0883e','#f85149','#bc8cff','#39d2c0','#ff7eb6','#79c0ff','#e3b341','#a5d6ff','#7ee787','#ffa657','#ff7b72','#d2a8ff','#56d4dd','#db61a2']

function renderPOAnalysis(){
  const c=document.getElementById('content')
  if(!c)return
  const tab=S.poTab||'trends'
  const _tabBar=_subTabBar('poTab',[{id:'trends',label:'Trends'},{id:'data',label:'Data'}],tab)

  if(tab==='data') _renderPODataTab(c,_tabBar)
  else _renderPOTrendsTab(c,_tabBar)
}

function _renderPOTrendsTab(c,tabBar){
  const filters=S.poFilters||{}
  const allData=getPOAnalysisData() // unfiltered for building options
  if(!allData.length){
    c.innerHTML=tabBar+`<div class="card" style="padding:60px;text-align:center"><h3 style="color:var(--fg);margin-bottom:8px">No PO Data Yet</h3><p style="color:var(--muted)">Import historical closed trades CSV or add buys through the Trading blotter.</p><button class="btn btn-primary" style="margin-top:16px" onclick="S.poTab='data';SS('poTab','data');render()">Go to Import</button></div>`
    return
  }

  // Build unique product/length/location lists with counts
  const prodCounts={},locCounts={},lenCounts={}
  allData.forEach(r=>{
    if(r.product)prodCounts[r.product]=(prodCounts[r.product]||0)+1
    if(r.origin)locCounts[r.origin]=(locCounts[r.origin]||0)+1
    if(r.length)lenCounts[r.length]=(lenCounts[r.length]||0)+1
  })
  const products=Object.keys(prodCounts).sort()
  const locations=Object.keys(locCounts).sort()
  const lengths=Object.keys(lenCounts).sort((a,b)=>(parseInt(a)||999)-(parseInt(b)||999))
  const selectedProducts=filters.products||[]
  const selectedLocations=filters.locations||[]
  const selectedLengths=filters.lengths||[]
  const agg=filters.agg||'monthly'

  // Auto-select top product if nothing selected
  if(!selectedProducts.length&&products.length){
    const top=Object.entries(prodCounts).sort((a,b)=>b[1]-a[1])[0][0]
    if(!S.poFilters)S.poFilters={}
    S.poFilters.products=[top]
    SS('poFilters',S.poFilters)
  }
  const selProds=S.poFilters?.products||[]

  // View toggle state
  const viewMode=S._poViewMode||'chart'
  const hasRL=S.rl&&S.rl.length>0

  c.innerHTML=tabBar+(typeof _renderStaleRLBanner==='function'?_renderStaleRLBanner():'')+`
    <div style="display:flex;gap:12px;padding:0 0 12px;flex-wrap:wrap;align-items:flex-start">
      ${_poaMultiSelect('po-products','Products',products,selProds,prodCounts)}
      ${_poaMultiSelect('po-lengths','Lengths',lengths,selectedLengths,lenCounts)}
      ${_poaMultiSelect('po-locations','Ship From Location',locations,selectedLocations,locCounts)}
      <div class="control-group">
        <label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">RL Region</label>
        <select onchange="_poaSetRegion(this.value)" style="padding:6px 10px;border-radius:var(--radius);border:1px solid var(--border);background:var(--panel);color:var(--fg);min-width:100px">
          <option value="all"${(filters.region||'all')==='all'?' selected':''}>All (per PO)</option>
          <option value="west"${filters.region==='west'?' selected':''}>West</option>
          <option value="central"${filters.region==='central'?' selected':''}>Central</option>
          <option value="east"${filters.region==='east'?' selected':''}>East</option>
        </select>
      </div>
      <div class="control-group">
        <label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Aggregation</label>
        <select onchange="_poaSetAgg(this.value)" style="padding:6px 10px;border-radius:var(--radius);border:1px solid var(--border);background:var(--panel);color:var(--fg);min-width:120px">
          <option value="weekly"${agg==='weekly'?' selected':''}>Weekly</option>
          <option value="monthly"${agg==='monthly'?' selected':''}>Monthly</option>
          <option value="quarterly"${agg==='quarterly'?' selected':''}>Quarterly</option>
        </select>
      </div>
      <div class="control-group">
        <label style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">View</label>
        <div style="display:flex;gap:2px;background:var(--panel);border-radius:var(--radius);padding:2px;border:1px solid var(--border)">
          <button class="btn btn-sm ${viewMode==='chart'?'btn-primary':'btn-default'}" onclick="S._poViewMode='chart';render()">Chart</button>
          <button class="btn btn-sm ${viewMode==='table'?'btn-primary':'btn-default'}" onclick="S._poViewMode='table';render()">Table</button>
        </div>
      </div>
    </div>

    ${selProds.length===0?`<div class="card" style="padding:60px;text-align:center;color:var(--muted)"><h3 style="margin-bottom:8px">Select Products</h3><p>Use the dropdown above to pick one or more products to see price trends.</p></div>`
    :viewMode==='chart'?`
      <div class="card" style="margin-bottom:12px"><div class="card-header"><span class="card-title">${selProds.length===1?selProds[0]:selProds.length+' Products'} — ${hasRL?'Price vs RL Market':'Price Over Time'} ($/MBF)</span></div><div class="card-body">
        <div style="height:400px;position:relative"><canvas id="po-price-chart"></canvas></div>
      </div></div>
      ${hasRL?`<div class="card" style="margin-bottom:12px"><div class="card-header"><span class="card-title">Spread vs RL ($/MBF)</span></div><div class="card-body">
        <div style="height:200px;position:relative"><canvas id="po-spread-chart"></canvas></div>
      </div></div>`:''}
      <div class="card"><div class="card-header"><span class="card-title">Order Volume</span></div><div class="card-body">
        <div style="height:180px;position:relative"><canvas id="po-volume-chart"></canvas></div>
      </div></div>`
    :_renderPOPriceTable(getPOAnalysisData({products:selProds,locations:selectedLocations,lengths:selectedLengths}),selProds,agg)}`
}

// ============================================================
// PRICE TABLE VIEW
// ============================================================

function _renderPOPriceTable(records,selProds,agg){
  const series=aggregatePOSeries(records,agg)
  const rlSeries=_aggregateRLSeries(records,agg)
  const allKeys=new Set()
  for(const prod of selProds){
    if(series[prod])Object.keys(series[prod]).forEach(k=>allKeys.add(k))
  }
  const keys=[...allKeys].sort()
  const hasRL=Object.keys(rlSeries).length>0

  let html=`<div class="card"><div class="card-header"><span class="card-title">Price Data</span></div><div class="card-body table-wrap">
    <table class="data-table" style="width:100%;font-size:12px"><thead><tr>`
  if(selProds.length>1)html+=`<th>Product</th>`
  html+=`<th>Period</th><th>Avg Price</th>${hasRL?'<th>RL Market</th><th>Spread</th>':''}<th>Orders</th></tr></thead><tbody>`
  for(const prod of selProds){
    for(const k of keys){
      const d=series[prod]&&series[prod][k]
      if(!d)continue
      const avg=Math.round(d.sum/d.count)
      const rlD=rlSeries[prod]&&rlSeries[prod][k]
      const rlAvg=rlD?Math.round(rlD.sum/rlD.count):null
      const spread=rlAvg!==null?avg-rlAvg:null
      html+=`<tr>`
      if(selProds.length>1)html+=`<td>${prod}</td>`
      html+=`<td>${k}</td><td>$${avg}</td>`
      if(hasRL){
        html+=`<td>${rlAvg!==null?'$'+rlAvg:'—'}</td>`
        html+=`<td style="color:${spread!==null?(spread<=0?'#a6e3a1':'#f38ba8'):'var(--muted)'}">${spread!==null?(spread<=0?'-$'+Math.abs(spread):'+$'+spread):'—'}</td>`
      }
      html+=`<td>${d.count}</td></tr>`
    }
  }
  html+=`</tbody></table></div></div>`
  return html
}

// ============================================================
// DATA SUB-TAB
// ============================================================

function _renderPODataTab(c,tabBar){
  const poHistory=S.poHistory||[]
  const total=poHistory.length
  const page=S._poPage||0
  const perPage=100
  const search=(S._poSearch||'').toLowerCase()
  let allData=getPOAnalysisData()
  // Sort descending for data tab
  allData.sort((a,b)=>(b.date||'').localeCompare(a.date||''))
  if(search){
    allData=allData.filter(r=>
      (r.orderNum||'').toLowerCase().includes(search)||
      (r.mill||'').toLowerCase().includes(search)||
      (r.product||'').toLowerCase().includes(search)||
      (r.trader||'').toLowerCase().includes(search)||
      (r.origin||'').toLowerCase().includes(search)
    )
  }
  const totalFiltered=allData.length
  const start=page*perPage
  const displayData=allData.slice(start,start+perPage)
  const totalPages=Math.ceil(totalFiltered/perPage)

  c.innerHTML=`${tabBar}
    <div class="card" style="margin-bottom:12px"><div class="card-body" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <label class="btn btn-primary" style="cursor:pointer">
        <input type="file" accept=".csv" onchange="importPOFile(this.files[0])" style="display:none">
        ${total?'Re-import CSV':'Import Historical POs'}
      </label>
      <span style="color:var(--muted);font-size:12px">${total?total.toLocaleString()+' records loaded from CSV':'Upload your closed trades CSV to analyze historical purchase orders'}</span>
      ${total?`<button class="btn btn-default btn-sm" onclick="if(confirm('Clear all imported PO history?')){save('poHistory',[]);S._poPage=0;render()}" style="margin-left:auto">Clear History</button>`:''}
    </div></div>

    <div style="margin-bottom:10px;display:flex;gap:8px;align-items:center">
      <input type="text" id="po-search" placeholder="Search orders..." value="${S._poSearch||''}" oninput="S._poSearch=this.value;S._poPage=0;render()" style="padding:6px 10px;border-radius:var(--radius);border:1px solid var(--border);background:var(--panel);color:var(--fg);flex:1;max-width:300px">
      <span style="color:var(--muted);font-size:11px">${totalFiltered.toLocaleString()} records</span>
    </div>

    <div class="card"><div class="card-body table-wrap">
      <table class="data-table" style="width:100%;font-size:12px">
        <thead><tr>
          <th>Date</th><th>Order#</th><th>Supplier</th>
          <th>Product</th><th>Length</th><th>Price</th><th>Origin</th><th>Trader</th>
        </tr></thead>
        <tbody>
          ${displayData.length?displayData.map(r=>`<tr>
            <td>${fmtD(r.date)}</td>
            <td style="font-family:monospace;font-size:11px">${r.orderNum||'—'}</td>
            <td>${r.mill||'—'}</td>
            <td><strong>${r.product||'—'}</strong></td>
            <td>${r.length?r.length+"'":'—'}</td>
            <td>${r.price?fmt(r.price):'—'}</td>
            <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.origin||'—'}</td>
            <td>${r.trader||'—'}</td>
          </tr>`).join(''):`<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">No PO data — import a CSV or add buys in the Trading blotter</td></tr>`}
        </tbody>
      </table>
    </div></div>

    ${totalFiltered>perPage?`<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:12px;color:var(--muted)">
      <span>Showing ${(start+1).toLocaleString()}–${Math.min(start+perPage,totalFiltered).toLocaleString()} of ${totalFiltered.toLocaleString()}</span>
      <div style="display:flex;gap:4px">
        <button class="btn btn-default btn-sm" onclick="S._poPage=Math.max(0,${page}-1);render()" ${page===0?'disabled':''}>Prev</button>
        <button class="btn btn-default btn-sm" onclick="S._poPage=${page}+1;render()" ${page>=totalPages-1?'disabled':''}>Next</button>
      </div>
    </div>`:''}`
}

// ============================================================
// CHART RENDERING
// ============================================================

function renderPOCharts(){
  if(typeof Chart==='undefined')return
  const filters=S.poFilters||{}
  const selProds=filters.products||[]
  if(!selProds.length)return
  if((S._poViewMode||'chart')!=='chart')return

  const filtered=getPOAnalysisData({products:selProds,locations:filters.locations||[],lengths:filters.lengths||[]})
  const agg=filters.agg||'monthly'
  const regionOverride=filters.region||null
  const series=aggregatePOSeries(filtered,agg)
  const hasRL=S.rl&&S.rl.length>0
  const rlSeries=hasRL?_aggregateRLSeries(filtered,agg,regionOverride):{}
  const spreadSeries=hasRL?_aggregateSpreadSeries(filtered,agg,regionOverride):{}

  _renderPOMainChart(selProds,series,rlSeries,agg)
  if(hasRL)_renderPOSpreadChart(selProds,spreadSeries,agg)
  _renderPOVolChart(selProds,series,agg)
}

function _renderPOMainChart(selProds,series,rlSeries,agg){
  const ctx=document.getElementById('po-price-chart')
  if(!ctx)return
  destroyChart('po-price')

  const datasets=[]
  const hasRL=Object.keys(rlSeries).length>0
  selProds.forEach((prod,pi)=>{
    const color=_PO_COLORS[pi%_PO_COLORS.length]
    const prefix=selProds.length>1?prod+' ':'';
    // Actual PO price (solid) — attach RL print per bucket for tooltip
    if(series[prod]){
      const rlBuckets=rlSeries[prod]||{}
      const pts=Object.entries(series[prod]).map(([k,v])=>{
        const rlB=rlBuckets[k]
        return{x:k,y:Math.round(v.sum/v.count),trades:v.trades||[],count:v.count,rlPrint:rlB?Math.round(rlB.sum/rlB.count):null}
      }).sort((a,b)=>a.x.localeCompare(b.x))
      datasets.push({label:prefix+(hasRL?'Actual':''),data:pts,borderColor:color,backgroundColor:color+'22',borderWidth:2,pointRadius:agg==='weekly'?1:3,tension:0.3})
    }
    // RL benchmark (dashed)
    if(rlSeries[prod]){
      const pts=Object.entries(rlSeries[prod]).map(([k,v])=>({x:k,y:Math.round(v.sum/v.count)})).sort((a,b)=>a.x.localeCompare(b.x))
      datasets.push({label:prefix+'RL Market',data:pts,borderColor:color,backgroundColor:'transparent',borderWidth:2,pointRadius:0,tension:0.3,borderDash:[6,3]})
    }
  })

  const timeUnit=agg==='weekly'?'week':agg==='quarterly'?'quarter':'month'
  window._charts['po-price']=new Chart(ctx,{
    type:'line',
    data:{datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{labels:{color:'#a0a0b8',usePointStyle:true,padding:14,font:{size:11,family:'Inter'}}},
        tooltip:{backgroundColor:'#1c2128',titleColor:'#f0f6fc',bodyColor:'#e1e4e8',borderColor:'#30363d',borderWidth:1,
          callbacks:{
            label:ctx=>{
              const pt=ctx.raw;
              // For RL Market dataset (no trades attached), keep simple
              if(!pt.trades||!pt.trades.length){
                return ctx.dataset.label+': $'+ctx.parsed.y+'/MBF';
              }
              const lines=[ctx.dataset.label+': $'+ctx.parsed.y+'/MBF ('+pt.count+' trades)'];
              if(pt.rlPrint!=null){
                const spread=ctx.parsed.y-pt.rlPrint;
                lines.push('  RL Print: $'+pt.rlPrint+'/MBF  ('+( spread>=0?'+':'')+spread+')');
              }
              const sorted=pt.trades.slice().sort((a,b)=>b.price-a.price);
              const show=sorted.slice(0,6);
              show.forEach(t=>{
                let detail='  $'+t.price;
                if(t.mill)detail+=' — '+t.mill;
                if(t.vol)detail+=' ('+t.vol+' MBF)';
                if(t.date)detail+='  '+t.date;
                lines.push(detail);
              });
              if(sorted.length>6)lines.push('  ...+'+(sorted.length-6)+' more');
              return lines;
            }
          }}
      },
      scales:{
        x:{type:'time',time:{unit:timeUnit,tooltipFormat:'MMM yyyy'},grid:{color:'rgba(62,62,86,0.5)'},ticks:{color:'#a0a0b8',font:{size:10}}},
        y:{grid:{color:'rgba(62,62,86,0.5)'},ticks:{color:'#a0a0b8',font:{size:10},callback:v=>'$'+v}}
      }
    }
  })
}

function _renderPOSpreadChart(selProds,spreadSeries,agg){
  const ctx=document.getElementById('po-spread-chart')
  if(!ctx)return
  destroyChart('po-spread')

  const datasets=[]
  selProds.forEach((prod,pi)=>{
    const color=_PO_COLORS[pi%_PO_COLORS.length]
    if(spreadSeries[prod]){
      const pts=Object.entries(spreadSeries[prod]).map(([k,v])=>{
        const avg=Math.round(v.sum/v.count)
        return{x:k,y:avg}
      }).sort((a,b)=>a.x.localeCompare(b.x))
      datasets.push({
        label:selProds.length>1?prod:'Spread',
        data:pts,
        borderColor:color,
        segment:{borderColor:ctx2=>ctx2.p0.parsed.y<=0&&ctx2.p1.parsed.y<=0?'#a6e3a1':ctx2.p0.parsed.y>=0&&ctx2.p1.parsed.y>=0?'#f38ba8':color},
        pointBackgroundColor:pts.map(p=>p.y<=0?'#a6e3a1':'#f38ba8'),
        borderWidth:2,
        pointRadius:agg==='weekly'?1:3,
        tension:0.3,
        fill:'origin'
      })
    }
  })

  if(!datasets.length)return
  const timeUnit=agg==='weekly'?'week':agg==='quarterly'?'quarter':'month'

  // Dashed zero line plugin
  const zeroLinePlugin={id:'zeroLine',afterDraw:chart=>{
    const yScale=chart.scales.y
    if(!yScale)return
    const y=yScale.getPixelForValue(0)
    const c2=chart.ctx
    c2.save()
    c2.strokeStyle='rgba(160,160,184,0.5)'
    c2.lineWidth=1
    c2.setLineDash([4,4])
    c2.beginPath()
    c2.moveTo(chart.chartArea.left,y)
    c2.lineTo(chart.chartArea.right,y)
    c2.stroke()
    c2.restore()
  }}

  window._charts['po-spread']=new Chart(ctx,{
    type:'line',
    data:{datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{labels:{color:'#a0a0b8',usePointStyle:true,padding:14,font:{size:11,family:'Inter'}}},
        tooltip:{backgroundColor:'#1c2128',titleColor:'#f0f6fc',bodyColor:'#e1e4e8',borderColor:'#30363d',borderWidth:1,
          callbacks:{label:ctx2=>{
            const v=ctx2.parsed.y
            return ctx2.dataset.label+': '+(v<0?'-$'+Math.abs(v):'+$'+v)+'/MBF'+(v<0?' (below print)':' (above print)')
          }}}
      },
      scales:{
        x:{type:'time',time:{unit:timeUnit,tooltipFormat:'MMM yyyy'},grid:{color:'rgba(62,62,86,0.5)'},ticks:{color:'#a0a0b8',font:{size:10}}},
        y:{grid:{color:'rgba(62,62,86,0.5)'},ticks:{color:'#a0a0b8',font:{size:10},callback:v=>(v<0?'-$'+Math.abs(v):'+$'+v)},
          afterDataLimits:scale=>{if(scale.min>0)scale.min=0;if(scale.max<0)scale.max=0}}
      }
    },
    plugins:[zeroLinePlugin]
  })

  // Apply green/red gradient fill now that scales exist
  const chart=window._charts['po-spread']
  const yScale=chart.scales.y
  if(yScale){
    const zeroY=yScale.getPixelForValue(0)
    const {top,bottom}=chart.chartArea
    const grad=chart.ctx.createLinearGradient(0,top,0,bottom)
    if(zeroY<=top){
      grad.addColorStop(0,'rgba(166,227,161,0.35)')
      grad.addColorStop(1,'rgba(166,227,161,0.35)')
    }else if(zeroY>=bottom){
      grad.addColorStop(0,'rgba(243,139,168,0.35)')
      grad.addColorStop(1,'rgba(243,139,168,0.35)')
    }else{
      const ratio=(zeroY-top)/(bottom-top)
      grad.addColorStop(0,'rgba(243,139,168,0.35)')
      grad.addColorStop(Math.max(0,ratio-0.01),'rgba(243,139,168,0.1)')
      grad.addColorStop(ratio,'transparent')
      grad.addColorStop(Math.min(1,ratio+0.01),'rgba(166,227,161,0.1)')
      grad.addColorStop(1,'rgba(166,227,161,0.35)')
    }
    chart.data.datasets.forEach(ds=>{ds.backgroundColor=grad})
    chart.update('none')
  }
}

function _renderPOVolChart(selProds,series,agg){
  const ctx=document.getElementById('po-volume-chart')
  if(!ctx)return
  destroyChart('po-volume')

  const datasets=[]
  selProds.forEach((prod,pi)=>{
    const color=_PO_COLORS[pi%_PO_COLORS.length]
    if(series[prod]){
      const pts=Object.entries(series[prod]).map(([k,v])=>({x:k,y:v.count})).sort((a,b)=>a.x.localeCompare(b.x))
      datasets.push({label:prod,data:pts,backgroundColor:color+'66',borderColor:color,borderWidth:1})
    }
  })

  const timeUnit=agg==='weekly'?'week':agg==='quarterly'?'quarter':'month'
  window._charts['po-volume']=new Chart(ctx,{
    type:'bar',
    data:{datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{labels:{color:'#a0a0b8',usePointStyle:true,padding:14,font:{size:11,family:'Inter'}}},
        tooltip:{backgroundColor:'#1c2128',titleColor:'#f0f6fc',bodyColor:'#e1e4e8',borderColor:'#30363d',borderWidth:1}
      },
      scales:{
        x:{type:'time',time:{unit:timeUnit,tooltipFormat:'MMM yyyy'},grid:{color:'rgba(62,62,86,0.5)'},ticks:{color:'#a0a0b8',font:{size:10}}},
        y:{grid:{color:'rgba(62,62,86,0.5)'},ticks:{color:'#a0a0b8',font:{size:10}}}
      }
    }
  })
}

// ============================================================
// FILTER HELPERS
// ============================================================

function _poaSetRegion(value){
  if(!S.poFilters)S.poFilters={}
  S.poFilters.region=value==='all'?undefined:value
  SS('poFilters',S.poFilters)
  render()
}

function _poaSetAgg(value){
  if(!S.poFilters)S.poFilters={}
  S.poFilters.agg=value
  SS('poFilters',S.poFilters)
  render()
}

function _updatePOFilter(key,value){
  if(!S.poFilters)S.poFilters={}
  S.poFilters[key]=value==='all'?undefined:value
  SS('poFilters',S.poFilters)
  render()
}

// ============================================================
// IMPORT FLOW
// ============================================================

function importPOFile(file){
  if(!file)return
  if(!file.name.toLowerCase().endsWith('.csv')){showToast('Please select a CSV file','warn');return}
  const reader=new FileReader()
  reader.onload=function(e){
    try{
      const text=e.target.result
      const rows=parseClosedTradesCSV(text)
      if(!rows.length){showToast('No PO records found in CSV','warn');return}
      // Dedup by orderNum
      const existing=new Set((S.poHistory||[]).map(r=>r.orderNum||'').filter(k=>k))
      let newCount=0
      const merged=[...(S.poHistory||[])]
      for(const r of rows){
        const key=r.orderNum||''
        if(key&&existing.has(key))continue
        merged.push(r)
        if(key)existing.add(key)
        newCount++
      }
      save('poHistory',merged)
      S._poPage=0
      render()
      showToast(`Imported ${newCount.toLocaleString()} new records (${merged.length.toLocaleString()} total)`,'success')
    }catch(err){
      console.error('PO import error:',err)
      showToast('Import failed: '+err.message,'error')
    }
  }
  reader.onerror=function(){showToast('Failed to read file','error')}
  reader.readAsText(file)
}

// ============================================================
// AUTO-SEED FROM SERVER
// ============================================================

// Load pre-parsed seed data if S.poHistory is empty
async function seedPOHistory(){
  const SEED_VERSION=4 // v4: scrubbed junk (INV- transfers, bad prices/lengths)
  if(S.poHistory&&S.poHistory.length&&(S._poSeedVer||0)>=SEED_VERSION)return
  try{
    const res=await fetch('/api/po/seed')
    if(!res.ok)return
    let data=await res.json()
    if(!data||!data.length)return
    data=data.filter(r=>r.date>='2024-02-01'&&r.doc==='PO'&&r.price>=100&&r.price<=1500&&!/^INV-|MISCELLANEOUS/i.test(r.mill||'')&&/^\d+x\d+/.test(r.product))
    S.poHistory=data
    await dbSet('poHistory',data)
    SS('poHistory',data)
    S._poSeedVer=SEED_VERSION;SS('_poSeedVer',SEED_VERSION)
    console.log('PO Analysis: seeded',data.length,'records from server (v'+SEED_VERSION+')')
    if(S.view==='poanalysis')render()
  }catch(e){console.warn('PO seed skip:',e.message)}
}
