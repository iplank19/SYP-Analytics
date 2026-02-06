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
        id:`breach-${b.name||'portfolio'}-${Date.now()}`,
        type:'positionBreach',
        severity:'critical',
        title:`Position Limit Breach: ${b.name||'Portfolio'}`,
        message:`${b.type} position of ${b.current.toFixed(0)} exceeds limit of ${b.limit.toFixed(0)} by ${b.pctOver.toFixed(0)}%.`,
        name:b.name,
        level:b.level,
        current:b.current,
        limit:b.limit,
        pctOver:b.pctOver,
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
// ALERT TIERS — Escalation System
// ============================================================================

const ALERT_TIERS={
  info:{color:'#3b82f6',label:'Info',priority:0,autoExpire:24*60*60*1000},
  warning:{color:'#f59e0b',label:'Warning',priority:1,autoExpire:72*60*60*1000},
  critical:{color:'#ef4444',label:'Critical',priority:2,autoExpire:null},
  urgent:{color:'#dc2626',label:'Urgent',priority:3,autoExpire:null,requiresAck:true}
}

// Map alert types to default tiers
const ALERT_TYPE_TIERS={
  positionBreach:'critical',
  spreadAnomaly:'critical',
  priceChange:'warning',
  inventoryAging:'warning',
  priceAnomaly:'info'
}

function assignAlertTier(alert){
  // Use severity if already set, else map from type
  if(alert.severity==='critical')return alert.severity==='critical'&&alert.type==='positionBreach'?'urgent':'critical'
  const mapped=ALERT_TYPE_TIERS[alert.type]||'info'
  // Upgrade severity-based: critical severity → critical tier, warning → warning, etc.
  const severityMap={critical:'critical',warning:'warning',info:'info'}
  const fromSev=severityMap[alert.severity]||'info'
  // Use the higher priority tier
  const tierPriority={info:0,warning:1,critical:2,urgent:3}
  return(tierPriority[fromSev]||0)>=(tierPriority[mapped]||0)?fromSev:mapped
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

  // Assign tier to each alert
  allAlerts.forEach(a=>{
    if(!a.tier)a.tier=assignAlertTier(a)
    if(!a.acknowledged)a.acknowledged=false
    if(!a.createdAt)a.createdAt=a.timestamp||new Date().toISOString()
  })

  // Deduplicate by combining similar alerts
  const seen=new Set();
  const unique=allAlerts.filter(a=>{
    const key=`${a.type}-${a.title}`;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });

  // Sort by tier priority (urgent > critical > warning > info)
  unique.sort((a,b)=>(ALERT_TIERS[b.tier]?.priority||0)-(ALERT_TIERS[a.tier]?.priority||0));

  S.alerts=unique;
  return unique;
}

// ============================================================================
// ALERT ESCALATION
// ============================================================================

function escalateAlert(alertId){
  const alert=S.alerts.find(a=>a.id===alertId)
  if(!alert)return null

  const tierOrder=['info','warning','critical','urgent']
  const idx=tierOrder.indexOf(alert.tier)
  if(idx<0||idx>=tierOrder.length-1)return alert // Already at max

  alert.tier=tierOrder[idx+1]
  alert.escalatedAt=new Date().toISOString()
  alert.severity=alert.tier // Keep severity in sync
  return alert
}

function acknowledgeAlert(alertId,user){
  const alert=S.alerts.find(a=>a.id===alertId)
  if(!alert)return null

  alert.acknowledged=true
  alert.acknowledgedBy=user||S.trader||'Unknown'
  alert.acknowledgedAt=new Date().toISOString()

  // Add to history with ack info
  if(!S.alertAuditLog)S.alertAuditLog=[]
  S.alertAuditLog.unshift({
    alertId,
    action:'acknowledged',
    user:alert.acknowledgedBy,
    tier:alert.tier,
    title:alert.title,
    timestamp:alert.acknowledgedAt
  })
  S.alertAuditLog=S.alertAuditLog.slice(0,200)
  SS('alertAuditLog',S.alertAuditLog)

  return alert
}

function getAlertsByTier(){
  const grouped={info:[],warning:[],critical:[],urgent:[]}
  ;(S.alerts||[]).forEach(a=>{
    const tier=a.tier||'info'
    if(grouped[tier])grouped[tier].push(a)
  })
  return grouped
}

function checkAutoEscalation(){
  const now=Date.now()
  const escalationThreshold=24*60*60*1000 // 24 hours

  ;(S.alerts||[]).forEach(a=>{
    if(a.acknowledged)return
    if(a.tier!=='warning')return
    const created=new Date(a.createdAt||a.timestamp).getTime()
    if(now-created>escalationThreshold){
      escalateAlert(a.id)
    }
  })
}

function getAlertSummary(){
  const byTier=getAlertsByTier()
  return{
    total:(S.alerts||[]).length,
    unread:(S.alerts||[]).filter(a=>!a.read).length,
    unacknowledged:(S.alerts||[]).filter(a=>!a.acknowledged&&ALERT_TIERS[a.tier]?.requiresAck).length,
    info:byTier.info.length,
    warning:byTier.warning.length,
    critical:byTier.critical.length,
    urgent:byTier.urgent.length
  }
}

// ============================================================================
// ALERT PANEL RENDERING
// ============================================================================

function renderAlertPanel(){
  const byTier=getAlertsByTier()
  const summary=getAlertSummary()

  const renderTierSection=(tierName,alerts)=>{
    if(!alerts.length)return''
    const tier=ALERT_TIERS[tierName]
    return`
      <div style="margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:4px 0;border-bottom:1px solid var(--border)">
          <span style="width:8px;height:8px;border-radius:50%;background:${tier.color};display:inline-block"></span>
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${tier.color}">${escapeHtml(tier.label)}</span>
          <span style="font-size:10px;color:var(--muted);margin-left:auto">${alerts.length}</span>
        </div>
        ${alerts.map(a=>`
          <div style="padding:8px 10px;margin-bottom:4px;background:var(--panel-alt);border-radius:4px;border-left:3px solid ${tier.color};${a.acknowledged?'opacity:0.6':''}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div style="font-size:11px;font-weight:600;color:var(--fg)">${escapeHtml(a.title)}</div>
              <div style="display:flex;gap:4px;flex-shrink:0">
                ${!a.acknowledged&&ALERT_TIERS[a.tier]?.requiresAck?`<button onclick="acknowledgeAlert('${a.id}')" style="font-size:9px;padding:2px 6px;background:${tier.color};color:#fff;border:none;border-radius:3px;cursor:pointer">ACK</button>`:''}
                ${!a.read?`<button onclick="markAlertRead('${a.id}');this.closest('[style]').style.opacity='0.5'" style="font-size:9px;padding:2px 6px;background:var(--border);color:var(--fg);border:none;border-radius:3px;cursor:pointer">Dismiss</button>`:''}
              </div>
            </div>
            <div style="font-size:10px;color:var(--muted);margin-top:4px">${escapeHtml(a.message)}</div>
            <div style="font-size:9px;color:var(--muted);margin-top:4px">${new Date(a.timestamp).toLocaleString()}${a.acknowledged?' | ACK by '+escapeHtml(a.acknowledgedBy||''):''}</div>
          </div>
        `).join('')}
      </div>`
  }

  const hasAlerts=summary.total>0

  return`
    <div style="padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:var(--fg)">Alert Center</div>
        <div style="display:flex;gap:8px;font-size:10px">
          ${summary.urgent?`<span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:10px;font-weight:600">${summary.urgent} urgent</span>`:''}
          ${summary.critical?`<span style="background:#ef4444;color:#fff;padding:2px 8px;border-radius:10px;font-weight:600">${summary.critical} critical</span>`:''}
          ${summary.warning?`<span style="background:#f59e0b;color:#000;padding:2px 8px;border-radius:10px;font-weight:600">${summary.warning} warning</span>`:''}
        </div>
      </div>
      ${hasAlerts?
        renderTierSection('urgent',byTier.urgent)+
        renderTierSection('critical',byTier.critical)+
        renderTierSection('warning',byTier.warning)+
        renderTierSection('info',byTier.info)
        :'<div style="text-align:center;color:var(--muted);font-size:11px;padding:20px 0">No active alerts</div>'
      }
    </div>`
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
