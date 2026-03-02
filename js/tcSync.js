// tcSync.js — Trade Central → SYP Analytics sync
// Extracts order data from Trade Central's Pinia store and imports into SYP Analytics

// ===== CONFIGURATION =====
const TC_SYNC = {
  // Only sync these departments (SYP is the core business)
  departments: ['SYP'],

  // Trader name mapping: Trade Central → SYP Analytics
  traderMap: {
    'Ian Plank': 'Ian P',
    'Aubrey Milligan': 'Aubrey M',
    'Hunter Sweet': 'Hunter S',
    'Sawyer Rapp': 'Sawyer R',
    'Jackson McCormick': 'Jackson M',
    'John Wall': 'John W',
    'Michael Keegan': 'Michael K'
  },

  // Grade extraction from TC description
  gradeMap: {
    'K.D. SYP #1': '#1',
    'K.D. SYP #2': '#2',
    'K.D. SYP #2 & BTR': '#2',
    'K.D. SYP #3': '#3',
    'K.D. SYP #4': '#4',
    'K.D. SYP 2400 F - MSR': 'MSR',
    'K.D. SYP STUD GRADE': 'STUD',
    'KD SPF NO GRADE': '#2'  // default
  }
}

// ===== PRODUCT PARSING =====

/**
 * Parse TC descriptionDetail "2 X 4 R/L" or "2 X 10 12'" → {dim: "2x4", length: "RL"}
 */
function tcParseDetail(detail) {
  if (!detail) return { dim: '', length: '' }
  const cleaned = detail.trim()

  // Match "2 X 4 R/L" or "2 X 10 12'" or "2 X 6 104-5/8\""
  const match = cleaned.match(/^(\d+)\s*[Xx]\s*(\d+)\s+(.+)$/)
  if (!match) return { dim: '', length: '' }

  const width = match[1]
  const depth = match[2]
  const dim = `${width}x${depth}`

  let lengthStr = match[3].replace(/'/g, '').replace(/"/g, '').trim()

  // Normalize R/L → RL
  if (/^r\/l$/i.test(lengthStr)) lengthStr = 'RL'
  // Stud lengths like "104-5/8" stay as-is or we can note them

  return { dim, length: lengthStr }
}

/**
 * Convert TC description + detail → SYP Analytics product string
 * e.g. "K.D. SYP #2" + "2 X 4 R/L" → "2x4#2"
 */
function tcToSypProduct(description, detail) {
  const grade = TC_SYNC.gradeMap[description] || '#2'
  const { dim } = tcParseDetail(detail)
  if (!dim) return description // fallback

  if (grade === 'MSR') return `${dim} MSR 2400f`
  if (grade === 'STUD') return `${dim} STUD`
  return `${dim}${grade}`
}

/**
 * Get SYP Analytics length from TC detail
 */
function tcToSypLength(detail) {
  const { length } = tcParseDetail(detail)
  return length || 'RL'
}

/**
 * Map TC trader name → SYP Analytics short name
 */
function tcToSypTrader(traderName) {
  return TC_SYNC.traderMap[traderName] || traderName
}

/**
 * Format TC date string to YYYY-MM-DD
 */
function tcFormatDate(dateStr) {
  if (!dateStr) return ''
  return dateStr.split('T')[0]
}

/**
 * Derive ship week (Monday of that week) from date
 */
function tcShipWeek(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

/**
 * Generate UUID
 */
function tcUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ===== EXTRACTION (runs on Trade Central tab) =====

/**
 * Extract all SYP orders from Trade Central Pinia store
 * Returns { orders: [...], stats: {...} }
 *
 * Must be called from the Trade Central browser tab
 */
function tcExtractOrders() {
  const app = document.querySelector('#app')
  if (!app || !app.__vue_app__) {
    throw new Error('Not on Trade Central page — Vue app not found')
  }

  const pinia = app.__vue_app__.config.globalProperties.$pinia
  if (!pinia) throw new Error('Pinia store not found')

  const openStore = pinia._s.get('orderListV2:open')
  if (!openStore) throw new Error('Open orders store not found')

  const allOrders = openStore.$state.orderList || []

  // Filter to target departments
  const filtered = allOrders.filter(o =>
    TC_SYNC.departments.includes(o.departmentName)
  )

  // Group by tradeId to link OC ↔ PO
  const tradeGroups = {}
  filtered.forEach(o => {
    if (!tradeGroups[o.tradeId]) tradeGroups[o.tradeId] = []
    tradeGroups[o.tradeId].push(o)
  })

  const sells = [] // OC → SYP sell
  const buys = []  // PO → SYP buy

  filtered.forEach(order => {
    const trader = tcToSypTrader(order.traderName)
    const orderNum = String(order.orderNumber)
    const date = tcFormatDate(order.orderDate)
    const shipWeek = tcShipWeek(order.shipDueDate)

    // Each order can have multiple line items —
    // Group by product for the primary item, build tally for multi-length
    const items = order.orderItems || []

    if (items.length === 0) return

    // Determine if all items share the same dimension+grade (common case)
    const products = items.map(i => tcToSypProduct(i.description, i.descriptionDetail))
    const lengths = items.map(i => tcToSypLength(i.descriptionDetail))
    const prices = items.map(i => i.price)

    // Check if all items are same product (just different lengths)
    const uniqueProducts = [...new Set(products)]

    if (uniqueProducts.length === 1) {
      // Single product, possibly multiple lengths → one trade with tally
      const product = uniqueProducts[0]
      const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)

      // If all same length or just one item, simple entry
      // If multiple lengths, use RL and build tally
      const uniqueLengths = [...new Set(lengths)]
      let length, tally = {}

      if (uniqueLengths.length === 1) {
        length = uniqueLengths[0]
      } else {
        length = 'RL'
        items.forEach(i => {
          const l = tcToSypLength(i.descriptionDetail)
          if (l !== 'RL') {
            tally[l] = { price: i.price, vol: 0 } // vol unknown from TC
          }
        })
      }

      const base = {
        id: tcUuid(),
        date,
        price: avgPrice,
        product,
        length,
        trader,
        orderNum,
        shipWeek,
        notes: 'TC Import',
        volume: 0,     // TC doesn't have volume in list view
        freight: 0,
        rate: 0,
        miles: 0
      }

      if (Object.keys(tally).length > 0) base.tally = tally

      if (order.documentType === 'OC') {
        // Sell side
        const linked = tradeGroups[order.tradeId]
        const linkedPO = linked?.find(o => o.documentType === 'PO')

        sells.push({
          ...base,
          oc: orderNum,
          customer: order.vendCustName,
          destination: [order.shipToCity, order.shipToState].filter(Boolean).join(', '),
          region: '',  // Will need geo lookup
          linkedPO: linkedPO ? String(linkedPO.orderNumber) : '',
          delivered: false
        })
      } else if (order.documentType === 'PO') {
        // Buy side
        buys.push({
          ...base,
          po: orderNum,
          mill: order.vendCustName,
          origin: [order.shipFromCity, order.shipFromState].filter(Boolean).join(', '),
          region: '',
          shipped: false
        })
      }
    } else {
      // Multiple different products in one order — create separate entries per product
      items.forEach((item, idx) => {
        const product = products[idx]
        const length = lengths[idx]
        const price = prices[idx]

        const base = {
          id: tcUuid(),
          date,
          price,
          product,
          length,
          trader,
          orderNum,
          shipWeek,
          notes: 'TC Import',
          volume: 0,
          freight: 0,
          rate: 0,
          miles: 0,
          tally: {}
        }

        if (order.documentType === 'OC') {
          const linked = tradeGroups[order.tradeId]
          const linkedPO = linked?.find(o => o.documentType === 'PO')

          sells.push({
            ...base,
            oc: orderNum,
            customer: order.vendCustName,
            destination: [order.shipToCity, order.shipToState].filter(Boolean).join(', '),
            region: '',
            linkedPO: linkedPO ? String(linkedPO.orderNumber) : '',
            delivered: false
          })
        } else if (order.documentType === 'PO') {
          buys.push({
            ...base,
            po: orderNum,
            mill: order.vendCustName,
            origin: [order.shipFromCity, order.shipFromState].filter(Boolean).join(', '),
            region: '',
            shipped: false
          })
        }
      })
    }
  })

  return {
    buys,
    sells,
    stats: {
      totalTC: allOrders.length,
      filteredTC: filtered.length,
      extractedBuys: buys.length,
      extractedSells: sells.length,
      traders: [...new Set(filtered.map(o => o.traderName))],
      departments: [...new Set(filtered.map(o => o.departmentName))]
    }
  }
}


// ===== IMPORT INTO SYP ANALYTICS =====

/**
 * Import extracted TC data into SYP Analytics
 * Deduplicates by orderNum to avoid double-importing
 *
 * Must be called from the SYP Analytics browser tab (or with access to S/save/render)
 */
function tcImportToSYP(extracted) {
  if (!extracted || !extracted.buys || !extracted.sells) {
    showToast('No TC data to import', 'negative')
    return
  }

  const existingBuyNums = new Set((S.buys || []).map(b => b.orderNum || b.po).filter(Boolean))
  const existingSellNums = new Set((S.sells || []).map(s => s.orderNum || s.oc).filter(Boolean))

  let newBuys = 0, newSells = 0, skippedBuys = 0, skippedSells = 0

  // Import buys (deduplicate by orderNum)
  extracted.buys.forEach(buy => {
    if (existingBuyNums.has(buy.orderNum)) {
      skippedBuys++
      return
    }
    S.buys.push(buy)
    existingBuyNums.add(buy.orderNum)
    newBuys++

    // Ensure mill exists in S.mills
    if (buy.mill && !S.mills.find(m => m.name === buy.mill)) {
      S.mills.push({ name: buy.mill, origin: buy.origin || '', addedDate: new Date().toISOString().split('T')[0] })
    }
  })

  // Import sells (deduplicate by orderNum)
  extracted.sells.forEach(sell => {
    if (existingSellNums.has(sell.orderNum)) {
      skippedSells++
      return
    }
    S.sells.push(sell)
    existingSellNums.add(sell.orderNum)
    newSells++

    // Ensure customer exists in S.customers
    if (sell.customer && !S.customers.find(c => c.name === sell.customer)) {
      S.customers.push({ name: sell.customer, destination: sell.destination || '', addedDate: new Date().toISOString().split('T')[0] })
    }
  })

  if (newBuys > 0 || newSells > 0) {
    save('buys', S.buys)
    save('sells', S.sells)
    if (newBuys > 0) save('mills', S.mills)
    if (newSells > 0) save('customers', S.customers)
    render()
    showToast(`TC Import: +${newBuys} buys, +${newSells} sells (${skippedBuys + skippedSells} duplicates skipped)`, 'positive')
  } else {
    showToast(`TC Import: No new orders (${skippedBuys + skippedSells} already exist)`, 'info')
  }

  return { newBuys, newSells, skippedBuys, skippedSells }
}


// ===== BOOKMARKLET / CONSOLE EXTRACTION =====

/**
 * Generate a bookmarklet-friendly extraction script
 * This runs on the TC tab, extracts data, and copies JSON to clipboard
 */
function tcGenerateExtractScript() {
  return `javascript:void(function(){
    try{
      var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
      var orders=p._s.get('orderListV2:open').$state.orderList;
      var syp=orders.filter(function(o){return o.departmentName==='SYP'});
      var data=JSON.stringify(syp);
      navigator.clipboard.writeText(data).then(function(){
        alert('Copied '+syp.length+' SYP orders to clipboard!');
      });
    }catch(e){alert('Error: '+e.message)}
  }())`
}


// ===== SETTINGS UI =====

/**
 * Render TC Sync section in Settings page
 */
function renderTCSyncSettings() {
  const el = document.getElementById('tc-sync-settings')
  if (!el) return

  // Count existing TC imports
  const tcBuys = (S.buys || []).filter(b => b.notes === 'TC Import').length
  const tcSells = (S.sells || []).filter(s => s.notes === 'TC Import').length

  el.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:12px">
      <div style="flex:1;padding:10px;background:var(--bg);border-radius:6px;text-align:center">
        <div style="font-size:20px;font-weight:700;color:var(--accent)">${tcBuys}</div>
        <div style="font-size:11px;color:var(--muted)">TC Buys Imported</div>
      </div>
      <div style="flex:1;padding:10px;background:var(--bg);border-radius:6px;text-align:center">
        <div style="font-size:20px;font-weight:700;color:var(--green)">${tcSells}</div>
        <div style="font-size:11px;color:var(--muted)">TC Sells Imported</div>
      </div>
    </div>

    <div style="margin-bottom:12px">
      <button class="btn btn-primary" onclick="tcStartSync()" style="margin-right:8px">
        🔄 Sync from Trade Central
      </button>
      <button class="btn btn-default" onclick="tcPasteImport()">
        📋 Paste TC Data
      </button>
    </div>

    <div style="font-size:11px;color:var(--muted)">
      <strong>How to sync:</strong><br>
      1. Open <a href="https://trade.fctg.com/orders/open" target="_blank" style="color:var(--accent)">Trade Central</a> in another tab<br>
      2. Wait for orders to load<br>
      3. Click "Sync from Trade Central" — or copy data from TC console and paste here<br>
      <br>
      <strong>Departments:</strong> ${TC_SYNC.departments.join(', ')}<br>
      <strong>Deduplication:</strong> By order number — safe to run multiple times
    </div>

    <div id="tc-sync-log" style="margin-top:12px"></div>
  `
}

/**
 * Paste-based import: user copies JSON from TC console, pastes here
 */
async function tcPasteImport() {
  try {
    const text = await navigator.clipboard.readText()
    let data
    try {
      data = JSON.parse(text)
    } catch (e) {
      showToast('Clipboard does not contain valid JSON', 'negative')
      return
    }

    // If it's raw TC orders (array), transform them
    if (Array.isArray(data) && data[0] && data[0].documentType) {
      // Raw TC format — need to transform
      showToast('Processing raw TC orders...', 'info')
      const transformed = tcTransformRawOrders(data)
      const result = tcImportToSYP(transformed)
      renderTCSyncSettings()
      return
    }

    // If it's already in our extracted format {buys, sells}
    if (data.buys && data.sells) {
      const result = tcImportToSYP(data)
      renderTCSyncSettings()
      return
    }

    showToast('Unrecognized data format in clipboard', 'negative')
  } catch (e) {
    showToast('Clipboard access denied — paste into the text area below', 'negative')
    // Fallback: show textarea
    const log = document.getElementById('tc-sync-log')
    if (log) {
      log.innerHTML = `
        <textarea id="tc-paste-area" rows="6" style="width:100%;font-family:monospace;font-size:11px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:8px" placeholder="Paste TC JSON data here..."></textarea>
        <button class="btn btn-primary btn-sm" onclick="tcProcessPastedText()" style="margin-top:6px">Import Pasted Data</button>
      `
    }
  }
}

function tcProcessPastedText() {
  const area = document.getElementById('tc-paste-area')
  if (!area || !area.value.trim()) return
  try {
    const data = JSON.parse(area.value)
    if (Array.isArray(data)) {
      const transformed = tcTransformRawOrders(data)
      tcImportToSYP(transformed)
    } else if (data.buys && data.sells) {
      tcImportToSYP(data)
    }
    renderTCSyncSettings()
  } catch (e) {
    showToast('Invalid JSON: ' + e.message, 'negative')
  }
}

/**
 * Transform raw TC order array into {buys, sells} format
 */
function tcTransformRawOrders(rawOrders) {
  // Build trade groups for linking
  const tradeGroups = {}
  rawOrders.forEach(o => {
    if (!tradeGroups[o.tradeId]) tradeGroups[o.tradeId] = []
    tradeGroups[o.tradeId].push(o)
  })

  const buys = [], sells = []

  rawOrders.forEach(order => {
    const trader = tcToSypTrader(order.traderName)
    const orderNum = String(order.orderNumber)
    const date = tcFormatDate(order.orderDate)
    const shipWeek = tcShipWeek(order.shipDueDate)
    const items = order.orderItems || []

    if (items.length === 0) return

    const products = items.map(i => tcToSypProduct(i.description, i.descriptionDetail))
    const lengths = items.map(i => tcToSypLength(i.descriptionDetail))
    const prices = items.map(i => i.price)
    const uniqueProducts = [...new Set(products)]

    const buildEntry = (product, length, price, tally) => {
      const base = {
        id: tcUuid(),
        date,
        price,
        product,
        length,
        trader,
        orderNum,
        shipWeek,
        notes: 'TC Import',
        volume: 0,
        freight: 0,
        rate: 0,
        miles: 0
      }
      if (tally && Object.keys(tally).length > 0) base.tally = tally
      return base
    }

    const processItems = (product, itemSubset) => {
      const subPrices = itemSubset.map(i => i.price)
      const subLengths = itemSubset.map(i => tcToSypLength(i.descriptionDetail))
      const avgPrice = Math.round(subPrices.reduce((a, b) => a + b, 0) / subPrices.length)
      const uniqueLengths = [...new Set(subLengths)]

      let length, tally = {}
      if (uniqueLengths.length === 1) {
        length = uniqueLengths[0]
      } else {
        length = 'RL'
        itemSubset.forEach(i => {
          const l = tcToSypLength(i.descriptionDetail)
          if (l !== 'RL') tally[l] = { price: i.price, vol: 0 }
        })
      }

      const entry = buildEntry(product, length, avgPrice, tally)

      if (order.documentType === 'OC') {
        const linked = tradeGroups[order.tradeId]
        const linkedPO = linked?.find(o => o.documentType === 'PO')
        sells.push({
          ...entry,
          oc: orderNum,
          customer: order.vendCustName,
          destination: [order.shipToCity, order.shipToState].filter(Boolean).join(', '),
          region: '',
          linkedPO: linkedPO ? String(linkedPO.orderNumber) : '',
          delivered: false
        })
      } else if (order.documentType === 'PO') {
        buys.push({
          ...entry,
          po: orderNum,
          mill: order.vendCustName,
          origin: [order.shipFromCity, order.shipFromState].filter(Boolean).join(', '),
          region: '',
          shipped: false
        })
      }
    }

    if (uniqueProducts.length === 1) {
      processItems(uniqueProducts[0], items)
    } else {
      // Group items by product
      const byProduct = {}
      items.forEach((item, idx) => {
        const p = products[idx]
        if (!byProduct[p]) byProduct[p] = []
        byProduct[p].push(item)
      })
      Object.entries(byProduct).forEach(([prod, grp]) => processItems(prod, grp))
    }
  })

  return {
    buys,
    sells,
    stats: {
      totalTC: rawOrders.length,
      extractedBuys: buys.length,
      extractedSells: sells.length
    }
  }
}

/**
 * Cross-tab sync: check server for staged TC data, or show instructions
 */
async function tcStartSync() {
  const log = document.getElementById('tc-sync-log')
  if (log) log.innerHTML = '<div style="color:var(--muted)">Checking for staged TC data...</div>'

  try {
    // First check if TC data has been staged on the server
    const resp = await fetch('/api/tc-import')
    if (resp.ok) {
      const result = await resp.json()
      if (result.data && result.data.length > 0) {
        if (log) log.innerHTML = `<div style="color:var(--green)">Found ${result.count} staged TC orders (${result.age_seconds}s ago). Importing...</div>`
        const transformed = tcTransformRawOrders(result.data)
        const importResult = tcImportToSYP(transformed)
        // Clear staging
        fetch('/api/tc-import', { method: 'DELETE' })
        renderTCSyncSettings()
        return
      }
    }
  } catch (e) {
    // Server not available or no data — fall through to manual instructions
  }

  showToast('No staged data found — use the extraction script in TC', 'info')

  if (log) {
    log.innerHTML = `
      <div style="background:var(--bg);padding:12px;border-radius:6px;font-size:12px">
        <strong>Quick Sync Steps:</strong><br><br>
        1. Open <a href="https://trade.fctg.com/orders/open?opco=110" target="_blank" style="color:var(--accent)">Trade Central</a> in another tab<br>
        2. Press F12 → Console tab<br>
        3. Paste this and press Enter:<br>
        <pre style="background:var(--panel);padding:8px;border-radius:4px;margin:8px 0;overflow-x:auto;font-size:10px;cursor:pointer" onclick="navigator.clipboard.writeText(this.innerText);showToast('Copied!','positive')">var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;var o=p._s.get('orderListV2:open').$state.orderList.filter(function(x){return x.departmentName==='SYP'});fetch('http://localhost:5001/api/tc-import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o.map(function(r){return{orderNumber:r.orderNumber,documentType:r.documentType,orderDate:r.orderDate,shipDueDate:r.shipDueDate,vendCustName:r.vendCustName,tradingPartner:r.tradingPartner,traderName:r.traderName,tradeId:r.tradeId,shipFromCity:r.shipFromCity,shipFromState:r.shipFromState,shipToCity:r.shipToCity,shipToState:r.shipToState,estMargin:r.estMargin,transportationType:r.transportationType,orderItems:(r.orderItems||[]).map(function(i){return{description:i.description,descriptionDetail:i.descriptionDetail,price:i.price,priceUOM:i.priceUOM}})}}))}).then(function(r){return r.json()}).then(function(d){alert('Staged '+d.count+' orders! Go back to SYP Analytics and click Sync again.')}).catch(function(e){alert('Error: '+e.message)})</pre>
        4. Come back here and click <strong>🔄 Sync from Trade Central</strong> again
      </div>
    `
  }
}
