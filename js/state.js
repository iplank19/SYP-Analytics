// SYP Analytics - State & Constants
const PRODUCTS=['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2','2x4#3','2x6#3','2x8#3'];
const REGIONS=['west','central','east'];
const DESTS=['Atlanta','Charlotte','Dallas','Memphis','Birmingham','Chicago','Houston','Nashville','Jacksonville','New Orleans'];
const MILLS=['Canfor - DeQuincy','Canfor - Urbana','West Fraser - Huttig','West Fraser - Leola','Interfor - Monticello','Interfor - Georgetown','GP - Clarendon','GP - Camden','Rex Lumber - Bristol','Rex Lumber - Graceville','Weyerhaeuser - Dierks','Tolko - Leland'];
const FREIGHT={west:{Atlanta:96,Charlotte:104,Dallas:40,Memphis:60,Birmingham:85,Chicago:110,Houston:55,Nashville:78},central:{Atlanta:83,Charlotte:91,Dallas:70,Memphis:50,Birmingham:60,Chicago:90,Houston:75,Nashville:55},east:{Atlanta:60,Charlotte:55,Dallas:120,Memphis:80,Birmingham:65,Chicago:84,Houston:115,Nashville:65}};
const NAV=[{id:'dashboard',icon:'📊',label:'Dashboard'},{id:'leaderboard',icon:'🏆',label:'Leaderboard'},{id:'insights',icon:'🎯',label:'Daily Briefing'},{id:'blotter',icon:'📋',label:'Trade Blotter'},{id:'pnl-calendar',icon:'📅',label:'P&L Calendar'},{id:'benchmark',icon:'🎯',label:'vs Market'},{id:'risk',icon:'⚠️',label:'Risk'},{id:'quotes',icon:'💰',label:'Quote Engine'},{id:'mill-pricing',icon:'🏭',label:'Mill Pricing'},{id:'products',icon:'📦',label:'By Product'},{id:'crm',icon:'🏢',label:'CRM'},{id:'rldata',icon:'📈',label:'RL Data'},{id:'settings',icon:'⚙️',label:'Settings'}];

// Nav groups for collapsible sidebar
const NAV_GROUPS=[
  {label:'Trading',items:['dashboard','leaderboard','blotter','pnl-calendar','quotes','mill-pricing']},
  {label:'Relationships',items:['crm','products']},
  {label:'Analytics',items:['insights','benchmark','risk','rldata']},
  {label:'System',items:['settings']}
];

const LS=(k,d)=>{try{const v=localStorage.getItem('syp_'+k);return v?JSON.parse(v):d}catch{return d}};
const SS=(k,v)=>{try{localStorage.setItem('syp_'+k,JSON.stringify(v))}catch{}};

// Traders in department
const TRADERS=['Ian P','Aubrey M','Hunter S','Sawyer R','Jackson M','John W'];
const ALL_LOGINS=['Admin',...TRADERS]; // Admin + all traders for login
// CSV full names → trader profiles. John Edwards is NOT John W — his trades go to Admin.
const TRADER_MAP={'Ian Plank':'Ian P','Aubrey Milligan':'Aubrey M','Sawyer Rapp':'Sawyer R','Jackson McCormick':'Jackson M','Hunter Sweet':'Hunter S'};
// Legacy first-name-only → new format (for migrating old data)
const LEGACY_TRADER={'Ian':'Ian P','Aubrey':'Aubrey M','Hunter':'Hunter S','Sawyer':'Sawyer R','Jackson':'Jackson M'};
// Normalize any trader value to current format
function normalizeTrader(t){if(!t)return t;if(TRADERS.includes(t)||t==='Admin')return t;return LEGACY_TRADER[t]||TRADER_MAP[t]||null;}

let S={
  view:'dashboard',
  filters:{date:'30d',prod:'all',reg:'all'},
  buys:LS('buys',[]),
  sells:LS('sells',[]),
  rl:LS('rl',[]),
  customers:LS('customers',[]),
  mills:LS('mills',[]),
  nextId:LS('nextId',1),
  apiKey:LS('apiKey',''),
  aiMsgs:LS('aiMsgs',[]),
  aiPanelOpen:LS('aiPanelOpen',false),
  flatRate:LS('flatRate',3.50),
  autoSync:LS('autoSync',false),
  lanes:LS('lanes',[]),
  quoteItems:LS('quoteItems',[]),
  quoteMode:'known',
  quoteMBFperTL:23,
  quoteMSRFootage:false,
  stateRates:LS('stateRates',{AR:2.25,LA:2.25,TX:2.50,MS:2.25,AL:2.50,FL:2.75,GA:2.50,SC:2.50,NC:2.50}),
  quoteProfiles:LS('quoteProfiles',{default:{name:'Default',customers:[]}}),
  quoteProfile:LS('quoteProfile','default'),
  marketBlurb:LS('marketBlurb',''),
  shortHaulFloor:LS('shortHaulFloor',0),
  freightBase:LS('freightBase',450),
  singleQuoteCustomer:'',
  chartProduct:'2x4#2',
  trader:LS('trader','Ian P'),
  // Leaderboard & Goals
  leaderboardPeriod:LS('leaderboardPeriod','30d'),
  traderGoals:LS('traderGoals',{}),
  achievements:LS('achievements',[]),
  crmViewMode:LS('crmViewMode','table'),
  sidebarCollapsed:LS('sidebarCollapsed',false),
  // Futures
  futuresContracts:LS('futuresContracts',[]),
  frontHistory:LS('frontHistory',[]),
  futuresParams:LS('futuresParams',{basisLookback:8,zScoreSellThreshold:-1.5,zScoreBuyThreshold:1.5,defaultHoldWeeks:2,commissionPerContract:1.50}),
  dashChartRange:LS('dashChartRange','1M'),
  dashboardOrder:LS('dashboardOrder',null),
  futuresTab:'chart',
  calendarMonth:null,
  aiModel:LS('aiModel','claude-opus-4-20250514'),
  // Pieces Per Unit (PPU) - configurable per product dimension
  ppu:LS('ppu',{
    '2x4':208,'2x6':128,'2x8':96,'2x10':80,'2x12':64,
    '2x3':294,'2x14':52,
    '1x4':416,'1x6':256,'1x8':192,'1x10':160,'1x12':128,
    '4x4':64,'4x6':42,'6x6':24
  }),
  // MBF per Truckload by product type
  mbfPerTL:LS('mbfPerTL',{standard:23,msr:20,timber:20}),
  // Use units as primary input (vs raw volume)
  unitsMode:LS('unitsMode',true),
  // Mill Pricing intake
  millQuotes:LS('millQuotes',[]),
  millPricingTab:'intake'
};

// Migrate bad model IDs
if(S.aiModel==='claude-opus-4-0-20250115'||S.aiModel==='claude-opus-4-0-20250514'){S.aiModel='claude-opus-4-20250514';SS('aiModel',S.aiModel);}

// Migrate old carry-based futures params to new trader model
if(S.futuresParams.carryRate!==undefined){
  S.futuresParams={basisLookback:8,zScoreSellThreshold:-1.5,zScoreBuyThreshold:1.5,defaultHoldWeeks:2,commissionPerContract:1.50};
  SS('futuresParams',S.futuresParams);
}

// Historical basis at RL dates: pair each RL print with nearest futures close
function getHistoricalBasis(lookback){
  const recentRL=S.rl.filter(r=>r.east&&r.east['2x4#2']).slice(-lookback);
  if(!recentRL.length)return[];
  const history=getFrontHistory();
  const frontFut=S.futuresContracts&&S.futuresContracts.length?S.futuresContracts[0]:null;
  const fallbackPrice=frontFut?frontFut.price:0;
  return recentRL.map(r=>{
    const cash=r.east['2x4#2'];
    const rlTime=new Date(r.date+'T00:00:00').getTime();
    let futPrice=fallbackPrice;
    if(history.length){
      let closest=history[0],minDiff=Math.abs(rlTime-closest.timestamp*1000);
      for(let i=1;i<history.length;i++){
        const diff=Math.abs(rlTime-history[i].timestamp*1000);
        if(diff<minDiff){closest=history[i];minDiff=diff;}
      }
      futPrice=closest.close;
    }
    return{date:r.date,cash,futPrice,basis:cash-futPrice};
  });
}

// Get front-month daily history (OHLCV) — works without RL data
function getFrontHistory(){
  // Prefer persisted frontHistory (continuous front month from SYP=F)
  let history=S.frontHistory&&S.frontHistory.length?S.frontHistory:null;
  // Fallback to first contract's history
  if(!history){
    const frontFut=S.futuresContracts&&S.futuresContracts.length?S.futuresContracts[0]:null;
    history=frontFut&&frontFut.history&&frontFut.history.length?frontFut.history:null;
  }
  // Also check in-memory liveFutures
  if(!history&&S.liveFutures&&S.liveFutures.front&&S.liveFutures.front.history){
    history=S.liveFutures.front.history;
  }
  if(!history||!history.length)return[];
  return history.slice().sort((a,b)=>a.timestamp-b.timestamp);
}

// Daily-resolution basis: every futures trading day with last-known cash carried forward
// Returns data even without RL — basis/cash will be null if no RL overlap
function getDailyBasis(){
  const history=getFrontHistory();
  if(!history.length)return[];
  // Build sorted RL cash timeline
  const rlEntries=S.rl.filter(r=>r.east&&r.east['2x4#2']).map(r=>({
    time:new Date(r.date+'T00:00:00').getTime(),cash:r.east['2x4#2'],date:r.date
  })).sort((a,b)=>a.time-b.time);
  return history.map(h=>{
    const t=h.timestamp*1000;
    const d=new Date(t);
    const dateStr=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    // Carry forward: most recent RL at or before this trading day (+1 day tolerance)
    let cash=null;
    for(let ri=rlEntries.length-1;ri>=0;ri--){
      if(rlEntries[ri].time<=t+86400000){cash=rlEntries[ri].cash;break;}
    }
    const basis=cash!==null?cash-h.close:null;
    return{date:dateStr,cash,futPrice:h.close,open:h.open||null,high:h.high||null,low:h.low||null,volume:h.volume||null,basis};
  });
}

const fmt=(v,d=0)=>v!=null&&!isNaN(v)?`$${Number(v).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d})}`:'—';
const fmtN=v=>v!=null&&!isNaN(v)?parseFloat(Number(v).toFixed(2)):'—';// max 2 decimals, no trailing zeros
const fmtPct=v=>v!=null&&!isNaN(v)?`${v>=0?'+':''}${Number(v).toFixed(1)}%`:'—';
const fmtD=d=>d?new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—';
const today=()=>new Date().toISOString().split('T')[0];

// Migrate legacy first-name trader values to new "First L" format
// Called on load and after each loadAllLocal()/cloud sync
function migrateTraderNames(){
  let changed=false;
  // Migrate current login
  const nt=normalizeTrader(S.trader);
  if(nt&&nt!==S.trader){S.trader=nt;SS('trader',nt);changed=true;}
  // Migrate trade data
  S.buys.forEach(b=>{const n=normalizeTrader(b.trader);if(n&&n!==b.trader){b.trader=n;changed=true;}});
  S.sells.forEach(s=>{const n=normalizeTrader(s.trader);if(n&&n!==s.trader){s.trader=n;changed=true;}});
  S.mills.forEach(m=>{const n=normalizeTrader(m.trader);if(n&&n!==m.trader){m.trader=n;changed=true;}});
  S.customers.forEach(c=>{const n=normalizeTrader(c.trader);if(n&&n!==c.trader){c.trader=n;changed=true;}});
  if(changed){SS('buys',S.buys);SS('sells',S.sells);SS('mills',S.mills);SS('customers',S.customers);}
}
migrateTraderNames();
const genId=()=>{
  // Timestamp-based + random suffix for cross-device uniqueness
  // Returns a large integer that won't collide across devices
  const ts=Date.now()%1e10;// last 10 digits of epoch ms
  const rnd=Math.floor(Math.random()*1e4);// 4 random digits
  return ts*1e4+rnd;
};


// Achievement definitions
const ACHIEVEMENTS=[
  {id:'first_trade',name:'First Trade',icon:'🎯',desc:'Complete your first trade',check:s=>s.trades>=1},
  {id:'vol_100',name:'Century Club',icon:'💯',desc:'Trade 100 MBF total volume',check:s=>s.totalVol>=100},
  {id:'vol_500',name:'High Roller',icon:'🎰',desc:'Trade 500 MBF total volume',check:s=>s.totalVol>=500},
  {id:'vol_1000',name:'Volume King',icon:'👑',desc:'Trade 1,000 MBF total volume',check:s=>s.totalVol>=1000},
  {id:'profit_10k',name:'Money Maker',icon:'💰',desc:'Earn $10,000 profit',check:s=>s.profit>=10000},
  {id:'profit_50k',name:'Big Earner',icon:'💎',desc:'Earn $50,000 profit',check:s=>s.profit>=50000},
  {id:'profit_100k',name:'Six Figures',icon:'🏆',desc:'Earn $100,000 profit',check:s=>s.profit>=100000},
  {id:'margin_50',name:'Margin Master',icon:'📈',desc:'Achieve $50+/MBF margin',check:s=>s.margin>=50},
  {id:'margin_100',name:'Margin Legend',icon:'🌟',desc:'Achieve $100+/MBF margin',check:s=>s.margin>=100},
  {id:'win_80',name:'Sharp Shooter',icon:'🎯',desc:'80%+ win rate (min 10 sells)',check:s=>s.winRate>=80&&s.sells>=10},
  {id:'win_90',name:'Sniper',icon:'🔫',desc:'90%+ win rate (min 10 sells)',check:s=>s.winRate>=90&&s.sells>=10},
  {id:'customers_5',name:'Networker',icon:'🤝',desc:'Sell to 5 different customers',check:s=>s.customerCount>=5},
  {id:'customers_10',name:'Rainmaker',icon:'🌧️',desc:'Sell to 10 different customers',check:s=>s.customerCount>=10},
  {id:'trades_50',name:'Active Trader',icon:'⚡',desc:'Complete 50 trades',check:s=>s.trades>=50},
  {id:'trades_100',name:'Trading Machine',icon:'🤖',desc:'Complete 100 trades',check:s=>s.trades>=100},
  {id:'best_5k',name:'Big Fish',icon:'🐟',desc:'Single trade with $5,000+ profit',check:s=>s.bestProfit>=5000},
  {id:'best_10k',name:'Whale Hunter',icon:'🐋',desc:'Single trade with $10,000+ profit',check:s=>s.bestProfit>=10000}
];

function checkAchievements(traderName,stats){
  const earned=[];
  const existing=S.achievements.filter(a=>a.trader===traderName);
  ACHIEVEMENTS.forEach(ach=>{
    if(ach.check(stats)&&!existing.find(e=>e.id===ach.id)){
      earned.push({...ach,trader:traderName,earnedAt:new Date().toISOString()});
    }
  });
  if(earned.length>0){
    S.achievements=[...S.achievements,...earned];
    SS('achievements',S.achievements);
  }
  return[...existing,...earned];
}
