// SYP Analytics - Utility Functions
// Leaderboard time period helpers
function getLeaderboardRange(period){
  const now=new Date();
  let start;
  switch(period){
    case 'today':start=new Date(now.getFullYear(),now.getMonth(),now.getDate());break;
    case 'week':const dow=now.getDay();start=new Date(now-dow*86400000);start.setHours(0,0,0,0);break;
    case 'month':start=new Date(now.getFullYear(),now.getMonth(),1);break;
    case 'quarter':const q=Math.floor(now.getMonth()/3);start=new Date(now.getFullYear(),q*3,1);break;
    case 'ytd':start=new Date(now.getFullYear(),0,1);break;
    case '7d':start=new Date(now-7*86400000);break;
    case '30d':start=new Date(now-30*86400000);break;
    case '90d':start=new Date(now-90*86400000);break;
    default:start=new Date(2020,0,1);
  }
  return{start,end:now};
}

// Calculate detailed trader stats for leaderboard
// ALL math is based on matched order pairs (same orderNum on buy + sell)
function calcTraderStats(trader,buys,sells){
  const buyVol=buys.reduce((s,b)=>s+(b.volume||0),0);
  const buyVal=buys.reduce((s,b)=>s+(b.price||0)*(b.volume||0),0);
  const sellVol=sells.reduce((s,x)=>s+(x.volume||0),0);
  const sellVal=sells.reduce((s,x)=>s+(x.price||0)*(x.volume||0),0);

  // FOB calculation (sell price minus freight per MBF)
  const sellFOB=sells.reduce((s,x)=>{
    const frPerMBF=x.volume>0?(x.freight||0)/x.volume:0;
    return s+((x.price||0)-frPerMBF)*(x.volume||0);
  },0);

  const avgBuy=buyVol>0?buyVal/buyVol:0;
  const avgSellFOB=sellVol>0?sellFOB/sellVol:0;

  // Build buy lookup from ALL department buys for cross-trader matching
  // A sell by trader A may be matched to a buy by trader B (same order number)
  const buyByOrder={};
  S.buys.forEach(b=>{
    const ord=String(b.orderNum||b.po||'').trim();
    if(ord)buyByOrder[ord]=b;
  });

  // Matched profit, margin, win rate — all order-matched
  let matchedProfit=0,matchedVol=0,matchedBuyCost=0,matchedSellFOB=0;
  let wins=0,matchedSells=0;
  let bestProfit=0,bestTrade=null;

  sells.forEach(s=>{
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    const buy=ord?buyByOrder[ord]:null;
    if(!buy)return;

    const vol=s.volume||0;
    if(vol<=0)return;

    const frPerMBF=vol>0?(s.freight||0)/vol:0;
    const sellFob=(s.price||0)-frPerMBF;
    const buyCost=buy.price||0;
    const tradeProfit=(sellFob-buyCost)*vol;

    matchedProfit+=tradeProfit;
    matchedVol+=vol;
    matchedBuyCost+=buyCost*vol;
    matchedSellFOB+=sellFob*vol;
    matchedSells++;

    // Win = positive margin on this matched trade
    if(sellFob>buyCost)wins++;

    // Best single trade
    if(tradeProfit>bestProfit){
      bestProfit=tradeProfit;
      bestTrade={...s,profit:tradeProfit};
    }
  });

  const margin=matchedVol>0?(matchedSellFOB/matchedVol)-(matchedBuyCost/matchedVol):0;
  const profit=matchedProfit;
  const winRate=matchedSells>0?(wins/matchedSells*100):0;

  // Total trades
  const totalTrades=buys.length+sells.length;

  // Customers served
  const customers=[...new Set(sells.map(s=>s.customer).filter(Boolean))];

  return{
    name:trader,
    buyVol,sellVol,totalVol:buyVol+sellVol,
    buyVal,sellVal,sellFOB,
    avgBuy,avgSellFOB,
    margin:isNaN(margin)?0:margin,
    profit:isNaN(profit)?0:profit,
    matchedVol,
    trades:totalTrades,
    buys:buys.length,sells:sells.length,
    matchedSells,
    openBuys:buys.filter(b=>!b.shipped).length,
    openSells:sells.filter(s=>!s.delivered).length,
    winRate,bestTrade,bestProfit,
    customers,customerCount:customers.length
  };
}

// ACHIEVEMENTS and checkAchievements are defined in state.js

function getRange(){
  const now=new Date(),days={['7d']:7,['14d']:14,['30d']:30,['90d']:90,all:9999}[S.filters.date]||30;
  return{start:new Date(now-days*86400000),end:now};
}

function filtered(){
  const r=getRange(),inR=d=>new Date(d)>=r.start&&new Date(d)<=r.end;
  const mP=p=>S.filters.prod==='all'||p===S.filters.prod;
  const mR=rg=>S.filters.reg==='all'||rg===S.filters.reg;

  // Admin sees all, traders see only their own
  const isAdmin=S.trader==='Admin';
  const isMyTrade=t=>isAdmin||t===S.trader||!t;

  return{
    buys:S.buys.filter(b=>inR(b.date)&&mP(b.product)&&mR(b.region)&&isMyTrade(b.trader)),
    sells:S.sells.filter(s=>inR(s.date)&&mP(s.product)&&isMyTrade(s.trader))
  };
}

// Get ALL department data (for leaderboard, cross-trader linking)
function allData(){
  return{buys:S.buys,sells:S.sells};
}

// Get current trader's CRM only (Admin sees all)
function myMills(){
  if(S.trader==='Admin')return S.mills;
  return S.mills.filter(m=>m.trader===S.trader||!m.trader);
}
function myCustomers(){
  if(S.trader==='Admin')return S.customers;
  return S.customers.filter(c=>c.trader===S.trader||!c.trader);
}

// Check if current user is admin
function isAdmin(){
  return S.trader==='Admin';
}

function canEdit(trade){
  if(S.trader==='Admin')return true; // Admin can edit all
  return trade.trader===S.trader||!trade.trader; // Can edit own trades or legacy untagged
}

// Get trader color for display
function traderColor(t){
  const colors={'Admin':'#f5a623','Ian P':'var(--accent)','Aubrey M':'#f5a623','Hunter S':'#4a9eff','Sawyer R':'#a855f7','Jackson M':'#ec4899','John W':'#14b8a6'};
  return colors[t]||'var(--muted)';
}

// Get trader initials for badges
function traderInitial(t){
  if(t==='Admin')return '★';
  return t?t.split(' ').map(w=>w.charAt(0)).join('').toUpperCase():'?';
}
