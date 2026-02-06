// SYP Analytics - Utility Functions

// ============================================================
// SAFE DOM & PARSING HELPERS
// ============================================================

// Safe innerHTML setter - prevents null reference errors
function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) {
    el.innerHTML = html;
    return true;
  }
  console.warn(`setHTML: element '${id}' not found`);
  return false;
}

// Safe JSON parse with fallback
function safeJSONParse(str, fallback = null) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    console.warn('safeJSONParse failed:', e.message);
    return fallback;
  }
}

// ============================================================
// DATA NORMALIZATION FUNCTIONS
// ============================================================

// Normalize price to 2 decimal places, ensure number type
// Returns 0 for null/undefined/empty — intentional for arithmetic safety
function normalizePrice(val) {
  if (val === null || val === undefined || val === '') return 0;
  const num = typeof val === 'string' ? parseFloat(val.replace(/[$,]/g, '')) : parseFloat(val);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

// Normalize volume to 2 decimal places (MBF)
function normalizeVolume(val) {
  if (val === null || val === undefined || val === '') return 0;
  const num = parseFloat(val);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

// Normalize date to YYYY-MM-DD format
function normalizeDate(d) {
  if (!d) return today();
  // Handle ISO strings and date objects
  const date = new Date(d);
  if (isNaN(date.getTime())) return today();
  return date.toISOString().split('T')[0];
}

// Normalize region to lowercase (west/central/east)
function normalizeRegion(raw) {
  if (!raw) return 'central';
  const lower = String(raw).toLowerCase().trim();
  return ['west', 'central', 'east'].includes(lower) ? lower : 'central';
}

// Normalize product name format (handles spacing, case)
function normalizeProduct(raw) {
  if (!raw) return raw;
  let p = String(raw).trim();

  // Try exact match first against known products
  if (typeof PRODUCTS !== 'undefined' && PRODUCTS.includes(p)) return p;
  if (typeof MI_PRODUCTS !== 'undefined' && MI_PRODUCTS.includes(p)) return p;

  // Normalize case: "2X4#2" → "2x4#2"
  p = p.replace(/^(\d+)X(\d+)/i, (m, a, b) => `${a}x${b}`);

  // Normalize MSR spacing: "2x4MSR" or "2x4  MSR" → "2x4 MSR"
  p = p.replace(/(\d)\s*MSR\b/i, '$1 MSR');

  // Normalize grade spacing: "2x4 #2" → "2x4#2" (no space before #)
  p = p.replace(/(\d)\s+#/g, '$1#');

  // Check again after normalization
  if (typeof PRODUCTS !== 'undefined' && PRODUCTS.includes(p)) return p;
  if (typeof MI_PRODUCTS !== 'undefined' && MI_PRODUCTS.includes(p)) return p;

  return p;
}

// Normalize length format (strips quotes, handles RL)
function normalizeLength(len) {
  if (!len) return '';
  const s = String(len).trim().replace(/['"′″]+$/, '').trim();
  if (s.toLowerCase() === 'rl' || s.toLowerCase() === 'random') return 'RL';
  const num = parseInt(s, 10);
  return isNaN(num) ? s : String(num);
}

// Normalize location to "City, ST" format
function normalizeLocation(raw) {
  if (!raw) return { city: '', state: '', display: '' };
  const s = String(raw).trim();

  // Split on comma
  const parts = s.split(',').map(p => p.trim());
  let city = parts[0] || '';
  let state = (parts[1] || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);

  // Title case city
  city = city.split(' ').map(w =>
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join(' ');

  // Handle special cases like "DeQuincy", "El Dorado"
  city = city.replace(/^De([a-z])/g, (m, c) => 'De' + c.toUpperCase());
  city = city.replace(/^El ([a-z])/g, (m, c) => 'El ' + c.toUpperCase());
  city = city.replace(/^Mc([a-z])/g, (m, c) => 'Mc' + c.toUpperCase());

  const display = state ? `${city}, ${state}` : city;
  return { city, state, display };
}

// Normalize ship window to standard values
function normalizeShipWindow(ship) {
  if (!ship) return '1-2 Weeks';
  const s = String(ship).toLowerCase().trim();
  if (['prompt', 'immediate', 'spot', 'now', 'asap'].includes(s)) return 'Prompt';
  if (s.includes('day') && !s.includes('7')) return 'Prompt';
  return '1-2 Weeks';
}

// Normalize order object (buy or sell) - call before saving
function normalizeOrder(order, type = 'buy') {
  if (!order) return order;
  return {
    ...order,
    price: normalizePrice(order.price),
    volume: normalizeVolume(order.volume),
    date: normalizeDate(order.date),
    region: normalizeRegion(order.region),
    product: normalizeProduct(order.product),
    length: normalizeLength(order.length),
    mill: type === 'buy' && typeof normalizeMillCompany === 'function'
      ? normalizeMillCompany(order.mill)
      : order.mill,
    customer: type === 'sell' && typeof normalizeCustomerName === 'function'
      ? normalizeCustomerName(order.customer)
      : order.customer,
    freight: normalizePrice(order.freight || 0),
    trader: typeof normalizeTrader === 'function' ? normalizeTrader(order.trader) : order.trader
  };
}

// Normalize quote item - call before saving
function normalizeQuoteItem(item) {
  if (!item) return item;
  return {
    ...item,
    product: normalizeProduct(item.product),
    length: normalizeLength(item.length),
    fob: normalizePrice(item.fob),
    landed: normalizePrice(item.landed),
    origin: item.origin ? normalizeLocation(item.origin).display : item.origin,
    volume: normalizeVolume(item.volume || 0)
  };
}

// Normalize mill quote (from pricing intake)
function normalizeMillQuote(q) {
  if (!q) return q;
  const millResult = typeof normalizeMillName === 'function'
    ? normalizeMillName(q.mill || q.mill_name)
    : { name: q.mill || q.mill_name };
  return {
    ...q,
    mill: millResult.name,
    mill_name: millResult.name,
    product: normalizeProduct(q.product),
    length: normalizeLength(q.length),
    price: normalizePrice(q.price),
    volume: normalizeVolume(q.volume || 0),
    tls: normalizeVolume(q.tls || 0),
    date: normalizeDate(q.date),
    region: normalizeRegion(q.region || millResult.state && MI_STATE_REGIONS?.[millResult.state.toUpperCase()]),
    ship_window: normalizeShipWindow(q.ship_window || q.ship)
  };
}

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

  const notCancelled=t=>t.status!=='cancelled';
  return{
    buys:S.buys.filter(b=>notCancelled(b)&&inR(b.date)&&mP(b.product)&&mR(b.region)&&isMyTrade(b.trader)),
    sells:S.sells.filter(s=>notCancelled(s)&&inR(s.date)&&mP(s.product)&&isMyTrade(s.trader))
  };
}

// Get ALL department data (for leaderboard, cross-trader linking)
function allData(){
  return{buys:S.buys,sells:S.sells};
}

// Get current trader's CRM only (Admin sees all), deduplicated by name
function dedupeByName(arr){const seen=new Set();return arr.filter(x=>{if(!x.name||seen.has(x.name))return false;seen.add(x.name);return true})}
function myMills(){
  if(S.trader==='Admin')return dedupeByName(S.mills);
  return dedupeByName(S.mills.filter(m=>m.trader===S.trader||!m.trader));
}
function myCustomers(){
  if(S.trader==='Admin')return dedupeByName(S.customers);
  return dedupeByName(S.customers.filter(c=>c.trader===S.trader||!c.trader));
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
  const colors={'Admin':'#e8734a','Ian P':'var(--accent)','Aubrey M':'#e8734a','Hunter S':'#6e9ecf','Sawyer R':'#a855f7','Jackson M':'#ec4899','John W':'#14b8a6'};
  return colors[t]||'var(--muted)';
}

// Get trader initials for badges
function traderInitial(t){
  if(t==='Admin')return '★';
  return t?t.split(' ').map(w=>w.charAt(0)).join('').toUpperCase():'?';
}

// Build sold-volume-per-order map. Pass a custom sells array to filter;
// defaults to S.sells when called with no arguments.
function buildOrderSold(sells){
  const orderSold={};
  (sells||S.sells).forEach(s=>{
    const ord=normalizeOrderNum(s.orderNum||s.linkedPO||s.oc);
    if(ord)orderSold[ord]=(orderSold[ord]||0)+(s.volume||0);
  });
  return orderSold;
}
