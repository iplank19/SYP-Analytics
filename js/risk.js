// SYP Analytics - Risk Management Module
// Provides position limits, exposure monitoring, VaR calculations, and drawdown tracking

// ============================================================================
// POSITION LIMITS & EXPOSURE CONTROLS
// ============================================================================

// Get current exposure by dimension (product, region, trader, customer, mill)
function getExposure(groupBy='product'){
  const exposure={};
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;

  // Helper to get RL price for a product/region
  const getRLPrice=(product,region)=>{
    const defaultPrice=S.rl?.length>0?(S.rl[S.rl.length-1].west?.['2x4#2']||400):400;
    if(!latestRL)return defaultPrice;
    const reg=region||'west';
    const prod=product||'2x4#2';
    return latestRL[reg]?.[prod]||latestRL.west?.['2x4#2']||defaultPrice;
  };

  // Calculate sold volume per order for net position
  const orderSold={};
  S.sells.forEach(s=>{
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    if(ord)orderSold[ord]=(orderSold[ord]||0)+(s.volume||0);
  });

  // Process buys (long exposure)
  S.buys.forEach(b=>{
    const ord=String(b.orderNum||b.po||'').trim();
    const sold=orderSold[ord]||0;
    const netVol=(b.volume||0)-sold;
    if(netVol<=0)return; // Fully covered

    let key;
    switch(groupBy){
      case 'region': key=b.region||'unknown'; break;
      case 'trader': key=b.trader||'Unknown'; break;
      case 'mill': key=b.mill||'Unknown'; break;
      default: key=b.product||'Unknown';
    }

    if(!exposure[key])exposure[key]={long:0,short:0,net:0,notional:0,avgPrice:0,count:0};
    const price=b.price||getRLPrice(b.product,b.region);
    exposure[key].long+=netVol;
    exposure[key].net+=netVol;
    exposure[key].notional+=netVol*price;
    exposure[key].count++;
  });

  // Process unmatched sells (short exposure)
  const buyByOrder=buildBuyByOrder();
  S.sells.forEach(s=>{
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    const hasBuy=ord?buyByOrder[ord]:null;
    if(hasBuy)return; // Matched - not a short position

    let key;
    switch(groupBy){
      case 'region': key=s.region||'unknown'; break;
      case 'trader': key=s.trader||'Unknown'; break;
      case 'customer': key=s.customer||'Unknown'; break;
      default: key=s.product||'Unknown';
    }

    if(!exposure[key])exposure[key]={long:0,short:0,net:0,notional:0,avgPrice:0,count:0};
    const vol=s.volume||0;
    const price=s.price||getRLPrice(s.product,s.region);
    exposure[key].short+=vol;
    exposure[key].net-=vol;
    exposure[key].notional+=vol*price; // Absolute notional
    exposure[key].count++;
  });

  // Calculate avg price
  Object.values(exposure).forEach(e=>{
    const totalVol=e.long+e.short;
    e.avgPrice=totalVol>0?e.notional/totalVol:0;
  });

  return exposure;
}

// Get total portfolio exposure metrics
function getPortfolioExposure(){
  const byProd=getExposure('product');
  const byReg=getExposure('region');
  const byTrader=getExposure('trader');

  let totalLong=0,totalShort=0,totalNotional=0;
  Object.values(byProd).forEach(e=>{
    totalLong+=e.long;
    totalShort+=e.short;
    totalNotional+=e.notional;
  });

  // Concentration metrics
  const prodVols=Object.entries(byProd).map(([k,v])=>({name:k,vol:Math.abs(v.net),notional:v.notional}));
  prodVols.sort((a,b)=>b.notional-a.notional);
  const topProdConc=totalNotional>0&&prodVols.length>0?(prodVols[0].notional/totalNotional)*100:0;

  return{
    totalLong,
    totalShort,
    netPosition:totalLong-totalShort,
    totalNotional,
    byProduct:byProd,
    byRegion:byReg,
    byTrader:byTrader,
    topProductConcentration:topProdConc,
    topProduct:prodVols[0]?.name||'N/A',
    productCount:Object.keys(byProd).length
  };
}

// Check position limits - returns array of breaches
function checkPositionLimits(){
  const limits=S.riskLimits||{};
  const breaches=[];
  const exposure=getExposure('product');
  const portfolio=getPortfolioExposure();

  // Product-level limits
  if(limits.positionLimits){
    Object.entries(exposure).forEach(([product,exp])=>{
      const limit=limits.positionLimits[product];
      if(limit&&Math.abs(exp.net)>limit){
        breaches.push({
          type:'position',
          level:'product',
          name:product,
          current:Math.abs(exp.net),
          limit,
          pctOver:((Math.abs(exp.net)/limit)-1)*100,
          direction:exp.net>0?'LONG':'SHORT'
        });
      }
    });
  }

  // Trader-level limits
  if(limits.traderLimits){
    const byTrader=getExposure('trader');
    Object.entries(byTrader).forEach(([trader,exp])=>{
      const limit=limits.traderLimits[trader];
      if(limit&&exp.notional>limit){
        breaches.push({
          type:'exposure',
          level:'trader',
          name:trader,
          current:exp.notional,
          limit,
          pctOver:((exp.notional/limit)-1)*100
        });
      }
    });
  }

  // Total exposure limit
  if(limits.exposureLimit&&portfolio.totalNotional>limits.exposureLimit){
    breaches.push({
      type:'exposure',
      level:'portfolio',
      name:'Total Exposure',
      current:portfolio.totalNotional,
      limit:limits.exposureLimit,
      pctOver:((portfolio.totalNotional/limits.exposureLimit)-1)*100
    });
  }

  // Concentration limit (default 40% max in single product)
  const concLimit=limits.concentrationLimit||40;
  if(portfolio.topProductConcentration>concLimit){
    breaches.push({
      type:'concentration',
      level:'product',
      name:portfolio.topProduct,
      current:portfolio.topProductConcentration,
      limit:concLimit,
      pctOver:portfolio.topProductConcentration-concLimit
    });
  }

  return breaches;
}

// ============================================================================
// VALUE AT RISK (VaR) ENGINE
// ============================================================================

// Calculate historical volatility for a product/region
function calcHistoricalVolatility(product='2x4#2',region='west',weeks=12){
  if(S.rl.length<2)return{volatility:0,returns:[],annualized:0};

  const prices=S.rl.slice(-weeks).map(r=>r[region]?.[product]).filter(p=>p&&p>0);
  if(prices.length<2)return{volatility:0,returns:[],annualized:0};

  // Calculate weekly returns
  const returns=[];
  for(let i=1;i<prices.length;i++){
    returns.push((prices[i]-prices[i-1])/prices[i-1]);
  }

  // Standard deviation of returns
  const avgRet=returns.reduce((a,b)=>a+b,0)/returns.length;
  const variance=returns.reduce((s,r)=>s+Math.pow(r-avgRet,2),0)/(returns.length-1);
  const volatility=Math.sqrt(variance);
  const annualized=volatility*Math.sqrt(52); // Annualize weekly vol

  return{volatility,returns,annualized,avgReturn:avgRet,priceHistory:prices};
}

// Calculate Value at Risk using parametric method
function calcParametricVaR(confidence=0.95,holdingPeriod=5){
  const exposure=getExposure('product');
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;

  // Z-scores for common confidence levels
  const zScores={0.90:1.28,0.95:1.645,0.99:2.33};
  const z=zScores[confidence]||1.645;

  let portfolioVaR=0;
  const productVaRs=[];

  Object.entries(exposure).forEach(([product,exp])=>{
    const region='west'; // Use west as primary for vol calc
    const vol=calcHistoricalVolatility(product,region,12);
    const position=Math.abs(exp.net);
    const price=latestRL?.[region]?.[product]||exp.avgPrice||400;
    const notional=position*price;

    // VaR = Notional × σ × Z × √(holding period / base period)
    // Weekly vol, so adjust for holding period in weeks
    const periodAdjust=Math.sqrt(holdingPeriod/5); // Assuming 5 trading days/week
    const productVaR=notional*vol.volatility*z*periodAdjust;

    productVaRs.push({
      product,
      position,
      price,
      notional,
      volatility:vol.volatility,
      annualizedVol:vol.annualized,
      var:productVaR,
      varPct:(notional>0?productVaR/notional:0)*100
    });

    // Sum for portfolio (ignoring correlations - conservative)
    portfolioVaR+=productVaR;
  });

  // Sort by VaR contribution
  productVaRs.sort((a,b)=>b.var-a.var);

  return{
    confidence,
    holdingPeriod,
    portfolioVaR,
    byProduct:productVaRs,
    method:'parametric'
  };
}

// Calculate Historical VaR using actual price movements
function calcHistoricalVaR(confidence=0.95,lookback=52){
  const exposure=getExposure('product');
  if(S.rl.length<lookback)lookback=S.rl.length;
  if(lookback<5)return{confidence,portfolioVaR:0,scenarios:[],method:'historical'};

  const scenarios=[];

  // For each historical week, calculate what our P&L would have been
  for(let i=1;i<lookback;i++){
    const prevRL=S.rl[S.rl.length-i-1];
    const currRL=S.rl[S.rl.length-i];
    if(!prevRL||!currRL)continue;

    let weekPnL=0;
    Object.entries(exposure).forEach(([product,exp])=>{
      const region='west';
      const prevPrice=prevRL[region]?.[product]||0;
      const currPrice=currRL[region]?.[product]||0;
      if(prevPrice>0&&currPrice>0){
        const priceChange=currPrice-prevPrice;
        weekPnL+=exp.net*priceChange; // Net position × price change
      }
    });

    scenarios.push({date:currRL.date,pnl:weekPnL});
  }

  // Sort by P&L and find VaR percentile
  scenarios.sort((a,b)=>a.pnl-b.pnl);
  const varIndex=Math.floor((1-confidence)*scenarios.length);
  const varScenario=scenarios[varIndex]||scenarios[0];

  return{
    confidence,
    portfolioVaR:Math.abs(varScenario?.pnl||0),
    worstCase:Math.abs(scenarios[0]?.pnl||0),
    bestCase:scenarios[scenarios.length-1]?.pnl||0,
    scenarios:scenarios.slice(0,10), // Worst 10 scenarios
    method:'historical'
  };
}

// Get comprehensive VaR report
function getVaRReport(confidence=0.95){
  const parametric=calcParametricVaR(confidence,5);
  const historical=calcHistoricalVaR(confidence,52);

  return{
    confidence,
    parametricVaR:parametric.portfolioVaR,
    historicalVaR:historical.portfolioVaR,
    conservativeVaR:Math.max(parametric.portfolioVaR,historical.portfolioVaR),
    byProduct:parametric.byProduct,
    worstHistoricalLoss:historical.worstCase,
    bestHistoricalGain:historical.bestCase
  };
}

// ============================================================================
// DRAWDOWN & LOSS TRACKING
// ============================================================================

// Calculate drawdown from P&L history
function calcDrawdown(period='30d'){
  const dailyPnL=calcDailyPnL();
  const days=Object.entries(dailyPnL).sort((a,b)=>a[0].localeCompare(b[0]));

  if(days.length===0)return{currentDrawdown:0,maxDrawdown:0,peakValue:0,troughValue:0,recoveryDays:null};

  // Filter by period
  const now=new Date();
  let cutoff;
  switch(period){
    case '7d': cutoff=new Date(now-7*24*60*60*1000); break;
    case '14d': cutoff=new Date(now-14*24*60*60*1000); break;
    case '30d': cutoff=new Date(now-30*24*60*60*1000); break;
    case '90d': cutoff=new Date(now-90*24*60*60*1000); break;
    default: cutoff=new Date(0);
  }

  const filtered=days.filter(([d])=>new Date(d)>=cutoff);
  if(filtered.length===0)return{currentDrawdown:0,maxDrawdown:0,peakValue:0,troughValue:0,recoveryDays:null};

  // Build cumulative P&L
  let cumPnL=0;
  const cumulative=filtered.map(([date,data])=>{
    cumPnL+=data.total;
    return{date,pnl:data.total,cumulative:cumPnL};
  });

  // Find peak and calculate drawdowns
  let peak=cumulative[0].cumulative;
  let peakDate=cumulative[0].date;
  let maxDrawdown=0;
  let maxDrawdownDate='';
  let currentDrawdown=0;
  let troughValue=peak;
  let troughDate='';

  cumulative.forEach(({date,cumulative:cum})=>{
    if(cum>peak){
      peak=cum;
      peakDate=date;
    }
    const drawdown=peak-cum;
    if(drawdown>maxDrawdown){
      maxDrawdown=drawdown;
      maxDrawdownDate=date;
      troughValue=cum;
      troughDate=date;
    }
    currentDrawdown=peak-cum;
  });

  // Calculate days since peak
  const lastDate=new Date(cumulative[cumulative.length-1].date);
  const peakD=new Date(peakDate);
  const daysSincePeak=Math.floor((lastDate-peakD)/(24*60*60*1000));

  return{
    currentDrawdown,
    maxDrawdown,
    peakValue:peak,
    peakDate,
    troughValue,
    troughDate,
    currentValue:cumulative[cumulative.length-1].cumulative,
    daysSincePeak,
    isInDrawdown:currentDrawdown>0,
    drawdownPct:peak>0?(currentDrawdown/peak)*100:0,
    maxDrawdownPct:peak>0?(maxDrawdown/peak)*100:0,
    cumulativePnL:cumulative
  };
}

// Check daily P&L limits
function checkDailyLossLimit(){
  const limits=S.riskLimits||{};
  const dailyLimit=limits.dailyLossLimit||50000;

  const todayStr=today();
  const dailyPnL=calcDailyPnL();
  const todayPnL=dailyPnL[todayStr]?.total||0;

  // Get MTD and YTD
  const now=new Date();
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1).toISOString().split('T')[0];
  const yearStart=new Date(now.getFullYear(),0,1).toISOString().split('T')[0];

  let mtdPnL=0,ytdPnL=0;
  Object.entries(dailyPnL).forEach(([date,data])=>{
    if(date>=monthStart)mtdPnL+=data.total;
    if(date>=yearStart)ytdPnL+=data.total;
  });

  return{
    todayPnL,
    todayLimit:dailyLimit,
    isBreached:todayPnL<-dailyLimit,
    breachAmount:todayPnL<-dailyLimit?Math.abs(todayPnL)-dailyLimit:0,
    mtdPnL,
    ytdPnL,
    daysWithLoss:Object.values(dailyPnL).filter(d=>d.total<0).length,
    daysWithProfit:Object.values(dailyPnL).filter(d=>d.total>0).length
  };
}

// ============================================================================
// RISK DASHBOARD DATA
// ============================================================================

// Get comprehensive risk metrics for dashboard
function getRiskDashboard(){
  const portfolio=getPortfolioExposure();
  const breaches=checkPositionLimits();
  const var95=getVaRReport(0.95);
  const var99=getVaRReport(0.99);
  const drawdown=calcDrawdown('30d');
  const dailyLoss=checkDailyLossLimit();
  const aging=calcAgingSummary(S.buys);

  // Risk score (0-100, higher = more risk)
  let riskScore=0;

  // Position risk (up to 30 points)
  const positionRisk=Math.min(30,breaches.filter(b=>b.type==='position').length*10);
  riskScore+=positionRisk;

  // Concentration risk (up to 20 points)
  const concRisk=Math.min(20,portfolio.topProductConcentration/2);
  riskScore+=concRisk;

  // VaR risk (up to 25 points)
  const varRisk=Math.min(25,(var95.conservativeVaR/portfolio.totalNotional)*250||0);
  riskScore+=varRisk;

  // Drawdown risk (up to 15 points)
  const ddRisk=Math.min(15,drawdown.maxDrawdownPct);
  riskScore+=ddRisk;

  // Inventory aging risk (up to 10 points)
  const agingRisk=Math.min(10,((aging.twoToFourWeek+aging.old)/aging.total)*20||0);
  riskScore+=agingRisk;

  // Determine risk level
  let riskLevel='LOW';
  if(riskScore>70)riskLevel='CRITICAL';
  else if(riskScore>50)riskLevel='HIGH';
  else if(riskScore>30)riskLevel='MODERATE';

  return{
    riskScore:Math.round(riskScore),
    riskLevel,
    portfolio,
    breaches,
    var95:var95.conservativeVaR,
    var99:var99.conservativeVaR,
    varByProduct:var95.byProduct.slice(0,5),
    drawdown,
    dailyLoss,
    aging,
    components:{positionRisk,concRisk,varRisk,ddRisk,agingRisk}
  };
}

// ============================================================================
// VOLATILITY SUITE
// ============================================================================

// Get volatility metrics for all products
function getVolatilityReport(weeks=12){
  const products=['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2'];
  const regions=['west','central','east'];
  const report=[];

  products.forEach(product=>{
    regions.forEach(region=>{
      const vol=calcHistoricalVolatility(product,region,weeks);
      if(vol.volatility>0){
        report.push({
          product,
          region,
          weeklyVol:vol.volatility*100,
          annualizedVol:vol.annualized*100,
          avgReturn:vol.avgReturn*100,
          dataPoints:vol.returns.length+1
        });
      }
    });
  });

  // Sort by volatility descending
  report.sort((a,b)=>b.annualizedVol-a.annualizedVol);

  // Detect volatility regime
  const avgVol=report.reduce((s,r)=>s+r.annualizedVol,0)/report.length;
  let regime='NORMAL';
  if(avgVol>30)regime='HIGH';
  else if(avgVol<15)regime='LOW';

  return{regime,avgVolatility:avgVol,byProduct:report};
}

// ============================================================================
// CORRELATION ANALYSIS
// ============================================================================

// Calculate correlation between two price series
function calcCorrelation(prices1,prices2){
  if(prices1.length!==prices2.length||prices1.length<3)return 0;

  const n=prices1.length;
  const mean1=prices1.reduce((a,b)=>a+b,0)/n;
  const mean2=prices2.reduce((a,b)=>a+b,0)/n;

  let num=0,den1=0,den2=0;
  for(let i=0;i<n;i++){
    const d1=prices1[i]-mean1;
    const d2=prices2[i]-mean2;
    num+=d1*d2;
    den1+=d1*d1;
    den2+=d2*d2;
  }

  if(den1===0||den2===0)return 0;
  return num/Math.sqrt(den1*den2);
}

// Get correlation matrix for products
function getCorrelationMatrix(weeks=12){
  const products=['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2'];
  const region='west';
  const matrix={};

  // Get return series for each product (consistent with calcHistoricalVolatility)
  const series={};
  products.forEach(prod=>{
    const prices=S.rl.slice(-weeks).map(r=>r[region]?.[prod]).filter(p=>p&&p>0);
    const returns=[];
    for(let i=1;i<prices.length;i++){
      returns.push((prices[i]-prices[i-1])/prices[i-1]);
    }
    series[prod]=returns;
  });

  // Calculate pairwise correlations on returns
  products.forEach(prod1=>{
    matrix[prod1]={};
    products.forEach(prod2=>{
      if(prod1===prod2){
        matrix[prod1][prod2]=1;
      }else{
        matrix[prod1][prod2]=calcCorrelation(series[prod1],series[prod2]);
      }
    });
  });

  return{products,matrix,region,weeks};
}

// Get regional correlations
function getRegionalCorrelations(product='2x4#2',weeks=12){
  const regions=['west','central','east'];
  const series={};

  regions.forEach(reg=>{
    const prices=S.rl.slice(-weeks).map(r=>r[reg]?.[product]).filter(p=>p&&p>0);
    const returns=[];
    for(let i=1;i<prices.length;i++){
      returns.push((prices[i]-prices[i-1])/prices[i-1]);
    }
    series[reg]=returns;
  });

  const correlations=[];
  for(let i=0;i<regions.length;i++){
    for(let j=i+1;j<regions.length;j++){
      correlations.push({
        region1:regions[i],
        region2:regions[j],
        correlation:calcCorrelation(series[regions[i]],series[regions[j]])
      });
    }
  }

  return{product,weeks,correlations};
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Initialize default risk limits
function initRiskLimits(){
  if(!S.riskLimits){
    S.riskLimits={
      positionLimits:{
        '2x4#2':500,'2x6#2':400,'2x8#2':300,'2x10#2':200,'2x12#2':200,
        '2x4#3':300,'2x6#3':200,'2x8#3':150
      },
      traderLimits:{
        'Ian P':2000000,'Aubrey M':1500000,'Hunter S':1000000,
        'Sawyer R':1000000,'Jackson M':750000,'John W':500000
      },
      exposureLimit:5000000,
      dailyLossLimit:50000,
      concentrationLimit:40,
      varLimit:100000
    };
    SS('riskLimits',S.riskLimits);
  }
}

// Update risk limit
function updateRiskLimit(type,key,value){
  initRiskLimits();
  if(type==='position'){
    S.riskLimits.positionLimits[key]=value;
  }else if(type==='trader'){
    S.riskLimits.traderLimits[key]=value;
  }else if(type==='exposure'){
    S.riskLimits.exposureLimit=value;
  }else if(type==='dailyLoss'){
    S.riskLimits.dailyLossLimit=value;
  }else if(type==='concentration'){
    S.riskLimits.concentrationLimit=value;
  }
  SS('riskLimits',S.riskLimits);
  return S.riskLimits;
}

// Initialize on load
initRiskLimits();
