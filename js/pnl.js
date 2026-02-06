// SYP Analytics - P&L Attribution Engine
// Multi-dimensional P&L breakdown, trade components, and contribution analysis

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Get period cutoff date
function getPeriodCutoff(period){
  const now=new Date();
  switch(period){
    case '7d': return new Date(now.getTime()-7*24*60*60*1000);
    case '14d': return new Date(now.getTime()-14*24*60*60*1000);
    case '30d': return new Date(now.getTime()-30*24*60*60*1000);
    case '90d': return new Date(now.getTime()-90*24*60*60*1000);
    case 'mtd': return new Date(now.getFullYear(),now.getMonth(),1);
    case 'ytd': return new Date(now.getFullYear(),0,1);
    case 'all': return new Date(0);
    default: return new Date(now.getTime()-30*24*60*60*1000);
  }
}

// Build buy order lookup
function buildBuyByOrderForPnL(){
  const buyByOrder={};
  S.buys.forEach(b=>{
    const ord=String(b.orderNum||b.po||'').trim();
    if(ord&&!buyByOrder[ord])buyByOrder[ord]=b;
  });
  return buyByOrder;
}

// ============================================================================
// MULTI-DIMENSIONAL P&L BREAKDOWN
// ============================================================================

// Get P&L breakdown by dimension
function getPnLBreakdown(options={}){
  const{groupBy='product',period='30d'}=options;
  const buyByOrder=buildBuyByOrderForPnL();
  const groups={};
  const cutoff=getPeriodCutoff(period);

  // Process all matched trades
  S.sells.forEach(s=>{
    if(new Date(s.date)<cutoff)return;

    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    const buy=ord?buyByOrder[ord]:null;

    // Determine group key
    let key;
    switch(groupBy){
      case 'trader': key=s.trader||buy?.trader||'Unknown'; break;
      case 'region': key=s.region||buy?.region||'west'; break;
      case 'customer': key=s.customer||'Unknown'; break;
      case 'mill': key=buy?.mill||'Unknown'; break;
      case 'month': key=(s.date||'').substring(0,7)||'Unknown'; break;
      case 'product':
      default: key=s.product||'Unknown';
    }

    if(!groups[key]){
      groups[key]={
        key,
        trades:0,
        volume:0,
        revenue:0,
        cost:0,
        freight:0,
        pnl:0,
        matchedTrades:0,
        matchedVolume:0
      };
    }

    const vol=s.volume||0;
    const sellPrice=s.price||0;
    const freight=s.freight||0;
    const freightPerMBF=vol>0?freight/vol:0;
    const sellFOB=sellPrice-freightPerMBF;

    groups[key].trades++;
    groups[key].volume+=vol;
    groups[key].revenue+=sellFOB*vol;
    groups[key].freight+=freight;

    // Calculate P&L for matched trades
    if(buy){
      const buyCost=(buy.price||0)*vol;
      groups[key].cost+=buyCost;
      groups[key].pnl+=(sellFOB*vol)-buyCost;
      groups[key].matchedTrades++;
      groups[key].matchedVolume+=vol;
    }
  });

  // Calculate derived metrics
  const items=Object.values(groups).map(g=>({
    ...g,
    avgSellPrice:g.volume?g.revenue/g.volume:0,
    avgCost:g.matchedVolume?g.cost/g.matchedVolume:0,
    marginPerMBF:g.matchedVolume?g.pnl/g.matchedVolume:0,
    marginPct:g.cost?(g.pnl/g.cost)*100:0
  }));

  // Sort by P&L descending
  items.sort((a,b)=>b.pnl-a.pnl);

  // Calculate totals
  const totals={
    trades:items.reduce((s,i)=>s+i.trades,0),
    volume:items.reduce((s,i)=>s+i.volume,0),
    revenue:items.reduce((s,i)=>s+i.revenue,0),
    cost:items.reduce((s,i)=>s+i.cost,0),
    freight:items.reduce((s,i)=>s+i.freight,0),
    pnl:items.reduce((s,i)=>s+i.pnl,0),
    matchedTrades:items.reduce((s,i)=>s+i.matchedTrades,0),
    matchedVolume:items.reduce((s,i)=>s+i.matchedVolume,0)
  };

  return{groupBy,period,items,totals};
}

// ============================================================================
// TRADE P&L COMPONENTS
// ============================================================================

// Get detailed P&L components for a single matched trade
function getTradePnLComponents(sell){
  const buyByOrder=buildBuyByOrderForPnL();
  const ord=String(sell.orderNum||sell.linkedPO||sell.oc||'').trim();
  const buy=ord?buyByOrder[ord]:null;

  if(!buy)return null;

  const vol=sell.volume||0;
  const sellPrice=sell.price||0;
  const buyPrice=buy.price||0;
  const freight=sell.freight||0;
  const freightPerMBF=vol>0?freight/vol:0;

  const grossRevenue=sellPrice*vol;
  const freightCost=freight;
  const netRevenue=(sellPrice-freightPerMBF)*vol;
  const buyCost=buyPrice*vol;
  const grossPnL=netRevenue-buyCost;
  const marginPerMBF=vol?(grossPnL/vol):0;

  return{
    sell,
    buy,
    volume:vol,
    grossRevenue,
    freightCost,
    netRevenue,
    buyCost,
    grossPnL,
    marginPerMBF,
    marginPct:buyCost?(grossPnL/buyCost)*100:0
  };
}

// Get all matched trades with P&L
function getMatchedTradesWithPnL(period='30d'){
  const buyByOrder=buildBuyByOrderForPnL();
  const cutoff=getPeriodCutoff(period);
  const trades=[];

  S.sells.forEach(s=>{
    if(new Date(s.date)<cutoff)return;

    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    const buy=ord?buyByOrder[ord]:null;
    if(!buy)return;

    const components=getTradePnLComponents(s);
    if(components){
      trades.push({
        id:s.id,
        date:s.date,
        trader:s.trader||buy.trader,
        product:s.product,
        customer:s.customer,
        mill:buy.mill,
        region:s.region||buy.region,
        ...components
      });
    }
  });

  // Sort by date descending
  trades.sort((a,b)=>new Date(b.date)-new Date(a.date));

  return trades;
}

// ============================================================================
// MARK-TO-MARKET P&L
// ============================================================================

// Calculate unrealized P&L on open positions
function getMTMPnL(){
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
  if(!latestRL)return{positions:[],totalUnrealized:0};

  // Calculate net positions
  const positions={};

  // Track volume sold per order to calculate remaining inventory
  const orderSold={};
  S.sells.forEach(s=>{
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    if(ord)orderSold[ord]=(orderSold[ord]||0)+(s.volume||0);
  });

  // Process buys to find open positions
  S.buys.forEach(b=>{
    const ord=String(b.orderNum||b.po||'').trim();
    const soldVol=orderSold[ord]||0;
    const remainingVol=(b.volume||0)-soldVol;

    if(remainingVol<=0)return; // Fully sold

    const key=`${b.product}|${b.region||'west'}`;
    if(!positions[key]){
      positions[key]={
        product:b.product,
        region:b.region||'west',
        volume:0,
        costBasis:0,
        mtmValue:0,
        unrealizedPnL:0
      };
    }

    positions[key].volume+=remainingVol;
    positions[key].costBasis+=(b.price||0)*remainingVol;
  });

  // Calculate MTM values
  Object.values(positions).forEach(p=>{
    const normProd=(p.product||'').replace(/\s+/g,'');
    const marketPrice=latestRL[p.region]?.[normProd]||
                      latestRL[p.region]?.[normProd+'#2']||
                      latestRL.composite?.[p.region]?.[normProd]||0;

    p.marketPrice=marketPrice;
    p.mtmValue=marketPrice*p.volume;
    p.avgCost=p.volume?p.costBasis/p.volume:0;
    p.unrealizedPnL=p.mtmValue-p.costBasis;
    p.unrealizedPerMBF=p.volume?p.unrealizedPnL/p.volume:0;
  });

  const positionList=Object.values(positions).filter(p=>p.volume>0);
  positionList.sort((a,b)=>Math.abs(b.unrealizedPnL)-Math.abs(a.unrealizedPnL));

  return{
    positions:positionList,
    totalVolume:positionList.reduce((s,p)=>s+p.volume,0),
    totalCostBasis:positionList.reduce((s,p)=>s+p.costBasis,0),
    totalMTMValue:positionList.reduce((s,p)=>s+p.mtmValue,0),
    totalUnrealized:positionList.reduce((s,p)=>s+p.unrealizedPnL,0),
    rlDate:latestRL.date
  };
}

// ============================================================================
// DAILY P&L CALCULATION
// ============================================================================

// Calculate daily P&L from matched trades
function calcDetailedDailyPnL(days=30){
  const buyByOrder=buildBuyByOrderForPnL();
  const dailyPnL={};
  const now=new Date();
  const cutoff=new Date(now.getTime()-days*24*60*60*1000);

  S.sells.forEach(s=>{
    const date=s.date;
    if(!date||new Date(date)<cutoff)return;

    const dateKey=date.substring(0,10);
    if(!dailyPnL[dateKey]){
      dailyPnL[dateKey]={
        date:dateKey,
        trades:0,
        volume:0,
        revenue:0,
        cost:0,
        pnl:0
      };
    }

    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    const buy=ord?buyByOrder[ord]:null;

    const vol=s.volume||0;
    const freightPerMBF=vol>0?(s.freight||0)/vol:0;
    const sellFOB=((s.price||0)-freightPerMBF)*vol;

    dailyPnL[dateKey].trades++;
    dailyPnL[dateKey].volume+=vol;
    dailyPnL[dateKey].revenue+=sellFOB;

    if(buy){
      const buyCost=(buy.price||0)*vol;
      dailyPnL[dateKey].cost+=buyCost;
      dailyPnL[dateKey].pnl+=sellFOB-buyCost;
    }
  });

  return dailyPnL;
}

// ============================================================================
// CONTRIBUTION ANALYSIS
// ============================================================================

// Get contribution analysis showing what % each segment contributes
function getContributionAnalysis(groupBy='product',period='30d'){
  const breakdown=getPnLBreakdown({groupBy,period});
  const totalPnL=breakdown.totals.pnl||1;
  const totalVol=breakdown.totals.volume||1;
  const totalRev=breakdown.totals.revenue||1;

  return breakdown.items.map(item=>({
    ...item,
    pnlContribution:(item.pnl/totalPnL)*100,
    volumeContribution:(item.volume/totalVol)*100,
    revenueContribution:(item.revenue/totalRev)*100
  }));
}

// ============================================================================
// TRADER PERFORMANCE
// ============================================================================

// Get detailed trader performance metrics
function getTraderPerformance(period='30d'){
  const breakdown=getPnLBreakdown({groupBy:'trader',period});
  const cutoff=getPeriodCutoff(period);

  // Enhance with win rate calculation
  const traderWins={};
  const buyByOrder=buildBuyByOrderForPnL();

  S.sells.forEach(s=>{
    if(new Date(s.date)<cutoff)return;

    const trader=s.trader||'Unknown';
    if(!traderWins[trader])traderWins[trader]={wins:0,losses:0};

    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    const buy=ord?buyByOrder[ord]:null;
    if(!buy)return;

    const vol=s.volume||0;
    const freightPerMBF=vol>0?(s.freight||0)/vol:0;
    const sellFOB=(s.price||0)-freightPerMBF;
    const margin=sellFOB-(buy.price||0);

    if(margin>0)traderWins[trader].wins++;
    else traderWins[trader].losses++;
  });

  return breakdown.items.map(item=>{
    const wins=traderWins[item.key]?.wins||0;
    const losses=traderWins[item.key]?.losses||0;
    const total=wins+losses;

    return{
      trader:item.key,
      trades:item.trades,
      volume:item.volume,
      pnl:item.pnl,
      avgMargin:item.marginPerMBF,
      winRate:total?(wins/total)*100:0,
      wins,
      losses,
      contribution:item.pnl
    };
  }).sort((a,b)=>b.pnl-a.pnl);
}

// ============================================================================
// CUSTOMER PROFITABILITY
// ============================================================================

// Get customer profitability ranking
function getCustomerProfitability(period='30d'){
  const breakdown=getPnLBreakdown({groupBy:'customer',period});

  return breakdown.items.map(item=>({
    customer:item.key,
    trades:item.trades,
    volume:item.volume,
    revenue:item.revenue,
    pnl:item.pnl,
    avgMargin:item.marginPerMBF,
    marginPct:item.marginPct
  })).filter(c=>c.customer!=='Unknown');
}

// ============================================================================
// PRODUCT PROFITABILITY
// ============================================================================

// Get product profitability ranking
function getProductProfitability(period='30d'){
  const breakdown=getPnLBreakdown({groupBy:'product',period});

  return breakdown.items.map(item=>({
    product:item.key,
    trades:item.trades,
    volume:item.volume,
    revenue:item.revenue,
    cost:item.cost,
    pnl:item.pnl,
    avgSellPrice:item.avgSellPrice,
    avgCost:item.avgCost,
    avgMargin:item.marginPerMBF,
    marginPct:item.marginPct
  }));
}

// ============================================================================
// P&L DASHBOARD
// ============================================================================

// Get comprehensive P&L dashboard data
function getPnLDashboard(){
  const period=S.filters?.date||'30d';
  const dailyPnL=calcDetailedDailyPnL(90);
  const mtm=getMTMPnL();
  const productBreakdown=getPnLBreakdown({groupBy:'product',period});
  const traderPerf=getTraderPerformance(period);

  // Calculate period totals
  const periodDays=period==='7d'?7:period==='14d'?14:period==='30d'?30:period==='90d'?90:365;
  const cutoff=new Date(Date.now()-periodDays*24*60*60*1000);

  let periodPnL=0,periodVol=0,periodTrades=0;
  Object.values(dailyPnL).forEach(d=>{
    if(new Date(d.date)>=cutoff){
      periodPnL+=d.pnl;
      periodVol+=d.volume;
      periodTrades+=d.trades;
    }
  });

  // MTD and YTD
  const now=new Date();
  const mtdCutoff=new Date(now.getFullYear(),now.getMonth(),1);
  const ytdCutoff=new Date(now.getFullYear(),0,1);

  let mtdPnL=0,ytdPnL=0;
  Object.values(dailyPnL).forEach(d=>{
    const date=new Date(d.date);
    if(date>=mtdCutoff)mtdPnL+=d.pnl;
    if(date>=ytdCutoff)ytdPnL+=d.pnl;
  });

  // Best and worst days
  const sortedDays=Object.values(dailyPnL).sort((a,b)=>b.pnl-a.pnl);
  const bestDay=sortedDays[0]||null;
  const worstDay=sortedDays[sortedDays.length-1]||null;

  // Average daily P&L
  const tradingDays=Object.keys(dailyPnL).length;
  const avgDailyPnL=tradingDays?periodPnL/tradingDays:0;

  return{
    summary:{
      totalPnL:productBreakdown.totals.pnl,
      tradePnL:productBreakdown.totals.pnl,
      mtmPnL:mtm.totalUnrealized,
      combinedPnL:productBreakdown.totals.pnl+mtm.totalUnrealized,
      mtdPnL,
      ytdPnL,
      avgDailyPnL,
      periodTrades,
      periodVolume:periodVol
    },
    totalPnL:productBreakdown.totals.pnl,
    tradePnL:productBreakdown.totals.pnl,
    mtmPnL:mtm.totalUnrealized,
    avgMargin:productBreakdown.totals.matchedVolume?
      productBreakdown.totals.pnl/productBreakdown.totals.matchedVolume:0,
    dailyPnL,
    byProduct:productBreakdown.items,
    byTrader:traderPerf,
    mtmPositions:mtm.positions,
    bestDay,
    worstDay,
    tradingDays
  };
}

// ============================================================================
// ROLLING P&L
// ============================================================================

// Get rolling P&L for charting
function getRollingPnL(days=30){
  const dailyPnL=calcDetailedDailyPnL(days);
  const now=new Date();
  const result=[];

  for(let i=days-1;i>=0;i--){
    const date=new Date(now);
    date.setDate(date.getDate()-i);
    const dateKey=date.toISOString().substring(0,10);
    const dayData=dailyPnL[dateKey];

    result.push({
      date:dateKey,
      pnl:dayData?.pnl||0,
      volume:dayData?.volume||0,
      trades:dayData?.trades||0,
      cumulative:0 // Will calculate below
    });
  }

  // Calculate cumulative
  let cumulative=0;
  result.forEach(d=>{
    cumulative+=d.pnl;
    d.cumulative=cumulative;
  });

  return result;
}
