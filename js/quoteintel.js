// SYP Analytics - Quote Intelligence Module
// Aggregated market intelligence for rapid customer quoting

// ============================================================================
// POSITION INTELLIGENCE
// ============================================================================

function getPositionForProduct(product){
  let bought=0,sold=0,boughtVal=0;
  S.buys.filter(b=>b.product===product).forEach(b=>{
    bought+=b.volume||0;
    boughtVal+=(b.price||0)*(b.volume||0);
  });
  S.sells.filter(s=>s.product===product).forEach(s=>{
    sold+=s.volume||0;
  });
  const net=bought-sold;
  const avgCost=bought?boughtVal/bought:0;
  return{
    product,bought,sold,net,avgCost,
    isLong:net>0,isShort:net<0,isFlat:net===0,
    positionSize:Math.abs(net),
    pricingBias:net>100?'aggressive':net>50?'normal':net<-50?'cautious':'normal'
  };
}

// ============================================================================
// MARKET INTELLIGENCE
// ============================================================================

function getMarketContext(product,region='west'){
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
  const prevRL=S.rl.length>1?S.rl[S.rl.length-2]:null;
  if(!latestRL)return null;

  const normProd=(product||'').replace(/\s+/g,'');
  const currentPrice=latestRL[region]?.[normProd]||latestRL[region]?.[normProd+'#2']||null;
  const prevPrice=prevRL?prevRL[region]?.[normProd]||prevRL[region]?.[normProd+'#2']:null;
  if(!currentPrice)return null;

  let trend='flat',trendPct=0;
  if(prevPrice){
    trendPct=((currentPrice-prevPrice)/prevPrice)*100;
    trend=trendPct>1?'up':trendPct<-1?'down':'flat';
  }

  return{product,region,currentPrice,previousPrice:prevPrice,trend,trendPct,date:latestRL.date};
}

// ============================================================================
// CUSTOMER PRODUCT HISTORY
// ============================================================================

function getCustomerProducts(customerName){
  if(!customerName)return[];
  const products=new Set();
  S.sells.filter(s=>(s.customer||'').toLowerCase().includes(customerName.toLowerCase()))
    .forEach(s=>{if(s.product)products.add(s.product);});
  return[...products].sort();
}

function getCustomerProfile(customerName){
  if(!customerName)return null;
  const customerSells=S.sells.filter(s=>(s.customer||'').toLowerCase().includes(customerName.toLowerCase()));
  if(!customerSells.length)return null;

  const buyByOrder={};
  S.buys.forEach(b=>{const ord=String(b.orderNum||b.po||'').trim();if(ord)buyByOrder[ord]=b;});

  const productStats={};
  let totalMargin=0,matchedVol=0;

  customerSells.forEach(s=>{
    const prod=s.product;
    if(!productStats[prod])productStats[prod]={product:prod,volume:0,margin:0,trades:0,prices:[]};
    const vol=s.volume||0;
    productStats[prod].trades++;
    productStats[prod].volume+=vol;
    productStats[prod].prices.push(s.price||0);
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    const buy=ord?buyByOrder[ord]:null;
    if(buy){
      const freightPerMBF=vol>0?(s.freight||0)/vol:0;
      const sellFOB=(s.price||0)-freightPerMBF;
      const margin=(sellFOB-(buy.price||0))*vol;
      productStats[prod].margin+=margin;
      totalMargin+=margin;
      matchedVol+=vol;
    }
  });

  const byProduct=Object.values(productStats).map(p=>({
    ...p,
    avgPrice:p.volume?p.prices.reduce((a,b)=>a+b,0)/p.prices.length:0,
    lastPrice:p.prices[p.prices.length-1]||0,
    avgMargin:p.volume&&p.margin?p.margin/p.volume:null
  }));

  const totalVolume=customerSells.reduce((s,x)=>s+(x.volume||0),0);
  const dates=customerSells.map(s=>s.date).filter(Boolean).sort();
  return{
    customer:customerName,
    totalTrades:customerSells.length,
    totalVolume,
    avgMarginPerMBF:matchedVol?totalMargin/matchedVol:null,
    byProduct,
    lastPurchase:dates[dates.length-1]||null,
    products:byProduct.map(p=>p.product)
  };
}

// ============================================================================
// AGGREGATED MARKET SNAPSHOT
// ============================================================================

// Get all mill quotes for a product with competitive analysis
function getProductMarketSnapshot(product){
  const thirtyDaysAgo=new Date(Date.now()-30*24*60*60*1000);
  const quotes=(S.millQuotes||[]).filter(q=>
    q.product===product&&new Date(q.date)>=thirtyDaysAgo
  ).sort((a,b)=>a.price-b.price);

  if(!quotes.length)return{product,hasQuotes:false,quotes:[],spread:0,clusters:[]};

  const best=quotes[0];
  const worst=quotes[quotes.length-1];
  const spread=worst.price-best.price;

  // Cluster mills by price tier ($10 buckets)
  const clusters=[];
  let currentCluster=null;
  quotes.forEach(q=>{
    const tier=Math.floor((q.price-best.price)/10)*10;
    if(!currentCluster||currentCluster.tier!==tier){
      currentCluster={tier,mills:[],avgPrice:0};
      clusters.push(currentCluster);
    }
    currentCluster.mills.push(q);
    currentCluster.avgPrice=currentCluster.mills.reduce((s,m)=>s+m.price,0)/currentCluster.mills.length;
  });

  const market=getMarketContext(product,'west');
  const position=getPositionForProduct(product);

  return{
    product,
    hasQuotes:true,
    quotes,
    best,
    second:quotes[1]||null,
    third:quotes[2]||null,
    spread,
    clusters,
    numMills:quotes.length,
    marketPrice:market?.currentPrice||null,
    marketTrend:market?.trend||'flat',
    marketTrendPct:market?.trendPct||0,
    basisToBest:market?.currentPrice?best.price-market.currentPrice:null,
    position:position.net,
    positionBias:position.pricingBias
  };
}

// Get full market snapshot for all products a customer buys
function getCustomerMarketSnapshot(customerName){
  const profile=getCustomerProfile(customerName);
  const products=profile?.products||[];

  // If no history, use common products
  const targetProducts=products.length?products:['2x4#2','2x6#2','2x4#3','2x6#3'];

  const snapshots=targetProducts.map(p=>getProductMarketSnapshot(p));
  const withQuotes=snapshots.filter(s=>s.hasQuotes);

  // Overall market sentiment
  const upTrends=withQuotes.filter(s=>s.marketTrend==='up').length;
  const downTrends=withQuotes.filter(s=>s.marketTrend==='down').length;
  const marketSentiment=upTrends>downTrends?'bullish':downTrends>upTrends?'bearish':'neutral';

  // Competitive landscape
  const avgSpread=withQuotes.length?withQuotes.reduce((s,p)=>s+p.spread,0)/withQuotes.length:0;
  const tightMarkets=withQuotes.filter(s=>s.spread<20);
  const wideMarkets=withQuotes.filter(s=>s.spread>=40);

  return{
    customer:customerName,
    profile,
    products:snapshots,
    withQuotes,
    marketSentiment,
    avgSpread,
    tightMarkets:tightMarkets.map(s=>s.product),
    wideMarkets:wideMarkets.map(s=>s.product),
    summary:{
      totalProducts:snapshots.length,
      quotedProducts:withQuotes.length,
      upTrends,
      downTrends,
      flatTrends:withQuotes.length-upTrends-downTrends
    }
  };
}

// ============================================================================
// BULK QUOTE GENERATION
// ============================================================================

// Generate quotes for all products at a given risk level
// riskLevel: 0=best cost, 1=2nd best, 2=3rd best, etc. OR 'aggressive'/'moderate'/'conservative'
function generateBulkQuotes(customerName,destination,riskLevel=1,marginTarget=25){
  const snapshot=getCustomerMarketSnapshot(customerName);
  const quotes=[];

  snapshot.products.forEach(prod=>{
    if(!prod.hasQuotes)return;

    // Select cost basis by risk level
    let costSource;
    if(riskLevel==='aggressive')costSource=prod.best;
    else if(riskLevel==='conservative')costSource=prod.third||prod.second||prod.best;
    else if(typeof riskLevel==='number')costSource=prod.quotes[riskLevel]||prod.quotes[prod.quotes.length-1];
    else costSource=prod.second||prod.best;

    // Adjust margin based on market trend and position
    let adjustedMargin=marginTarget;
    if(prod.marketTrend==='down')adjustedMargin-=5; // Tighter in falling market
    if(prod.marketTrend==='up')adjustedMargin+=5; // More room in rising market
    if(prod.positionBias==='aggressive')adjustedMargin-=5; // Move inventory
    if(prod.positionBias==='cautious')adjustedMargin+=5; // Cover risk

    // Calculate freight if destination provided
    let freight=null;
    if(destination&&costSource.mill){
      const origin=MILL_DIRECTORY?.[costSource.mill]?.city;
      if(origin&&typeof getLaneMiles==='function'&&typeof calcFreightPerMBF==='function'){
        const miles=getLaneMiles(origin+', '+MILL_DIRECTORY[costSource.mill]?.state,destination);
        if(miles)freight=calcFreightPerMBF(miles,origin,prod.product.includes('MSR'));
      }
    }

    const landedCost=costSource.price+(freight||0);
    const suggestedPrice=landedCost+adjustedMargin;

    quotes.push({
      product:prod.product,
      mill:costSource.mill,
      millPrice:costSource.price,
      freight,
      landedCost,
      margin:adjustedMargin,
      suggestedPrice,
      marketPrice:prod.marketPrice,
      marketTrend:prod.marketTrend,
      spread:prod.spread,
      numMills:prod.numMills,
      position:prod.position,
      basisToMarket:prod.basisToBest,
      alternativeMills:prod.quotes.slice(0,3).map(q=>({mill:q.mill,price:q.price}))
    });
  });

  return{
    customer:customerName,
    destination,
    riskLevel,
    marginTarget,
    quotes,
    marketSentiment:snapshot.marketSentiment,
    generatedAt:new Date().toISOString()
  };
}

// ============================================================================
// UI FUNCTIONS
// ============================================================================

// State for quote dashboard
function initQuoteDashState(){
  S.qdCustomer=S.qdCustomer||'';
  S.qdDestination=S.qdDestination||'';
  S.qdRiskLevel=S.qdRiskLevel||1;
  S.qdMargin=S.qdMargin||25;
  S.qdProducts=S.qdProducts||[];
  S.qdQuotes=S.qdQuotes||null;
}

// Update customer selection
function setQdCustomer(name){
  S.qdCustomer=name;
  // Auto-load products and destination
  const profile=getCustomerProfile(name);
  if(profile){
    S.qdProducts=profile.products;
    // Try to get destination from CRM or sales
    const cust=(S.customers||[]).find(c=>(c.name||'').toLowerCase()===name.toLowerCase());
    S.qdDestination=cust?.destination||cust?.locations?.[0]||'';
  }
  S.qdQuotes=null;
  render();
}

// Generate quotes
function runQuoteDashboard(){
  if(!S.qdCustomer)return;
  S.qdQuotes=generateBulkQuotes(S.qdCustomer,S.qdDestination,S.qdRiskLevel,S.qdMargin);
  render();
}

// Add product to quote list
function addQdProduct(product){
  if(!S.qdProducts.includes(product)){
    S.qdProducts.push(product);
    S.qdQuotes=null;
    render();
  }
}

// Remove product from quote list
function removeQdProduct(product){
  S.qdProducts=S.qdProducts.filter(p=>p!==product);
  S.qdQuotes=null;
  render();
}

// Export quotes to clipboard
function copyQuotesToClipboard(){
  if(!S.qdQuotes||!S.qdQuotes.quotes.length)return;
  const lines=['Product\tMill\tFOB\tFreight\tLanded\tMargin\tPrice'];
  S.qdQuotes.quotes.forEach(q=>{
    lines.push(`${q.product}\t${q.mill}\t$${q.millPrice?.toFixed(0)||'—'}\t$${q.freight?.toFixed(0)||'—'}\t$${q.landedCost?.toFixed(0)||'—'}\t$${q.margin?.toFixed(0)||'—'}\t$${q.suggestedPrice?.toFixed(0)||'—'}`);
  });
  navigator.clipboard.writeText(lines.join('\n'));
  showToast('Quotes copied to clipboard!','positive');
}

// Create sell orders from quotes
function createSellsFromQuotes(){
  if(!S.qdQuotes||!S.qdQuotes.quotes.length)return;
  // Open multi-sell modal or first product
  const first=S.qdQuotes.quotes[0];
  showSellModal({
    customer:S.qdCustomer,
    product:first.product,
    price:first.suggestedPrice,
    destination:S.qdDestination,
    region:'west'
  });
}
