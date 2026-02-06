// SYP Analytics - Data & Storage Functions
//
// Save Pattern (all state mutations MUST follow one of these):
//   1. save(key, value)         — single key → IndexedDB + LS + debounced cloud push
//   2. saveAllLocal()           — full state → IndexedDB + LS + debounced cloud push
//   3. cloudSync('push')        — full state → Supabase (called automatically by 1 & 2)
//   4. cloudSync('pull')        — Supabase → merge into S → saveAllLocal()
//
// Data priority: Supabase (source of truth) > IndexedDB (primary local) > localStorage (backup)
// Merge strategy: _mergeById uses updatedAt timestamps — local wins ties only when updatedAt > remote
// RL data: merged by 'date' key (not full replacement) to preserve local-only entries
//
// IndexedDB for larger local storage
const DB_NAME='SYPAnalytics';
const DB_VERSION=1;
let db=null;

async function initDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{db=request.result;resolve(db)};
    request.onupgradeneeded=(e)=>{
      const database=e.target.result;
      if(!database.objectStoreNames.contains('data')){
        database.createObjectStore('data',{keyPath:'key'});
      }
    };
  });
}

async function dbGet(key,defaultVal){
  if(!db)await initDB();
  return new Promise((resolve)=>{
    try{
      const tx=db.transaction('data','readonly');
      const store=tx.objectStore('data');
      const request=store.get(key);
      request.onsuccess=()=>resolve(request.result?.value??defaultVal);
      request.onerror=()=>resolve(defaultVal);
    }catch{resolve(defaultVal)}
  });
}

async function dbSet(key,value){
  if(!db)await initDB();
  return new Promise((resolve)=>{
    try{
      const tx=db.transaction('data','readwrite');
      const store=tx.objectStore('data');
      store.put({key,value});
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>resolve(false);
    }catch{resolve(false)}
  });
}

// Supabase Cloud Sync
let supabase=null;
// Credentials loaded from backend /api/config or user settings — never hardcoded
let _supabaseConfigLoaded=false
let SUPABASE_URL=LS('supabaseUrl','')
let SUPABASE_KEY=LS('supabaseKey','')

async function loadSupabaseConfig(){
  if(_supabaseConfigLoaded)return
  // Try backend config endpoint first
  try{
    const res=await fetch('/api/config')
    if(res.ok){
      const cfg=await res.json()
      if(cfg.supabaseUrl&&cfg.supabaseKey){
        SUPABASE_URL=cfg.supabaseUrl
        SUPABASE_KEY=cfg.supabaseKey
        SS('supabaseUrl',SUPABASE_URL)
        SS('supabaseKey',SUPABASE_KEY)
        _supabaseConfigLoaded=true
        return
      }
    }
  }catch(e){console.debug('Backend config not available:',e.message)}
  // Fall back to user-configured values from localStorage
  if(SUPABASE_URL&&SUPABASE_KEY){
    _supabaseConfigLoaded=true
  }else{
    console.warn('Supabase not configured — set URL and key in Settings')
  }
}

function initSupabase(url,key){
  if(url&&key){
    // Using REST API directly instead of SDK to avoid dependencies
    supabase={url,key};
    return true;
  }
  return false;
}

// Merge two arrays by item ID (or custom key), preferring items with later updatedAt
// Guards: items with undefined/null/empty-string keys are skipped to prevent false grouping
function _mergeById(local,remote,key='id'){
  const merged=new Map()
  // Index local items — skip items without a valid key
  ;(local||[]).forEach(item=>{
    if(!item||typeof item!=='object')return
    const k=item[key]
    if(k==null||k==='')return
    merged.set(k,item)
  })
  // Merge remote items — remote wins if it has a later updatedAt, or if local lacks the item
  ;(remote||[]).forEach(item=>{
    if(!item||typeof item!=='object')return
    const k=item[key]
    if(k==null||k==='')return
    const existing=merged.get(k)
    if(!existing){
      merged.set(k,item)
    }else{
      // Compare updatedAt timestamps if available, otherwise remote wins
      const localTime=existing.updatedAt?new Date(existing.updatedAt).getTime():0
      const remoteTime=item.updatedAt?new Date(item.updatedAt).getTime():0
      if(remoteTime>=localTime)merged.set(k,item)
    }
  })
  return[...merged.values()]
}

async function cloudSync(action='push',opts={}){
  if(!supabase)return{success:false,error:'Supabase not configured'};

  const userId=LS('supabaseUserId','')||'default';
  console.log('Cloud sync:',action,'user:',userId,'trader:',S.trader,'url:',supabase.url);
  
  try{
    if(action==='push'){
      // First pull existing data to preserve other traders' quote data
      let existingTraderQuotes={};
      let existingPasswords={};
      try{
        const pullRes=await fetch(`${supabase.url}/rest/v1/syp_data?user_id=eq.${userId}&select=data`,{
          method:'GET',
          headers:{'apikey':supabase.key,'Authorization':`Bearer ${supabase.key}`}
        });
        const pullRows=await pullRes.json();
        if(pullRows&&pullRows.length>0&&pullRows[0].data){
          existingTraderQuotes=pullRows[0].data.traderQuotes||{};
          existingPasswords=pullRows[0].data.traderPasswords||{};
        }
      }catch(e){console.log('Could not pull existing:',e)}
      
      // Update current trader's quote data
      existingTraderQuotes[S.trader]={
        quoteItems:S.quoteItems,
        quoteProfiles:S.quoteProfiles,
        quoteProfile:S.quoteProfile,
        stateRates:S.stateRates
      };
      
      // Merge local passwords with cloud passwords
      const localPasswords=safeJSONParse(localStorage.getItem('traderPasswords'),{});
      Object.assign(existingPasswords,localPasswords);
      
      // Fetch prospect summary from SQLite as cloud backup (prospects live in SQLite only)
      let prospectBackup=[]
      try{
        const pRes=await fetch('/api/crm/prospects')
        if(pRes.ok)prospectBackup=await pRes.json()
      }catch(e){console.debug('Prospect backup fetch skipped:',e.message)}

      // Upload local data to cloud
      const data={
        buys:S.buys,
        sells:S.sells,
        rl:S.rl,
        customers:S.customers,
        mills:S.mills,
        nextId:S.nextId,
        flatRate:S.flatRate,
        // Shared quote engine data
        lanes:S.lanes,
        marketBlurb:S.marketBlurb,
        freightBase:S.freightBase,
        shortHaulFloor:S.shortHaulFloor,
        // Trader-specific quote data (all traders)
        traderQuotes:existingTraderQuotes,
        // Trader passwords (all traders)
        traderPasswords:existingPasswords,
        // Goals and achievements
        traderGoals:S.traderGoals,
        achievements:S.achievements,
        // Futures data
        futuresContracts:S.futuresContracts,
        futuresParams:S.futuresParams,
        millQuotes:S.millQuotes,
        // Risk management
        riskLimits:S.riskLimits||{},
        // Trading signals
        signalConfig:S.signalConfig||null,
        signalHistory:S.signalHistory||[],
        // Alerts
        alertConfig:S.alertConfig||null,
        alertHistory:S.alertHistory||[],
        // Reports
        reportSchedules:S.reportSchedules||[],
        reportHistory:S.reportHistory||[],
        // Prospect backup (SQLite → cloud safety net)
        prospectBackup,
        updated_at:new Date().toISOString()
      };
      
      console.log('Checking for existing record...');
      const res=await fetch(`${supabase.url}/rest/v1/syp_data?user_id=eq.${userId}`,{
        method:'GET',
        headers:{
          'apikey':supabase.key,
          'Authorization':`Bearer ${supabase.key}`
        }
      });
      
      if(!res.ok){
        const errText=await res.text();
        console.error('GET failed:',res.status,errText);
        return{success:false,error:`GET failed: ${res.status} ${errText}`};
      }
      
      const existing=await res.json();
      console.log('Existing records:',existing.length);
      
      let saveRes;
      if(existing&&existing.length>0){
        // Update existing record
        console.log('Updating existing record...');
        saveRes=await fetch(`${supabase.url}/rest/v1/syp_data?user_id=eq.${userId}`,{
          method:'PATCH',
          headers:{
            'apikey':supabase.key,
            'Authorization':`Bearer ${supabase.key}`,
            'Content-Type':'application/json',
            'Prefer':'return=minimal'
          },
          body:JSON.stringify({data,updated_at:new Date().toISOString()})
        });
      }else{
        // Insert new record
        console.log('Inserting new record...');
        saveRes=await fetch(`${supabase.url}/rest/v1/syp_data`,{
          method:'POST',
          headers:{
            'apikey':supabase.key,
            'Authorization':`Bearer ${supabase.key}`,
            'Content-Type':'application/json',
            'Prefer':'return=minimal'
          },
          body:JSON.stringify({user_id:userId,data,updated_at:new Date().toISOString()})
        });
      }
      
      if(!saveRes.ok){
        const errText=await saveRes.text();
        console.error('Save failed:',saveRes.status,errText);
        return{success:false,error:`Save failed: ${saveRes.status} ${errText}`};
      }
      
      console.log('Push successful!');
      return{success:true,action:'pushed'};
    }else if(action==='pull'){
      _isPulling=true;
      // Download cloud data to local
      const res=await fetch(`${supabase.url}/rest/v1/syp_data?user_id=eq.${userId}&select=data,updated_at`,{
        headers:{
          'apikey':supabase.key,
          'Authorization':`Bearer ${supabase.key}`
        }
      });
      const rows=await res.json();
      if(rows&&rows.length>0&&rows[0].data){
        const d=rows[0].data;
        // Cloud wins on pull — direct replacement (no merge conflicts)
        // Use _mergeById only for explicit merge scenarios (opts.merge=true)
        if(opts.merge){
          S.buys=_mergeById(S.buys,d.buys||[])
          S.sells=_mergeById(S.sells,d.sells||[])
          S.rl=_mergeById(S.rl,d.rl||[],'date').sort((a,b)=>new Date(a.date)-new Date(b.date))
          S.customers=_mergeById(S.customers,d.customers||[],'name')
          S.mills=_mergeById(S.mills,d.mills||[],'name')
        }else{
          S.buys=d.buys||[]
          S.sells=d.sells||[]
          S.rl=(d.rl||[]).sort((a,b)=>new Date(a.date)-new Date(b.date))
          S.customers=d.customers||[]
          S.mills=d.mills||[]
        }
        S.nextId=d.nextId||1
        S.flatRate=d.flatRate||3.50
        // Shared quote engine data
        S.lanes=d.lanes||[]
        S.marketBlurb=d.marketBlurb||''
        S.freightBase=d.freightBase||450
        S.shortHaulFloor=d.shortHaulFloor||0
        // Trader-specific quote data
        const traderQuotes=d.traderQuotes||{}
        const myQuotes=traderQuotes[S.trader]||{}
        S.quoteItems=myQuotes.quoteItems||d.quoteItems||[]
        S.quoteProfiles=myQuotes.quoteProfiles||d.quoteProfiles||{default:{name:'Default',customers:[]}}
        S.quoteProfile=myQuotes.quoteProfile||d.quoteProfile||'default'
        S.stateRates=myQuotes.stateRates||d.stateRates||{AR:2.25,LA:2.25,TX:2.50,MS:2.25,AL:2.50,FL:2.75,GA:2.50,SC:2.50,NC:2.50}
        // Trader passwords (sync from cloud)
        if(d.traderPasswords){
          localStorage.setItem('traderPasswords',JSON.stringify(d.traderPasswords))
        }
        // Goals and achievements
        if(d.traderGoals){S.traderGoals=d.traderGoals;SS('traderGoals',S.traderGoals)}
        if(d.achievements){S.achievements=d.achievements;SS('achievements',S.achievements)}
        // Futures data
        if(d.futuresContracts){S.futuresContracts=d.futuresContracts;SS('futuresContracts',S.futuresContracts)}
        if(d.futuresParams){S.futuresParams=d.futuresParams;SS('futuresParams',S.futuresParams)}
        // Mill pricing
        if(d.millQuotes){S.millQuotes=d.millQuotes;normalizeMillQuotes();SS('millQuotes',S.millQuotes)}
        // Risk management
        if(d.riskLimits){S.riskLimits=d.riskLimits;SS('riskLimits',S.riskLimits)}
        // Trading signals
        if(d.signalConfig){S.signalConfig=d.signalConfig;SS('signalConfig',S.signalConfig)}
        if(d.signalHistory){S.signalHistory=d.signalHistory;SS('signalHistory',S.signalHistory)}
        // Alerts
        if(d.alertConfig){S.alertConfig=d.alertConfig;SS('alertConfig',S.alertConfig)}
        if(d.alertHistory){S.alertHistory=d.alertHistory;SS('alertHistory',S.alertHistory)}
        // Reports
        if(d.reportSchedules){S.reportSchedules=d.reportSchedules;SS('reportSchedules',S.reportSchedules)}
        if(d.reportHistory){S.reportHistory=d.reportHistory;SS('reportHistory',S.reportHistory)}
        // Save cloud data locally (skip cloud push — we just pulled, don't push back)
        _isPulling=true; // keeps the debounced push from firing
        await saveAllLocal();
        // Cancel any push that saveAllLocal may have scheduled
        clearTimeout(_cloudPushTimer);
        // Sync pulled data into SQLite and Mill Intel (fire-and-forget, don't block UI)
        syncCustomersToServer(S.customers).catch(e=>console.warn('Customer sync:',e));
        syncMillsToServer(S.mills).catch(e=>console.warn('Mill sync:',e));
        syncMillQuotesToMillIntel().catch(e=>console.warn('Mill quote sync:',e));
        syncRLToMillIntel().catch(e=>console.warn('RL sync:',e));
        _isPulling=false;
        return{success:true,action:'pulled',updated:rows[0].updated_at};
      }
      _isPulling=false;
      return{success:false,error:'No cloud data found'};
    }
  }catch(err){
    _isPulling=false;
    return{success:false,error:err.message};
  }
}

// Debounce timer and pull-in-progress flag for cloud sync
let _cloudPushTimer=null;
let _isPulling=false;
let _isPushing=false;

// Save all data locally (IndexedDB + localStorage backup)
// ALWAYS syncs to cloud so all profiles see the same trade data
async function saveAllLocal(){
  // Stamp updatedAt on customer/mill objects so _mergeById conflict resolution works
  const now=Date.now()
  ;(S.customers||[]).forEach(c=>{if(c&&typeof c==='object')c.updatedAt=c.updatedAt||now})
  ;(S.mills||[]).forEach(m=>{if(m&&typeof m==='object')m.updatedAt=m.updatedAt||now})

  // IndexedDB (primary) — parallel writes
  const t=S.trader
  await Promise.all([
    dbSet('buys',S.buys),dbSet('sells',S.sells),dbSet('rl',S.rl),
    dbSet('customers',S.customers),dbSet('mills',S.mills),
    dbSet('nextId',S.nextId),dbSet('flatRate',S.flatRate),dbSet('lanes',S.lanes),
    dbSet('quoteItems_'+t,S.quoteItems),dbSet('stateRates_'+t,S.stateRates),
    dbSet('quoteProfiles_'+t,S.quoteProfiles),dbSet('quoteProfile_'+t,S.quoteProfile),
    dbSet('marketBlurb',S.marketBlurb),dbSet('freightBase',S.freightBase),
    dbSet('shortHaulFloor',S.shortHaulFloor),
    dbSet('futuresContracts',S.futuresContracts),dbSet('futuresParams',S.futuresParams),
    dbSet('millQuotes',S.millQuotes),dbSet('riskLimits',S.riskLimits||{}),
    dbSet('signalConfig',S.signalConfig||null),dbSet('signalHistory',S.signalHistory||[]),
    dbSet('alertConfig',S.alertConfig||null),dbSet('alertHistory',S.alertHistory||[]),
    dbSet('reportSchedules',S.reportSchedules||[]),dbSet('reportHistory',S.reportHistory||[])
  ])
  // localStorage (backup for small data)
  SS('buys',S.buys)
  SS('sells',S.sells)
  SS('rl',S.rl)
  SS('customers',S.customers)
  SS('mills',S.mills)
  SS('nextId',S.nextId)
  SS('flatRate',S.flatRate)
  SS('lanes',S.lanes)
  // Trader-specific quote data (localStorage)
  SS('quoteItems_'+S.trader,S.quoteItems)
  SS('stateRates_'+S.trader,S.stateRates)
  SS('quoteProfiles_'+S.trader,S.quoteProfiles)
  SS('quoteProfile_'+S.trader,S.quoteProfile)
  SS('marketBlurb',S.marketBlurb)
  SS('freightBase',S.freightBase)
  SS('shortHaulFloor',S.shortHaulFloor)
  // Futures data
  SS('futuresContracts',S.futuresContracts)
  SS('futuresParams',S.futuresParams)
  // Mill pricing
  SS('millQuotes',S.millQuotes)
  // Risk management
  SS('riskLimits',S.riskLimits||{})
  // Trading signals
  SS('signalConfig',S.signalConfig||null)
  SS('signalHistory',S.signalHistory||[])
  // Alerts
  SS('alertConfig',S.alertConfig||null)
  SS('alertHistory',S.alertHistory||[])
  // Reports
  SS('reportSchedules',S.reportSchedules||[])
  SS('reportHistory',S.reportHistory||[])

  // Debounced cloud push (prevents rapid-fire syncs during bulk operations)
  if(supabase){
    clearTimeout(_cloudPushTimer);
    _cloudPushTimer=setTimeout(()=>{
      // Check flags inside callback — _isPulling may have changed since scheduling
      if(_isPulling||_isPushing)return;
      _isPushing=true;
      cloudSync('push').catch(e=>console.warn('Auto cloud sync failed:',e)).finally(()=>{_isPushing=false});
    },2000);
  }

}

// ---------- MILL INTEL CROSS-PLATFORM SYNC ----------

let _milSyncTimer=null;

// Push RL data from SYP Analytics → Mill Intel rl_prices table
async function syncRLToMillIntel(){
  if(!S.rl||!S.rl.length)return;
  // Debounce: only sync once every 3s
  return new Promise(resolve=>{
    clearTimeout(_milSyncTimer);
    _milSyncTimer=setTimeout(async()=>{
      try{
        const entries=[];
        S.rl.forEach(rl=>{
          if(!rl.date)return;
          // 1. Composite prices (main RL values)
          ['west','central','east'].forEach(region=>{
            Object.entries(rl[region]||{}).forEach(([product,price])=>{
              if(price&&typeof price==='number'){
                entries.push({date:rl.date,product,region,price});
              }
            });
          });
          // 2. Specified lengths (length-specific RL values)
          if(rl.specified_lengths){
            ['west','central','east'].forEach(region=>{
              Object.entries(rl.specified_lengths[region]||{}).forEach(([product,lengths])=>{
                if(lengths&&typeof lengths==='object'){
                  Object.entries(lengths).forEach(([len,price])=>{
                    if(price&&typeof price==='number'){
                      entries.push({date:rl.date,product:`${product} ${len}'`,region,price});
                    }
                  });
                }
              });
            });
          }
          // 3. Timbers
          if(rl.timbers){
            ['west','central','east'].forEach(region=>{
              Object.entries(rl.timbers[region]||{}).forEach(([product,lengths])=>{
                if(lengths&&typeof lengths==='object'){
                  Object.entries(lengths).forEach(([len,price])=>{
                    if(price&&typeof price==='number'){
                      entries.push({date:rl.date,product:`${product} ${len}'`,region,price});
                    }
                  });
                }
              });
            });
          }
        });
        if(!entries.length){resolve();return}
        const res=await fetch('/api/mi/rl',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(entries)
        });
        if(res.ok){
          const r=await res.json();
          console.log(`Mill Intel RL sync: ${r.created} entries pushed`);
        }
        resolve();
      }catch(e){
        // Mill Intel may not be running — that's OK
        console.debug('Mill Intel not reachable:',e.message);
        resolve();
      }
    },3000);
  });
}

// Push mill quotes from S.millQuotes → Mill Intel backend (/api/mi/quotes)
async function syncMillQuotesToMillIntel(){
  if(!S.millQuotes||!S.millQuotes.length)return;
  try{
    const res=await fetch('/api/mi/quotes',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(S.millQuotes.map(q=>({
        mill:q.mill||q.mill_name||'',
        product:q.product||'',
        price:q.price||q.fob||0,
        length:q.length||'RL',
        volume:q.volume||0,
        shipWindow:q.shipWindow||q.ship_window||q.ship||'prompt',
        date:q.date||new Date().toISOString().slice(0,10),
        trader:q.trader||S.trader,
        city:q.city||q.location||'',
        source:'syp_analytics'
      })))
    });
    if(res.ok)console.log('Mill Intel quote sync complete');
  }catch(e){
    console.debug('Mill Intel quote sync skip:',e.message);
  }
}

// Load from IndexedDB first, fall back to localStorage
async function loadAllLocal(){
  await initDB();
  // Parallel IDB reads (30+ sequential awaits → single Promise.all)
  const t=S.trader;
  const [buys,sells,rl,customers,mills,nextId,flatRate,lanes,
         quoteItems,stateRates,quoteProfiles,quoteProfile,
         marketBlurb,shortHaulFloor,freightBase,
         futuresContracts,futuresParams,millQuotes,
         riskLimits,signalConfig,signalHistory,
         alertConfig,alertHistory,reportSchedules,reportHistory
  ]=await Promise.all([
    dbGet('buys',LS('buys',[])),
    dbGet('sells',LS('sells',[])),
    dbGet('rl',LS('rl',[])),
    dbGet('customers',LS('customers',[])),
    dbGet('mills',LS('mills',[])),
    dbGet('nextId',LS('nextId',1)),
    dbGet('flatRate',LS('flatRate',3.50)),
    dbGet('lanes',LS('lanes',[])),
    dbGet('quoteItems_'+t,LS('quoteItems_'+t,[])),
    dbGet('stateRates_'+t,LS('stateRates_'+t,{AR:2.25,LA:2.25,TX:2.50,MS:2.25,AL:2.50,FL:2.75,GA:2.50,SC:2.50,NC:2.50})),
    dbGet('quoteProfiles_'+t,LS('quoteProfiles_'+t,{default:{name:'Default',customers:[]}})),
    dbGet('quoteProfile_'+t,LS('quoteProfile_'+t,'default')),
    dbGet('marketBlurb',LS('marketBlurb','')),
    dbGet('shortHaulFloor',LS('shortHaulFloor',0)),
    dbGet('freightBase',LS('freightBase',450)),
    dbGet('futuresContracts',LS('futuresContracts',[])),
    dbGet('futuresParams',LS('futuresParams',{carryRate:0.08,storageCost:2,insuranceCost:1})),
    dbGet('millQuotes',LS('millQuotes',[])),
    dbGet('riskLimits',LS('riskLimits',{})),
    dbGet('signalConfig',LS('signalConfig',null)),
    dbGet('signalHistory',LS('signalHistory',[])),
    dbGet('alertConfig',LS('alertConfig',null)),
    dbGet('alertHistory',LS('alertHistory',[])),
    dbGet('reportSchedules',LS('reportSchedules',[])),
    dbGet('reportHistory',LS('reportHistory',[]))
  ]);
  S.buys=buys;S.sells=sells;S.rl=rl;S.customers=customers;S.mills=mills;
  S.nextId=nextId;S.flatRate=flatRate;S.lanes=lanes;
  S.quoteItems=quoteItems;S.stateRates=stateRates;
  S.quoteProfiles=quoteProfiles;S.quoteProfile=quoteProfile;
  S.marketBlurb=marketBlurb;S.shortHaulFloor=shortHaulFloor;S.freightBase=freightBase;
  S.apiKey=LS('apiKey','');S.aiMsgs=LS('aiMsgs',[]);
  S.futuresContracts=futuresContracts;S.futuresParams=futuresParams;
  S.millQuotes=millQuotes;normalizeMillQuotes();
  S.riskLimits=riskLimits;
  S.signalConfig=signalConfig;S.signalHistory=signalHistory;
  S.alertConfig=alertConfig;S.alertHistory=alertHistory;
  S.reportSchedules=reportSchedules;S.reportHistory=reportHistory;
}

// Sync pulled customers/mills into SQLite so loadCRMData finds them
async function syncCustomersToServer(customers){
  if(!customers||!customers.length)return;
  let synced=false;
  try{
    // Check against ALL server customers (no trader filter) to prevent cross-trader dupes
    const res=await fetch('/api/crm/customers');
    const existing=await res.json();
    const existingNames=new Set(existing.map(c=>c.name));
    // Insert any customers not already in SQLite
    for(const c of customers){
      if(c.name&&!existingNames.has(c.name)){
        const r=await fetch('/api/crm/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)});
        if(r.ok){
          const created=await r.json();
          // Update local customer with server ID
          const local=S.customers.find(x=>x.name===c.name);
          if(local&&created.id)local.id=created.id;
          synced=true;
        }
      }
    }
  }catch(e){console.error('syncCustomersToServer error:',e)}
  return synced;
}

async function syncMillsToServer(mills){
  if(!mills||!mills.length)return;
  let synced=false;
  try{
    // Check against ALL server mills (no trader filter) to prevent cross-trader dupes
    const res=await fetch('/api/crm/mills');
    const existing=await res.json();
    const existingNames=new Set(existing.map(m=>m.name));
    for(const m of mills){
      if(m.name&&!existingNames.has(m.name)){
        const r=await fetch('/api/crm/mills',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});
        if(r.ok){
          const created=await r.json();
          // Update local mill with server ID
          const local=S.mills.find(x=>x.name===m.name);
          if(local&&created.id)local.id=created.id;
          synced=true;
        }
      }
    }
  }catch(e){console.error('syncMillsToServer error:',e)}
  return synced;
}

// Enhanced save function that saves to IndexedDB
// Keys in ALWAYS_SYNC will trigger cloud sync regardless of autoSync setting
const ALWAYS_SYNC_KEYS = ['lanes', 'buys', 'sells', 'customers', 'mills', 'freightBase', 'stateRates'];

async function save(key,value){
  S[key]=value;
  await dbSet(key,value);
  SS(key,value); // backup

  // Auto-sync to cloud if configured, or if key is in always-sync list
  if(supabase && (S.autoSync || ALWAYS_SYNC_KEYS.includes(key))){
    clearTimeout(_cloudPushTimer);
    _cloudPushTimer=setTimeout(()=>{
      if(_isPulling||_isPushing)return;
      _isPushing=true;
      cloudSync('push').catch(e=>console.warn('Auto cloud sync failed:',e)).finally(()=>{_isPushing=false});
    },2000);
  }
}
