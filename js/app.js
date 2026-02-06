// SYP Analytics - App Init & Settings

// Secure password hashing using Web Crypto API (SHA-256)
async function hashPassword(input){
  const encoder=new TextEncoder()
  const data=encoder.encode(input)
  const hashBuffer=await crypto.subtle.digest('SHA-256',data)
  const hashArray=Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b=>b.toString(16).padStart(2,'0')).join('')
}

// SETTINGS
function saveKey(){S.apiKey=document.getElementById('api-key').value.trim();SS('apiKey',S.apiKey);showToast('API key saved!','positive')}
function saveFlatRate(){S.flatRate=parseFloat(document.getElementById('flat-rate').value)||3.50;SS('flatRate',S.flatRate);showToast('Flat rate saved: $'+S.flatRate+'/mile','positive')}

// PPU Settings
function savePPUSettings(){
  const inputs=document.querySelectorAll('.ppu-input');
  const newPPU={};
  inputs.forEach(inp=>{
    const dim=inp.dataset.dim;
    const val=parseInt(inp.value);
    if(dim&&val>0)newPPU[dim]=val;
  });
  S.ppu=newPPU;
  SS('ppu',S.ppu);
  showToast('PPU settings saved!','positive');
}

function resetPPUDefaults(){
  S.ppu={
    '2x4':208,'2x6':128,'2x8':96,'2x10':80,'2x12':64,
    '2x3':294,'2x14':52,
    '1x4':416,'1x6':256,'1x8':192,'1x10':160,'1x12':128,
    '4x4':64,'4x6':42,'6x6':24
  };
  SS('ppu',S.ppu);
  showToast('PPU reset to defaults','info');
  render();
}

function addPPUDimension(){
  const dim=document.getElementById('new-ppu-dim').value.trim();
  const val=parseInt(document.getElementById('new-ppu-val').value);
  if(!dim||!dim.match(/^\d+x\d+$/i)){
    showToast('Invalid dimension format (use NxN like 2x4)','negative');
    return;
  }
  if(!val||val<=0){
    showToast('Enter a valid PPU value','negative');
    return;
  }
  if(!S.ppu)S.ppu={};
  S.ppu[dim.toLowerCase()]=val;
  SS('ppu',S.ppu);
  showToast(`Added ${dim} = ${val} pcs/unit`,'positive');
  render();
}

// Trader Goals (Admin)
function saveTraderGoal(trader){
  const vol=parseFloat(document.getElementById('goal-vol-'+trader)?.value)||0;
  const profit=parseFloat(document.getElementById('goal-profit-'+trader)?.value)||0;
  if(!S.traderGoals)S.traderGoals={};
  S.traderGoals[trader]={volume:vol||null,profit:profit||null};
  SS('traderGoals',S.traderGoals);
  // Sync to cloud
  if(supabase)cloudSync('push').catch(()=>{});
  showToast(`Goals saved for ${trader}`,'positive');
  render();
}

function exportLeaderboardReport(){
  const period=S.leaderboardPeriod||'30d';
  const r=getLeaderboardRange(period);
  const inR=d=>new Date(d)>=r.start&&new Date(d)<=r.end;
  const allBuys=S.buys.filter(b=>inR(b.date));
  const allSells=S.sells.filter(s=>inR(s.date));

  const traderStats=TRADERS.map(t=>{
    const buys=allBuys.filter(b=>b.trader===t||(!b.trader&&t==='Ian P'));
    const sells=allSells.filter(s=>s.trader===t||(!s.trader&&t==='Ian P'));
    return calcTraderStats(t,buys,sells);
  });

  let csv='Trader,Volume (MBF),Buy Vol,Sell Vol,Trades,Margin/MBF,Profit,Win Rate,Best Trade,Customers\\n';
  traderStats.forEach(t=>{
    csv+=`${t.name},${t.totalVol},${t.buyVol},${t.sellVol},${t.trades},${t.margin.toFixed(2)},${t.profit.toFixed(2)},${t.winRate.toFixed(1)}%,${t.bestProfit.toFixed(2)},${t.customerCount}\\n`;
  });

  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`leaderboard_${period}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Report exported!','positive');
}

function showAllAchievements(){
  const modal=document.getElementById('modal');
  const traderAchs={};
  TRADERS.forEach(t=>traderAchs[t]=S.achievements.filter(a=>a.trader===t));

  modal.innerHTML=`
    <div class="modal-overlay" onclick="closeModal()">
      <div class="modal wide" onclick="event.stopPropagation()">
        <div class="modal-header">
          <span class="modal-title warn">🏆 ALL ACHIEVEMENTS</span>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="modal-body">
          <div style="margin-bottom:16px">
            <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Achievement definitions:</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
              ${ACHIEVEMENTS.map(a=>`
                <div style="padding:8px;background:var(--panel-alt);border-radius:4px;display:flex;align-items:center;gap:8px">
                  <span style="font-size:20px">${a.icon}</span>
                  <div>
                    <div style="font-size:11px;font-weight:600">${a.name}</div>
                    <div style="font-size:9px;color:var(--muted)">${a.desc}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Achievements by trader:</div>
          <table style="font-size:11px">
            <thead><tr><th>Trader</th><th>Earned</th><th>Achievements</th></tr></thead>
            <tbody>
              ${TRADERS.map(t=>`
                <tr style="border-left:3px solid ${traderColor(t)}">
                  <td class="bold">${t}</td>
                  <td>${traderAchs[t].length}/${ACHIEVEMENTS.length}</td>
                  <td>${traderAchs[t].map(a=>a.icon).join(' ')||'<span style="color:var(--muted)">None yet</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button class="btn btn-default" onclick="closeModal()">Close</button>
        </div>
      </div>
    </div>`;
}

// Supabase functions
function saveSupabaseConfig(){
  const url=document.getElementById('sb-url')?.value.trim()||SUPABASE_URL;
  const key=document.getElementById('sb-key')?.value.trim()||SUPABASE_KEY;
  const user=document.getElementById('sb-user')?.value.trim()||'default';
  
  SS('supabaseUrl',url);
  SS('supabaseKey',key);
  SS('supabaseUserId',user);
  
  if(url&&key){
    initSupabase(url,key);
    showToast('Supabase configured! You can now sync to cloud.','positive');
  }else{
    showToast('Supabase disabled (URL or key missing)','warn');
  }
  render();
}

function saveUserIdOnly(){
  const user=document.getElementById('sb-user')?.value.trim()||'default';
  SS('supabaseUserId',user);
  
  // Re-init with defaults + new user ID
  initSupabase(SUPABASE_URL,SUPABASE_KEY);
  showToast('User ID saved: '+user,'positive');
  render();
}

async function doCloudSync(action){
  const statusEl=document.getElementById('sync-status');
  if(statusEl)statusEl.innerHTML=`<span style="color:var(--accent)">⏳ ${action==='push'?'Pushing':'Pulling'}...</span>`;
  
  const result=await cloudSync(action);
  
  if(result.success){
    if(statusEl)statusEl.innerHTML=`<span style="color:var(--positive)">✓ ${result.action==='pushed'?'Pushed to cloud':'Pulled from cloud'} at ${new Date().toLocaleTimeString()}</span>`;
    if(action==='pull')render();
  }else{
    if(statusEl)statusEl.innerHTML=`<span style="color:var(--negative)">✗ Error: ${result.error}</span>`;
  }
}

function toggleAutoSync(){
  S.autoSync=document.getElementById('auto-sync').checked;
  SS('autoSync',S.autoSync);
}

function expCSV(t){
  const d=t==='buys'?S.buys:S.sells;if(!d.length){showToast('No data to export','warn');return}
  const h=t==='buys'?['Date','Mill','Region','Product','Price','Volume','Shipped','Notes']:['Date','Customer','Dest','Product','DLVD','Freight','FOB','Volume','Delivered','Notes'];
  const rows=d.map(x=>t==='buys'?[x.date,x.mill,x.region,x.product,x.price,x.volume,x.shipped?'Y':'N',x.notes]:[x.date,x.customer,x.destination,x.product,x.price,x.freight,x.price-x.freight,x.volume,x.delivered?'Y':'N',x.notes]);
  const csv=[h,...rows].map(r=>r.map(c=>`"${c||''}"`).join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`syp-${t}-${today()}.csv`;a.click();
}
function expAll(){
  const d={
    buys:S.buys,
    sells:S.sells,
    rl:S.rl,
    customers:S.customers,
    mills:S.mills,
    nextId:S.nextId,
    flatRate:S.flatRate,
    // Quote engine data
    lanes:S.lanes,
    quoteItems:S.quoteItems,
    quoteProfiles:S.quoteProfiles,
    quoteProfile:S.quoteProfile,
    marketBlurb:S.marketBlurb,
    stateRates:S.stateRates,
    freightBase:S.freightBase,
    shortHaulFloor:S.shortHaulFloor,
    exportedAt:new Date().toISOString()
  };
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));a.download=`syp-backup-${today()}.json`;a.click();
}
async function impData(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=async ev=>{
    try{
      const d=JSON.parse(ev.target.result);
      if(d.buys){S.buys=d.buys}
      if(d.sells){S.sells=d.sells}
      if(d.rl){S.rl=d.rl}
      if(d.customers){S.customers=d.customers}
      if(d.mills){S.mills=d.mills}
      if(d.nextId){S.nextId=d.nextId}
      if(d.flatRate){S.flatRate=d.flatRate}
      // Quote engine data
      if(d.lanes){S.lanes=d.lanes}
      if(d.quoteItems){S.quoteItems=d.quoteItems}
      if(d.quoteProfiles){S.quoteProfiles=d.quoteProfiles}
      if(d.quoteProfile){S.quoteProfile=d.quoteProfile}
      if(d.marketBlurb!==undefined){S.marketBlurb=d.marketBlurb}
      if(d.stateRates){S.stateRates=d.stateRates}
      if(d.freightBase!==undefined){S.freightBase=d.freightBase}
      if(d.shortHaulFloor!==undefined){S.shortHaulFloor=d.shortHaulFloor}
      migrateTraderNames();
      await saveAllLocal();
      showToast('Imported! All data restored.','positive');
      render();
    }catch(err){showToast('Import error: '+err.message,'negative')}
  };
  r.readAsText(f);e.target.value='';
}
async function clearAll(){
  if(!confirm('Delete ALL data?'))return;
  if(!confirm('Really?'))return;
  S.buys=[];S.sells=[];S.rl=[];S.customers=[];S.mills=[];S.aiMsgs=[];
  S.lanes=[];S.quoteItems=[];S.quoteProfiles={default:{name:'Default',customers:[]}};
  await saveAllLocal();
  SS('aiMsgs',[]);
  render();
}

// Status bar clock
function initStatusBar(){
  const clockEl=document.getElementById('status-clock');
  const traderEl=document.getElementById('status-trader');
  if(traderEl)traderEl.textContent=S.trader||'—';
  if(clockEl){
    const tick=()=>{const now=new Date();clockEl.textContent=now.toLocaleTimeString('en-US',{hour12:false})};
    tick();setInterval(tick,1000);
  }
}

// INIT
async function init(){
  // Check for matrix-only mode first
  if(sessionStorage.getItem('syp_matrix_only')==='true'){
    launchMatrixMode();
    return;
  }

  // Always require login
  const isLoggedIn=sessionStorage.getItem('syp_logged_in')==='true';
  const sessionTrader=sessionStorage.getItem('syp_trader');

  if(!isLoggedIn||!sessionTrader){
    showLoginScreen();
    return;
  }
  
  // Set trader from session (locked after login)
  S.trader=sessionTrader;
  
  await initDB();
  await loadAllLocal();
  migrateTraderNames();
  if(!localStorage.getItem('syp_entityMigration_v1')){migrateEntityNames();localStorage.setItem('syp_entityMigration_v1','1')}

  // Init Supabase (loads from backend config or user settings)
  await loadSupabaseConfig()
  const sbUrl=LS('supabaseUrl','')||SUPABASE_URL;
  const sbKey=LS('supabaseKey','')||SUPABASE_KEY;
  if(sbUrl&&sbKey){
    initSupabase(sbUrl,sbKey);
    // Auto-pull on load with loading indicator
    const content=document.getElementById('content');
    if(content)content.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:60vh;color:var(--muted)"><div style="text-align:center"><div style="font-size:24px;margin-bottom:12px">☁️</div><div>Syncing from cloud...</div></div></div>';
    try{
      const result=await cloudSync('pull');
      if(result.success){
        // cloudSync('pull') already updated S.* and saved to IndexedDB — no need to reload
        migrateTraderNames();
        if(!localStorage.getItem('syp_entityMigration_v1')){migrateEntityNames();localStorage.setItem('syp_entityMigration_v1','1')}
        console.log('Cloud sync: pulled latest data');
      }
    }catch(e){
      console.log('Cloud sync failed:',e);
    }
  }
  
  // Update trader display in sidebar (read-only, shows who's logged in)
  const traderSelect=document.getElementById('trader-select');
  if(traderSelect){
    traderSelect.outerHTML=`<div style="padding:8px 12px;background:var(--card);border:1px solid ${traderColor(S.trader)};border-radius:4px;font-weight:600;color:${traderColor(S.trader)};text-align:center">${S.trader==='Admin'?'🔑 Admin':S.trader}</div>`;
  }
  
  document.getElementById('f-date').onchange=e=>{S.filters.date=e.target.value;render()};
  document.getElementById('f-prod').onchange=e=>{S.filters.prod=e.target.value;render()};
  document.getElementById('f-reg').onchange=e=>{S.filters.reg=e.target.value;render()};
  document.getElementById('f-prod').innerHTML='<option value="all">All Products</option>'+PRODUCTS.map(p=>`<option value="${p}">${p}</option>`).join('');

  // Initialize AI panel state
  document.getElementById('ai-panel').classList.toggle('collapsed',!S.aiPanelOpen);
  document.querySelector('.ai-toggle').style.display='';

  initStatusBar();
  if(typeof initKeyboard==='function')initKeyboard();
  render();
  updateNotificationBadge();

  // Show sync status
  if(sbUrl&&sbKey){
    showToast('☁️ Logged in as '+S.trader,'info');
  }
}

function showLoginScreen(){
  document.querySelector('.ai-toggle').style.display='none';
  document.getElementById('app').innerHTML=`
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:var(--bg)">
      <div style="background:var(--panel);border:1px solid var(--border);padding:40px;width:320px;text-align:center">
        <div style="background:linear-gradient(135deg,var(--accent),#3a5eb8);padding:12px;font-weight:700;font-size:16px;color:var(--bg);margin-bottom:24px">SYP ANALYTICS</div>
        <div style="color:var(--muted);font-size:11px;margin-bottom:20px">Buckeye Pacific</div>
        <select id="login-trader" style="width:100%;padding:12px;margin-bottom:12px;text-align:center;font-size:14px">
          ${ALL_LOGINS.map(t=>`<option value="${t}"${t==='Admin'?' style="font-weight:bold;color:#e8734a"':''}>${t==='Admin'?'🔑 Admin':t}</option>`).join('')}
        </select>
        <input type="password" id="login-password" placeholder="Enter your password" style="width:100%;padding:12px;margin-bottom:16px;text-align:center" onkeydown="if(event.key==='Enter')doLogin()">
        <button class="btn btn-primary" style="width:100%" onclick="doLogin()">Login</button>
        <div id="login-error" style="color:var(--negative);font-size:11px;margin-top:12px"></div>
        <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px">
          <div style="color:var(--muted);font-size:10px;margin-bottom:8px">First time? Set your password:</div>
          <input type="password" id="new-password" placeholder="New password" style="width:100%;padding:8px;margin-bottom:8px;text-align:center;font-size:12px">
          <button class="btn btn-default btn-sm" style="width:100%" onclick="setupTraderPassword()">Set Password</button>
        </div>
        <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px">
          <button class="btn btn-default" style="width:100%;padding:10px;font-size:12px" onclick="showMatrixLogin()">📊 Matrix Login</button>
          <div style="color:var(--muted);font-size:9px;margin-top:4px">View pricing matrix only</div>
        </div>
      </div>
    </div>`;
  setTimeout(()=>document.getElementById('login-password')?.focus(),100);
}

function showMatrixLogin(){
  document.getElementById('app').innerHTML=`
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:var(--bg)">
      <div style="background:var(--panel);border:1px solid var(--border);padding:40px;width:320px;text-align:center">
        <div style="background:linear-gradient(135deg,var(--accent),#3a5eb8);padding:12px;font-weight:700;font-size:16px;color:var(--bg);margin-bottom:24px">PRICING MATRIX</div>
        <div style="color:var(--muted);font-size:11px;margin-bottom:20px">Enter PIN to view mill pricing</div>
        <input type="password" id="matrix-pin" placeholder="Enter PIN" style="width:100%;padding:12px;margin-bottom:16px;text-align:center;font-size:18px;letter-spacing:8px" maxlength="10" onkeydown="if(event.key==='Enter')doMatrixLogin()">
        <button class="btn btn-primary" style="width:100%" onclick="doMatrixLogin()">View Matrix</button>
        <div id="matrix-login-error" style="color:var(--negative);font-size:11px;margin-top:12px"></div>
        <button class="btn btn-default btn-sm" style="margin-top:16px" onclick="showLoginScreen()">← Back to Login</button>
      </div>
    </div>`;
  setTimeout(()=>document.getElementById('matrix-pin')?.focus(),100);
}

async function doMatrixLogin(){
  const pin=document.getElementById('matrix-pin')?.value||'';
  const errEl=document.getElementById('matrix-login-error');
  if(!pin){errEl.textContent='Enter a PIN';return;}
  errEl.textContent='Checking...';
  try{
    const res=await fetch('/api/pricing/auth',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({password:pin})
    });
    const data=await res.json();
    if(data.ok){
      sessionStorage.setItem('syp_matrix_only','true');
      launchMatrixMode();
    }else{
      errEl.textContent='Invalid PIN';
    }
  }catch(e){
    errEl.textContent='Connection error';
  }
}

let _matrixModeTab='matrix';

function launchMatrixMode(){
  _matrixModeTab='matrix';
  // Hide sidebar, AI panel, mobile nav — show only the matrix
  document.getElementById('app').innerHTML=`
    <div style="background:var(--panel);border-bottom:1px solid var(--border);padding:12px 24px;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:16px;font-weight:700;color:var(--accent);letter-spacing:1px">SYP PRICING MATRIX</div>
      <div style="display:flex;align-items:center;gap:16px">
        <span id="matrix-updated" style="font-size:10px;color:var(--muted)"></span>
        <span style="font-size:11px;color:var(--muted);cursor:pointer;text-decoration:underline" onclick="exitMatrixMode()">Logout</span>
      </div>
    </div>
    <div style="display:flex;gap:0;background:var(--panel);border-bottom:1px solid var(--border);padding:0 24px">
      <button class="tab-btn active" id="mtab-matrix" onclick="switchMatrixTab('matrix')" style="padding:10px 20px;font-size:12px;font-weight:600;color:var(--accent);background:none;border:none;border-bottom:2px solid var(--accent);cursor:pointer;font-family:inherit;text-transform:uppercase;letter-spacing:0.5px">Matrix</button>
      <button class="tab-btn" id="mtab-quotes" onclick="switchMatrixTab('quotes')" style="padding:10px 20px;font-size:12px;font-weight:600;color:var(--muted);background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;font-family:inherit;text-transform:uppercase;letter-spacing:0.5px">Quote Builder</button>
    </div>
    <div id="matrix-content" style="padding:16px">
      <div class="spinner" style="margin:40px auto"></div>
    </div>
    <div id="matrix-quotes-content" style="padding:16px;display:none"></div>`;
  // Override body/app styles that clip scrolling
  document.body.style.overflow='auto';
  document.body.style.height='auto';
  document.getElementById('app').style.display='block';
  document.getElementById('app').style.height='auto';
  // Hide everything else
  const sidebar=document.querySelector('.sidebar');
  const mobileHeader=document.querySelector('.mobile-header');
  const mobileNav=document.querySelector('.mobile-nav');
  const aiToggle=document.querySelector('.ai-toggle');
  const aiPanel=document.getElementById('ai-panel');
  if(sidebar)sidebar.style.display='none';
  if(mobileHeader)mobileHeader.style.display='none';
  if(mobileNav)mobileNav.style.display='none';
  if(aiToggle)aiToggle.style.display='none';
  if(aiPanel)aiPanel.style.display='none';
  loadMatrixView();
}

function switchMatrixTab(tab){
  _matrixModeTab=tab;
  const mTab=document.getElementById('mtab-matrix');
  const qTab=document.getElementById('mtab-quotes');
  const mContent=document.getElementById('matrix-content');
  const qContent=document.getElementById('matrix-quotes-content');
  if(!mTab||!qTab||!mContent||!qContent)return;
  mTab.style.color=tab==='matrix'?'var(--accent)':'var(--muted)';
  mTab.style.borderBottomColor=tab==='matrix'?'var(--accent)':'transparent';
  qTab.style.color=tab==='quotes'?'var(--accent)':'var(--muted)';
  qTab.style.borderBottomColor=tab==='quotes'?'var(--accent)':'transparent';
  mContent.style.display=tab==='matrix'?'':'none';
  qContent.style.display=tab==='quotes'?'':'none';
  if(tab==='matrix')loadMatrixView();
  if(tab==='quotes')loadMatrixQuoteBuilder();
}

async function loadMatrixQuoteBuilder(){
  const el=document.getElementById('matrix-quotes-content');
  if(!el)return;
  el.innerHTML='<div class="spinner" style="margin:40px auto"></div>';
  try{
    if(typeof renderMiSmartQuotesInline==='function'){
      await renderMiSmartQuotesInline(el);
    }else{
      el.innerHTML='<div style="text-align:center;color:var(--muted);padding:40px">Quote Builder not available</div>';
    }
  }catch(e){
    el.innerHTML=`<div style="text-align:center;color:var(--negative);padding:40px">Error: ${e.message}</div>`;
  }
}

function exitMatrixMode(){
  sessionStorage.removeItem('syp_matrix_only');
  location.reload();
}

async function loadMatrixView(){
  const el=document.getElementById('matrix-content');
  if(!el)return;
  el.innerHTML='<div class="spinner" style="margin:40px auto"></div>';
  try{
    // Sync cutoff from server so portal matches in-app matrix exactly
    try{const cr=await fetch('/api/pricing/cutoff');if(cr.ok){const cd=await cr.json();_miMatrixCutoff=cd.since||''}}catch(e){}
    // Use the exact same renderer as the in-app profile matrix
    _miMatrixHideEmpty=true;
    _miMatrixHideMills=true;
    _miMatrixProduct='';
    const wrapper=document.createElement('div');
    wrapper.id='mi-agg-content';
    wrapper.innerHTML='<div class="card-body"><div class="spinner" style="margin:20px auto"></div></div>';
    el.innerHTML='';
    el.appendChild(wrapper);
    await miRenderGranularMatrix(wrapper);
    document.getElementById('matrix-updated').textContent='Updated '+new Date().toLocaleTimeString();
  }catch(e){
    el.innerHTML=`<div style="text-align:center;color:var(--negative);padding:40px">Error: ${e.message}</div>`;
  }
}

async function doLogin(){
  const trader=document.getElementById('login-trader')?.value||'Ian P';
  const input=document.getElementById('login-password')?.value||'';
  const errEl=document.getElementById('login-error');

  errEl.textContent='Checking...';

  // Pull passwords from cloud first
  await loadSupabaseConfig()
  let passwords=safeJSONParse(localStorage.getItem('traderPasswords'),{});
  if(!SUPABASE_URL||!SUPABASE_KEY){
    // Skip cloud pull if not configured
  }else try{
    const res=await fetch(`${SUPABASE_URL}/rest/v1/syp_data?user_id=eq.default&select=data`,{
      headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}
    });
    const rows=await res.json();
    if(rows&&rows[0]?.data?.traderPasswords){
      // Merge cloud passwords with local (cloud takes priority)
      const cloudPwds=rows[0].data.traderPasswords;
      passwords={...passwords,...cloudPwds};
      localStorage.setItem('traderPasswords',JSON.stringify(passwords));
    }
  }catch(e){console.log('Could not fetch cloud passwords:',e)}

  const stored=passwords[trader]||'';

  if(!stored){
    errEl.textContent='No password set for '+trader+'. Set one below.';
    return;
  }

  // Secure hash comparison
  const hash=await hashPassword(input)

  // Also accept legacy btoa hash for migration (one-time)
  const legacyHash=btoa(input.split('').reverse().join('')+input.length)
  const isLegacy=hash!==stored&&legacyHash===stored

  if(hash===stored||isLegacy){
    // Migrate legacy hash to SHA-256
    if(isLegacy){
      passwords[trader]=hash
      localStorage.setItem('traderPasswords',JSON.stringify(passwords))
      try{
        const pullRes=await fetch(`${SUPABASE_URL}/rest/v1/syp_data?user_id=eq.default&select=data`,{
          headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}
        })
        const pullRows=await pullRes.json()
        if(pullRows&&pullRows[0]?.data){
          pullRows[0].data.traderPasswords={...(pullRows[0].data.traderPasswords||{}),...passwords}
          await fetch(`${SUPABASE_URL}/rest/v1/syp_data?user_id=eq.default`,{
            method:'PATCH',
            headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json','Prefer':'return=minimal'},
            body:JSON.stringify({data:pullRows[0].data})
          })
        }
      }catch(e){console.log('Legacy hash migration sync failed:',e)}
    }
    S.trader=trader;
    SS('trader',trader);
    sessionStorage.setItem('syp_logged_in','true');
    sessionStorage.setItem('syp_trader',trader);
    location.reload();
  }else{
    errEl.textContent='Incorrect password for '+trader;
  }
}

async function setupTraderPassword(){
  const trader=document.getElementById('login-trader')?.value||'Ian P';
  const pwd=document.getElementById('new-password')?.value||'';
  const errEl=document.getElementById('login-error');

  if(!pwd||pwd.length<3){
    errEl.textContent='Password must be at least 3 characters';
    return;
  }

  errEl.textContent='Saving...';

  const passwords=safeJSONParse(localStorage.getItem('traderPasswords'),{});
  const hash=await hashPassword(pwd)
  passwords[trader]=hash;
  localStorage.setItem('traderPasswords',JSON.stringify(passwords));

  // Sync to cloud
  await loadSupabaseConfig()
  if(!SUPABASE_URL||!SUPABASE_KEY){
    errEl.innerHTML=`<span style="color:var(--positive)">Password set locally for ${escapeHtml(trader)}. Cloud sync not configured.</span>`;
    document.getElementById('new-password').value='';
    return;
  }
  try{
    // First pull existing data
    const res=await fetch(`${SUPABASE_URL}/rest/v1/syp_data?user_id=eq.default&select=data`,{
      headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}
    });
    const rows=await res.json();
    let existingData=rows&&rows[0]?.data?rows[0].data:{};

    // Merge passwords
    existingData.traderPasswords={...(existingData.traderPasswords||{}),...passwords};

    // Push back
    const method=rows&&rows.length>0?'PATCH':'POST';
    const url=method==='PATCH'?`${SUPABASE_URL}/rest/v1/syp_data?user_id=eq.default`:`${SUPABASE_URL}/rest/v1/syp_data`;
    const body=method==='PATCH'?{data:existingData}:{user_id:'default',data:existingData};

    await fetch(url,{
      method,
      headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify(body)
    });

    errEl.innerHTML=`<span style="color:var(--positive)">Password set for ${escapeHtml(trader)}! Now login above.</span>`;
  }catch(e){
    console.log('Cloud sync failed:',e);
    errEl.innerHTML=`<span style="color:var(--positive)">Password set locally for ${escapeHtml(trader)}.</span>`;
  }

  document.getElementById('new-password').value='';
}

async function setAppPassword(pwd){
  if(!pwd||pwd.length<3){
    showToast('Password must be at least 3 characters','warn');
    return;
  }
  const passwords=safeJSONParse(localStorage.getItem('traderPasswords'),{});
  const hash=await hashPassword(pwd)
  passwords[S.trader]=hash;
  localStorage.setItem('traderPasswords',JSON.stringify(passwords));
  showToast('Password updated for '+S.trader,'positive');
  // Sync passwords to cloud
  if(supabase){cloudSync('push').catch(()=>{});}
}

function doLogout(){
  sessionStorage.removeItem('syp_logged_in');
  sessionStorage.removeItem('syp_trader');
  location.reload();
}

// Mobile navigation functions
function toggleMobileSidebar(){
  const sidebar=document.getElementById('sidebar');
  const overlay=document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
}

function closeMobileSidebar(){
  const sidebar=document.getElementById('sidebar');
  const overlay=document.getElementById('sidebar-overlay');
  sidebar.classList.remove('open');
  overlay.classList.remove('open');
}

function updateMobileNav(){
  // Update active state on mobile nav
  const views=['dashboard','insights','charts','quotes','blotter'];
  views.forEach(v=>{
    const el=document.getElementById('mnav-'+v);
    if(el){
      el.classList.toggle('active',S.view===v);
    }
  });
}

function showToast(msg,type='info'){
  let c=document.getElementById('toast-container');
  if(!c){c=document.createElement('div');c.id='toast-container';c.className='toast-container';document.body.appendChild(c)}
  const icons={positive:'✓',warn:'⚠',negative:'✗',info:'ℹ'};
  const t=document.createElement('div');
  t.className='toast toast-'+type;
  t.innerHTML='<span class="toast-icon">'+(icons[type]||icons.info)+'</span><span class="toast-msg">'+escapeHtml(String(msg))+'</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>';
  c.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('toast-visible'));
  setTimeout(()=>{t.classList.remove('toast-visible');setTimeout(()=>t.remove(),300)},3000);
}

// Toggle sidebar collapse
function toggleSidebar(){
  const sidebar=document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
  S.sidebarCollapsed=sidebar.classList.contains('collapsed');
  SS('sidebarCollapsed',S.sidebarCollapsed);
  const btn=sidebar.querySelector('.sidebar-toggle-btn');
  if(btn)btn.innerHTML=S.sidebarCollapsed?'&#9654;':'&#9664;';
}

// Toggle light/dark theme
function toggleTheme(){
  const html=document.documentElement;
  const current=html.getAttribute('data-theme');
  const next=current==='light'?'dark':'light';
  html.setAttribute('data-theme',next);
  SS('theme',next);
}

// Styled confirmation dialog (replaces browser confirm())
function showConfirm(message,onConfirm){
  document.getElementById('modal').innerHTML=
    '<div class="modal-overlay" onclick="closeModal()">'+
    '<div class="modal" style="width:400px" onclick="event.stopPropagation()">'+
    '<div class="modal-header"><span class="modal-title" style="color:var(--warn)">Confirm</span><button class="modal-close" onclick="closeModal()">×</button></div>'+
    '<div class="modal-body"><p style="font-size:13px;line-height:1.6">'+message+'</p></div>'+
    '<div class="modal-footer"><button class="btn btn-default" onclick="closeModal()">Cancel</button>'+
    '<button class="btn btn-danger" id="confirm-yes-btn">Confirm</button></div></div></div>';
  document.getElementById('confirm-yes-btn').onclick=function(){closeModal();onConfirm()};
}

// Export current view to PDF
function exportPDF(){
  if(typeof html2pdf==='undefined'){
    showToast('html2pdf library not loaded','negative');
    return;
  }
  showToast('Generating PDF...','info');
  const content=document.getElementById('content');
  if(!content)return;

  // Save current theme and switch to light for white-background capture
  const html=document.documentElement;
  const prevTheme=html.getAttribute('data-theme');
  html.setAttribute('data-theme','light');
  content.classList.add('pdf-export-mode');

  const viewName=NAV.find(n=>n.id===S.view)?.label||S.view;
  const filename=`SYP_${viewName.replace(/\s+/g,'_')}_${today()}.pdf`;

  const opt={
    margin:8,
    filename,
    image:{type:'jpeg',quality:0.95},
    html2canvas:{scale:2,useCORS:true,logging:false},
    jsPDF:{unit:'mm',format:'a4',orientation:'landscape'}
  };

  html2pdf().set(opt).from(content).save().then(()=>{
    // Restore theme
    content.classList.remove('pdf-export-mode');
    if(prevTheme)html.setAttribute('data-theme',prevTheme);
    else html.removeAttribute('data-theme');
    showToast('PDF exported: '+filename,'positive');
  }).catch(err=>{
    content.classList.remove('pdf-export-mode');
    if(prevTheme)html.setAttribute('data-theme',prevTheme);
    else html.removeAttribute('data-theme');
    showToast('PDF export failed: '+err.message,'negative');
  });
}

// ============================================================================
// TAB SWITCHING
// ============================================================================

function switchTab(tabName){
  // Map shortcut names to view IDs
  const tabMap={
    'dashboard':'dashboard',
    'blotter':'blotter',
    'quotes':'quotes',
    'risk':'risk',
    'crm':'crm',
    'millintel':'mi-prices',
    'analytics':'benchmark',
    'leaderboard':'leaderboard',
    'pnl':'pnl-calendar',
    'settings':'settings'
  }
  const viewId=tabMap[tabName]||tabName
  if(typeof go==='function')go(viewId)
}

// ============================================================================
// GLOBAL SEARCH
// ============================================================================

function globalSearch(query){
  if(!query||!query.trim())return{trades:[],customers:[],mills:[],quotes:[]}
  const q=query.trim().toLowerCase()
  const results={trades:[],customers:[],mills:[],quotes:[]}

  // Search trades (buys + sells)
  S.buys.forEach(b=>{
    const haystack=[b.mill,b.product,b.region,b.orderNum,b.po,b.notes,b.trader].filter(Boolean).join(' ').toLowerCase()
    if(haystack.includes(q))results.trades.push({type:'buy',...b})
  })
  S.sells.forEach(s=>{
    const haystack=[s.customer,s.product,s.destination,s.orderNum,s.linkedPO,s.oc,s.notes,s.trader].filter(Boolean).join(' ').toLowerCase()
    if(haystack.includes(q))results.trades.push({type:'sell',...s})
  })

  // Search customers
  ;(S.customers||[]).forEach(c=>{
    const haystack=[c.name,c.company,c.city,c.state,c.notes].filter(Boolean).join(' ').toLowerCase()
    if(haystack.includes(q))results.customers.push(c)
  })

  // Search mills
  ;(S.mills||[]).forEach(m=>{
    const haystack=[m.name,m.company,m.city,m.state,m.region,m.notes].filter(Boolean).join(' ').toLowerCase()
    if(haystack.includes(q))results.mills.push(m)
  })

  // Search quote items
  ;(S.quoteItems||[]).forEach(qi=>{
    const haystack=[qi.product,qi.customer,qi.notes].filter(Boolean).join(' ').toLowerCase()
    if(haystack.includes(q))results.quotes.push(qi)
  })

  return results
}

// ============================================================================
// NOTIFICATION BADGE
// ============================================================================

function updateNotificationBadge(){
  // Count pending items: unread alerts + unmatched sells
  let count=0
  if(typeof getUnreadAlertCount==='function')count+=getUnreadAlertCount()

  // Update badge in sidebar nav if element exists
  const badge=document.getElementById('notification-badge')
  if(badge){
    if(count>0){
      badge.textContent=count>99?'99+':count
      badge.style.display='inline-block'
    }else{
      badge.style.display='none'
    }
  }
}

// Apply saved theme on load
(function(){
  const saved=localStorage.getItem('syp_theme');
  if(saved)document.documentElement.setAttribute('data-theme',saved);
  // Apply saved sidebar state (default to collapsed on first visit)
  const sidebarCollapsed=localStorage.getItem('syp_sidebarCollapsed')===null?true:LS('sidebarCollapsed',false);
  if(sidebarCollapsed){
    const sb=document.getElementById('sidebar');
    if(sb){sb.classList.add('collapsed');const btn=sb.querySelector('.sidebar-toggle-btn');if(btn)btn.innerHTML='&#9654;';}
  }
})();

init();
