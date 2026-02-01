// SYP Mill Intelligence - State & Constants
const PRODUCTS=['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2','2x4#3','2x6#3','2x8#3'];
const REGIONS=['west','central','east'];
const TRADERS=['Ian P','Aubrey M','Hunter S','Sawyer R','Jackson M','John W'];
const MILLS=[
  // Canfor Southern Pine (10 SPIB locations)
  'Canfor - DeQuincy','Canfor - Urbana','Canfor - Fulton','Canfor - Axis','Canfor - El Dorado',
  'Canfor - Thomasville','Canfor - Moultrie','Canfor - DeRidder','Canfor - Camden SC','Canfor - Conway',
  // West Fraser (9+ locations)
  'West Fraser - Huttig','West Fraser - Leola','West Fraser - Opelika','West Fraser - Russellville',
  'West Fraser - Blackshear','West Fraser - Dudley','West Fraser - Fitzgerald',
  'West Fraser - New Boston','West Fraser - Henderson','West Fraser - Lufkin','West Fraser - Joyce',
  // Interfor (10 locations)
  'Interfor - Monticello','Interfor - Georgetown','Interfor - Fayette','Interfor - DeQuincy',
  'Interfor - Preston','Interfor - Perry','Interfor - Baxley','Interfor - Swainsboro',
  'Interfor - Thomaston','Interfor - Eatonton',
  // Georgia-Pacific (12 locations)
  'GP - Clarendon','GP - Camden','GP - Talladega','GP - Frisco City','GP - Gurdon',
  'GP - Albany','GP - Warrenton','GP - Taylorsville','GP - Dudley NC',
  'GP - Diboll','GP - Pineland','GP - Prosperity',
  // Weyerhaeuser (9 locations)
  'Weyerhaeuser - Dierks','Weyerhaeuser - Millport','Weyerhaeuser - Dodson','Weyerhaeuser - Holden',
  'Weyerhaeuser - Philadelphia','Weyerhaeuser - Bruce','Weyerhaeuser - Magnolia',
  'Weyerhaeuser - Grifton','Weyerhaeuser - Plymouth',
  // Rex Lumber (4 locations)
  'Rex Lumber - Bristol','Rex Lumber - Graceville','Rex Lumber - Troy','Rex Lumber - Brookhaven',
  // PotlatchDeltic (3 locations)
  'PotlatchDeltic - Ola','PotlatchDeltic - Waldo','PotlatchDeltic - Warren',
  // Other major mills
  'Tolko - Leland','Idaho Forest Group - Lumberton','Hunt Forest Products - Winnfield',
  'Biewer - Newton','Biewer - Winona','Anthony Timberlands - Bearden','Anthony Timberlands - Malvern',
  'Lumberton Lumber','Harrigan Lumber','T.R. Miller - Brewton',
  'Lincoln Lumber - Jasper','Lincoln Lumber - Conroe',
];
const PPU={'2x4':208,'2x6':128,'2x8':96,'2x10':80,'2x12':64,'2x3':294,'2x14':52,'1x4':416,'1x6':256,'1x8':192,'1x10':160,'1x12':128,'4x4':64,'4x6':42,'6x6':24};

const NAV=[
  {id:'intake',icon:'📥',label:'Intake'},
  {id:'aggregated',icon:'📊',label:'All Prices'},
  {id:'map',icon:'🗺️',label:'Mill Map'},
  {id:'intel',icon:'🧠',label:'Intelligence'},
  {id:'quotes',icon:'💰',label:'Smart Quotes'},
  {id:'settings',icon:'⚙️',label:'Settings'}
];

const LS=(k,d)=>{try{const v=localStorage.getItem('mi_'+k);return v?JSON.parse(v):d}catch{return d}};
const SS=(k,v)=>{try{localStorage.setItem('mi_'+k,JSON.stringify(v))}catch{}};

const STATE_RATES={AR:2.25,LA:2.25,TX:2.50,MS:2.25,AL:2.50,FL:2.75,GA:2.50,SC:2.50,NC:2.50,TN:2.25,KY:2.25,VA:2.50,OH:2.50,IN:2.50,IL:2.50,MO:2.25,WI:2.50,MI:2.50,MN:2.50,IA:2.50};

let S={
  view:LS('view','intake'),
  trader:LS('trader','Ian P'),
  apiKey:LS('apiKey',''),
  sidebarCollapsed:LS('sidebarCollapsed',false),
  // Freight config
  stateRates:LS('stateRates',STATE_RATES),
  freightBase:LS('freightBase',450),
  shortHaulFloor:LS('shortHaulFloor',0),
  quoteMBFperTL:LS('quoteMBFperTL',23),
  // Filters
  filterProduct:'',
  filterMill:'',
  filterTrader:'',
  filterDays:7,
  // Map state
  mapProduct:'',
  // Quote builder
  quoteCustomer:'',
  quoteItems:[]
};

const fmt=(v,d=0)=>v!=null&&!isNaN(v)?`$${Number(v).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d})}`:'—';
const fmtN=v=>v!=null&&!isNaN(v)?parseFloat(Number(v).toFixed(2)):'—';
const today=()=>new Date().toISOString().split('T')[0];
const genId=()=>Date.now()%1e10*1e4+Math.floor(Math.random()*1e4);
