// SYP Analytics - Alert System Module
// Provides automated market alerts, anomaly detection, and notifications

// ============================================================================
// ALERT CONFIGURATION
// ============================================================================

function initAlertConfig(){
  if(!S.alertConfig){
    S.alertConfig={
      priceChange:{enabled:true,threshold:5},
      positionBreach:{enabled:true},
      inventoryAging:{enabled:true,days:30},
      anomaly:{enabled:true,threshold:2}
    };
    SS('alertConfig',S.alertConfig);
  }
  if(!S.alerts)S.alerts=[];
  if(!S.alertHistory)S.alertHistory=LS('alertHistory',[]);
}

// ============================================================================
// PRICE CHANGE ALERTS
// ============================================================================

function generatePriceChangeAlerts(){
  initAlertConfig();
  const config=S.alertConfig.priceChange;
  if(!config?.enabled)return[];

  const alerts=[];
  const threshold=config.threshold||5;

  // Need at least 2 RL data points to compare
  if(S.rl.length<2)return alerts;

  const latest=S.rl[S.rl.length-1];
  const previous=S.rl[S.rl.length-2];
  const products=['2x4#2','2x6#2','2x4#3','2x6#3','2x8#2','2x10#2','2x12#2'];
  const regions=['west','central','east'];

  products.forEach(product=>{
    regions.forEach(region=>{
      const normProd=product.replace(/\s+/g,'');
      const currentPrice=latest[region]?.[normProd]||latest[region]?.[product];
      const prevPrice=previous[region]?.[normProd]||previous[region]?.[product];

      if(!currentPrice||!prevPrice)return;

      const change=currentPrice-prevPrice;
      const changePct=prevPrice?((change/prevPrice)*100):0;

      if(Math.abs(changePct)>=threshold){
        const direction=change>0?'up':'down';
        alerts.push({
          id:`price-${product}-${region}-${Date.now()}`,
          type:'priceChange',
          severity:Math.abs(changePct)>=threshold*2?'critical':'warning',
          title:`${product} ${region.charAt(0).toUpperCase()+region.slice(1)} ${direction} $${Math.abs(change).toFixed(0)}`,
          message:`Price moved ${direction} ${Math.abs(changePct).toFixed(1)}% from $${prevPrice.toFixed(0)} to $${currentPrice.toFixed(0)} since last RL update.`,
          product,
          region,
          currentPrice,
          previousPrice:prevPrice,
          change,
          changePct,
          timestamp:new Date().toISOString(),
          read:false
        });
      }
    });
  });

  return alerts;
}

// ============================================================================
// POSITION BREACH ALERTS
// ============================================================================

function generatePositionBreachAlerts(){
  initAlertConfig();
  const config=S.alertConfig.positionBreach;
  if(!config?.enabled)return[];

  const alerts=[];

  // Check position limits if risk module is loaded
  if(typeof checkPositionLimits==='function'){
    const breaches=checkPositionLimits();
    breaches.forEach(b=>{
      alerts.push({
        id:`breach-${b.product||b.trader||'portfolio'}-${Date.now()}`,
        type:'positionBreach',
        severity:'critical',
        title:`Position Limit Breach: ${b.product||b.trader||'Portfolio'}`,
        message:`${b.type} position of ${b.current.toFixed(0)} MBF exceeds limit of ${b.limit.toFixed(0)} MBF by ${b.breach.toFixed(0)} MBF.`,
        product:b.product,
        trader:b.trader,
        current:b.current,
        limit:b.limit,
        breach:b.breach,
        timestamp:new Date().toISOString(),
        read:false
      });
    });
  }

  // Also check for large uncovered shorts
  const positions={};
  S.buys.forEach(b=>{
    const key=b.product;
    if(!positions[key])positions[key]={product:key,bought:0,sold:0};
    positions[key].bought+=b.volume||0;
  });
  S.sells.forEach(s=>{
    const key=s.product;
    if(!positions[key])positions[key]={product:key,bought:0,sold:0};
    positions[key].sold+=s.volume||0;
  });

  Object.values(positions).forEach(p=>{
    const net=p.bought-p.sold;
    if(net<-150){ // Significant short position
      alerts.push({
        id:`short-${p.product}-${Date.now()}`,
        type:'positionBreach',
        severity:'warning',
        title:`Large Short Position: ${p.product}`,
        message:`Net short position of ${Math.abs(net).toFixed(0)} MBF. Ensure adequate coverage is sourced.`,
        product:p.product,
        netPosition:net,
        timestamp:new Date().toISOString(),
        read:false
      });
    }
  });

  return alerts;
}

// ============================================================================
// INVENTORY AGING ALERTS
// ============================================================================

function generateInventoryAgingAlerts(){
  initAlertConfig();
  const config=S.alertConfig.inventoryAging;
  if(!config?.enabled)return[];

  const alerts=[];
  const agingThreshold=config.days||30;
  const now=new Date();

  // Track sold volume per order
  const orderSold={};
  S.sells.forEach(s=>{
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    if(ord)orderSold[ord]=(orderSold[ord]||0)+(s.volume||0);
  });

  // Group aging inventory by product
  const agingByProduct={};

  S.buys.forEach(b=>{
    if(!b.date)return;
    const days=Math.floor((now-new Date(b.date))/(1000*60*60*24));
    if(days<agingThreshold)return;

    const ord=String(b.orderNum||b.po||'').trim();
    const sold=orderSold[ord]||0;
    const remaining=(b.volume||0)-sold;

    if(remaining<=0)return; // Fully sold

    const key=b.product||'Unknown';
    if(!agingByProduct[key]){
      agingByProduct[key]={product:key,volume:0,value:0,maxAge:0,items:0};
    }
    agingByProduct[key].volume+=remaining;
    agingByProduct[key].value+=(b.price||0)*remaining;
    agingByProduct[key].maxAge=Math.max(agingByProduct[key].maxAge,days);
    agingByProduct[key].items++;
  });

  // Generate alerts for significant aging inventory
  Object.values(agingByProduct).forEach(p=>{
    if(p.volume<20)return; // Skip small amounts

    const severity=p.maxAge>60?'critical':p.maxAge>45?'warning':'info';
    alerts.push({
      id:`aging-${p.product}-${Date.now()}`,
      type:'inventoryAging',
      severity,
      title:`Aging Inventory: ${p.product}`,
      message:`${p.volume.toFixed(0)} MBF ($${Math.round(p.value).toLocaleString()}) aged ${p.maxAge}+ days. ${p.items} item(s) need attention.`,
      product:p.product,
      volume:p.volume,
      value:p.value,
      maxAge:p.maxAge,
      items:p.items,
      timestamp:new Date().toISOString(),
      read:false
    });
  });

  return alerts;
}

// ============================================================================
// PRICE ANOMALY ALERTS
// ============================================================================

function generateAnomalyAlerts(){
  initAlertConfig();
  const config=S.alertConfig.anomaly;
  if(!config?.enabled)return[];

  const alerts=[];
  const threshold=config.threshold||2;

  // Get recent buy prices and compare to RL market prices
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
  if(!latestRL)return alerts;

  const now=new Date();
  const recentCutoff=new Date(now.getTime()-7*24*60*60*1000);

  // Check recent buys for prices significantly off market
  S.buys.filter(b=>new Date(b.date)>=recentCutoff).forEach(b=>{
    const normProd=(b.product||'').replace(/\s+/g,'');
    const region=b.region||'west';
    const marketPrice=latestRL[region]?.[normProd]||
                      latestRL[region]?.[normProd+'#2']||
                      latestRL.composite?.[region]?.[normProd];

    if(!marketPrice||!b.price)return;

    const diff=b.price-marketPrice;
    const diffPct=(diff/marketPrice)*100;

    // Alert if bought significantly above market
    if(diffPct>threshold*3){
      alerts.push({
        id:`anomaly-buy-${b.id}-${Date.now()}`,
        type:'priceAnomaly',
        severity:'warning',
        title:`High Buy Price: ${b.product}`,
        message:`Buy at $${b.price.toFixed(0)} is ${diffPct.toFixed(1)}% above market ($${marketPrice.toFixed(0)}). Order: ${b.orderNum||b.po||'—'}`,
        product:b.product,
        region,
        tradePrice:b.price,
        marketPrice,
        deviation:diffPct,
        timestamp:new Date().toISOString(),
        read:false
      });
    }

    // Alert if bought significantly below market (potential error or opportunity)
    if(diffPct<-threshold*5){
      alerts.push({
        id:`anomaly-buy-low-${b.id}-${Date.now()}`,
        type:'priceAnomaly',
        severity:'info',
        title:`Low Buy Price: ${b.product}`,
        message:`Buy at $${b.price.toFixed(0)} is ${Math.abs(diffPct).toFixed(1)}% below market ($${marketPrice.toFixed(0)}). Verify trade accuracy.`,
        product:b.product,
        region,
        tradePrice:b.price,
        marketPrice,
        deviation:diffPct,
        timestamp:new Date().toISOString(),
        read:false
      });
    }
  });

  return alerts;
}

// ============================================================================
// SPREAD ANALYSIS ALERTS
// ============================================================================

function generateSpreadAlerts(){
  const alerts=[];
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
  if(!latestRL)return alerts;

  // Check grade spreads (2x4#2 vs 2x4#3)
  const products=[
    {higher:'2x4#2',lower:'2x4#3',expectedSpread:25},
    {higher:'2x6#2',lower:'2x6#3',expectedSpread:25}
  ];

  products.forEach(p=>{
    const higherPrice=latestRL.west?.[p.higher];
    const lowerPrice=latestRL.west?.[p.lower];

    if(!higherPrice||!lowerPrice)return;

    const actualSpread=higherPrice-lowerPrice;

    // Alert if spread is inverted or unusually narrow/wide
    if(actualSpread<0){
      alerts.push({
        id:`spread-inverted-${p.higher}-${Date.now()}`,
        type:'spreadAnomaly',
        severity:'critical',
        title:`Grade Spread Inverted: ${p.higher}/${p.lower}`,
        message:`${p.lower} ($${lowerPrice.toFixed(0)}) trading above ${p.higher} ($${higherPrice.toFixed(0)}). Unusual market condition.`,
        higherGrade:p.higher,
        lowerGrade:p.lower,
        spread:actualSpread,
        expectedSpread:p.expectedSpread,
        timestamp:new Date().toISOString(),
        read:false
      });
    }else if(actualSpread<p.expectedSpread*0.4){
      alerts.push({
        id:`spread-narrow-${p.higher}-${Date.now()}`,
        type:'spreadAnomaly',
        severity:'info',
        title:`Grade Spread Narrow: ${p.higher}/${p.lower}`,
        message:`Spread of $${actualSpread.toFixed(0)} is below typical $${p.expectedSpread}. Consider #3 buying opportunities.`,
        higherGrade:p.higher,
        lowerGrade:p.lower,
        spread:actualSpread,
        expectedSpread:p.expectedSpread,
        timestamp:new Date().toISOString(),
        read:false
      });
    }
  });

  return alerts;
}

// ============================================================================
// MARKET COMMENTARY
// ============================================================================

function generateMarketCommentary(){
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
  const prevRL=S.rl.length>1?S.rl[S.rl.length-2]:null;

  if(!latestRL)return'No market data available.';

  const commentary=[];
  commentary.push(`Market Update (${latestRL.date}):`);

  // Overall market direction
  if(prevRL){
    const products=['2x4#2','2x6#2'];
    let up=0,down=0,unchanged=0;

    products.forEach(p=>{
      const current=latestRL.west?.[p];
      const prev=prevRL.west?.[p];
      if(current&&prev){
        if(current>prev)up++;
        else if(current<prev)down++;
        else unchanged++;
      }
    });

    if(up>down)commentary.push(`• Market trending HIGHER with ${up} products up.`);
    else if(down>up)commentary.push(`• Market trending LOWER with ${down} products down.`);
    else commentary.push(`• Market is STABLE.`);
  }

  // Key prices
  const west24=latestRL.west?.['2x4#2'];
  const west26=latestRL.west?.['2x6#2'];
  if(west24)commentary.push(`• 2x4#2 West: $${west24.toFixed(0)}`);
  if(west26)commentary.push(`• 2x6#2 West: $${west26.toFixed(0)}`);

  // Regional spread
  const westPrice=latestRL.west?.['2x4#2'];
  const eastPrice=latestRL.east?.['2x4#2'];
  if(westPrice&&eastPrice){
    const spread=westPrice-eastPrice;
    commentary.push(`• West-East basis: $${spread.toFixed(0)}`);
  }

  // Position summary
  let totalLong=0,totalShort=0;
  const positions={};
  S.buys.forEach(b=>{
    const key=b.product;
    if(!positions[key])positions[key]={bought:0,sold:0};
    positions[key].bought+=b.volume||0;
  });
  S.sells.forEach(s=>{
    const key=s.product;
    if(!positions[key])positions[key]={bought:0,sold:0};
    positions[key].sold+=s.volume||0;
  });
  Object.values(positions).forEach(p=>{
    const net=p.bought-p.sold;
    if(net>0)totalLong+=net;
    else totalShort+=Math.abs(net);
  });

  commentary.push(`• Net position: ${(totalLong-totalShort).toFixed(0)} MBF (${totalLong.toFixed(0)} long / ${totalShort.toFixed(0)} short)`);

  return commentary.join('\n');
}

// ============================================================================
// SPREAD ANALYSIS
// ============================================================================

function getSpreadAnalysis(){
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
  if(!latestRL)return{spreads:[],analysis:[]};

  const spreads=[];

  // Grade spreads
  const gradePairs=[
    {name:'2x4 #2/#3',product1:'2x4#2',product2:'2x4#3'},
    {name:'2x6 #2/#3',product1:'2x6#2',product2:'2x6#3'}
  ];

  gradePairs.forEach(pair=>{
    ['west','central','east'].forEach(region=>{
      const p1=latestRL[region]?.[pair.product1];
      const p2=latestRL[region]?.[pair.product2];
      if(p1&&p2){
        spreads.push({
          name:`${pair.name} (${region})`,
          type:'grade',
          region,
          price1:p1,
          price2:p2,
          spread:p1-p2,
          spreadPct:((p1-p2)/p2*100)
        });
      }
    });
  });

  // Regional spreads
  const products=['2x4#2','2x6#2'];
  products.forEach(product=>{
    const west=latestRL.west?.[product];
    const central=latestRL.central?.[product];
    const east=latestRL.east?.[product];

    if(west&&central){
      spreads.push({
        name:`${product} West-Central`,
        type:'regional',
        product,
        price1:west,
        price2:central,
        spread:west-central,
        spreadPct:((west-central)/central*100)
      });
    }
    if(west&&east){
      spreads.push({
        name:`${product} West-East`,
        type:'regional',
        product,
        price1:west,
        price2:east,
        spread:west-east,
        spreadPct:((west-east)/east*100)
      });
    }
  });

  return{
    spreads,
    date:latestRL.date
  };
}

// ============================================================================
// MASTER ALERT GENERATOR
// ============================================================================

function generateAlerts(){
  initAlertConfig();

  const allAlerts=[
    ...generatePriceChangeAlerts(),
    ...generatePositionBreachAlerts(),
    ...generateInventoryAgingAlerts(),
    ...generateAnomalyAlerts(),
    ...generateSpreadAlerts()
  ];

  // Deduplicate by combining similar alerts
  const seen=new Set();
  const unique=allAlerts.filter(a=>{
    // Create a key that identifies similar alerts (ignore timestamp and id)
    const key=`${a.type}-${a.title}`;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });

  // Sort by severity (critical > warning > info)
  const severityOrder={critical:0,warning:1,info:2};
  unique.sort((a,b)=>(severityOrder[a.severity]||2)-(severityOrder[b.severity]||2));

  S.alerts=unique;
  return unique;
}

// ============================================================================
// ALERT MANAGEMENT
// ============================================================================

// Mark alert as read
function markAlertRead(alertId){
  const alert=S.alerts.find(a=>a.id===alertId);
  if(alert){
    alert.read=true;
    // Move to history
    S.alertHistory.unshift({...alert,dismissedAt:new Date().toISOString()});
    S.alertHistory=S.alertHistory.slice(0,100); // Keep last 100
    SS('alertHistory',S.alertHistory);
  }
}

// Dismiss alert
function dismissAlert(alertId){
  S.alerts=S.alerts.filter(a=>a.id!==alertId);
}

// Get unread alert count
function getUnreadAlertCount(){
  return(S.alerts||[]).filter(a=>!a.read).length;
}

// Get alerts by severity
function getAlertsBySeverity(severity){
  return(S.alerts||[]).filter(a=>a.severity===severity);
}

// Initialize on load
initAlertConfig();
