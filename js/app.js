// SYP Analytics - App Init & Settings
// SETTINGS
function saveKey(){S.apiKey=document.getElementById('api-key').value.trim();SS('apiKey',S.apiKey);alert('Saved!')}
function saveFlatRate(){S.flatRate=parseFloat(document.getElementById('flat-rate').value)||3.50;SS('flatRate',S.flatRate);alert('Flat rate saved: $'+S.flatRate+'/mile')}

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
  const url=document.getElementById('sb-url')?.value.trim()||DEFAULT_SUPABASE_URL;
  const key=document.getElementById('sb-key')?.value.trim()||DEFAULT_SUPABASE_KEY;
  const user=document.getElementById('sb-user')?.value.trim()||'default';
  
  SS('supabaseUrl',url);
  SS('supabaseKey',key);
  SS('supabaseUserId',user);
  
  if(url&&key){
    initSupabase(url,key);
    alert('Supabase configured! You can now sync to cloud.');
  }else{
    alert('Supabase disabled (URL or key missing)');
  }
  render();
}

function saveUserIdOnly(){
  const user=document.getElementById('sb-user')?.value.trim()||'default';
  SS('supabaseUserId',user);
  
  // Re-init with defaults + new user ID
  initSupabase(DEFAULT_SUPABASE_URL,DEFAULT_SUPABASE_KEY);
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
  const d=t==='buys'?S.buys:S.sells;if(!d.length){alert('No data');return}
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
      alert('Imported! All data including quote engine settings restored.');
      render();
    }catch(err){alert('Error: '+err.message)}
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

// INIT
async function init(){
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

  // Init Supabase (uses hardcoded defaults if not overridden)
  const sbUrl=LS('supabaseUrl','')||DEFAULT_SUPABASE_URL;
  const sbKey=LS('supabaseKey','')||DEFAULT_SUPABASE_KEY;
  if(sbUrl&&sbKey){
    initSupabase(sbUrl,sbKey);
    // Auto-pull on load
    try{
      const result=await cloudSync('pull');
      if(result.success){
        await loadAllLocal(); // Reload with cloud data
        migrateTraderNames();
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

  render();
  
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
      </div>
    </div>`;
  setTimeout(()=>document.getElementById('login-password')?.focus(),100);
}

async function doLogin(){
  const trader=document.getElementById('login-trader')?.value||'Ian P';
  const input=document.getElementById('login-password')?.value||'';
  const errEl=document.getElementById('login-error');

  errEl.textContent='Checking...';

  // Pull passwords from cloud first
  let passwords=JSON.parse(localStorage.getItem('traderPasswords')||'{}');
  try{
    const res=await fetch(`${DEFAULT_SUPABASE_URL}/rest/v1/syp_data?user_id=eq.default&select=data`,{
      headers:{'apikey':DEFAULT_SUPABASE_KEY,'Authorization':`Bearer ${DEFAULT_SUPABASE_KEY}`}
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

  // Simple hash comparison
  const hash=btoa(input.split('').reverse().join('')+input.length);

  if(hash===stored){
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

  const passwords=JSON.parse(localStorage.getItem('traderPasswords')||'{}');
  const hash=btoa(pwd.split('').reverse().join('')+pwd.length);
  passwords[trader]=hash;
  localStorage.setItem('traderPasswords',JSON.stringify(passwords));

  // Sync to cloud
  try{
    // First pull existing data
    const res=await fetch(`${DEFAULT_SUPABASE_URL}/rest/v1/syp_data?user_id=eq.default&select=data`,{
      headers:{'apikey':DEFAULT_SUPABASE_KEY,'Authorization':`Bearer ${DEFAULT_SUPABASE_KEY}`}
    });
    const rows=await res.json();
    let existingData=rows&&rows[0]?.data?rows[0].data:{};

    // Merge passwords
    existingData.traderPasswords={...(existingData.traderPasswords||{}),...passwords};

    // Push back
    const method=rows&&rows.length>0?'PATCH':'POST';
    const url=method==='PATCH'?`${DEFAULT_SUPABASE_URL}/rest/v1/syp_data?user_id=eq.default`:`${DEFAULT_SUPABASE_URL}/rest/v1/syp_data`;
    const body=method==='PATCH'?{data:existingData}:{user_id:'default',data:existingData};

    await fetch(url,{
      method,
      headers:{'apikey':DEFAULT_SUPABASE_KEY,'Authorization':`Bearer ${DEFAULT_SUPABASE_KEY}`,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify(body)
    });

    errEl.innerHTML=`<span style="color:var(--positive)">✓ Password set for ${trader}! Now login above.</span>`;
  }catch(e){
    console.log('Cloud sync failed:',e);
    errEl.innerHTML=`<span style="color:var(--positive)">✓ Password set locally for ${trader}.</span>`;
  }

  document.getElementById('new-password').value='';
}

function setAppPassword(pwd){
  if(!pwd||pwd.length<3){
    showToast('Password must be at least 3 characters','warn');
    return;
  }
  const passwords=JSON.parse(localStorage.getItem('traderPasswords')||'{}');
  const hash=btoa(pwd.split('').reverse().join('')+pwd.length);
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
  t.innerHTML='<span class="toast-icon">'+(icons[type]||icons.info)+'</span><span class="toast-msg">'+msg+'</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>';
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
