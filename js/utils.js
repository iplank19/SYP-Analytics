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
function calcTraderStats(trader,buys,sells){
  const buyVol=buys.reduce((s,b)=>s+(b.volume||0),0);
  const buyVal=buys.reduce((s,b)=>s+(b.price||0)*(b.volume||0),0);
  const sellVol=sells.reduce((s,x)=>s+(x.volume||0),0);
  const sellVal=sells.reduce((s,x)=>s+(x.price||0)*(x.volume||0),0);

  // FOB calculation
  const sellFOB=sells.reduce((s,x)=>{
    const frPerMBF=x.volume>0?(x.freight||0)/x.volume:0;
    return s+((x.price||0)-frPerMBF)*(x.volume||0);
  },0);

  const avgBuy=buyVol>0?buyVal/buyVol:0;
  const avgSellFOB=sellVol>0?sellFOB/sellVol:0;
  const margin=avgSellFOB-avgBuy;
  const profit=sellFOB-buyVal;

  // Win rate: trades with positive margin
  const profitableTrades=sells.filter(s=>{
    const frPerMBF=s.volume>0?(s.freight||0)/s.volume:0;
    const fob=(s.price||0)-frPerMBF;
    const matchingBuy=buys.find(b=>b.product===s.product);
    return matchingBuy?(fob>(matchingBuy.price||0)):true;
  }).length;
  const winRate=sells.length>0?(profitableTrades/sells.length*100):0;

  // Best single trade
  let bestTrade=null,bestProfit=0;
  sells.forEach(s=>{
    const frPerMBF=s.volume>0?(s.freight||0)/s.volume:0;
    const fob=(s.price||0)-frPerMBF;
    const vol=s.volume||0;
    const matchingBuy=buys.find(b=>b.product===s.product);
    const buyPrice=matchingBuy?.price||avgBuy;
    const tradeProfit=(fob-buyPrice)*vol;
    if(tradeProfit>bestProfit){bestProfit=tradeProfit;bestTrade={...s,profit:tradeProfit}}
  });

  // Avg margin per trade
  const totalTrades=buys.length+sells.length;
  const avgMarginPerTrade=totalTrades>0?profit/totalTrades:0;

  // Customers served
  const customers=[...new Set(sells.map(s=>s.customer).filter(Boolean))];

  return{
    name:trader,
    buyVol,sellVol,totalVol:buyVol+sellVol,
    buyVal,sellVal,sellFOB,
    avgBuy,avgSellFOB,
    margin:isNaN(margin)?0:margin,
    profit:isNaN(profit)?0:profit,
    trades:totalTrades,
    buys:buys.length,sells:sells.length,
    openBuys:buys.filter(b=>!b.shipped).length,
    openSells:sells.filter(s=>!s.delivered).length,
    winRate,bestTrade,bestProfit,
    avgMarginPerTrade,
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
  const colors={'Admin':'#f5a623','Ian':'var(--accent)','Aubrey':'#f5a623','Hunter':'#4a9eff','Sawyer':'#a855f7','Jackson':'#ec4899','John':'#14b8a6'};
  return colors[t]||'var(--muted)';
}

// Get trader initials for badges
function traderInitial(t){
  if(t==='Admin')return '★';
  return t?t.charAt(0).toUpperCase():'?';
}
