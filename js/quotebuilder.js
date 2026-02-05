// SYP Analytics - Quote Builder
// Bulk quoting machine with intelligence

// ============================================================================
// QUOTE BUILDER STATE
// ============================================================================

function initQuoteBuilder(){
  S.qb=S.qb||{
    customer:'',
    destination:'',
    products:[],
    quotes:[],
    marginTarget:25,
    freightAdjustments:{}, // {lane: adjustment} for learned freight corrections
    generatedAt:null
  };
}

// ============================================================================
// DATA HELPERS
// ============================================================================

// Get best mill quotes for a product (sorted by price)
function qbGetMillQuotes(product){
  const cutoff=Date.now()-30*24*60*60*1000; // 30 days
  const quotes=(S.millQuotes||[])
    .filter(q=>q.product===product&&new Date(q.date)>=cutoff)
    .sort((a,b)=>a.price-b.price);

  // Dedupe by mill (keep cheapest)
  const byMill=new Map();
  quotes.forEach(q=>{
    if(!byMill.has(q.mill))byMill.set(q.mill,q);
  });

  return[...byMill.values()].slice(0,5); // Top 5 mills
}

// Get mill location for freight calc
function qbGetMillLocation(millName){
  const mill=(S.mills||[]).find(m=>m.name===millName);
  if(mill){
    return mill.origin||mill.location||(mill.locations&&mill.locations[0])||'';
  }
  // Check MILL_DIRECTORY if exists
  if(typeof MILL_DIRECTORY!=='undefined'&&MILL_DIRECTORY[millName]){
    const m=MILL_DIRECTORY[millName];
    return m.city+', '+m.state;
  }
  return'';
}

// Calculate freight with adjustments
async function qbCalcFreight(origin,destination,product){
  if(!origin||!destination)return null;

  const lane=origin+'→'+destination;
  const adjustment=S.qb?.freightAdjustments?.[lane]||0;

  // Try to get mileage
  let miles=null;
  if(typeof getLaneMiles==='function'){
    miles=getLaneMiles(origin,destination);
  }
  if(!miles&&typeof getMileage==='function'){
    try{
      const result=await getMileage(origin,destination);
      miles=result?.miles;
    }catch(e){}
  }

  if(!miles)return null;

  // Use flat rate calculation
  const isMSR=product&&product.includes('MSR');
  let freight;
  if(typeof calcFreightPerMBF==='function'){
    freight=calcFreightPerMBF(miles,origin,isMSR);
  }else{
    // Fallback to simple calculation
    const rate=S.flatRate||3.50;
    freight=miles*rate/1000*42; // Approximate MBF conversion
  }

  return{
    miles,
    base:freight,
    adjustment,
    total:freight+adjustment,
    lane
  };
}

// Get customer data
function qbGetCustomerData(customerName){
  if(!customerName)return null;

  // Find customer record
  const customer=(S.customers||[]).find(c=>
    c.name&&c.name.toLowerCase()===customerName.toLowerCase()
  );

  // Get sell history
  const sells=(S.sells||[]).filter(s=>
    s.customer&&s.customer.toLowerCase()===customerName.toLowerCase()&&
    s.status!=='cancelled'
  );

  // Extract products they buy
  const productCounts={};
  sells.forEach(s=>{
    const prod=s.product;
    if(prod){
      productCounts[prod]=(productCounts[prod]||0)+1;
    }
  });

  // Sort by frequency
  const products=Object.entries(productCounts)
    .sort((a,b)=>b[1]-a[1])
    .map(([p])=>p);

  // Calculate typical margin
  let totalMargin=0,marginCount=0;
  sells.forEach(s=>{
    if(s.margin){
      totalMargin+=s.margin;
      marginCount++;
    }
  });
  const avgMargin=marginCount>0?totalMargin/marginCount:25;

  // Get destination
  const destination=customer?.destination||customer?.locations?.[0]||'';

  return{
    name:customerName,
    destination,
    products,
    avgMargin:Math.round(avgMargin),
    totalOrders:sells.length,
    lastOrder:sells.length?sells.sort((a,b)=>new Date(b.date)-new Date(a.date))[0].date:null,
    record:customer
  };
}

// ============================================================================
// QUOTE GENERATION
// ============================================================================

// Generate quotes for all selected products
async function qbGenerateQuotes(){
  if(!S.qb.customer||!S.qb.products.length){
    showToast('Select customer and products','warn');
    return;
  }

  const quotes=[];
  const destination=S.qb.destination;

  for(const product of S.qb.products){
    const millQuotes=qbGetMillQuotes(product);

    if(!millQuotes.length){
      // No mill data - create placeholder
      quotes.push({
        product,
        hasCost:false,
        mill:null,
        fob:null,
        freight:null,
        landed:null,
        margin:S.qb.marginTarget,
        price:null,
        alternatives:[],
        stale:false,
        notes:'No mill quotes available'
      });
      continue;
    }

    // Use best (cheapest) mill
    const best=millQuotes[0];
    const millLoc=qbGetMillLocation(best.mill);
    const freightData=await qbCalcFreight(millLoc,destination,product);

    const freight=freightData?.total||0;
    const landed=best.price+freight;
    const price=landed+S.qb.marginTarget;

    // Check staleness (>7 days old)
    const age=Date.now()-new Date(best.date).getTime();
    const stale=age>7*24*60*60*1000;

    quotes.push({
      product,
      hasCost:true,
      mill:best.mill,
      millLoc,
      fob:best.price,
      freight,
      freightData,
      landed,
      margin:S.qb.marginTarget,
      price,
      quoteDate:best.date,
      stale,
      age:Math.floor(age/(24*60*60*1000)),
      alternatives:millQuotes.slice(1,4).map(q=>({
        mill:q.mill,
        fob:q.price,
        diff:q.price-best.price
      })),
      notes:stale?`Quote ${Math.floor(age/(24*60*60*1000))}d old`:''
    });
  }

  S.qb.quotes=quotes;
  S.qb.generatedAt=new Date().toISOString();
  render();
}

// ============================================================================
// QUOTE ADJUSTMENTS
// ============================================================================

// Adjust price for a specific product
function qbAdjustPrice(product,newPrice){
  const quote=S.qb.quotes.find(q=>q.product===product);
  if(quote){
    quote.price=parseFloat(newPrice);
    quote.margin=quote.landed?quote.price-quote.landed:S.qb.marginTarget;
    render();
  }
}

// Adjust freight for a lane (saves for future)
function qbAdjustFreight(product,newFreight){
  const quote=S.qb.quotes.find(q=>q.product===product);
  if(quote&&quote.freightData){
    const diff=parseFloat(newFreight)-quote.freightData.base;
    quote.freight=parseFloat(newFreight);
    quote.freightData.adjustment=diff;
    quote.freightData.total=parseFloat(newFreight);
    quote.landed=quote.fob+quote.freight;
    quote.price=quote.landed+quote.margin;

    // Save adjustment for this lane
    if(!S.qb.freightAdjustments)S.qb.freightAdjustments={};
    S.qb.freightAdjustments[quote.freightData.lane]=diff;

    render();
  }
}

// Switch to alternative mill
function qbSwitchMill(product,millName){
  const quote=S.qb.quotes.find(q=>q.product===product);
  if(!quote)return;

  const millQuotes=qbGetMillQuotes(product);
  const newMill=millQuotes.find(q=>q.mill===millName);
  if(!newMill)return;

  quote.mill=newMill.mill;
  quote.fob=newMill.price;
  quote.quoteDate=newMill.date;

  // Recalc with new mill
  const millLoc=qbGetMillLocation(newMill.mill);
  quote.millLoc=millLoc;

  qbCalcFreight(millLoc,S.qb.destination,product).then(freightData=>{
    quote.freight=freightData?.total||0;
    quote.freightData=freightData;
    quote.landed=quote.fob+quote.freight;
    quote.price=quote.landed+quote.margin;
    render();
  });
}

// ============================================================================
// PRODUCT SELECTION
// ============================================================================

// Common product packages
const QB_PACKAGES={
  'Studs #2':['2x4#2','2x6#2'],
  'Studs #3':['2x4#3','2x6#3'],
  'Full #2':['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2'],
  'Full #3':['2x4#3','2x6#3','2x8#3','2x10#3','2x12#3'],
  'Full Line':['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2','2x4#3','2x6#3','2x8#3'],
};

function qbAddPackage(packageName){
  const products=QB_PACKAGES[packageName]||[];
  products.forEach(p=>{
    if(!S.qb.products.includes(p))S.qb.products.push(p);
  });
  S.qb.quotes=[];
  render();
}

function qbAddProduct(product){
  if(!S.qb.products.includes(product)){
    S.qb.products.push(product);
    S.qb.quotes=[];
    render();
  }
}

function qbRemoveProduct(product){
  S.qb.products=S.qb.products.filter(p=>p!==product);
  S.qb.quotes=S.qb.quotes.filter(q=>q.product!==product);
  render();
}

function qbClearProducts(){
  S.qb.products=[];
  S.qb.quotes=[];
  render();
}

// ============================================================================
// CUSTOMER SELECTION
// ============================================================================

function qbSelectCustomer(customerName){
  const data=qbGetCustomerData(customerName);
  S.qb.customer=customerName;
  S.qb.destination=data?.destination||'';
  S.qb.marginTarget=data?.avgMargin||25;
  S.qb.products=data?.products?.slice(0,10)||[]; // Top 10 products
  S.qb.quotes=[];
  S.qb.customerData=data;
  render();
}

function qbSetDestination(dest){
  S.qb.destination=dest;
  S.qb.quotes=[]; // Clear quotes since freight will change
  render();
}

function qbSetMargin(margin){
  S.qb.marginTarget=parseFloat(margin)||25;
  // Recalc all prices
  S.qb.quotes.forEach(q=>{
    if(q.landed){
      q.margin=S.qb.marginTarget;
      q.price=q.landed+q.margin;
    }
  });
  render();
}

// ============================================================================
// EXPORT / OUTPUT
// ============================================================================

// Copy to clipboard as formatted text
function qbCopyToClipboard(){
  if(!S.qb.quotes.length){
    showToast('No quotes to copy','warn');
    return;
  }

  const lines=[];
  lines.push(`Quote for ${S.qb.customer}`);
  lines.push(`Delivered to: ${S.qb.destination}`);
  lines.push(`Generated: ${new Date().toLocaleDateString()}`);
  lines.push('');
  lines.push('Product\tPrice\tMill');
  lines.push('─'.repeat(40));

  S.qb.quotes.forEach(q=>{
    if(q.price){
      lines.push(`${q.product}\t$${q.price.toFixed(0)}\t${q.mill||'—'}`);
    }else{
      lines.push(`${q.product}\tNo quote\t—`);
    }
  });

  lines.push('');
  lines.push('Prices valid for 24 hours. Subject to availability.');

  navigator.clipboard.writeText(lines.join('\n'));
  showToast('Quote copied to clipboard','positive');
}

// Copy as tab-separated for Excel
function qbCopyForExcel(){
  if(!S.qb.quotes.length){
    showToast('No quotes to copy','warn');
    return;
  }

  const lines=[];
  lines.push(['Product','Mill','FOB','Freight','Landed','Margin','Price'].join('\t'));

  S.qb.quotes.forEach(q=>{
    lines.push([
      q.product,
      q.mill||'',
      q.fob?'$'+q.fob.toFixed(0):'',
      q.freight?'$'+q.freight.toFixed(0):'',
      q.landed?'$'+q.landed.toFixed(0):'',
      q.margin?'$'+q.margin.toFixed(0):'',
      q.price?'$'+q.price.toFixed(0):''
    ].join('\t'));
  });

  navigator.clipboard.writeText(lines.join('\n'));
  showToast('Copied for Excel','positive');
}

// Copy just prices (customer-facing)
function qbCopyPricesOnly(){
  if(!S.qb.quotes.length){
    showToast('No quotes to copy','warn');
    return;
  }

  const lines=[];
  lines.push(`${S.qb.customer} - Delivered ${S.qb.destination}`);
  lines.push('');

  S.qb.quotes.forEach(q=>{
    if(q.price){
      lines.push(`${q.product}: $${q.price.toFixed(0)}`);
    }
  });

  navigator.clipboard.writeText(lines.join('\n'));
  showToast('Prices copied','positive');
}

// ============================================================================
// SAVE QUOTE (for tracking)
// ============================================================================

function qbSaveQuote(){
  if(!S.qb.quotes.length){
    showToast('No quotes to save','warn');
    return;
  }

  const savedQuote={
    id:Date.now(),
    customer:S.qb.customer,
    destination:S.qb.destination,
    products:S.qb.quotes.map(q=>({
      product:q.product,
      mill:q.mill,
      fob:q.fob,
      freight:q.freight,
      price:q.price,
      margin:q.margin
    })),
    marginTarget:S.qb.marginTarget,
    generatedAt:S.qb.generatedAt,
    savedAt:new Date().toISOString(),
    status:'sent', // sent, won, lost
    trader:S.trader
  };

  if(!S.savedQuotes)S.savedQuotes=[];
  S.savedQuotes.push(savedQuote);
  saveAllLocal();

  showToast('Quote saved for tracking','positive');
}

// ============================================================================
// VIEW RENDERING
// ============================================================================

function renderQuoteBuilder(){
  initQuoteBuilder();

  const customers=[...new Set((S.customers||[]).map(c=>c.name).filter(Boolean))].sort();
  const allProducts=PRODUCTS||['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2','2x4#3','2x6#3','2x8#3'];

  return`
    <div class="qb-container">
      <!-- Customer & Settings Row -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">QUOTE BUILDER</span>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm btn-default" onclick="qbCopyToClipboard()">📋 Copy</button>
            <button class="btn btn-sm btn-default" onclick="qbCopyForExcel()">📊 Excel</button>
            <button class="btn btn-sm btn-success" onclick="qbSaveQuote()">💾 Save</button>
          </div>
        </div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr 150px 150px auto;gap:12px;align-items:end">
            <div class="form-group" style="margin:0">
              <label class="form-label">Customer</label>
              <input type="text" id="qb-customer" list="qb-customers"
                value="${S.qb.customer}"
                onchange="qbSelectCustomer(this.value)"
                placeholder="Select or type customer...">
              <datalist id="qb-customers">
                ${customers.map(c=>`<option value="${c}">`).join('')}
              </datalist>
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">Destination</label>
              <input type="text" id="qb-destination"
                value="${S.qb.destination}"
                onchange="qbSetDestination(this.value)"
                placeholder="City, ST">
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">Target Margin</label>
              <input type="number" id="qb-margin"
                value="${S.qb.marginTarget}"
                onchange="qbSetMargin(this.value)"
                style="width:100%">
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">Flat Rate</label>
              <div style="padding:8px;background:var(--bg);border-radius:4px;text-align:center">
                $${(S.flatRate||3.50).toFixed(2)}/mi
              </div>
            </div>
            <button class="btn btn-primary" onclick="qbGenerateQuotes()" style="height:38px">
              ⚡ Generate
            </button>
          </div>

          ${S.qb.customerData?`
            <div style="margin-top:12px;padding:8px 12px;background:var(--bg);border-radius:4px;font-size:11px;display:flex;gap:20px">
              <span>📦 ${S.qb.customerData.totalOrders} orders</span>
              <span>💰 Avg margin: $${S.qb.customerData.avgMargin}</span>
              <span>📅 Last: ${S.qb.customerData.lastOrder?new Date(S.qb.customerData.lastOrder).toLocaleDateString():'Never'}</span>
            </div>
          `:''}
        </div>
      </div>

      <!-- Product Selection -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">PRODUCTS</span>
          <div style="display:flex;gap:8px">
            ${Object.keys(QB_PACKAGES).map(pkg=>`
              <button class="btn btn-sm btn-default" onclick="qbAddPackage('${pkg}')">${pkg}</button>
            `).join('')}
            <button class="btn btn-sm btn-danger" onclick="qbClearProducts()">Clear</button>
          </div>
        </div>
        <div class="card-body">
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${allProducts.map(p=>`
              <button class="btn btn-sm ${S.qb.products.includes(p)?'btn-primary':'btn-default'}"
                onclick="${S.qb.products.includes(p)?`qbRemoveProduct('${p}')`:`qbAddProduct('${p}')`}">
                ${p} ${S.qb.products.includes(p)?'✓':''}
              </button>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Quote Results -->
      ${S.qb.quotes.length?`
        <div class="card">
          <div class="card-header">
            <span class="card-title positive">GENERATED QUOTES</span>
            <span style="font-size:11px;color:var(--muted)">
              ${new Date(S.qb.generatedAt).toLocaleString()}
            </span>
          </div>
          <div class="card-body" style="padding:0">
            <table class="data-table" style="font-size:12px">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Mill</th>
                  <th style="text-align:right">FOB</th>
                  <th style="text-align:right">Freight</th>
                  <th style="text-align:right">Landed</th>
                  <th style="text-align:right">Margin</th>
                  <th style="text-align:right">Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${S.qb.quotes.map(q=>`
                  <tr class="${q.stale?'stale-row':''}">
                    <td class="bold">${q.product}</td>
                    <td>
                      ${q.mill?`
                        <select onchange="qbSwitchMill('${q.product}',this.value)" style="font-size:11px;padding:2px 4px">
                          <option value="${q.mill}">${q.mill}</option>
                          ${q.alternatives.map(a=>`
                            <option value="${a.mill}">${a.mill} (+$${a.diff.toFixed(0)})</option>
                          `).join('')}
                        </select>
                      `:'<span style="color:var(--muted)">—</span>'}
                    </td>
                    <td style="text-align:right">${q.fob?'$'+q.fob.toFixed(0):'—'}</td>
                    <td style="text-align:right">
                      ${q.freight!==null?`
                        <input type="number" value="${q.freight.toFixed(0)}"
                          onchange="qbAdjustFreight('${q.product}',this.value)"
                          style="width:60px;text-align:right;font-size:11px;padding:2px 4px">
                      `:'—'}
                    </td>
                    <td style="text-align:right;font-weight:600">${q.landed?'$'+q.landed.toFixed(0):'—'}</td>
                    <td style="text-align:right;color:var(--positive)">${q.margin?'$'+q.margin.toFixed(0):'—'}</td>
                    <td style="text-align:right">
                      ${q.price?`
                        <input type="number" value="${q.price.toFixed(0)}"
                          onchange="qbAdjustPrice('${q.product}',this.value)"
                          style="width:70px;text-align:right;font-weight:600;font-size:12px;padding:4px">
                      `:'<span style="color:var(--negative)">No data</span>'}
                    </td>
                    <td>
                      ${q.stale?`<span class="badge badge-warn" title="${q.age}d old">⚠️ Stale</span>`:''}
                      ${!q.hasCost?`<span class="badge badge-danger">No cost</span>`:''}
                      ${q.hasCost&&!q.stale?`<span class="badge badge-success">✓</span>`:''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr style="background:var(--panel-alt);font-weight:600">
                  <td colspan="6" style="text-align:right">Total Margin:</td>
                  <td style="text-align:right;color:var(--positive)">
                    $${S.qb.quotes.reduce((sum,q)=>sum+(q.margin||0),0).toFixed(0)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- Quick Copy Section -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">QUICK COPY</span>
          </div>
          <div class="card-body">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
              <div>
                <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Customer-Facing (prices only)</div>
                <pre style="background:var(--bg);padding:12px;border-radius:4px;font-size:11px;max-height:200px;overflow:auto">${S.qb.customer} - Delivered ${S.qb.destination}

${S.qb.quotes.filter(q=>q.price).map(q=>`${q.product}: $${q.price.toFixed(0)}`).join('\n')}</pre>
                <button class="btn btn-sm btn-primary" onclick="qbCopyPricesOnly()" style="margin-top:8px">Copy Prices</button>
              </div>
              <div>
                <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Internal (full breakdown)</div>
                <pre style="background:var(--bg);padding:12px;border-radius:4px;font-size:11px;max-height:200px;overflow:auto">${S.qb.quotes.filter(q=>q.price).map(q=>
                  `${q.product}: ${q.mill} $${q.fob?.toFixed(0)||'?'} + $${q.freight?.toFixed(0)||'?'} frt = $${q.landed?.toFixed(0)||'?'} + $${q.margin?.toFixed(0)||'?'} = $${q.price.toFixed(0)}`
                ).join('\n')}</pre>
                <button class="btn btn-sm btn-default" onclick="qbCopyForExcel()" style="margin-top:8px">Copy for Excel</button>
              </div>
            </div>
          </div>
        </div>
      `:`
        <div class="card">
          <div class="card-body" style="text-align:center;padding:40px;color:var(--muted)">
            <div style="font-size:24px;margin-bottom:12px">📋</div>
            <div>Select customer, add products, then click Generate</div>
          </div>
        </div>
      `}
    </div>

    <style>
      .qb-container{display:flex;flex-direction:column;gap:16px}
      .stale-row{background:rgba(232,180,74,0.1)}
      .stale-row td{color:var(--warn)}
    </style>
  `;
}
