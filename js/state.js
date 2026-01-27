// SYP Analytics - State & Constants
const PRODUCTS=['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2','2x4#3','2x6#3','2x8#3'];
const REGIONS=['west','central','east'];
const DESTS=['Atlanta','Charlotte','Dallas','Memphis','Birmingham','Chicago','Houston','Nashville','Jacksonville','New Orleans'];
const MILLS=['Canfor - DeQuincy','Canfor - Urbana','West Fraser - Huttig','West Fraser - Leola','Interfor - Monticello','Interfor - Georgetown','GP - Clarendon','GP - Camden','Rex Lumber - Bristol','Rex Lumber - Graceville','Weyerhaeuser - Dierks','Tolko - Leland'];
const FREIGHT={west:{Atlanta:96,Charlotte:104,Dallas:40,Memphis:60,Birmingham:85,Chicago:110,Houston:55,Nashville:78},central:{Atlanta:83,Charlotte:91,Dallas:70,Memphis:50,Birmingham:60,Chicago:90,Houston:75,Nashville:55},east:{Atlanta:60,Charlotte:55,Dallas:120,Memphis:80,Birmingham:65,Chicago:84,Houston:115,Nashville:65}};
const NAV=[{id:'dashboard',icon:'📊',label:'Dashboard'},{id:'leaderboard',icon:'🏆',label:'Leaderboard'},{id:'insights',icon:'🎯',label:'Daily Briefing'},{id:'blotter',icon:'📋',label:'Trade Blotter'},{id:'benchmark',icon:'🎯',label:'vs Market'},{id:'risk',icon:'⚠️',label:'Risk'},{id:'quotes',icon:'💰',label:'Quote Engine'},{id:'products',icon:'📦',label:'By Product'},{id:'crm',icon:'🏢',label:'CRM'},{id:'rldata',icon:'📈',label:'RL Data'},{id:'settings',icon:'⚙️',label:'Settings'}];

// Nav groups for collapsible sidebar
const NAV_GROUPS=[
  {label:'Trading',items:['dashboard','leaderboard','blotter','quotes']},
  {label:'Relationships',items:['crm','products']},
  {label:'Analytics',items:['insights','benchmark','risk','rldata']},
  {label:'System',items:['settings']}
];

const LS=(k,d)=>{try{const v=localStorage.getItem('syp_'+k);return v?JSON.parse(v):d}catch{return d}};
const SS=(k,v)=>{try{localStorage.setItem('syp_'+k,JSON.stringify(v))}catch{}};

// Traders in department
const TRADERS=['Ian','Aubrey','Hunter','Sawyer','Jackson','John'];
const ALL_LOGINS=['Admin',...TRADERS]; // Admin + all traders for login

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
  trader:LS('trader','Ian'),
  // Leaderboard & Goals
  leaderboardPeriod:LS('leaderboardPeriod','30d'),
  traderGoals:LS('traderGoals',{}),
  achievements:LS('achievements',[]),
  crmViewMode:LS('crmViewMode','table'),
  sidebarCollapsed:LS('sidebarCollapsed',false)
};

const fmt=(v,d=0)=>v!=null&&!isNaN(v)?`$${Number(v).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d})}`:'—';
const fmtPct=v=>v!=null&&!isNaN(v)?`${v>=0?'+':''}${Number(v).toFixed(1)}%`:'—';
const fmtD=d=>d?new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—';
const today=()=>new Date().toISOString().split('T')[0];
const genId=()=>{const id=S.nextId++;SS('nextId',S.nextId);return id};


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
