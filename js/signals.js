// SYP Analytics - Trading Signals Module
// Generates actionable trading signals from price data, positions, and market conditions

// ============================================================================
// SIGNAL CONFIGURATION
// ============================================================================

const SIGNAL_DEFAULTS={
  trendFollowing:{enabled:true,lookback:14,threshold:3},
  meanReversion:{enabled:true,lookback:30,stdDevThreshold:1.5},
  seasonal:{enabled:true},
  spread:{enabled:true,threshold:10},
  momentum:{enabled:true,lookback:7,threshold:2}
};

function initSignalConfig(){
  if(!S.signalConfig){
    S.signalConfig=LS('signalConfig',SIGNAL_DEFAULTS);
  }
  if(!S.signals)S.signals=[];
  if(!S.signalHistory)S.signalHistory=LS('signalHistory',[]);
}

// ============================================================================
// PRICE ANALYSIS HELPERS
// ============================================================================

// Get price history for a product from RL data
function getPriceHistory(product,region='west',days=90){
  const history=[];
  const now=new Date();
  const cutoff=new Date(now.getTime()-days*24*60*60*1000);

  S.rl.forEach(rl=>{
    const date=new Date(rl.date);
    if(date<cutoff)return;

    let price=null;
    const normProd=(product||'').replace(/\s+/g,'');

    // Try to find price in RL data
    if(rl[region]?.[normProd]){
      price=rl[region][normProd];
    }else if(rl[region]?.[normProd+'#2']){
      price=rl[region][normProd+'#2'];
    }else if(rl.composite?.[region]?.[normProd]){
      price=rl.composite[region][normProd];
    }

    if(price){
      history.push({date:rl.date,price});
    }
  });

  return history.sort((a,b)=>new Date(a.date)-new Date(b.date));
}

// Calculate moving average
function calcMA(prices,period){
  if(prices.length<period)return null;
  const slice=prices.slice(-period);
  return slice.reduce((s,p)=>s+p.price,0)/period;
}

// Calculate standard deviation
function calcStdDev(prices,period){
  if(prices.length<period)return null;
  if(period<=1)return 0;
  const slice=prices.slice(-period);
  const mean=slice.reduce((s,p)=>s+p.price,0)/period;
  const variance=slice.reduce((s,p)=>s+Math.pow(p.price-mean,2),0)/(period-1);
  return Math.sqrt(variance);
}

// Calculate rate of change (momentum)
function calcROC(prices,period){
  if(prices.length<period+1)return null;
  const current=prices[prices.length-1].price;
  const past=prices[prices.length-1-period].price;
  return past?((current-past)/past)*100:null;
}

// ============================================================================
// TREND FOLLOWING SIGNALS
// ============================================================================

function generateTrendSignals(){
  initSignalConfig();
  const config=S.signalConfig.trendFollowing;
  if(!config?.enabled)return[];

  const signals=[];
  const products=PRODUCTS;
  const regions=['west','central','east'];

  products.forEach(product=>{
    regions.forEach(region=>{
      const history=getPriceHistory(product,region,60);
      if(history.length<20)return;

      const ma7=calcMA(history,7);
      const ma14=calcMA(history,14);
      const ma30=calcMA(history,30);
      const current=history[history.length-1]?.price;

      if(!ma7||!ma14||!ma30||!current)return;

      // Bullish: short MA above long MA, price above both
      if(ma7>ma14&&ma14>ma30&&current>ma7){
        const strength=((ma7-ma30)/ma30*100)>5?'strong':((ma7-ma30)/ma30*100)>2?'moderate':'weak';
        signals.push({
          type:'trend',
          direction:'buy',
          product,
          region,
          strength,
          price:current,
          reason:`Uptrend: 7d MA ($${ma7.toFixed(0)}) > 14d ($${ma14.toFixed(0)}) > 30d ($${ma30.toFixed(0)})`,
          timestamp:new Date().toISOString()
        });
      }

      // Bearish: short MA below long MA, price below both
      if(ma7<ma14&&ma14<ma30&&current<ma7){
        const strength=((ma30-ma7)/ma30*100)>5?'strong':((ma30-ma7)/ma30*100)>2?'moderate':'weak';
        signals.push({
          type:'trend',
          direction:'sell',
          product,
          region,
          strength,
          price:current,
          reason:`Downtrend: 7d MA ($${ma7.toFixed(0)}) < 14d ($${ma14.toFixed(0)}) < 30d ($${ma30.toFixed(0)})`,
          timestamp:new Date().toISOString()
        });
      }
    });
  });

  return signals;
}

// ============================================================================
// MEAN REVERSION SIGNALS
// ============================================================================

function generateMeanReversionSignals(){
  initSignalConfig();
  const config=S.signalConfig.meanReversion;
  if(!config?.enabled)return[];

  const signals=[];
  const products=['2x4#2','2x6#2','2x4#3','2x6#3','2x8#2','2x10#2'];
  const regions=['west','central','east'];
  const threshold=config.stdDevThreshold||1.5;

  products.forEach(product=>{
    regions.forEach(region=>{
      const history=getPriceHistory(product,region,90);
      if(history.length<30)return;

      const mean=calcMA(history,30);
      const stdDev=calcStdDev(history,30);
      const current=history[history.length-1]?.price;

      if(!mean||!stdDev||!current||stdDev===0)return;

      const zScore=(current-mean)/stdDev;

      // Oversold: price significantly below mean
      if(zScore<-threshold){
        const strength=zScore<-2.5?'strong':zScore<-2?'moderate':'weak';
        signals.push({
          type:'meanReversion',
          direction:'buy',
          product,
          region,
          strength,
          price:current,
          zScore:zScore.toFixed(2),
          targetPrice:mean,
          reason:`Oversold: ${Math.abs(zScore).toFixed(1)} std devs below 30d mean ($${mean.toFixed(0)})`,
          timestamp:new Date().toISOString()
        });
      }

      // Overbought: price significantly above mean
      if(zScore>threshold){
        const strength=zScore>2.5?'strong':zScore>2?'moderate':'weak';
        signals.push({
          type:'meanReversion',
          direction:'sell',
          product,
          region,
          strength,
          price:current,
          zScore:zScore.toFixed(2),
          targetPrice:mean,
          reason:`Overbought: ${zScore.toFixed(1)} std devs above 30d mean ($${mean.toFixed(0)})`,
          timestamp:new Date().toISOString()
        });
      }
    });
  });

  return signals;
}

// ============================================================================
// SEASONAL SIGNALS
// ============================================================================

function generateSeasonalSignals(){
  initSignalConfig();
  const config=S.signalConfig.seasonal;
  if(!config?.enabled)return[];

  const signals=[];
  const month=new Date().getMonth();

  // Lumber seasonal patterns (typical):
  // Strong demand: March-June (spring building season)
  // Weak demand: November-February (winter slowdown)
  // Peak prices: April-May
  // Low prices: November-December

  const seasonalBias={
    0:'weak',1:'weak',2:'strong',3:'strong',4:'strong',5:'strong',
    6:'neutral',7:'neutral',8:'neutral',9:'neutral',10:'weak',11:'weak'
  };

  const currentBias=seasonalBias[month];

  // Generate seasonal signals for key products
  const products=['2x4#2','2x6#2'];

  products.forEach(product=>{
    const history=getPriceHistory(product,'west',30);
    const current=history[history.length-1]?.price;
    if(!current)return;

    if(currentBias==='strong'&&month<=5){
      signals.push({
        type:'seasonal',
        direction:'buy',
        product,
        region:'all',
        strength:'moderate',
        price:current,
        reason:`Entering spring building season (${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month]}). Historically strong demand period.`,
        timestamp:new Date().toISOString()
      });
    }

    if(currentBias==='weak'&&month>=10){
      signals.push({
        type:'seasonal',
        direction:'sell',
        product,
        region:'all',
        strength:'moderate',
        price:current,
        reason:`Entering winter slowdown (${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month]}). Consider reducing inventory.`,
        timestamp:new Date().toISOString()
      });
    }
  });

  return signals;
}

// ============================================================================
// SPREAD SIGNALS (Regional Arbitrage)
// ============================================================================

function generateSpreadSignals(){
  initSignalConfig();
  const config=S.signalConfig.spread;
  if(!config?.enabled)return[];

  const signals=[];
  const products=['2x4#2','2x6#2','2x4#3','2x6#3'];
  const threshold=config.threshold||10;

  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
  if(!latestRL)return signals;

  products.forEach(product=>{
    const normProd=(product||'').replace(/\s+/g,'');
    const westPrice=latestRL.west?.[normProd]||latestRL.west?.[normProd+'#2'];
    const centralPrice=latestRL.central?.[normProd]||latestRL.central?.[normProd+'#2'];
    const eastPrice=latestRL.east?.[normProd]||latestRL.east?.[normProd+'#2'];

    if(!westPrice||!centralPrice||!eastPrice)return;

    // Calculate spreads
    const westCentralSpread=westPrice-centralPrice;
    const westEastSpread=westPrice-eastPrice;
    const centralEastSpread=centralPrice-eastPrice;

    // Compute historical average spreads from RL data, fallback to defaults
    let avgWestCentral=15;
    let avgWestEast=25;
    if(S.rl.length>=4){
      const recent=S.rl.slice(-12);
      const wcSpreads=recent.map(r=>(r.west?.[normProd]||0)-(r.central?.[normProd]||0)).filter(v=>v!==0);
      const weSpreads=recent.map(r=>(r.west?.[normProd]||0)-(r.east?.[normProd]||0)).filter(v=>v!==0);
      if(wcSpreads.length>=3)avgWestCentral=wcSpreads.reduce((a,b)=>a+b,0)/wcSpreads.length;
      if(weSpreads.length>=3)avgWestEast=weSpreads.reduce((a,b)=>a+b,0)/weSpreads.length;
    }

    // Check for unusual spreads
    if(Math.abs(westCentralSpread-avgWestCentral)>threshold){
      const isWide=westCentralSpread>avgWestCentral+threshold;
      signals.push({
        type:'spread',
        direction:isWide?'sell':'buy',
        product,
        region:'west',
        strength:Math.abs(westCentralSpread-avgWestCentral)>threshold*2?'strong':'moderate',
        price:westPrice,
        spread:westCentralSpread,
        reason:`West-Central spread $${westCentralSpread.toFixed(0)} vs avg $${avgWestCentral}. ${isWide?'West overpriced':'West underpriced'} relative to Central.`,
        timestamp:new Date().toISOString()
      });
    }

    if(Math.abs(westEastSpread-avgWestEast)>threshold){
      const isWide=westEastSpread>avgWestEast+threshold;
      signals.push({
        type:'spread',
        direction:isWide?'sell':'buy',
        product,
        region:'west',
        strength:Math.abs(westEastSpread-avgWestEast)>threshold*2?'strong':'moderate',
        price:westPrice,
        spread:westEastSpread,
        reason:`West-East spread $${westEastSpread.toFixed(0)} vs avg $${avgWestEast}. ${isWide?'West overpriced':'West underpriced'} relative to East.`,
        timestamp:new Date().toISOString()
      });
    }
  });

  return signals;
}

// ============================================================================
// MOMENTUM SIGNALS
// ============================================================================

function generateMomentumSignals(){
  initSignalConfig();
  const config=S.signalConfig.momentum;
  if(!config?.enabled)return[];

  const signals=[];
  const products=['2x4#2','2x6#2','2x4#3','2x6#3','2x8#2'];
  const regions=['west','central','east'];
  const threshold=config.threshold||2;

  products.forEach(product=>{
    regions.forEach(region=>{
      const history=getPriceHistory(product,region,30);
      if(history.length<14)return;

      const roc7=calcROC(history,7);
      const roc14=calcROC(history,14);
      const current=history[history.length-1]?.price;

      if(roc7===null||roc14===null||!current)return;

      // Strong upward momentum
      if(roc7>threshold&&roc14>0){
        const strength=roc7>threshold*2?'strong':roc7>threshold*1.5?'moderate':'weak';
        signals.push({
          type:'momentum',
          direction:'buy',
          product,
          region,
          strength,
          price:current,
          momentum7d:roc7.toFixed(1)+'%',
          momentum14d:roc14.toFixed(1)+'%',
          reason:`Strong momentum: +${roc7.toFixed(1)}% (7d), +${roc14.toFixed(1)}% (14d)`,
          timestamp:new Date().toISOString()
        });
      }

      // Strong downward momentum
      if(roc7<-threshold&&roc14<0){
        const strength=roc7<-threshold*2?'strong':roc7<-threshold*1.5?'moderate':'weak';
        signals.push({
          type:'momentum',
          direction:'sell',
          product,
          region,
          strength,
          price:current,
          momentum7d:roc7.toFixed(1)+'%',
          momentum14d:roc14.toFixed(1)+'%',
          reason:`Weak momentum: ${roc7.toFixed(1)}% (7d), ${roc14.toFixed(1)}% (14d)`,
          timestamp:new Date().toISOString()
        });
      }
    });
  });

  return signals;
}

// ============================================================================
// POSITION-BASED SIGNALS
// ============================================================================

function generatePositionSignals(){
  const signals=[];

  // Get current positions
  const positions={};
  S.buys.forEach(b=>{
    const key=b.product;
    if(!positions[key])positions[key]={product:key,bought:0,sold:0,boughtVal:0};
    positions[key].bought+=b.volume||0;
    positions[key].boughtVal+=(b.price||0)*(b.volume||0);
  });
  S.sells.forEach(s=>{
    const key=s.product;
    if(!positions[key])positions[key]={product:key,bought:0,sold:0,boughtVal:0};
    positions[key].sold+=s.volume||0;
  });

  Object.values(positions).forEach(p=>{
    const net=p.bought-p.sold;
    const avgCost=p.bought?p.boughtVal/p.bought:0;

    // Large long position warning
    if(net>200){
      const currentPrice=getMarketPrice(p.product,'west');
      if(currentPrice&&currentPrice<avgCost){
        signals.push({
          type:'position',
          direction:'sell',
          product:p.product,
          strength:'strong',
          price:currentPrice,
          netPosition:net,
          reason:`Large long position (${net} MBF) underwater. Current $${currentPrice.toFixed(0)} vs cost $${avgCost.toFixed(0)}. Consider reducing.`,
          timestamp:new Date().toISOString()
        });
      }
    }

    // Uncovered short warning
    if(net<-100){
      const currentPrice=getMarketPrice(p.product,'west');
      signals.push({
        type:'position',
        direction:'buy',
        product:p.product,
        strength:'strong',
        price:currentPrice,
        netPosition:net,
        reason:`Uncovered short position (${Math.abs(net)} MBF). Need to source material.`,
        timestamp:new Date().toISOString()
      });
    }
  });

  return signals;
}

// ============================================================================
// CONFIDENCE SCORING
// ============================================================================

function calcSignalConfidence(signal,allSignals){
  // Base confidence from strength
  const strengthBase={strong:70,moderate:45,weak:20}
  let confidence=strengthBase[signal.strength]||30

  // Bonus for confirming signals on the same product in the same direction
  const confirming=allSignals.filter(s=>
    s!==signal&&
    s.product===signal.product&&
    s.direction===signal.direction
  )
  confidence+=Math.min(30,confirming.length*10)

  // Bonus for multiple regions agreeing
  const regionConfirm=allSignals.filter(s=>
    s!==signal&&
    s.product===signal.product&&
    s.direction===signal.direction&&
    s.region!==signal.region&&
    s.type===signal.type
  )
  if(regionConfirm.length>0)confidence+=5

  // Penalty for conflicting signals
  const conflicting=allSignals.filter(s=>
    s!==signal&&
    s.product===signal.product&&
    s.direction!==signal.direction&&
    s.strength==='strong'
  )
  confidence-=conflicting.length*10

  return Math.max(0,Math.min(100,Math.round(confidence)))
}

// ============================================================================
// MASTER SIGNAL GENERATOR
// ============================================================================

let _signalCache=null;
let _signalCacheTime=0;

function generateSignals(){
  const now=Date.now();
  if(_signalCache&&now-_signalCacheTime<1000)return _signalCache;

  initSignalConfig();

  const allSignals=[
    ...generateTrendSignals(),
    ...generateMeanReversionSignals(),
    ...generateSeasonalSignals(),
    ...generateSpreadSignals(),
    ...generateMomentumSignals(),
    ...generatePositionSignals()
  ];

  // Deduplicate and rank
  const seen=new Set();
  const unique=allSignals.filter(s=>{
    const key=`${s.type}-${s.product}-${s.region}-${s.direction}`;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });

  // Add confidence scores
  unique.forEach(s=>{
    s.confidence=calcSignalConfidence(s,unique)
  })

  // Sort by confidence (high to low), then by strength
  const strengthOrder={strong:0,moderate:1,weak:2};
  unique.sort((a,b)=>{
    if(b.confidence!==a.confidence)return b.confidence-a.confidence
    const sa=strengthOrder[a.strength]??2;
    const sb=strengthOrder[b.strength]??2;
    return sa-sb;
  });

  S.signals=unique;
  _signalCache=unique;
  _signalCacheTime=Date.now();
  return unique;
}

// ============================================================================
// TRADE RECOMMENDATIONS
// ============================================================================

function getTradeRecommendations(){
  const signals=generateSignals();
  const recommendations=[];

  // Group signals by product and direction
  const grouped={};
  signals.forEach(s=>{
    if(s.strength==='weak')return; // Skip weak signals
    const key=`${s.product}-${s.direction}`;
    if(!grouped[key])grouped[key]={product:s.product,direction:s.direction,signals:[],score:0};
    grouped[key].signals.push(s);
    grouped[key].score+=(s.strength==='strong'?3:1);
  });

  // Create recommendations from grouped signals
  Object.values(grouped).forEach(g=>{
    if(g.signals.length<1)return; // Need at least 1 signal

    const reasons=g.signals.map(s=>s.reason).slice(0,3);
    const avgPrice=g.signals.reduce((s,x)=>s+(x.price||0),0)/g.signals.filter(x=>x.price).length;

    recommendations.push({
      action:g.direction,
      product:g.product,
      priority:g.score>=5?'high':g.score>=3?'medium':'low',
      confidence:Math.min(100,g.score*15),
      signalCount:g.signals.length,
      targetPrice:avgPrice||null,
      suggestedVolume:g.score>=5?50:g.score>=3?30:20,
      reason:reasons.join(' | '),
      signals:g.signals.map(s=>s.type)
    });
  });

  // Sort by priority
  const priorityOrder={high:0,medium:1,low:2};
  recommendations.sort((a,b)=>priorityOrder[a.priority]-priorityOrder[b.priority]);

  return recommendations;
}

// ============================================================================
// CUSTOMER OPPORTUNITY MATCHING
// ============================================================================

function matchCustomerOpportunities(){
  const recommendations=getTradeRecommendations().filter(r=>r.action==='sell');
  const opportunities=[];

  // Get customer purchase history
  const customerProducts={};
  S.sells.forEach(s=>{
    const cust=s.customer;
    const prod=s.product;
    if(!cust||!prod)return;
    if(!customerProducts[cust])customerProducts[cust]={customer:cust,products:{},lastPurchase:null};
    if(!customerProducts[cust].products[prod])customerProducts[cust].products[prod]={volume:0,count:0,lastPrice:0};
    customerProducts[cust].products[prod].volume+=s.volume||0;
    customerProducts[cust].products[prod].count++;
    customerProducts[cust].products[prod].lastPrice=s.price||0;
    if(!customerProducts[cust].lastPurchase||new Date(s.date)>new Date(customerProducts[cust].lastPurchase)){
      customerProducts[cust].lastPurchase=s.date;
    }
  });

  // Match customers to sell recommendations
  recommendations.forEach(rec=>{
    Object.values(customerProducts).forEach(cust=>{
      if(cust.products[rec.product]&&cust.products[rec.product].count>=2){
        opportunities.push({
          customer:cust.customer,
          product:rec.product,
          avgVolume:Math.round(cust.products[rec.product].volume/cust.products[rec.product].count),
          lastPrice:cust.products[rec.product].lastPrice,
          suggestedPrice:rec.targetPrice,
          reason:`Regular buyer (${cust.products[rec.product].count} orders). ${rec.reason}`,
          priority:rec.priority
        });
      }
    });
  });

  return opportunities.slice(0,10);
}

// ============================================================================
// SIGNAL DASHBOARD
// ============================================================================

function getSignalDashboard(){
  const signals=generateSignals();
  const recommendations=getTradeRecommendations();

  // Count by type
  const byType={};
  signals.forEach(s=>{
    byType[s.type]=(byType[s.type]||0)+1;
  });

  // Count by strength
  const byStrength={strong:0,moderate:0,weak:0};
  signals.forEach(s=>{
    byStrength[s.strength]=(byStrength[s.strength]||0)+1;
  });

  // Count by direction
  const buySignals=signals.filter(s=>s.direction==='buy');
  const sellSignals=signals.filter(s=>s.direction==='sell');

  return{
    signals,
    recommendations,
    summary:{
      total:signals.length,
      buySignals:buySignals.length,
      sellSignals:sellSignals.length,
      strongSignals:byStrength.strong,
      moderateSignals:byStrength.moderate,
      weakSignals:byStrength.weak
    },
    byType,
    byStrength,
    topBuySignal:buySignals.find(s=>s.strength==='strong')||buySignals[0]||null,
    topSellSignal:sellSignals.find(s=>s.strength==='strong')||sellSignals[0]||null
  };
}

// ============================================================================
// SIGNAL SUMMARY & RENDERING
// ============================================================================

function getSignalSummary(){
  const signals=S.signals&&S.signals.length?S.signals:generateSignals()
  // Return top 5 highest-confidence actionable signals
  return signals
    .filter(s=>s.confidence>=30&&s.strength!=='weak')
    .slice(0,5)
    .map(s=>({
      product:s.product,
      direction:s.direction,
      type:s.type,
      confidence:s.confidence,
      strength:s.strength,
      price:s.price,
      reason:s.reason,
      region:s.region||'all'
    }))
}

function renderSignalCards(){
  const signals=S.signals&&S.signals.length?S.signals:generateSignals()
  const top=signals.filter(s=>s.confidence>=20).slice(0,10)

  if(!top.length){
    return'<div style="text-align:center;color:var(--muted);font-size:11px;padding:20px 0">No active signals</div>'
  }

  return top.map(s=>{
    const dirColor=s.direction==='buy'?'var(--positive)':'var(--negative)'
    const dirLabel=s.direction==='buy'?'BUY':'SELL'
    const confColor=s.confidence>=70?'var(--positive)':s.confidence>=40?'var(--warn)':'var(--muted)'
    const typeLabel={trend:'Trend',meanReversion:'Mean Rev',seasonal:'Seasonal',spread:'Spread',momentum:'Momentum',position:'Position'}[s.type]||s.type

    return`
      <div style="padding:10px 12px;margin-bottom:6px;background:var(--panel-alt);border-radius:4px;border-left:3px solid ${dirColor}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:12px;font-weight:600;color:var(--fg)">${escapeHtml(s.product)} <span style="color:${dirColor};font-weight:700">${dirLabel}</span></div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:9px;padding:2px 6px;background:var(--border);border-radius:3px;color:var(--muted);text-transform:uppercase">${escapeHtml(typeLabel)}</span>
            <span style="font-size:11px;font-weight:700;color:${confColor}">${s.confidence}%</span>
          </div>
        </div>
        <div style="background:var(--bg);border-radius:3px;height:6px;overflow:hidden;margin-bottom:6px">
          <div style="height:100%;width:${s.confidence}%;background:${confColor};border-radius:3px;transition:width 0.3s"></div>
        </div>
        <div style="font-size:10px;color:var(--muted)">${escapeHtml(s.reason)}</div>
        ${s.price?`<div style="font-size:10px;color:var(--muted);margin-top:2px">${escapeHtml(s.region||'all')} @ $${s.price.toFixed(0)}</div>`:''}
      </div>`
  }).join('')
}

// Initialize on load
initSignalConfig();
