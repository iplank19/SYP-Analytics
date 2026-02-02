// SYP Analytics - Data & Storage Functions
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
// Pre-configured Supabase (auto-connect on any device)
const DEFAULT_SUPABASE_URL='https://miydcdlywbcemcmqqocv.supabase.co';
const DEFAULT_SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1peWRjZGx5d2JjZW1jbXFxb2N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDA0NjIsImV4cCI6MjA4NDY3NjQ2Mn0.LDe7owtdqhGUyE5O5DE8krJI7OdCPCv7I4l7RVl0CqI';
const SUPABASE_URL=LS('supabaseUrl','')||DEFAULT_SUPABASE_URL;
const SUPABASE_KEY=LS('supabaseKey','')||DEFAULT_SUPABASE_KEY;

function initSupabase(url,key){
  if(url&&key){
    // Using REST API directly instead of SDK to avoid dependencies
    supabase={url,key};
    return true;
  }
  return false;
}

async function cloudSync(action='push'){
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
      const localPasswords=JSON.parse(localStorage.getItem('traderPasswords')||'{}');
      Object.assign(existingPasswords,localPasswords);
      
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
        S.buys=d.buys||[];
        S.sells=d.sells||[];
        S.rl=(d.rl||[]).sort((a,b)=>new Date(a.date)-new Date(b.date));
        S.customers=d.customers||[];
        S.mills=d.mills||[];
        S.nextId=d.nextId||1;
        S.flatRate=d.flatRate||3.50;
        // Shared quote engine data
        S.lanes=d.lanes||[];
        S.marketBlurb=d.marketBlurb||'';
        S.freightBase=d.freightBase||450;
        S.shortHaulFloor=d.shortHaulFloor||0;
        // Trader-specific quote data
        const traderQuotes=d.traderQuotes||{};
        const myQuotes=traderQuotes[S.trader]||{};
        S.quoteItems=myQuotes.quoteItems||d.quoteItems||[];
        S.quoteProfiles=myQuotes.quoteProfiles||d.quoteProfiles||{default:{name:'Default',customers:[]}};
        S.quoteProfile=myQuotes.quoteProfile||d.quoteProfile||'default';
        S.stateRates=myQuotes.stateRates||d.stateRates||{AR:2.25,LA:2.25,TX:2.50,MS:2.25,AL:2.50,FL:2.75,GA:2.50,SC:2.50,NC:2.50};
        // Trader passwords (sync from cloud)
        if(d.traderPasswords){
          localStorage.setItem('traderPasswords',JSON.stringify(d.traderPasswords));
        }
        // Goals and achievements
        if(d.traderGoals){S.traderGoals=d.traderGoals;SS('traderGoals',S.traderGoals)}
        if(d.achievements){S.achievements=d.achievements;SS('achievements',S.achievements)}
        // Futures data
        if(d.futuresContracts){S.futuresContracts=d.futuresContracts;SS('futuresContracts',S.futuresContracts)}
        if(d.futuresParams){S.futuresParams=d.futuresParams;SS('futuresParams',S.futuresParams)}
        // Mill pricing
        if(d.millQuotes){S.millQuotes=d.millQuotes;normalizeMillQuotes();SS('millQuotes',S.millQuotes)}
        // Save to local storage too
        await saveAllLocal();
        // Sync pulled customers/mills into SQLite (so loadCRMData finds them)
        await syncCustomersToServer(S.customers);
        await syncMillsToServer(S.mills);
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
  // IndexedDB (primary)
  await dbSet('buys',S.buys);
  await dbSet('sells',S.sells);
  await dbSet('rl',S.rl);
  await dbSet('customers',S.customers);
  await dbSet('mills',S.mills);
  await dbSet('nextId',S.nextId);
  await dbSet('flatRate',S.flatRate);
  await dbSet('lanes',S.lanes);
  // Trader-specific quote data
  await dbSet('quoteItems_'+S.trader,S.quoteItems);
  await dbSet('stateRates_'+S.trader,S.stateRates);
  await dbSet('quoteProfiles_'+S.trader,S.quoteProfiles);
  await dbSet('quoteProfile_'+S.trader,S.quoteProfile);
  await dbSet('marketBlurb',S.marketBlurb);
  await dbSet('freightBase',S.freightBase);
  await dbSet('shortHaulFloor',S.shortHaulFloor);
  // Futures data
  await dbSet('futuresContracts',S.futuresContracts);
  await dbSet('futuresParams',S.futuresParams);
  // Mill pricing
  await dbSet('millQuotes',S.millQuotes);
  // localStorage (backup for small data)
  SS('buys',S.buys);
  SS('sells',S.sells);
  SS('rl',S.rl);
  SS('customers',S.customers);
  SS('mills',S.mills);
  SS('nextId',S.nextId);
  SS('flatRate',S.flatRate);
  SS('lanes',S.lanes);
  // Trader-specific quote data (localStorage)
  SS('quoteItems_'+S.trader,S.quoteItems);
  SS('stateRates_'+S.trader,S.stateRates);
  SS('quoteProfiles_'+S.trader,S.quoteProfiles);
  SS('quoteProfile_'+S.trader,S.quoteProfile);
  SS('marketBlurb',S.marketBlurb);
  SS('freightBase',S.freightBase);
  SS('shortHaulFloor',S.shortHaulFloor);
  // Futures data
  SS('futuresContracts',S.futuresContracts);
  SS('futuresParams',S.futuresParams);
  // Mill pricing
  SS('millQuotes',S.millQuotes);

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

  // Auto-sync data to Mill Intel platform (non-blocking)
  syncRLToMillIntel().catch(e=>console.warn('Mill Intel RL sync:',e));
  syncMillQuotesToMillIntel().catch(e=>console.warn('Mill Intel quote sync:',e));
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
  S.buys=await dbGet('buys',LS('buys',[]));
  S.sells=await dbGet('sells',LS('sells',[]));
  S.rl=await dbGet('rl',LS('rl',[]));
  S.customers=await dbGet('customers',LS('customers',[]));
  S.mills=await dbGet('mills',LS('mills',[]));
  S.nextId=await dbGet('nextId',LS('nextId',1));
  S.flatRate=await dbGet('flatRate',LS('flatRate',3.50));
  S.lanes=await dbGet('lanes',LS('lanes',[]));
  // Trader-specific quote data
  S.quoteItems=await dbGet('quoteItems_'+S.trader,LS('quoteItems_'+S.trader,[]));
  S.stateRates=await dbGet('stateRates_'+S.trader,LS('stateRates_'+S.trader,{AR:2.25,LA:2.25,TX:2.50,MS:2.25,AL:2.50,FL:2.75,GA:2.50,SC:2.50,NC:2.50}));
  S.quoteProfiles=await dbGet('quoteProfiles_'+S.trader,LS('quoteProfiles_'+S.trader,{default:{name:'Default',customers:[]}}));
  S.quoteProfile=await dbGet('quoteProfile_'+S.trader,LS('quoteProfile_'+S.trader,'default'));
  S.marketBlurb=await dbGet('marketBlurb',LS('marketBlurb',''));
  S.shortHaulFloor=await dbGet('shortHaulFloor',LS('shortHaulFloor',0));
  S.freightBase=await dbGet('freightBase',LS('freightBase',450));
  S.apiKey=LS('apiKey','');
  S.aiMsgs=LS('aiMsgs',[]);
  // Futures data
  S.futuresContracts=await dbGet('futuresContracts',LS('futuresContracts',[]));
  S.futuresParams=await dbGet('futuresParams',LS('futuresParams',{carryRate:0.08,storageCost:2,insuranceCost:1}));
  // Mill pricing
  S.millQuotes=await dbGet('millQuotes',LS('millQuotes',[]));
  normalizeMillQuotes();
}

// Sync pulled customers/mills into SQLite so loadCRMData finds them
async function syncCustomersToServer(customers){
  if(!customers||!customers.length)return;
  try{
    // Check against ALL server customers (no trader filter) to prevent cross-trader dupes
    const res=await fetch('/api/crm/customers');
    const existing=await res.json();
    const existingNames=new Set(existing.map(c=>c.name));
    // Insert any customers not already in SQLite
    for(const c of customers){
      if(c.name&&!existingNames.has(c.name)){
        await fetch('/api/crm/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)});
      }
    }
  }catch(e){console.error('syncCustomersToServer error:',e)}
}

async function syncMillsToServer(mills){
  if(!mills||!mills.length)return;
  try{
    // Check against ALL server mills (no trader filter) to prevent cross-trader dupes
    const res=await fetch('/api/crm/mills');
    const existing=await res.json();
    const existingNames=new Set(existing.map(m=>m.name));
    for(const m of mills){
      if(m.name&&!existingNames.has(m.name)){
        await fetch('/api/crm/mills',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});
      }
    }
  }catch(e){console.error('syncMillsToServer error:',e)}
}

// Enhanced save function that saves to IndexedDB
async function save(key,value){
  S[key]=value;
  await dbSet(key,value);
  SS(key,value); // backup
  
  // Auto-sync to cloud if configured
  if(supabase&&S.autoSync){
    cloudSync('push').catch(()=>{});
  }
}
