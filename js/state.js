// SYP Analytics - State & Constants
const PRODUCTS=['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2','2x4#3','2x6#3','2x8#3'];

// Full product list for Mill Intel quoting matrix (includes #1, MSR, #4)
const MI_PRODUCTS=[
  '2x4#1','2x6#1','2x8#1','2x10#1','2x12#1',
  '2x4#2','2x6#2','2x8#2','2x10#2','2x12#2',
  '2x4#3','2x6#3','2x8#3','2x10#3','2x12#3',
  '2x4#4','2x6#4','2x8#4','2x10#4','2x12#4',
  '2x4 MSR','2x6 MSR','2x8 MSR','2x10 MSR','2x12 MSR',
];

const PRODUCT_GROUPS={
  'All':MI_PRODUCTS,
  '#1':MI_PRODUCTS.filter(p=>p.includes('#1')),
  '#2':MI_PRODUCTS.filter(p=>p.includes('#2')),
  '#3':MI_PRODUCTS.filter(p=>p.includes('#3')),
  '#4':MI_PRODUCTS.filter(p=>p.includes('#4')),
  'MSR':MI_PRODUCTS.filter(p=>p.includes('MSR')),
  'Studs':['2x4#1','2x6#1','2x4#2','2x6#2','2x4#3','2x6#3','2x4#4','2x6#4','2x4 MSR','2x6 MSR'],
  'Wides':['2x8#1','2x10#1','2x12#1','2x8#2','2x10#2','2x12#2','2x8#3','2x10#3','2x12#3','2x8#4','2x10#4','2x12#4','2x8 MSR','2x10 MSR','2x12 MSR'],
};

// Derive products a customer has historically purchased from sell orders
function getCustomerProducts(customerName){
  if(!customerName||!S.sells)return[];
  const products=new Set();
  S.sells.filter(s=>s.customer===customerName&&s.status!=='cancelled').forEach(s=>{
    const prods=s.product&&s.product.includes('/')?s.product.split('/').map(p=>p.trim()):[s.product];
    prods.forEach(p=>{
      if(!p)return;
      const base=p.replace(/\s+\d+['"]?$/,'').trim();
      if(base)products.add(base);
    });
  });
  return[...products].sort();
}

const QUOTE_LENGTHS=['8','10','12','14','16','18','20','RL'];

// Derive product+length combos a customer has historically purchased
function getCustomerProductLengths(customerName){
  if(!customerName||!S.sells)return[];
  const combos=new Set();
  S.sells.filter(s=>s.customer===customerName&&s.status!=='cancelled').forEach(s=>{
    const prods=s.product&&s.product.includes('/')?s.product.split('/').map(p=>p.trim()):[s.product];
    prods.forEach(p=>{
      if(!p)return;
      const lenMatch=p.match(/\s+(\d+)['"]?$/);
      const base=p.replace(/\s+\d+['"]?$/,'').trim();
      if(base)combos.add(lenMatch?`${base}|${lenMatch[1]}`:`${base}|RL`);
    });
  });
  return[...combos].map(c=>{const[product,length]=c.split('|');return{product,length};});
}

// Built-in quote matrix templates
const QUOTE_TEMPLATES={
  'All RL':{desc:'All products, RL only',build:()=>{
    const g={};MI_PRODUCTS.forEach(p=>{g[p]={};QUOTE_LENGTHS.forEach(l=>{g[p][l]=l==='RL';});});return g;
  }},
  '#2 RL':{desc:'#2 grade, RL only',build:()=>{
    const g={};MI_PRODUCTS.forEach(p=>{g[p]={};QUOTE_LENGTHS.forEach(l=>{g[p][l]=p.includes('#2')&&l==='RL';});});return g;
  }},
  'Studs RL':{desc:'2x4 & 2x6 all grades, RL only',build:()=>{
    const g={};MI_PRODUCTS.forEach(p=>{g[p]={};QUOTE_LENGTHS.forEach(l=>{g[p][l]=(p.startsWith('2x4')||p.startsWith('2x6'))&&l==='RL';});});return g;
  }},
  'Wides':{desc:'2x8-2x12 all grades, 10\'-20\'',build:()=>{
    const lens=['10','12','14','16','18','20'];
    const g={};MI_PRODUCTS.forEach(p=>{g[p]={};QUOTE_LENGTHS.forEach(l=>{g[p][l]=(p.startsWith('2x8')||p.startsWith('2x10')||p.startsWith('2x12'))&&lens.includes(l);});});return g;
  }},
  'Full Grid':{desc:'Everything checked',build:()=>{
    const g={};MI_PRODUCTS.forEach(p=>{g[p]={};QUOTE_LENGTHS.forEach(l=>{g[p][l]=true;});});return g;
  }}
};

const REGIONS=['west','central','east'];
const DESTS=['Atlanta','Charlotte','Dallas','Memphis','Birmingham','Chicago','Houston','Nashville','Jacksonville','New Orleans'];
const MILLS=[
  'Canfor - DeQuincy','Canfor - Urbana','Canfor - Fulton','Canfor - Axis','Canfor - El Dorado',
  'Canfor - Thomasville','Canfor - Moultrie','Canfor - DeRidder','Canfor - Camden SC','Canfor - Conway',
  'West Fraser - Huttig','West Fraser - Leola','West Fraser - Opelika','West Fraser - Russellville',
  'West Fraser - Blackshear','West Fraser - Dudley','West Fraser - Fitzgerald',
  'West Fraser - New Boston','West Fraser - Henderson','West Fraser - Lufkin','West Fraser - Joyce',
  'Interfor - Monticello','Interfor - Georgetown','Interfor - Fayette','Interfor - DeQuincy',
  'Interfor - Preston','Interfor - Perry','Interfor - Baxley','Interfor - Swainsboro',
  'Interfor - Thomaston','Interfor - Eatonton',
  'GP - Clarendon','GP - Camden','GP - Talladega','GP - Frisco City','GP - Gurdon',
  'GP - Albany','GP - Warrenton','GP - Taylorsville','GP - Dudley NC',
  'GP - Diboll','GP - Pineland','GP - Prosperity',
  'Weyerhaeuser - Dierks','Weyerhaeuser - Millport','Weyerhaeuser - Dodson','Weyerhaeuser - Holden',
  'Weyerhaeuser - Philadelphia','Weyerhaeuser - Bruce','Weyerhaeuser - Magnolia',
  'Weyerhaeuser - Grifton','Weyerhaeuser - Plymouth',
  'Rex Lumber - Bristol','Rex Lumber - Graceville','Rex Lumber - Troy','Rex Lumber - Brookhaven',
  'PotlatchDeltic - Ola','PotlatchDeltic - Waldo','PotlatchDeltic - Warren',
  'Tolko - Leland','Idaho Forest Group - Lumberton','Hunt Forest Products - Winnfield',
  'Biewer - Newton','Biewer - Winona','Anthony Timberlands - Bearden','Anthony Timberlands - Malvern',
  'Lumberton Lumber','Harrigan Lumber','T.R. Miller - Brewton',
  'Lincoln Lumber - Jasper','Lincoln Lumber - Conroe'
];
const FREIGHT={west:{Atlanta:96,Charlotte:104,Dallas:40,Memphis:60,Birmingham:85,Chicago:110,Houston:55,Nashville:78},central:{Atlanta:83,Charlotte:91,Dallas:70,Memphis:50,Birmingham:60,Chicago:90,Houston:75,Nashville:55},east:{Atlanta:60,Charlotte:55,Dallas:120,Memphis:80,Birmingham:65,Chicago:84,Houston:115,Nashville:65}};

// SPIB-sourced mill directory: canonical name → { city, state }
// Used for mill name normalization during intake
const MILL_DIRECTORY={
  // Canfor Southern Pine (SPIB IDs: 025,123,130,143,143f,144,145,205,426,446,674)
  'Canfor - DeQuincy':{city:'DeQuincy',state:'LA'},'Canfor - Urbana':{city:'Urbana',state:'AR'},
  'Canfor - Fulton':{city:'Fulton',state:'AL'},'Canfor - Axis':{city:'Axis',state:'AL'},
  'Canfor - El Dorado':{city:'El Dorado',state:'AR'},'Canfor - Thomasville':{city:'Thomasville',state:'GA'},
  'Canfor - Moultrie':{city:'Moultrie',state:'GA'},'Canfor - DeRidder':{city:'Deridder',state:'LA'},
  'Canfor - Camden SC':{city:'Camden',state:'SC'},'Canfor - Conway':{city:'Conway',state:'SC'},
  'Canfor - Marion':{city:'Marion',state:'SC'},'Canfor - Graham':{city:'Graham',state:'NC'},
  // West Fraser (SPIB IDs: 24,285,33,700,711,720,857,861,95)
  'West Fraser - Huttig':{city:'Huttig',state:'AR'},'West Fraser - Leola':{city:'Leola',state:'AR'},
  'West Fraser - Opelika':{city:'Opelika',state:'AL'},'West Fraser - Russellville':{city:'Russellville',state:'AR'},
  'West Fraser - Blackshear':{city:'Blackshear',state:'GA'},'West Fraser - Dudley':{city:'Dudley',state:'GA'},
  'West Fraser - Fitzgerald':{city:'Fitzgerald',state:'GA'},'West Fraser - New Boston':{city:'New Boston',state:'TX'},
  'West Fraser - Henderson':{city:'Henderson',state:'TX'},'West Fraser - Lufkin':{city:'Lufkin',state:'TX'},
  'West Fraser - Joyce':{city:'Joyce',state:'LA'},
  // Georgia-Pacific (SPIB IDs: 14,18,20,77,77p,77r,125,140,210,425,522,860)
  'GP - Clarendon':{city:'Clarendon',state:'NC'},'GP - Camden':{city:'Camden',state:'TX'},
  'GP - Talladega':{city:'Talladega',state:'AL'},'GP - Frisco City':{city:'Frisco City',state:'AL'},
  'GP - Gurdon':{city:'Gurdon',state:'AR'},'GP - Albany':{city:'Albany',state:'GA'},
  'GP - Warrenton':{city:'Warrenton',state:'GA'},'GP - Taylorsville':{city:'Taylorsville',state:'MS'},
  'GP - Dudley NC':{city:'Dudley',state:'NC'},'GP - Diboll':{city:'Diboll',state:'TX'},
  'GP - Pineland':{city:'Pineland',state:'TX'},'GP - Prosperity':{city:'Prosperity',state:'SC'},
  'GP - Rome':{city:'Rome',state:'GA'},
  // Weyerhaeuser (SPIB IDs: 62,63,72,128,163,277,400,403,490,2001)
  'Weyerhaeuser - Dierks':{city:'Dierks',state:'AR'},'Weyerhaeuser - Millport':{city:'Millport',state:'AL'},
  'Weyerhaeuser - Dodson':{city:'Dodson',state:'LA'},'Weyerhaeuser - Holden':{city:'Holden',state:'LA'},
  'Weyerhaeuser - Philadelphia':{city:'Philadelphia',state:'MS'},'Weyerhaeuser - Bruce':{city:'Bruce',state:'MS'},
  'Weyerhaeuser - Magnolia':{city:'Magnolia',state:'MS'},'Weyerhaeuser - Grifton':{city:'Grifton',state:'NC'},
  'Weyerhaeuser - Plymouth':{city:'Plymouth',state:'NC'},'Weyerhaeuser - Idabel':{city:'Idabel',state:'OK'},
  // Interfor
  'Interfor - Monticello':{city:'Monticello',state:'AR'},'Interfor - Georgetown':{city:'Georgetown',state:'SC'},
  'Interfor - Fayette':{city:'Fayette',state:'AL'},'Interfor - DeQuincy':{city:'DeQuincy',state:'LA'},
  'Interfor - Preston':{city:'Preston',state:'GA'},'Interfor - Perry':{city:'Perry',state:'GA'},
  'Interfor - Baxley':{city:'Baxley',state:'GA'},'Interfor - Swainsboro':{city:'Swainsboro',state:'GA'},
  'Interfor - Thomaston':{city:'Thomaston',state:'GA'},'Interfor - Eatonton':{city:'Eatonton',state:'GA'},
  // PotlatchDeltic (SPIB IDs: 146,404,434)
  'PotlatchDeltic - Warren':{city:'Warren',state:'AR'},'PotlatchDeltic - Ola':{city:'Ola',state:'AR'},
  'PotlatchDeltic - Waldo':{city:'Waldo',state:'AR'},
  // Rex Lumber
  'Rex Lumber - Bristol':{city:'Bristol',state:'FL'},'Rex Lumber - Graceville':{city:'Graceville',state:'FL'},
  'Rex Lumber - Troy':{city:'Troy',state:'AL'},'Rex Lumber - Brookhaven':{city:'Brookhaven',state:'MS'},
  // Others
  'Tolko - Leland':{city:'Leland',state:'MS'},
  'Idaho Forest Group - Lumberton':{city:'Lumberton',state:'MS'},
  'Hunt Forest Products - Winnfield':{city:'Winnfield',state:'LA'},
  'Biewer - Newton':{city:'Newton',state:'MS'},'Biewer - Winona':{city:'Winona',state:'MS'},
  'Anthony Timberlands - Bearden':{city:'Bearden',state:'AR'},'Anthony Timberlands - Malvern':{city:'Malvern',state:'AR'},
  'T.R. Miller - Brewton':{city:'Brewton',state:'AL'},
  'Lincoln Lumber - Jasper':{city:'Jasper',state:'TX'},'Lincoln Lumber - Conroe':{city:'Conroe',state:'TX'},
  'Barge Forest Products - Macon':{city:'Macon',state:'MS'},
  'Scotch Lumber - Fulton':{city:'Fulton',state:'AL'},
  'Klausner Lumber - Live Oak':{city:'Live Oak',state:'FL'},
  'Hood Industries - Beaumont':{city:'Beaumont',state:'MS'},'Hood Industries - Waynesboro':{city:'Waynesboro',state:'MS'},
  'Mid-South Lumber - Booneville':{city:'Booneville',state:'MS'},
  'Murray Lumber - Murray':{city:'Murray',state:'KY'},
  'Langdale Forest Products - Valdosta':{city:'Valdosta',state:'GA'},
  'LaSalle Lumber - Urania':{city:'Urania',state:'LA'},
  'Big River Forest Products - Gloster':{city:'Gloster',state:'MS'},
  'Hankins Lumber - Grenada':{city:'Grenada',state:'MS'},
  'Westervelt Lumber - Moundville':{city:'Moundville',state:'AL'},'Westervelt Lumber - Tuscaloosa':{city:'Tuscaloosa',state:'AL'}
};

// Company alias mapping for normalization: alternate names → canonical company prefix
const _MILL_COMPANY_ALIASES={
  'canfor':'Canfor','canfor southern pine':'Canfor','csp':'Canfor',
  'west fraser':'West Fraser','wf':'West Fraser',
  'georgia-pacific':'GP','georgia pacific':'GP','gp':'GP',
  'weyerhaeuser':'Weyerhaeuser','wey':'Weyerhaeuser','weyer':'Weyerhaeuser',
  'interfor':'Interfor',
  'potlatchdeltic':'PotlatchDeltic','potlatch':'PotlatchDeltic','potlatch deltic':'PotlatchDeltic','pld':'PotlatchDeltic','pd':'PotlatchDeltic',
  'rex':'Rex Lumber','rex lumber':'Rex Lumber',
  'tolko':'Tolko',
  'idaho forest group':'Idaho Forest Group','ifg':'Idaho Forest Group','idaho forest':'Idaho Forest Group',
  'hunt':'Hunt Forest Products','hunt forest':'Hunt Forest Products','hunt forest products':'Hunt Forest Products',
  'biewer':'Biewer','biewer lumber':'Biewer',
  'anthony':'Anthony Timberlands','anthony timberlands':'Anthony Timberlands',
  'tr miller':'T.R. Miller','t.r. miller':'T.R. Miller','t r miller':'T.R. Miller',
  'lincoln':'Lincoln Lumber','lincoln lumber':'Lincoln Lumber',
  'barge':'Barge Forest Products','barge forest':'Barge Forest Products',
  'scotch':'Scotch Lumber','scotch lumber':'Scotch Lumber',
  'klausner':'Klausner Lumber','klausner lumber':'Klausner Lumber',
  'hood':'Hood Industries','hood industries':'Hood Industries',
  'mid south':'Mid-South Lumber','mid-south':'Mid-South Lumber','mid south lumber':'Mid-South Lumber','mid south lumber company':'Mid-South Lumber','midsouth':'Mid-South Lumber','midsouth lumber':'Mid-South Lumber',
  'murray':'Murray Lumber','murray lumber':'Murray Lumber',
  'langdale':'Langdale Forest Products','langdale forest':'Langdale Forest Products',
  'lasalle':'LaSalle Lumber','lasalle lumber':'LaSalle Lumber',
  'big river':'Big River Forest Products','big river forest':'Big River Forest Products',
  'hankins':'Hankins Lumber','hankins lumber':'Hankins Lumber',
  'westervelt':'Westervelt Lumber','westervelt lumber':'Westervelt Lumber'
};

// Derived company-level list (for datalists/dropdowns — one per company, not per location)
const MILL_COMPANIES=[...new Set(Object.keys(MILL_DIRECTORY).map(n=>n.split(' - ')[0]))].sort();

// Extract company name from "Company - City" or alias
function extractMillCompany(name){
  if(!name)return name;
  const trimmed=name.trim();
  if(trimmed.includes(' - '))return trimmed.split(' - ')[0].trim();
  const lower=trimmed.toLowerCase().replace(/[_\-–—]+/g,' ').replace(/\s+/g,' ');
  const sortedAliases=Object.entries(_MILL_COMPANY_ALIASES).sort((a,b)=>b[0].length-a[0].length);
  for(const[alias,company]of sortedAliases){
    if(lower===alias||lower.startsWith(alias+' '))return company;
  }
  return trimmed;
}

// Get all locations for a company from MILL_DIRECTORY + CRM mills
function getMillLocations(companyName){
  const locs=[];
  // From MILL_DIRECTORY
  Object.entries(MILL_DIRECTORY).forEach(([name,info])=>{
    if(name.startsWith(companyName+' - ')){
      locs.push({city:info.city,state:info.state,name:name,label:`${info.city}, ${info.state}`});
    }
  });
  // From CRM mills (server-loaded locations array)
  const crmMill=S.mills.find(m=>m.name===companyName);
  if(crmMill&&Array.isArray(crmMill.locations)){
    crmMill.locations.forEach(loc=>{
      if(loc.city&&!locs.find(l=>l.city.toLowerCase()===loc.city.toLowerCase()&&l.state.toUpperCase()===(loc.state||'').toUpperCase())){
        locs.push({city:loc.city,state:loc.state||'',name:loc.name||`${companyName} - ${loc.city}`,label:`${loc.city}, ${loc.state||''}`});
      }
    });
  }
  return locs;
}

// Build city→canonical lookup from MILL_DIRECTORY
const _MILL_CITY_LOOKUP={};
Object.entries(MILL_DIRECTORY).forEach(([name,info])=>{
  const city=info.city.toLowerCase();
  if(!_MILL_CITY_LOOKUP[city])_MILL_CITY_LOOKUP[city]=[];
  _MILL_CITY_LOOKUP[city].push(name);
});

/**
 * Normalize a raw mill name to canonical "Company - City" format.
 * Handles: "POTLATCHDELTIC OLA" → "PotlatchDeltic - Ola"
 *          "Canfor DQ" → "Canfor - DeQuincy"
 *          "GP" + city="Gurdon, AR" → "GP - Gurdon"
 *          "Warren" → "PotlatchDeltic - Warren" (city-only lookup)
 * @param {string} raw - Raw mill name from intake
 * @param {string} [city] - Optional city hint (e.g. "Gurdon, AR")
 * @returns {{ name: string, city: string, state: string }} Normalized result
 */
function normalizeMillName(raw, city) {
  if (!raw) return { name: raw, city: city || '', state: '', company: '' };
  const trimmed = raw.trim();

  // 1. Already canonical? Direct lookup in MILL_DIRECTORY
  if (MILL_DIRECTORY[trimmed]) {
    const d = MILL_DIRECTORY[trimmed];
    return { name: trimmed, city: d.city + ', ' + d.state, state: d.state, company: extractMillCompany(trimmed) };
  }

  const lower = trimmed.toLowerCase().replace(/[_\-–—]+/g, ' ').replace(/\s+/g, ' ');

  // 2. Try "Company City" pattern (e.g. "POTLATCHDELTIC OLA", "Canfor DeQuincy", "GP Gurdon")
  // Also handles "Company - City" with wrong casing
  // Sort aliases longest-first so "mid south lumber company" matches before "mid south"
  const sortedAliases = Object.entries(_MILL_COMPANY_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, company] of sortedAliases) {
    if (lower.startsWith(alias)) {
      // Extract the city portion after the company alias
      let rest = lower.slice(alias.length).replace(/^[\s\-–—]+/, '').trim();
      // Strip common corporate suffixes that aren't city names
      rest = rest.replace(/\b(company|co|inc|llc|corp|corporation|lumber|forest|products|enterprises|industries)\b/gi, '').replace(/\s+/g, ' ').trim();
      if (!rest && city) {
        // Company-only name (e.g. "GEORGIA PACIFIC") — use city hint
        rest = city.split(',')[0].trim().toLowerCase();
      }
      if (!rest) {
        // Company-only name with no city hint — check if company has exactly one mill
        const companyMills = Object.entries(MILL_DIRECTORY).filter(([n]) => n.startsWith(company + ' - '));
        if (companyMills.length === 1) {
          const [canonName, info] = companyMills[0];
          return { name: canonName, city: info.city + ', ' + info.state, state: info.state, company };
        }
        // Multiple mills — return company name only (user needs to specify location)
        return { name: company, city: '', state: '', company };
      }

      // Common city abbreviations
      const cityAbbrevs = {
        'dq': 'dequincy', 'deq': 'dequincy',
        'er': 'el dorado', 'eld': 'el dorado',
        'tv': 'thomasville', 'mtl': 'moultrie',
        'fc': 'frisco city', 'nb': 'new boston'
      };
      const normalizedCity = cityAbbrevs[rest] || rest;

      // Search MILL_DIRECTORY for matching company + city
      for (const [canonName, info] of Object.entries(MILL_DIRECTORY)) {
        if (!canonName.startsWith(company + ' - ')) continue;
        if (info.city.toLowerCase() === normalizedCity ||
            canonName.split(' - ')[1].toLowerCase() === normalizedCity ||
            canonName.split(' - ')[1].toLowerCase().replace(/\s+/g, '') === normalizedCity.replace(/\s+/g, '')) {
          return { name: canonName, city: info.city + ', ' + info.state, state: info.state, company };
        }
      }

      // Company recognized but city not in directory — create formatted name
      const formattedCity = normalizedCity.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const cityState = city || '';
      const state = cityState.split(',').length > 1 ? cityState.split(',').pop().trim().toUpperCase() : '';
      return { name: company + ' - ' + formattedCity, city: cityState || formattedCity, state, company };
    }
  }

  // 3. City-only name (e.g. "Warren", "Ola", "Waldo") — look up by city
  const cityMatches = _MILL_CITY_LOOKUP[lower];
  if (cityMatches && cityMatches.length === 1) {
    const d = MILL_DIRECTORY[cityMatches[0]];
    return { name: cityMatches[0], city: d.city + ', ' + d.state, state: d.state, company: extractMillCompany(cityMatches[0]) };
  }

  // 4. Check if raw name is close to any MILLS entry (case-insensitive)
  const millMatch = MILLS.find(m => m.toLowerCase() === lower);
  if (millMatch && MILL_DIRECTORY[millMatch]) {
    const d = MILL_DIRECTORY[millMatch];
    return { name: millMatch, city: d.city + ', ' + d.state, state: d.state, company: extractMillCompany(millMatch) };
  }

  // 5. No match — return cleaned up version
  const state = city ? (city.split(',').pop() || '').trim().toUpperCase() : '';
  return { name: trimmed, city: city || '', state, company: extractMillCompany(trimmed) };
}
const NAV=[{id:'dashboard',icon:'📊',label:'Dashboard'},{id:'leaderboard',icon:'🏆',label:'Leaderboard'},{id:'insights',icon:'🎯',label:'Daily Briefing'},{id:'blotter',icon:'📋',label:'Trade Blotter'},{id:'pnl-calendar',icon:'📅',label:'P&L Calendar'},{id:'benchmark',icon:'🎯',label:'vs Market'},{id:'risk',icon:'⚠️',label:'Risk'},{id:'quotes',icon:'💰',label:'Quote Engine'},{id:'mi-intake',icon:'📥',label:'Mill Intake'},{id:'mi-prices',icon:'📊',label:'All Prices'},{id:'mi-intel',icon:'🧠',label:'Intelligence'},{id:'products',icon:'📦',label:'By Product'},{id:'crm',icon:'🏢',label:'CRM'},{id:'rldata',icon:'📈',label:'RL Data'},{id:'settings',icon:'⚙️',label:'Settings'}];

// Nav groups for collapsible sidebar
const NAV_GROUPS=[
  {label:'Trading',items:['dashboard','leaderboard','blotter','pnl-calendar','quotes']},
  {label:'Mill Intel',items:['mi-intake','mi-prices','mi-intel']},
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
  millPricingTab:'intake',
  // Mill Intel state
  miFilterProduct:'',
  miFilterMill:'',
  miFilterTrader:'',
  miFilterDays:7,
  miQuoteCustomer:'',
  miQuoteItems:[],
  quoteTemplates:LS('quoteTemplates',[])
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

// Migrate buy mill names from "Company - City" to company-only
(function migrateMillNames(){
  let changed=false;
  S.buys.forEach(b=>{
    if(b.mill&&b.mill.includes(' - ')){
      const company=extractMillCompany(b.mill);
      // Move the location part to origin if origin is empty
      if(!b.origin){
        const info=MILL_DIRECTORY[b.mill];
        if(info){
          b.origin=info.city+', '+info.state;
        }else{
          // Fallback: parse city from "Company - City" format
          const cityPart=b.mill.split(' - ').slice(1).join(' - ').trim();
          if(cityPart)b.origin=cityPart;
        }
      }
      b.mill=company;
      changed=true;
    }
  });
  // Also migrate S.mills names to company-level
  const companyMap={};
  S.mills.forEach(m=>{
    if(m.name&&m.name.includes(' - ')){
      const company=extractMillCompany(m.name);
      if(!companyMap[company])companyMap[company]={...m,name:company,locations:[]};
      if(m.origin&&!companyMap[company].locations.includes(m.origin))companyMap[company].locations.push(m.origin);
      changed=true;
    }
  });
  if(Object.keys(companyMap).length){
    // Replace per-location entries with company entries
    const companyNames=new Set(Object.keys(companyMap));
    S.mills=S.mills.filter(m=>!m.name||!m.name.includes(' - ')||!companyNames.has(extractMillCompany(m.name)));
    Object.values(companyMap).forEach(cm=>{
      if(!S.mills.find(m=>m.name===cm.name))S.mills.push(cm);
    });
  }
  if(changed){SS('buys',S.buys);SS('mills',S.mills);}
})();

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
