// SYP Analytics - Reporting Module
// Automated report generation, dashboard templates, and export capabilities

// ============================================================================
// REPORT CONFIGURATION
// ============================================================================

// Initialize report configuration
function initReportConfig(){
  if(!S.reportSchedules)S.reportSchedules=LS('reportSchedules',[]);
  if(!S.reportHistory)S.reportHistory=LS('reportHistory',[]);
}

// ============================================================================
// DAILY FLASH REPORT
// ============================================================================

// Generate daily flash report
function generateDailyFlash(){
  try{
  const todayStr=today();
  const a=analytics();
  const risk=getRiskDashboard();
  const pnl=getPnLDashboard();
  const dailyPnL=calcDailyPnL();
  const todayPnL=dailyPnL[todayStr]?.total||0;
  const alerts=S.alerts?.filter(a=>!a.read).slice(0,5)||[];

  return{
    type:'dailyFlash',
    date:todayStr,
    generatedAt:new Date().toISOString(),
    summary:{
      todayPnL,
      mtdPnL:pnl.summary.mtdPnL,
      ytdPnL:pnl.summary.ytdPnL,
      openPositions:risk.portfolio.netPosition,
      totalNotional:risk.portfolio.totalNotional
    },
    positions:{
      long:risk.portfolio.totalLong,
      short:risk.portfolio.totalShort,
      net:risk.portfolio.netPosition,
      topProduct:risk.portfolio.topProduct
    },
    risk:{
      score:risk.riskScore,
      level:risk.riskLevel,
      var95:risk.var95,
      breaches:risk.breaches.length
    },
    marketSummary:{
      west24:S.rl.length?S.rl[S.rl.length-1].west?.['2x4#2']:null,
      central24:S.rl.length?S.rl[S.rl.length-1].central?.['2x4#2']:null,
      east24:S.rl.length?S.rl[S.rl.length-1].east?.['2x4#2']:null,
      date:S.rl.length?S.rl[S.rl.length-1].date:null
    },
    alerts:alerts.map(a=>({type:a.type,title:a.title,severity:a.severity})),
    tradingActivity:{
      buyVolume:a.bVol,
      sellVolume:a.sVol,
      margin:a.margin,
      matchedTrades:a.matchedVol
    }
  };
  }catch(e){console.error('generateDailyFlash error:',e);return{type:'dailyFlash',error:true,message:'Error generating daily flash: '+e.message,generatedAt:new Date().toISOString()};}
}

// ============================================================================
// WEEKLY TRADING REPORT
// ============================================================================

// Generate weekly trading report
function generateWeeklyReport(){
  try{
  const now=new Date();
  const weekStart=new Date(now);
  weekStart.setDate(now.getDate()-7);

  const pnl=getPnLBreakdown({groupBy:'product',period:'7d'});
  const traderPerf=getTraderPerformance('7d');
  const customerProf=getCustomerProfitability('7d');
  const signals=S.signals?.filter(s=>s.status==='active')||[];
  const marketMovers=calcMarketMovers();
  const rolling=getRollingPnL(8);

  // Top trades this week
  const topTrades=getMatchedTradesWithPnL('7d').slice(0,10);

  // Derive avg margin and win rate from items
  const totalMatchedVol=pnl.totals.matchedVolume||0;
  const avgMargin=totalMatchedVol?pnl.totals.pnl/totalMatchedVol:0;

  return{
    type:'weeklyReport',
    weekStart:weekStart.toISOString().split('T')[0],
    weekEnd:today(),
    generatedAt:new Date().toISOString(),
    performance:{
      totalPnL:pnl.totals.pnl,
      tradePnL:pnl.totals.pnl,
      freightPnL:pnl.totals.freight,
      volume:pnl.totals.volume,
      trades:pnl.totals.trades,
      avgMargin,
      winRate:0
    },
    byProduct:pnl.items.slice(0,8).map(p=>({...p,totalPnL:p.pnl,avgMargin:p.marginPerMBF,tradePnL:p.pnl,freightPnL:p.freight,winRate:0})),
    traderPerformance:traderPerf.map(t=>({...t,totalPnL:t.pnl})),
    topCustomers:customerProf.slice(0,10),
    topTrades,
    marketMovers,
    activeSignals:signals.length,
    weeklyTrend:rolling,
    comparison:{
      vsLastWeek:rolling.length>=2?rolling[rolling.length-1].pnl-rolling[rolling.length-2].pnl:0
    }
  };
  }catch(e){console.error('generateWeeklyReport error:',e);return{type:'weeklyReport',error:true,message:'Error generating weekly report: '+e.message,generatedAt:new Date().toISOString()};}
}

// ============================================================================
// MONTHLY MANAGEMENT REPORT
// ============================================================================

// Generate monthly management report
function generateMonthlyReport(){
  try{
  const now=new Date();
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1);

  const pnl30d=getPnLBreakdown({groupBy:'product',period:'30d'});
  const pnl90d=getPnLBreakdown({groupBy:'product',period:'90d'});
  const traderPerf=getTraderPerformance('30d');
  const portfolio=getPortfolioDashboard();
  const risk=getRiskDashboard();
  const volatility=getVolatilityReport(12);

  // YTD performance
  const ytdStart=new Date(now.getFullYear(),0,1);
  const ytdPnL=getPnLBreakdown({groupBy:'product',period:'ytd'});

  // Calculate month-over-month trends
  const rolling=getRollingPnL(12);
  const monthlyTotals=[];
  for(let i=0;i<12;i+=4){
    const monthData=rolling.slice(i,i+4);
    if(monthData.length){
      monthlyTotals.push({
        period:`Month ${Math.floor(i/4)+1}`,
        pnl:monthData.reduce((s,w)=>s+w.pnl,0),
        volume:monthData.reduce((s,w)=>s+w.volume,0)
      });
    }
  }

  // Derive avg margin from totals
  const mtdMatchedVol=pnl30d.totals.matchedVolume||0;
  const mtdAvgMargin=mtdMatchedVol?pnl30d.totals.pnl/mtdMatchedVol:0;
  const ytdMatchedVol=ytdPnL.totals.matchedVolume||0;
  const ytdAvgMargin=ytdMatchedVol?ytdPnL.totals.pnl/ytdMatchedVol:0;

  return{
    type:'monthlyReport',
    month:`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`,
    generatedAt:new Date().toISOString(),
    mtdPerformance:{
      totalPnL:pnl30d.totals.pnl,
      volume:pnl30d.totals.volume,
      trades:pnl30d.totals.trades,
      avgMargin:mtdAvgMargin,
      winRate:0
    },
    ytdPerformance:{
      totalPnL:ytdPnL.totals.pnl,
      volume:ytdPnL.totals.volume,
      trades:ytdPnL.totals.trades,
      avgMargin:ytdAvgMargin
    },
    byProduct:pnl30d.items.slice(0,8).map(p=>({...p,totalPnL:p.pnl,avgMargin:p.marginPerMBF,tradePnL:p.pnl,freightPnL:p.freight,winRate:0})),
    byTrader:traderPerf.map(t=>({...t,totalPnL:t.pnl})),
    portfolioHealth:{
      totalValue:portfolio.totalMTM,
      unrealizedPnL:portfolio.unrealizedPnL,
      inventoryTurnover:portfolio.turnover.turnoverRatio,
      deadStockCount:portfolio.deadStock.length
    },
    riskMetrics:{
      score:risk.riskScore,
      level:risk.riskLevel,
      var95:risk.var95,
      maxDrawdown:risk.drawdown.maxDrawdown,
      concentration:risk.portfolio.topProductConcentration
    },
    marketConditions:{
      volatilityRegime:volatility.regime,
      avgVolatility:volatility.avgVolatility
    },
    trends:monthlyTotals
  };
  }catch(e){console.error('generateMonthlyReport error:',e);return{type:'monthlyReport',error:true,message:'Error generating monthly report: '+e.message,generatedAt:new Date().toISOString()};}
}

// ============================================================================
// CUSTOMER ACTIVITY REPORT
// ============================================================================

// Generate customer activity report
function generateCustomerReport(period='30d'){
  try{
  const customerProf=getCustomerProfitability(period);
  const cutoff=getPeriodCutoff(period);

  // Customer activity details
  const customerActivity=[];
  const customerData={};

  S.sells.filter(s=>new Date(s.date)>=cutoff).forEach(s=>{
    const cust=s.customer;
    if(!cust)return;
    if(!customerData[cust]){
      customerData[cust]={
        orders:[],
        products:new Set(),
        totalVolume:0,
        totalRevenue:0,
        lastOrder:null
      };
    }
    customerData[cust].orders.push(s);
    customerData[cust].products.add(s.product);
    customerData[cust].totalVolume+=s.volume||0;
    customerData[cust].totalRevenue+=(s.price||0)*(s.volume||0);
    if(!customerData[cust].lastOrder||s.date>customerData[cust].lastOrder){
      customerData[cust].lastOrder=s.date;
    }
  });

  Object.entries(customerData).forEach(([name,data])=>{
    const profData=customerProf.find(c=>c.customer===name);
    customerActivity.push({
      customer:name,
      orderCount:data.orders.length,
      volume:data.totalVolume,
      revenue:data.totalRevenue,
      avgOrderSize:data.orders.length>0?data.totalVolume/data.orders.length:0,
      products:[...data.products],
      lastOrderDate:data.lastOrder,
      daysSinceOrder:data.lastOrder?Math.floor((new Date()-new Date(data.lastOrder))/(24*60*60*1000)):null,
      profit:profData?.pnl||0,
      avgMargin:profData?.avgMargin||0
    });
  });

  // Sort by volume
  customerActivity.sort((a,b)=>b.volume-a.volume);

  // Inactive customers (no orders in period but have history)
  const activeCustomers=new Set(customerActivity.map(c=>c.customer));
  const inactiveCustomers=S.customers
    .filter(c=>c.type!=='mill'&&!activeCustomers.has(c.name))
    .map(c=>({name:c.name,destination:c.destination}));

  return{
    type:'customerReport',
    period,
    generatedAt:new Date().toISOString(),
    summary:{
      activeCustomers:customerActivity.length,
      totalVolume:customerActivity.reduce((s,c)=>s+c.volume,0),
      totalRevenue:customerActivity.reduce((s,c)=>s+c.revenue,0),
      totalProfit:customerActivity.reduce((s,c)=>s+c.profit,0)
    },
    topCustomers:customerActivity.slice(0,20),
    inactiveCustomers:inactiveCustomers.slice(0,10),
    customerDistribution:{
      top10Volume:customerActivity.slice(0,10).reduce((s,c)=>s+c.volume,0),
      top10Pct:customerActivity.length>0?
        (customerActivity.slice(0,10).reduce((s,c)=>s+c.volume,0)/customerActivity.reduce((s,c)=>s+c.volume,0))*100:0
    }
  };
  }catch(e){console.error('generateCustomerReport error:',e);return{type:'customerReport',error:true,message:'Error generating customer report: '+e.message,generatedAt:new Date().toISOString()};}
}

// ============================================================================
// MILL PROFITABILITY HELPER
// ============================================================================

// Local helper: get mill profitability via getPnLBreakdown grouped by mill
function _getMillProfitability(period='30d'){
  const breakdown=getPnLBreakdown({groupBy:'mill',period});
  return breakdown.items.map(item=>({
    mill:item.key,
    trades:item.trades,
    volume:item.volume,
    revenue:item.revenue,
    cost:item.cost,
    pnl:item.pnl,
    avgMargin:item.marginPerMBF,
    marginPct:item.marginPct
  })).filter(m=>m.mill!=='Unknown');
}

// Global function for ai.js and other callers
function getMillProfitability(period='30d'){
  return _getMillProfitability(period);
}

// ============================================================================
// MILL ACTIVITY REPORT
// ============================================================================

// Generate mill activity report
function generateMillReport(period='30d'){
  try{
  const millProf=getMillProfitability(period);
  const cutoff=getPeriodCutoff(period);

  // Mill activity details
  const millActivity=[];
  const millData={};

  S.buys.filter(b=>new Date(b.date)>=cutoff).forEach(b=>{
    const mill=b.mill;
    if(!mill)return;
    if(!millData[mill]){
      millData[mill]={
        orders:[],
        products:new Set(),
        regions:new Set(),
        totalVolume:0,
        totalCost:0,
        lastOrder:null
      };
    }
    millData[mill].orders.push(b);
    millData[mill].products.add(b.product);
    millData[mill].regions.add(b.region);
    millData[mill].totalVolume+=b.volume||0;
    millData[mill].totalCost+=(b.price||0)*(b.volume||0);
    if(!millData[mill].lastOrder||b.date>millData[mill].lastOrder){
      millData[mill].lastOrder=b.date;
    }
  });

  Object.entries(millData).forEach(([name,data])=>{
    const profData=millProf.find(m=>m.mill===name);
    millActivity.push({
      mill:name,
      orderCount:data.orders.length,
      volume:data.totalVolume,
      cost:data.totalCost,
      avgPrice:data.totalVolume>0?data.totalCost/data.totalVolume:0,
      products:[...data.products],
      regions:[...data.regions],
      lastOrderDate:data.lastOrder,
      daysSinceOrder:data.lastOrder?Math.floor((new Date()-new Date(data.lastOrder))/(24*60*60*1000)):null,
      profit:profData?.pnl||0,
      avgMargin:profData?.avgMargin||0
    });
  });

  // Sort by volume
  millActivity.sort((a,b)=>b.volume-a.volume);

  // Mill pricing comparison
  const millBasis=calcMillBasis();

  return{
    type:'millReport',
    period,
    generatedAt:new Date().toISOString(),
    summary:{
      activeMills:millActivity.length,
      totalVolume:millActivity.reduce((s,m)=>s+m.volume,0),
      totalCost:millActivity.reduce((s,m)=>s+m.cost,0),
      avgCost:millActivity.reduce((s,m)=>s+m.cost,0)/millActivity.reduce((s,m)=>s+m.volume,0)||0
    },
    topMills:millActivity.slice(0,20),
    millPricing:millBasis.slice(0,15),
    concentration:{
      top5Volume:millActivity.slice(0,5).reduce((s,m)=>s+m.volume,0),
      top5Pct:millActivity.length>0?
        (millActivity.slice(0,5).reduce((s,m)=>s+m.volume,0)/millActivity.reduce((s,m)=>s+m.volume,0))*100:0
    }
  };
  }catch(e){console.error('generateMillReport error:',e);return{type:'millReport',error:true,message:'Error generating mill report: '+e.message,generatedAt:new Date().toISOString()};}
}

// ============================================================================
// RISK REPORT
// ============================================================================

// Generate comprehensive risk report
function generateRiskReport(){
  try{
  const risk=getRiskDashboard();
  const volatility=getVolatilityReport(12);
  const correlations=getCorrelationMatrix(12);
  const drawdown=calcDrawdown('90d');
  const var95=getVaRReport(0.95);
  const var99=getVaRReport(0.99);

  return{
    type:'riskReport',
    generatedAt:new Date().toISOString(),
    overallRisk:{
      score:risk.riskScore,
      level:risk.riskLevel,
      components:risk.components
    },
    exposures:{
      byProduct:Object.entries(risk.portfolio.byProduct).map(([k,v])=>({
        product:k,
        long:v.long,
        short:v.short,
        net:v.net,
        notional:v.notional
      })),
      byRegion:Object.entries(risk.portfolio.byRegion).map(([k,v])=>({
        region:k,
        long:v.long,
        short:v.short,
        net:v.net
      }))
    },
    valueAtRisk:{
      var95:var95.conservativeVaR,
      var99:var99.conservativeVaR,
      byProduct:var95.byProduct.slice(0,8),
      worstHistoricalLoss:var95.worstHistoricalLoss
    },
    drawdown:{
      current:drawdown.currentDrawdown,
      max:drawdown.maxDrawdown,
      peakValue:drawdown.peakValue,
      daysSincePeak:drawdown.daysSincePeak
    },
    volatility:{
      regime:volatility.regime,
      avgVolatility:volatility.avgVolatility,
      byProduct:volatility.byProduct.slice(0,10)
    },
    breaches:risk.breaches,
    limits:S.riskLimits
  };
  }catch(e){console.error('generateRiskReport error:',e);return{type:'riskReport',error:true,message:'Error generating risk report: '+e.message,generatedAt:new Date().toISOString()};}
}

// ============================================================================
// REPORT RENDERING
// ============================================================================

// Render report as HTML for display or PDF generation
function renderReportHTML(report){
  const title=getReportTitle(report.type);

  let html=`
    <div class="report" style="font-family:Inter,sans-serif;max-width:900px;margin:0 auto;padding:24px;">
      <div class="report-header" style="margin-bottom:32px;border-bottom:2px solid #4d8df7;padding-bottom:16px;">
        <h1 style="font-size:24px;margin:0;color:#4d8df7;">${title}</h1>
        <p style="color:#5a6270;margin:8px 0 0;">Generated: ${new Date(report.generatedAt).toLocaleString()}</p>
      </div>
  `;

  // Render based on report type
  switch(report.type){
    case 'dailyFlash':
      html+=renderDailyFlashHTML(report);
      break;
    case 'weeklyReport':
      html+=renderWeeklyReportHTML(report);
      break;
    case 'monthlyReport':
      html+=renderMonthlyReportHTML(report);
      break;
    case 'riskReport':
      html+=renderRiskReportHTML(report);
      break;
    default:
      html+=`<pre>${JSON.stringify(report,null,2)}</pre>`;
  }

  html+=`</div>`;
  return html;
}

function getReportTitle(type){
  const titles={
    dailyFlash:'Daily Flash Report',
    weeklyReport:'Weekly Trading Report',
    monthlyReport:'Monthly Management Report',
    customerReport:'Customer Activity Report',
    millReport:'Mill Activity Report',
    riskReport:'Risk Assessment Report'
  };
  return titles[type]||'Report';
}

function renderDailyFlashHTML(report){
  return`
    <div class="section" style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#d0d4da;margin:0 0 12px;">Today's Summary</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">Today P&L</div>
          <div style="font-size:24px;color:${report.summary.todayPnL>=0?'#00e676':'#ff5252'}">${fmt(report.summary.todayPnL)}</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">MTD P&L</div>
          <div style="font-size:24px;color:${report.summary.mtdPnL>=0?'#00e676':'#ff5252'}">${fmt(report.summary.mtdPnL)}</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">Net Position</div>
          <div style="font-size:24px;color:#d0d4da">${fmtN(report.summary.openPositions)} MBF</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">Risk Level</div>
          <div style="font-size:24px;color:${report.risk.level==='LOW'?'#00e676':report.risk.level==='HIGH'?'#ff5252':'#ffab40'}">${report.risk.level}</div>
        </div>
      </div>
    </div>
    <div class="section" style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#d0d4da;margin:0 0 12px;">Market Prices (2x4#2)</h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
        <div style="background:#0e0e16;padding:16px;border-radius:8px;border-left:3px solid #4d8df7;">
          <div style="font-size:10px;color:#5a6270;">West</div>
          <div style="font-size:20px;color:#d0d4da">${report.marketSummary.west24?fmt(report.marketSummary.west24):'—'}</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;border-left:3px solid #ffab40;">
          <div style="font-size:10px;color:#5a6270;">Central</div>
          <div style="font-size:20px;color:#d0d4da">${report.marketSummary.central24?fmt(report.marketSummary.central24):'—'}</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;border-left:3px solid #64b5f6;">
          <div style="font-size:10px;color:#5a6270;">East</div>
          <div style="font-size:20px;color:#d0d4da">${report.marketSummary.east24?fmt(report.marketSummary.east24):'—'}</div>
        </div>
      </div>
    </div>
    ${report.alerts.length?`
    <div class="section">
      <h2 style="font-size:16px;color:#d0d4da;margin:0 0 12px;">Active Alerts</h2>
      ${report.alerts.map(a=>`
        <div style="background:#0e0e16;padding:12px;border-radius:4px;margin-bottom:8px;border-left:3px solid ${a.severity==='critical'?'#ff5252':a.severity==='high'?'#ffab40':'#5a6270'};">
          <span style="color:#d0d4da;">${a.title}</span>
        </div>
      `).join('')}
    </div>
    `:''}
  `;
}

function renderWeeklyReportHTML(report){
  return`
    <div class="section" style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#d0d4da;margin:0 0 12px;">Week Performance</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">Total P&L</div>
          <div style="font-size:24px;color:${report.performance.totalPnL>=0?'#00e676':'#ff5252'}">${fmt(report.performance.totalPnL)}</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">Volume</div>
          <div style="font-size:24px;color:#d0d4da">${fmtN(report.performance.volume)} MBF</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">Avg Margin</div>
          <div style="font-size:24px;color:#d0d4da">${fmt(report.performance.avgMargin)}/MBF</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">Win Rate</div>
          <div style="font-size:24px;color:#d0d4da">${report.performance.winRate.toFixed(0)}%</div>
        </div>
      </div>
    </div>
    <div class="section" style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#d0d4da;margin:0 0 12px;">Top Products</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="border-bottom:1px solid #1c1c2a;">
          <th style="text-align:left;padding:8px;color:#5a6270;font-size:10px;">PRODUCT</th>
          <th style="text-align:right;padding:8px;color:#5a6270;font-size:10px;">VOLUME</th>
          <th style="text-align:right;padding:8px;color:#5a6270;font-size:10px;">P&L</th>
          <th style="text-align:right;padding:8px;color:#5a6270;font-size:10px;">MARGIN</th>
        </tr>
        ${report.byProduct.slice(0,6).map(p=>`
          <tr style="border-bottom:1px solid #1c1c2a;">
            <td style="padding:8px;color:#d0d4da;">${p.key}</td>
            <td style="text-align:right;padding:8px;color:#d0d4da;">${fmtN(p.volume)} MBF</td>
            <td style="text-align:right;padding:8px;color:${p.totalPnL>=0?'#00e676':'#ff5252'};">${fmt(p.totalPnL)}</td>
            <td style="text-align:right;padding:8px;color:#d0d4da;">${fmt(p.avgMargin)}</td>
          </tr>
        `).join('')}
      </table>
    </div>
    <div class="section">
      <h2 style="font-size:16px;color:#d0d4da;margin:0 0 12px;">Trader Performance</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="border-bottom:1px solid #1c1c2a;">
          <th style="text-align:left;padding:8px;color:#5a6270;font-size:10px;">TRADER</th>
          <th style="text-align:right;padding:8px;color:#5a6270;font-size:10px;">VOLUME</th>
          <th style="text-align:right;padding:8px;color:#5a6270;font-size:10px;">P&L</th>
          <th style="text-align:right;padding:8px;color:#5a6270;font-size:10px;">WIN RATE</th>
        </tr>
        ${report.traderPerformance.map(t=>`
          <tr style="border-bottom:1px solid #1c1c2a;">
            <td style="padding:8px;color:#d0d4da;">${t.trader}</td>
            <td style="text-align:right;padding:8px;color:#d0d4da;">${fmtN(t.volume)} MBF</td>
            <td style="text-align:right;padding:8px;color:${t.totalPnL>=0?'#00e676':'#ff5252'};">${fmt(t.totalPnL)}</td>
            <td style="text-align:right;padding:8px;color:#d0d4da;">${t.winRate.toFixed(0)}%</td>
          </tr>
        `).join('')}
      </table>
    </div>
  `;
}

function renderMonthlyReportHTML(report){
  return`
    <div class="section" style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#d0d4da;margin:0 0 12px;">Month-to-Date Performance</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">MTD P&L</div>
          <div style="font-size:24px;color:${report.mtdPerformance.totalPnL>=0?'#00e676':'#ff5252'}">${fmt(report.mtdPerformance.totalPnL)}</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">YTD P&L</div>
          <div style="font-size:24px;color:${report.ytdPerformance.totalPnL>=0?'#00e676':'#ff5252'}">${fmt(report.ytdPerformance.totalPnL)}</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">Volume</div>
          <div style="font-size:24px;color:#d0d4da">${fmtN(report.mtdPerformance.volume)} MBF</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">Trades</div>
          <div style="font-size:24px;color:#d0d4da">${report.mtdPerformance.trades}</div>
        </div>
      </div>
    </div>
    <div class="section" style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#d0d4da;margin:0 0 12px;">Portfolio Health</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">Portfolio Value</div>
          <div style="font-size:20px;color:#d0d4da">${fmt(report.portfolioHealth.totalValue)}</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">Unrealized P&L</div>
          <div style="font-size:20px;color:${report.portfolioHealth.unrealizedPnL>=0?'#00e676':'#ff5252'}">${fmt(report.portfolioHealth.unrealizedPnL)}</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">Inv Turnover</div>
          <div style="font-size:20px;color:#d0d4da">${report.portfolioHealth.inventoryTurnover}x</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">Risk Level</div>
          <div style="font-size:20px;color:${report.riskMetrics.level==='LOW'?'#00e676':report.riskMetrics.level==='HIGH'?'#ff5252':'#ffab40'}">${report.riskMetrics.level}</div>
        </div>
      </div>
    </div>
  `;
}

function renderRiskReportHTML(report){
  return`
    <div class="section" style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#d0d4da;margin:0 0 12px;">Risk Overview</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">Risk Score</div>
          <div style="font-size:24px;color:${report.overallRisk.score<30?'#00e676':report.overallRisk.score>60?'#ff5252':'#ffab40'}">${report.overallRisk.score}/100</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">VaR (95%)</div>
          <div style="font-size:24px;color:#ff5252">${fmt(report.valueAtRisk.var95)}</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">Max Drawdown</div>
          <div style="font-size:24px;color:#ff5252">${fmt(report.drawdown.max)}</div>
        </div>
        <div style="background:#0e0e16;padding:16px;border-radius:8px;">
          <div style="font-size:10px;color:#5a6270;text-transform:uppercase;">Volatility</div>
          <div style="font-size:24px;color:#d0d4da">${report.volatility.regime}</div>
        </div>
      </div>
    </div>
    ${report.breaches.length?`
    <div class="section" style="margin-bottom:24px;">
      <h2 style="font-size:16px;color:#ff5252;margin:0 0 12px;">Limit Breaches</h2>
      ${report.breaches.map(b=>`
        <div style="background:#1a0a0a;padding:12px;border-radius:4px;margin-bottom:8px;border-left:3px solid #ff5252;">
          <span style="color:#d0d4da;font-weight:600;">${b.name}</span>
          <span style="color:#5a6270;"> - ${b.type} at ${fmtN(b.current)} vs limit ${fmtN(b.limit)}</span>
        </div>
      `).join('')}
    </div>
    `:''}
    <div class="section">
      <h2 style="font-size:16px;color:#d0d4da;margin:0 0 12px;">VaR by Product</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="border-bottom:1px solid #1c1c2a;">
          <th style="text-align:left;padding:8px;color:#5a6270;font-size:10px;">PRODUCT</th>
          <th style="text-align:right;padding:8px;color:#5a6270;font-size:10px;">POSITION</th>
          <th style="text-align:right;padding:8px;color:#5a6270;font-size:10px;">NOTIONAL</th>
          <th style="text-align:right;padding:8px;color:#5a6270;font-size:10px;">VAR</th>
        </tr>
        ${report.valueAtRisk.byProduct.slice(0,8).map(p=>`
          <tr style="border-bottom:1px solid #1c1c2a;">
            <td style="padding:8px;color:#d0d4da;">${p.product}</td>
            <td style="text-align:right;padding:8px;color:#d0d4da;">${fmtN(p.position)} MBF</td>
            <td style="text-align:right;padding:8px;color:#d0d4da;">${fmt(p.notional)}</td>
            <td style="text-align:right;padding:8px;color:#ff5252;">${fmt(p.var)}</td>
          </tr>
        `).join('')}
      </table>
    </div>
  `;
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

// Export report to JSON
function exportReportJSON(report){
  const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`${report.type}-${report.date||today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Export report to CSV
function exportReportCSV(report){
  let csv='';

  // For P&L breakdown reports
  if(report.byProduct){
    csv='Product,Volume,Trade P&L,Freight P&L,Total P&L,Avg Margin,Win Rate\n';
    report.byProduct.forEach(p=>{
      csv+=`"${p.key}",${p.volume},${p.tradePnL},${p.freightPnL},${p.totalPnL},${p.avgMargin},${p.winRate}\n`;
    });
  }

  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`${report.type}-${report.date||today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Generate PDF using html2pdf (if available)
function exportReportPDF(report){
  if(typeof html2pdf==='undefined'){
    showToast('PDF export requires html2pdf library','warn');
    return;
  }

  const html=renderReportHTML(report);
  const container=document.createElement('div');
  container.innerHTML=html;
  container.style.background='#0a0a10';
  document.body.appendChild(container);

  html2pdf().set({
    margin:10,
    filename:`${report.type}-${report.date||today()}.pdf`,
    image:{type:'jpeg',quality:0.98},
    html2canvas:{scale:2},
    jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}
  }).from(container).save().then(()=>{
    document.body.removeChild(container);
  });
}

// ============================================================================
// REPORT HISTORY
// ============================================================================

// Save report to history
function saveReportToHistory(report){
  initReportConfig();
  S.reportHistory=[{
    ...report,
    id:genId(),
    savedAt:new Date().toISOString()
  },...S.reportHistory].slice(0,50);
  SS('reportHistory',S.reportHistory);
}

// Get report history
function getReportHistory(type=null){
  initReportConfig();
  if(type){
    return S.reportHistory.filter(r=>r.type===type);
  }
  return S.reportHistory;
}

// ============================================================================
// UI HELPER FUNCTIONS
// ============================================================================

// Generate and show report in the preview area
function generateAndShowReport(type){
  let report;
  switch(type){
    case'daily':report=generateDailyFlash();break;
    case'weekly':report=generateWeeklyReport();break;
    case'monthly':report=generateMonthlyReport();break;
    case'risk':report=generateRiskReport();break;
    case'customer':report=generateCustomerReport();break;
    default:report=generateDailyFlash();
  }

  // Save to history
  saveReportToHistory(report);

  // Show preview
  const previewCard=document.getElementById('report-preview-card');
  const previewArea=document.getElementById('report-preview');
  if(previewCard&&previewArea){
    previewCard.style.display='block';
    previewArea.innerHTML=renderReportHTML(report);
    previewCard.scrollIntoView({behavior:'smooth'});
  }

  // Store current report for export
  window._currentReport=report;

  showToast(`${type.charAt(0).toUpperCase()+type.slice(1)} report generated`,'success');
}

// View historical report
function viewHistoricalReport(index){
  const report=S.reportHistory[index];
  if(!report)return;

  const previewCard=document.getElementById('report-preview-card');
  const previewArea=document.getElementById('report-preview');
  if(previewCard&&previewArea){
    previewCard.style.display='block';
    previewArea.innerHTML=renderReportHTML(report);
    previewCard.scrollIntoView({behavior:'smooth'});
  }

  window._currentReport=report;
}

// Export current report to PDF
function exportReportPDF(){
  if(!window._currentReport){
    showToast('No report to export','error');
    return;
  }

  const report=window._currentReport;
  const html=renderReportHTML(report);

  // Use html2pdf library if available
  if(typeof html2pdf!=='undefined'){
    const element=document.createElement('div');
    element.innerHTML=html;
    element.style.padding='20px';
    element.style.background='white';
    element.style.color='black';

    html2pdf().from(element).save(`${report.type}_${report.date}.pdf`);
    showToast('PDF exported','success');
  }else{
    // Fallback: open in new window for printing
    const win=window.open('','_blank');
    win.document.write(`<html><head><title>${report.type} Report</title><style>body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}</style></head><body>${html}</body></html>`);
    win.document.close();
    win.print();
    showToast('Print dialog opened','info');
  }
}

// Export current report to CSV
function exportReportCSV(){
  if(!window._currentReport){
    showToast('No report to export','error');
    return;
  }

  const report=window._currentReport;
  let csv='Report Type,'+report.type+'\n';
  csv+='Generated,'+report.date+'\n\n';

  // Add summary data
  if(report.summary){
    csv+='Summary\n';
    Object.entries(report.summary).forEach(([k,v])=>{
      csv+=k+','+v+'\n';
    });
    csv+='\n';
  }

  // Add positions if available
  if(report.positions){
    csv+='Positions\n';
    Object.entries(report.positions).forEach(([k,v])=>{
      csv+=k+','+(typeof v==='object'?JSON.stringify(v):v)+'\n';
    });
    csv+='\n';
  }

  // Add risk if available
  if(report.risk){
    csv+='Risk Metrics\n';
    Object.entries(report.risk).forEach(([k,v])=>{
      csv+=k+','+v+'\n';
    });
  }

  // Download
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`${report.type}_${report.date}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showToast('CSV exported','success');
}

// Initialize on load
initReportConfig();
