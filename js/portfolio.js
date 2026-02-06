// SYP Analytics - Portfolio Management Module
// Mark-to-market, basis tracking, hedge ratios, and inventory optimization

// ============================================================================
// MARK-TO-MARKET ENGINE
// ============================================================================

// Get current market price for a product/region
function getMarketPrice(product,region='west'){
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
  if(!latestRL)return null;

  const normProd=(product||'').replace(/\s+/g,'');
  return latestRL[region]?.[normProd]||
         latestRL[region]?.[normProd+'#2']||
         latestRL.composite?.[region]?.[normProd]||null;
}

// Calculate MTM for all open positions
function calcDailyMTM(){
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
  if(!latestRL)return{date:null,positions:[],totalValue:0,totalCost:0,unrealizedPnL:0};

  // Track sold volume per order
  const orderSold={};
  S.sells.forEach(s=>{
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    if(ord)orderSold[ord]=(orderSold[ord]||0)+(s.volume||0);
  });

  const positions=[];
  let totalValue=0,totalCost=0;

  S.buys.forEach(b=>{
    const ord=String(b.orderNum||b.po||'').trim();
    const sold=orderSold[ord]||0;
    const openVol=(b.volume||0)-sold;
    if(openVol<=0)return;

    const region=b.region||'west';
    const product=b.product||'Unknown';
    const costBasis=(b.price||0)*openVol;
    const marketPrice=getMarketPrice(product,region)||b.price||0;
    const mtmValue=marketPrice*openVol;
    const unrealized=mtmValue-costBasis;

    positions.push({
      id:b.id,
      orderNum:ord,
      date:b.date,
      product,
      region,
      mill:b.mill,
      trader:b.trader,
      openVolume:openVol,
      originalVolume:b.volume,
      soldVolume:sold,
      costPrice:b.price||0,
      costBasis,
      marketPrice,
      mtmValue,
      unrealizedPnL:unrealized,
      unrealizedPerMBF:openVol?unrealized/openVol:0,
      daysHeld:Math.floor((new Date()-new Date(b.date))/(1000*60*60*24))
    });

    totalValue+=mtmValue;
    totalCost+=costBasis;
  });

  // Sort by unrealized P&L (biggest losses first)
  positions.sort((a,b)=>a.unrealizedPnL-b.unrealizedPnL);

  return{
    date:latestRL.date,
    positions,
    totalVolume:positions.reduce((s,p)=>s+p.openVolume,0),
    totalValue,
    totalCost,
    unrealizedPnL:totalValue-totalCost
  };
}

// Get MTM history over time
function getMTMHistory(days=30){
  const history=[];
  const now=new Date();

  // For each day, calculate what MTM would have been
  for(let i=days-1;i>=0;i--){
    const targetDate=new Date(now);
    targetDate.setDate(targetDate.getDate()-i);
    const dateStr=targetDate.toISOString().substring(0,10);

    // Find RL data for that date or closest before
    let rlForDate=null;
    for(let j=S.rl.length-1;j>=0;j--){
      if(S.rl[j].date<=dateStr){
        rlForDate=S.rl[j];
        break;
      }
    }

    // Count open positions as of that date
    const orderSold={};
    S.sells.filter(s=>s.date<=dateStr).forEach(s=>{
      const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
      if(ord)orderSold[ord]=(orderSold[ord]||0)+(s.volume||0);
    });

    let totalValue=0,totalCost=0;
    S.buys.filter(b=>b.date<=dateStr).forEach(b=>{
      const ord=String(b.orderNum||b.po||'').trim();
      const sold=orderSold[ord]||0;
      const openVol=(b.volume||0)-sold;
      if(openVol<=0)return;

      const costBasis=(b.price||0)*openVol;
      totalCost+=costBasis;

      if(rlForDate){
        const normProd=(b.product||'').replace(/\s+/g,'');
        const region=b.region||'west';
        const marketPrice=rlForDate[region]?.[normProd]||
                          rlForDate[region]?.[normProd+'#2']||
                          b.price||0;
        totalValue+=marketPrice*openVol;
      }else{
        totalValue+=costBasis;
      }
    });

    history.push({
      date:dateStr,
      mtmValue:totalValue,
      costBasis:totalCost,
      unrealizedPnL:totalValue-totalCost
    });
  }

  return history;
}

// ============================================================================
// BASIS TRACKING
// ============================================================================

// Calculate basis (trade price vs market price)
function calcBasis(tradePrice,product,region='west'){
  const marketPrice=getMarketPrice(product,region);
  if(!marketPrice)return null;

  return{
    tradePrice,
    marketPrice,
    basis:tradePrice-marketPrice,
    basisPct:((tradePrice-marketPrice)/marketPrice)*100
  };
}

// Calculate average mill basis by mill
function calcMillBasis(){
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
  if(!latestRL)return[];

  const millBasis={};
  const cutoff=new Date(Date.now()-30*24*60*60*1000);

  S.buys.filter(b=>new Date(b.date)>=cutoff).forEach(b=>{
    const mill=b.mill||'Unknown';
    const region=b.region||'west';
    const product=b.product;
    const normProd=(product||'').replace(/\s+/g,'');

    const marketPrice=latestRL[region]?.[normProd]||
                      latestRL[region]?.[normProd+'#2']||null;
    if(!marketPrice||!b.price)return;

    if(!millBasis[mill]){
      millBasis[mill]={
        mill,
        trades:0,
        volume:0,
        totalBasis:0,
        products:{}
      };
    }

    const basis=b.price-marketPrice;
    millBasis[mill].trades++;
    millBasis[mill].volume+=b.volume||0;
    millBasis[mill].totalBasis+=basis*(b.volume||0);

    if(!millBasis[mill].products[product]){
      millBasis[mill].products[product]={trades:0,volume:0,avgBasis:0,totalBasis:0};
    }
    millBasis[mill].products[product].trades++;
    millBasis[mill].products[product].volume+=b.volume||0;
    millBasis[mill].products[product].totalBasis+=basis*(b.volume||0);
  });

  // Calculate averages
  return Object.values(millBasis).map(m=>({
    ...m,
    avgBasis:m.volume?m.totalBasis/m.volume:0,
    products:Object.entries(m.products).map(([prod,data])=>({
      product:prod,
      ...data,
      avgBasis:data.volume?data.totalBasis/data.volume:0
    }))
  })).sort((a,b)=>a.avgBasis-b.avgBasis);
}

// ============================================================================
// HEDGE RATIO CALCULATOR
// ============================================================================

// Calculate hedge ratio (sold vs bought)
function calcHedgeRatio(product=null){
  let totalBought=0,totalSold=0;

  if(product){
    S.buys.filter(b=>b.product===product).forEach(b=>totalBought+=b.volume||0);
    S.sells.filter(s=>s.product===product).forEach(s=>totalSold+=s.volume||0);
  }else{
    S.buys.forEach(b=>totalBought+=b.volume||0);
    S.sells.forEach(s=>totalSold+=s.volume||0);
  }

  return{
    product:product||'Portfolio',
    bought:totalBought,
    sold:totalSold,
    hedgeRatio:totalBought?totalSold/totalBought:0,
    netPosition:totalBought-totalSold,
    isFullyHedged:totalSold>=totalBought*0.9,
    isOverHedged:totalSold>totalBought
  };
}

// Get hedge recommendations
function getHedgeRecommendation(){
  const recommendations=[];
  const products=['2x4#2','2x6#2','2x4#3','2x6#3','2x8#2','2x10#2'];

  // Portfolio level
  const portfolio=calcHedgeRatio();
  if(portfolio.hedgeRatio<0.8&&portfolio.netPosition>100){
    recommendations.push({
      product:'Portfolio',
      action:'increase',
      currentRatio:portfolio.hedgeRatio,
      targetRatio:0.9,
      volumeNeeded:Math.round((0.9-portfolio.hedgeRatio)*portfolio.bought),
      reason:`Portfolio hedge ratio of ${(portfolio.hedgeRatio*100).toFixed(0)}% is below target 90%. Long ${portfolio.netPosition.toFixed(0)} MBF.`
    });
  }else if(portfolio.isOverHedged){
    recommendations.push({
      product:'Portfolio',
      action:'decrease',
      currentRatio:portfolio.hedgeRatio,
      targetRatio:1.0,
      volumeExcess:Math.round((portfolio.hedgeRatio-1.0)*portfolio.bought),
      reason:`Portfolio is over-hedged at ${(portfolio.hedgeRatio*100).toFixed(0)}%. Short ${(portfolio.sold-portfolio.bought).toFixed(0)} MBF.`
    });
  }

  // Product level
  products.forEach(product=>{
    const hedge=calcHedgeRatio(product);
    if(hedge.bought===0&&hedge.sold===0)return;

    if(hedge.netPosition>50&&hedge.hedgeRatio<0.7){
      recommendations.push({
        product,
        action:'increase',
        currentRatio:hedge.hedgeRatio,
        targetRatio:0.85,
        volumeNeeded:Math.round((0.85-hedge.hedgeRatio)*hedge.bought),
        reason:`${product} only ${(hedge.hedgeRatio*100).toFixed(0)}% hedged. Long ${hedge.netPosition.toFixed(0)} MBF.`
      });
    }else if(hedge.netPosition<-30){
      recommendations.push({
        product,
        action:'cover',
        currentRatio:hedge.hedgeRatio,
        targetRatio:1.0,
        volumeNeeded:Math.abs(hedge.netPosition),
        reason:`${product} uncovered short of ${Math.abs(hedge.netPosition).toFixed(0)} MBF. Need to source material.`
      });
    }
  });

  return recommendations;
}

// ============================================================================
// INVENTORY OPTIMIZATION
// ============================================================================

// Calculate optimal inventory levels
function getOptimalInventory(){
  // Calculate 30-day average daily sales by product
  const cutoff=new Date(Date.now()-30*24*60*60*1000);
  const productSales={};

  S.sells.filter(s=>new Date(s.date)>=cutoff).forEach(s=>{
    const prod=s.product;
    if(!productSales[prod])productSales[prod]={volume:0,count:0};
    productSales[prod].volume+=s.volume||0;
    productSales[prod].count++;
  });

  // Current inventory by product
  const orderSold={};
  S.sells.forEach(s=>{
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    if(ord)orderSold[ord]=(orderSold[ord]||0)+(s.volume||0);
  });

  const inventory={};
  S.buys.forEach(b=>{
    const ord=String(b.orderNum||b.po||'').trim();
    const sold=orderSold[ord]||0;
    const remaining=(b.volume||0)-sold;
    if(remaining<=0)return;

    const prod=b.product;
    if(!inventory[prod])inventory[prod]={volume:0,value:0};
    inventory[prod].volume+=remaining;
    inventory[prod].value+=(b.price||0)*remaining;
  });

  // Calculate recommendations
  const recommendations=[];
  const targetDays=14; // Target 2 weeks of inventory

  Object.keys({...productSales,...inventory}).forEach(product=>{
    const sales=productSales[product];
    const inv=inventory[product];
    const avgDailySales=sales?sales.volume/30:0;
    const currentInv=inv?.volume||0;
    const daysOfInventory=avgDailySales?currentInv/avgDailySales:Infinity;
    const optimalLevel=avgDailySales*targetDays;

    recommendations.push({
      product,
      currentInventory:currentInv,
      avgDailySales,
      daysOfInventory:isFinite(daysOfInventory)?daysOfInventory:0,
      optimalLevel,
      variance:currentInv-optimalLevel,
      status:daysOfInventory<7?'low':daysOfInventory>30?'excess':'optimal',
      action:daysOfInventory<7?'buy':daysOfInventory>30?'reduce':'hold'
    });
  });

  return recommendations.filter(r=>r.avgDailySales>0).sort((a,b)=>a.daysOfInventory-b.daysOfInventory);
}

// Get dead stock (inventory older than threshold)
function getDeadStock(ageDays=30){
  const now=new Date();
  const deadStock=[];

  // Track sold volume per order
  const orderSold={};
  S.sells.forEach(s=>{
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    if(ord)orderSold[ord]=(orderSold[ord]||0)+(s.volume||0);
  });

  S.buys.forEach(b=>{
    const days=Math.floor((now-new Date(b.date))/(1000*60*60*24));
    if(days<ageDays)return;

    const ord=String(b.orderNum||b.po||'').trim();
    const sold=orderSold[ord]||0;
    const remaining=(b.volume||0)-sold;
    if(remaining<=0)return;

    const marketPrice=getMarketPrice(b.product,b.region||'west');
    const costBasis=(b.price||0)*remaining;
    const mtmValue=marketPrice?marketPrice*remaining:costBasis;

    deadStock.push({
      id:b.id,
      date:b.date,
      product:b.product,
      mill:b.mill,
      region:b.region||'west',
      volume:remaining,
      cost:costBasis,
      marketValue:mtmValue,
      mtmLoss:mtmValue-costBasis,
      daysOld:days,
      orderNum:ord
    });
  });

  return deadStock.sort((a,b)=>b.daysOld-a.daysOld);
}

// Calculate inventory turnover
function getInventoryTurnover(){
  const now=new Date();
  const days90=new Date(now.getTime()-90*24*60*60*1000);

  // Track sold volume per order
  const orderSold={};
  S.sells.forEach(s=>{
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    if(ord)orderSold[ord]=(orderSold[ord]||0)+(s.volume||0);
  });

  // Calculate average inventory
  let totalInventory=0,inventoryCount=0;
  S.buys.forEach(b=>{
    const ord=String(b.orderNum||b.po||'').trim();
    const sold=orderSold[ord]||0;
    const remaining=(b.volume||0)-sold;
    if(remaining>0){
      totalInventory+=remaining;
      inventoryCount++;
    }
  });
  const currentInventory=totalInventory;

  // Calculate COGS (cost of goods sold in last 90 days)
  let cogs=0;
  S.sells.filter(s=>new Date(s.date)>=days90).forEach(s=>{
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    // Find matching buy
    const buy=S.buys.find(b=>{
      const bOrd=String(b.orderNum||b.po||'').trim();
      return bOrd===ord;
    });
    if(buy){
      cogs+=(buy.price||0)*(s.volume||0);
    }
  });

  // Annualize COGS
  const annualizedCOGS=cogs*4;

  // Calculate average inventory value
  let avgInvValue=0;
  S.buys.forEach(b=>{
    const ord=String(b.orderNum||b.po||'').trim();
    const sold=orderSold[ord]||0;
    const remaining=(b.volume||0)-sold;
    if(remaining>0){
      avgInvValue+=(b.price||0)*remaining;
    }
  });

  const turnoverRatio=avgInvValue?annualizedCOGS/avgInvValue:0;
  const daysToTurn=turnoverRatio?365/turnoverRatio:0;

  return{
    currentInventory,
    avgInventoryValue:avgInvValue,
    cogs90Day:cogs,
    annualizedCOGS,
    turnoverRatio,
    daysToTurn,
    inventoryItems:inventoryCount
  };
}

// ============================================================================
// PORTFOLIO DASHBOARD
// ============================================================================

function getPortfolioDashboard(){
  const mtm=calcDailyMTM();
  const mtmHistory=getMTMHistory(30);
  const hedgeRec=getHedgeRecommendation();
  const deadStock=getDeadStock(30);
  const turnover=getInventoryTurnover();
  const optimalInv=getOptimalInventory();
  const millBasis=calcMillBasis();

  // Calculate position breakdown
  const positionsByProduct={};
  mtm.positions.forEach(p=>{
    if(!positionsByProduct[p.product]){
      positionsByProduct[p.product]={
        product:p.product,
        volume:0,
        costBasis:0,
        mtmValue:0,
        unrealizedPnL:0
      };
    }
    positionsByProduct[p.product].volume+=p.openVolume;
    positionsByProduct[p.product].costBasis+=p.costBasis;
    positionsByProduct[p.product].mtmValue+=p.mtmValue;
    positionsByProduct[p.product].unrealizedPnL+=p.unrealizedPnL;
  });

  return{
    // Summary metrics
    totalMTM:mtm.totalValue,
    totalCost:mtm.totalCost,
    unrealizedPnL:mtm.unrealizedPnL,
    totalVolume:mtm.totalVolume,
    positionCount:mtm.positions.length,

    // Position details
    positions:mtm.positions,
    positionsByProduct:Object.values(positionsByProduct),

    // MTM history
    mtmHistory,
    mtmTrend:mtmHistory.length>1?mtmHistory[mtmHistory.length-1].unrealizedPnL-mtmHistory[0].unrealizedPnL:0,

    // Hedge status
    hedgeRecommendations:hedgeRec,
    hedgeRatio:calcHedgeRatio().hedgeRatio,

    // Inventory health
    deadStock,
    deadStockValue:deadStock.reduce((s,d)=>s+d.cost,0),
    deadStockVolume:deadStock.reduce((s,d)=>s+d.volume,0),

    // Turnover
    turnover,

    // Optimal levels
    optimalInventory:optimalInv,
    lowInventory:optimalInv.filter(o=>o.status==='low'),
    excessInventory:optimalInv.filter(o=>o.status==='excess'),

    // Mill basis
    millBasis,
    bestMills:millBasis.slice(0,3),
    worstMills:millBasis.slice(-3).reverse(),

    // Date
    date:mtm.date
  };
}
