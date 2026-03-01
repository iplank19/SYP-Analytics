// SYP Analytics - Views & Render

// ----- Ordinal suffix helper -----
function ordinal(n){const s=['th','st','nd','rd'],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0]);}

// ----- RL Historical Data Fetch Helpers -----
if(!window._rlCache)window._rlCache={};

function _rlRangeFrom(range){
  const now=new Date();
  const days={
    '1M':30,'1Y':365,'5Y':1825,'10Y':3650
  }[range];
  if(!days)return ''; // 'All' — no from filter
  const d=new Date(now.getTime()-days*86400000);
  return d.toISOString().slice(0,10);
}

async function rlFetchChartData(product,range){
  const cacheKey=`${product}_${range}`;
  if(window._rlCache[cacheKey])return; // already fetching or cached
  window._rlCache[cacheKey]=null; // mark as fetching
  try{
    const from=_rlRangeFrom(range);
    const qs=`product=${encodeURIComponent(product)}&length=RL${from?'&from='+from:''}`;
    const res=await fetch(`/api/rl/chart-batch?${qs}`);
    const data=await res.json();
    // Convert server spread objects to flat arrays aligned with west dates
    const spread46=(data.spread46||[]).map(s=>s.spread);
    const spreadWC=(data.spreadWC||[]).map(s=>s.spread);
    window._rlCache[cacheKey]={west:data.west,central:data.central,east:data.east,spread46,spreadWC};
    render();
  }catch(e){
    console.warn('RL chart fetch error:',e);
    delete window._rlCache[cacheKey];
  }
}

async function rlFetchSpreads(region,range,dateFrom,dateTo,excludeCovid){
  const from=dateFrom||_rlRangeFrom(range);
  const covid=excludeCovid||'0';
  const cacheKey=`spreads_${region}_${from}_${dateTo||''}_covid${covid}`;
  if(window._rlCache[cacheKey])return;
  window._rlCache[cacheKey]=null;
  try{
    let qs=`region=${region}`;
    if(from)qs+=`&from=${from}`;
    if(dateTo)qs+=`&to=${dateTo}`;
    if(covid==='1')qs+=`&exclude_covid=1`;
    const res=await fetch(`/api/rl/spreads?${qs}`);
    window._rlCache[cacheKey]=await res.json();
    render();
  }catch(e){
    console.warn('RL spreads fetch error:',e);
    delete window._rlCache[cacheKey];
  }
}

async function rlFetchCompareData(prod1,prod2,region,length,range){
  const cacheKey=`compare_${prod1}_${prod2}_${region}_${length}_${range}`;
  if(window._rlCache[cacheKey]!==undefined)return;
  window._rlCache[cacheKey]=null;
  try{
    const from=_rlRangeFrom(range);
    const lenParam=length==='composite'?'RL':length;
    const [d1,d2]=await Promise.all([
      fetch(`/api/rl/history?product=${encodeURIComponent(prod1)}&region=${region}&length=${lenParam}${from?'&from='+from:''}`).then(r=>r.json()),
      fetch(`/api/rl/history?product=${encodeURIComponent(prod2)}&region=${region}&length=${lenParam}${from?'&from='+from:''}`).then(r=>r.json())
    ]);
    const p1Map=Object.fromEntries(d1.map(r=>[r.date,r.price]));
    const p2Map=Object.fromEntries(d2.map(r=>[r.date,r.price]));
    const allDates=[...new Set([...d1.map(r=>r.date),...d2.map(r=>r.date)])].sort();
    const history=allDates.map(date=>{
      const p1=p1Map[date]||null;
      const p2=p2Map[date]||null;
      return{date,p1,p2,spread:p1&&p2?Math.round(p2-p1):null};
    }).filter(h=>h.p1||h.p2);
    window._rlCache[cacheKey]=history;
    window._rlCompareExpanded=false;
    render();
  }catch(e){
    console.warn('RL compare fetch error:',e);
    delete window._rlCache[cacheKey];
  }
}

async function rlFetchForecast(product,region,weeks){
  const cacheKey=`forecast_${product}_${region}_${weeks}`;
  if(window._rlCache[cacheKey]!==undefined)return;
  window._rlCache[cacheKey]=null;
  try{
    const res=await fetch(`/api/forecast/shortterm?product=${encodeURIComponent(product)}&region=${region}&weeks=${weeks}`);
    window._rlCache[cacheKey]=await res.json();
    render();
  }catch(e){
    console.warn('Forecast fetch error:',e);
    delete window._rlCache[cacheKey];
  }
}

async function rlFetchSeasonal(product,region,years){
  const cacheKey=`seasonal_${product}_${region}_${years||5}`;
  if(window._rlCache[cacheKey]!==undefined)return;
  window._rlCache[cacheKey]=null;
  try{
    const res=await fetch(`/api/forecast/seasonal?product=${encodeURIComponent(product)}&region=${region}&years=${years||5}`);
    window._rlCache[cacheKey]=await res.json();
    render();
  }catch(e){
    console.warn('Seasonal fetch error:',e);
    delete window._rlCache[cacheKey];
  }
}

function renderNav(){
  document.getElementById('nav').innerHTML=NAV.map(n=>`<button class="nav-item ${S.view===n.id?'active':''}" onclick="go('${n.id}')"${S.view===n.id?' aria-current="page"':''}><span>${n.icon}</span><span class="nav-label">${n.label}</span></button>`).join('');
}

function renderBreadcrumbs(){
  const bc=document.getElementById('breadcrumbs');
  if(!bc)return;
  const navItem=NAV.find(n=>n.id===S.view);
  if(!navItem){bc.innerHTML='';return}
  const subTabMap={
    dashboard:null,
    trading:null,
    quotes:null,
    millintel:{stateKey:'miTab',tabs:{intake:'Intake',prices:'Prices'}},
    analytics:{stateKey:'analyticsTab',tabs:{spreads:'Spreads',charts:'Charts',compare:'Compare',forecast:'Forecast',details:'Details'}},
    poanalysis:{stateKey:'poTab',tabs:{trends:'Trends',data:'Data'}},
    crm:{stateKey:'crmTab',tabs:{prospects:'Prospects',customers:'Customers',mills:'Mills'}}
  };
  let crumb=`<span class="bc-current">${navItem.label}</span>`;
  const sub=subTabMap[S.view];
  if(sub){
    const tabVal=S[sub.stateKey];
    const tabLabel=sub.tabs[tabVal];
    if(tabLabel)crumb+=` <span>›</span> <span class="bc-current">${tabLabel}</span>`;
  }
  bc.innerHTML=crumb;
}

function renderMkt(){
  const rl=S.rl.length?S.rl[S.rl.length-1]:null;
  document.getElementById('mkt-w').textContent=rl?.west?.['2x4#2']?fmt(rl.west['2x4#2']):'—';
  document.getElementById('mkt-c').textContent=rl?.central?.['2x4#2']?fmt(rl.central['2x4#2']):'—';
  document.getElementById('mkt-e').textContent=rl?.east?.['2x4#2']?fmt(rl.east['2x4#2']):'—';
  document.getElementById('mkt-d').textContent=rl?.date||'';
}

function _renderStaleRLBanner(){
  if(S._rlBannerDismissed)return '';
  const _now=Date.now();
  let msg='',showDismiss=false;
  if(!S.rl||!S.rl.length){
    msg='No Random Lengths data uploaded yet — prices and analytics need RL data.';
  }else{
    const latest=S.rl[S.rl.length-1];
    const age=Math.floor((_now-new Date(latest.date).getTime())/86400000);
    if(age>7){
      msg=`Random Lengths data is ${age} days old (${latest.date}) — update for accurate pricing.`;
      showDismiss=true;
    }else return '';
  }
  return `<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;margin-bottom:12px;border-radius:var(--radius);border:1px solid rgba(243,139,168,0.25);background:rgba(240,136,62,0.08)">
    <span style="font-size:18px;flex-shrink:0">⚠️</span>
    <span style="flex:1;color:#f0883e;font-size:13px;font-weight:500">${msg}</span>
    <button class="btn btn-sm btn-primary" onclick="showParseModal()" style="white-space:nowrap">Upload RL PDF</button>
    ${showDismiss?'<button class="btn btn-sm btn-default" onclick="S._rlBannerDismissed=true;render()" style="white-space:nowrap">Dismiss</button>':''}
  </div>`;
}

function renderSkeleton(){
  return `<div style="padding:8px 0">
    <div class="skeleton skeleton-bar" style="width:40%"></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0">
      <div class="skeleton skeleton-kpi"></div><div class="skeleton skeleton-kpi"></div><div class="skeleton skeleton-kpi"></div><div class="skeleton skeleton-kpi"></div>
    </div>
    <div class="skeleton skeleton-bar" style="width:25%;margin-top:16px"></div>
    <div class="skeleton skeleton-table" style="margin-top:8px"></div>
  </div>`;
}

// Backward-compat redirect map: old view IDs → {parent, stateKey, tab}
const _VIEW_REDIRECTS={
  'blotter':{parent:'trading',stateKey:'tradingTab',tab:'blotter'},
  'pnl-calendar':{parent:'trading',stateKey:'tradingTab',tab:'blotter'},
  'leaderboard':{parent:'dashboard',stateKey:null,tab:null},
  'insights':{parent:'analytics',stateKey:'analyticsTab',tab:'spreads'},
  'benchmark':{parent:'analytics',stateKey:'analyticsTab',tab:'spreads'},
  'risk':{parent:'analytics',stateKey:'analyticsTab',tab:'spreads'},
  'rldata':{parent:'analytics',stateKey:'analyticsTab',tab:'charts'},
  'charts':{parent:'analytics',stateKey:'analyticsTab',tab:'charts'},
  'spreads':{parent:'analytics',stateKey:'analyticsTab',tab:'spreads'},
  'compare':{parent:'analytics',stateKey:'analyticsTab',tab:'compare'},
  'details':{parent:'analytics',stateKey:'analyticsTab',tab:'details'},
  'mi-intake':{parent:'millintel',stateKey:'miTab',tab:'intake'},
  'mi-prices':{parent:'millintel',stateKey:'miTab',tab:'prices'},
  'mi-quotes':{parent:'quotes',stateKey:null,tab:null},
  'mill-pricing':{parent:'millintel',stateKey:'miTab',tab:'intake'},
  'products':{parent:'dashboard',stateKey:null,tab:null}
};

function _resolveView(v){
  const redir=_VIEW_REDIRECTS[v];
  if(redir){
    if(redir.stateKey){S[redir.stateKey]=redir.tab;SS(redir.stateKey,redir.tab);}
    return redir.parent;
  }
  return v;
}

function go(v){
  // Clear any pending blotter search timeout
  if(window._blotterSearchTimeout){clearTimeout(window._blotterSearchTimeout);window._blotterSearchTimeout=null;}
  v=_resolveView(v);
  const content=document.getElementById('content');
  if(content){content.classList.add('fading');content.innerHTML=renderSkeleton();}
  setTimeout(()=>{
    S.view=v;
    closeMobileSidebar();
    if(v==='crm'&&typeof loadCRMProspects==='function')loadCRMProspects();
    render();
    if(content)content.classList.remove('fading');
  },150);
}

function toggleAIPanel(){
  S.aiPanelOpen=!S.aiPanelOpen;
  SS('aiPanelOpen',S.aiPanelOpen);
  document.getElementById('ai-panel').classList.toggle('collapsed',!S.aiPanelOpen);
  if(S.aiPanelOpen)renderAIPanel();
}

function escapeHtml(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function renderMarkdown(text){
  let h=escapeHtml(text);
  // Code blocks (``` ... ```)
  h=h.replace(/```(\w*)\n?([\s\S]*?)```/g,(m,lang,code)=>`<pre><code>${code.trim()}</code></pre>`);
  // Inline code
  h=h.replace(/`([^`\n]+)`/g,'<code>$1</code>');
  // Bold
  h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  // Italic
  h=h.replace(/\*(.+?)\*/g,'<em>$1</em>');
  // Numbered lists: lines starting with "1. ", "2. " etc
  h=h.replace(/(^|\n)(\d+\.\s.+(?:\n\d+\.\s.+)*)/g,(m,pre,block)=>{
    const items=block.trim().split('\n').map(l=>l.replace(/^\d+\.\s/,''));
    return pre+'<ol>'+items.map(i=>'<li>'+i+'</li>').join('')+'</ol>';
  });
  // Bullet lists: lines starting with "- " or "• "
  h=h.replace(/(^|\n)([•\-]\s.+(?:\n[•\-]\s.+)*)/g,(m,pre,block)=>{
    const items=block.trim().split('\n').map(l=>l.replace(/^[•\-]\s/,''));
    return pre+'<ul>'+items.map(i=>'<li>'+i+'</li>').join('')+'</ul>';
  });
  // Line breaks (but not inside block elements)
  h=h.replace(/\n/g,'<br>');
  // Clean up <br> after block elements
  h=h.replace(/<\/(pre|ol|ul)><br>/g,'</$1>');
  h=h.replace(/<br><(pre|ol|ul)>/g,'<$1>');
  return h;
}

function renderAIPanel(){
  const msgs=document.getElementById('ai-msgs');
  if(!msgs)return;
  if(!S.apiKey){
    msgs.innerHTML='<div class="empty-state" style="font-size:10px;padding:20px">⚠️ Add your Claude API key in Settings first.</div>';
    return;
  }
  if(S.aiMsgs.length===0){
    msgs.innerHTML='<div class="empty-state" style="font-size:10px;padding:20px">Ask me anything about your trading data.<br><br>Examples:<br>• "How am I doing vs market?"<br>• "Which customers are most profitable?"<br>• "What\'s my margin by product?"</div>';
    return;
  }
  msgs.innerHTML=S.aiMsgs.filter(m=>!m.hidden).map(m=>`<div class="ai-msg ${m.role}">${m.role==='user'?escapeHtml(m.content):renderMarkdown(m.content)}</div>`).join('');
  msgs.scrollTop=msgs.scrollHeight;
}

function setTrader(t){
  S.trader=t;
  SS('trader',t);
  showToast('Viewing: '+t,'info');
  render();
}

// Check if current user can edit a trade (only individual traders can edit, not when viewing Department)

// P&L Calendar view
function renderPnLCalendar(){
  const dailyPnL=calcDailyPnL();
  const month=S.calendarMonth||today().slice(0,7);
  const yr=parseInt(month.split('-')[0]),mo=parseInt(month.split('-')[1]);
  const daysInMonth=new Date(yr,mo,0).getDate();
  const firstDow=new Date(yr,mo-1,1).getDay(); // 0=Sun
  const monthName=new Date(yr,mo-1,1).toLocaleString('en-US',{month:'long',year:'numeric'});

  // Gather month stats
  let monthTotal=0,bestDay=null,worstDay=null,tradingDays=0;
  const dayProfits=[];
  for(let d=1;d<=daysInMonth;d++){
    const key=`${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dp=dailyPnL[key];
    if(dp){
      monthTotal+=dp.total;
      tradingDays++;
      dayProfits.push(dp.total);
      if(!bestDay||dp.total>bestDay.val)bestDay={day:d,val:dp.total};
      if(!worstDay||dp.total<worstDay.val)worstDay={day:d,val:dp.total};
    }
  }
  const maxAbs=dayProfits.length?Math.max(...dayProfits.map(Math.abs)):1;

  // KPI row
  const kpis=`<div class="kpi-row" style="margin-bottom:16px">
    <div class="kpi-card"><div class="kpi-label">MONTH P&L</div><div class="kpi-value ${monthTotal>=0?'positive':'negative'}">${fmt(Math.round(monthTotal))}</div></div>
    <div class="kpi-card"><div class="kpi-label">BEST DAY</div><div class="kpi-value positive">${bestDay?fmt(Math.round(bestDay.val))+' ('+bestDay.day+')':'--'}</div></div>
    <div class="kpi-card"><div class="kpi-label">WORST DAY</div><div class="kpi-value negative">${worstDay?fmt(Math.round(worstDay.val))+' ('+worstDay.day+')':'--'}</div></div>
    <div class="kpi-card"><div class="kpi-label">TRADING DAYS</div><div class="kpi-value">${tradingDays}</div></div>
  </div>`;

  // Month nav
  const prevMonth=mo===1?`${yr-1}-12`:`${yr}-${String(mo-1).padStart(2,'0')}`;
  const nextMonth=mo===12?`${yr+1}-01`:`${yr}-${String(mo+1).padStart(2,'0')}`;
  const nav=`<div class="pnl-month-nav">
    <button onclick="S.calendarMonth='${prevMonth}';render()">&#9664; Prev</button>
    <span class="pnl-month-label">${monthName}</span>
    <button onclick="S.calendarMonth='${nextMonth}';render()">Next &#9654;</button>
  </div>`;

  // Calendar grid
  const dows=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let grid=`<div class="pnl-calendar-grid">`;
  grid+=dows.map(d=>`<div class="pnl-cal-dow">${d}</div>`).join('');
  // Empty cells before first day
  for(let i=0;i<firstDow;i++)grid+=`<div class="pnl-cal-cell empty"></div>`;
  // Day cells
  for(let d=1;d<=daysInMonth;d++){
    const key=`${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dp=dailyPnL[key];
    let bg='';
    let amtHtml='';
    let tradeCount='';
    if(dp){
      const alpha=Math.min(0.75,Math.max(0.15,Math.abs(dp.total)/maxAbs*0.75));
      bg=dp.total>=0?`rgba(74,158,110,${alpha.toFixed(2)})`:`rgba(224,82,82,${alpha.toFixed(2)})`;
      amtHtml=`<div class="pnl-cal-amt" style="color:${dp.total>=0?'var(--positive)':'var(--negative)'}">${dp.total>=0?'+':''}$${Math.abs(Math.round(dp.total)).toLocaleString()}</div>`;
      tradeCount=`<div class="pnl-cal-trades">${dp.trades.length} trade${dp.trades.length!==1?'s':''}</div>`;
    }else{
      bg='rgba(85,91,101,0.08)';
    }
    grid+=`<div class="pnl-cal-cell" style="background:${bg}" onclick="showPnLDayDetail('${key}')">
      <div class="pnl-cal-day">${d}</div>${amtHtml}${tradeCount}
    </div>`;
  }
  grid+=`</div>`;

  // Bar chart
  const barChart=`<div class="panel" style="margin-top:16px"><div class="panel-header">DAILY P&L</div><div class="panel-body"><div style="height:200px"><canvas id="pnl-daily-bar-chart"></canvas></div></div></div>`;

  // Day detail placeholder
  const detail=`<div id="pnl-day-detail"></div>`;

  // Export button
  const exportBtn=`<div style="margin-top:16px;text-align:right"><button class="btn btn-info" onclick="exportPDF()">Export PDF</button></div>`;

  return kpis+nav+grid+detail+barChart+exportBtn;
}

function showPnLDayDetail(dateKey){
  const dailyPnL=calcDailyPnL();
  const dp=dailyPnL[dateKey];
  const el=document.getElementById('pnl-day-detail');
  if(!el)return;
  // Toggle off if clicking same day
  if(el.dataset.active===dateKey){el.innerHTML='';el.dataset.active='';return;}
  el.dataset.active=dateKey;
  // Remove old selected
  document.querySelectorAll('.pnl-cal-cell.selected').forEach(c=>c.classList.remove('selected'));
  // Find and highlight clicked cell
  const cells=document.querySelectorAll('.pnl-cal-cell:not(.empty)');
  const dayNum=parseInt(dateKey.split('-')[2]);
  if(cells[dayNum-1])cells[dayNum-1].classList.add('selected');
  if(!dp||!dp.trades.length){
    el.innerHTML=`<div class="card pnl-day-detail"><div class="card-header"><span class="card-title">${fmtD(dateKey)}</span></div><div class="card-body"><div class="empty-state">No matched trades on this day</div></div></div>`;
    return;
  }
  const rows=dp.trades.map(t=>`<tr>
    <td>${escapeHtml(t.orderNum||'—')}</td>
    <td class="bold">${escapeHtml(t.customer||'')}</td>
    <td>${escapeHtml(t.product||'')}</td>
    <td class="right">${fmtN(t.volume)} MBF</td>
    <td class="right">${fmt(t.buyPrice)}</td>
    <td class="right">${fmt(t.sellPrice)}</td>
    <td class="right">${fmt(Math.round(t.freight))}</td>
    <td class="right bold ${t.profit>=0?'positive':'negative'}">${fmt(Math.round(t.profit))}</td>
  </tr>`).join('');
  el.innerHTML=`<div class="card pnl-day-detail">
    <div class="card-header">
      <span class="card-title">${fmtD(dateKey)} — ${dp.trades.length} Trade${dp.trades.length!==1?'s':''}</span>
      <span style="font-size:14px;font-weight:700;color:${dp.total>=0?'var(--positive)':'var(--negative)'}">${fmt(Math.round(dp.total))}</span>
    </div>
    <div class="card-body table-wrap" style="padding:0">
      <table style="font-size:11px">
        <thead><tr><th>Order#</th><th>Customer</th><th>Product</th><th class="right">Vol</th><th class="right">Buy</th><th class="right">Sell DLVD</th><th class="right">Freight</th><th class="right">Profit</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

// Focus mode: expand a card to full viewport
function expandCard(btn){
  const card=btn.closest('.card');
  if(!card)return;
  const overlay=document.createElement('div');
  overlay.className='card-expand-overlay';
  overlay.onclick=function(){collapseCard(card,overlay);};
  document.body.appendChild(overlay);
  card.classList.add('card-expanded');
  btn.innerHTML='&#x2715;';
  btn.setAttribute('title','Close');
  btn.onclick=function(){collapseCard(card,overlay);};
}
function collapseCard(card,overlay){
  card.classList.remove('card-expanded');
  if(overlay&&overlay.parentNode)overlay.parentNode.removeChild(overlay);
  const btn=card.querySelector('.card-expand-btn');
  if(btn){btn.innerHTML='&#x26F6;';btn.setAttribute('title','Expand');btn.onclick=function(){expandCard(btn);};}
  // Re-render charts inside the card in case canvas was resized
  if(card.querySelector('canvas')&&typeof renderDashboardCharts==='function')setTimeout(renderDashboardCharts,50);
}

// Drag-to-reorder dashboard sections
let _draggedSection=null;
function dashDragStart(e){
  _draggedSection=e.currentTarget;
  e.currentTarget.style.opacity='0.4';
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain',e.currentTarget.dataset.section);
}
function dashDragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
  const target=e.currentTarget;
  if(target!==_draggedSection&&target.classList.contains('dash-section')){
    target.classList.add('drag-over');
  }
}
function dashDrop(e){
  e.preventDefault();
  const target=e.currentTarget;
  target.classList.remove('drag-over');
  if(!_draggedSection||target===_draggedSection)return;
  const parent=target.parentNode;
  const sections=Array.from(parent.querySelectorAll('.dash-section'));
  const fromIdx=sections.indexOf(_draggedSection);
  const toIdx=sections.indexOf(target);
  if(fromIdx<0||toIdx<0)return;
  if(fromIdx<toIdx){parent.insertBefore(_draggedSection,target.nextSibling);}
  else{parent.insertBefore(_draggedSection,target);}
  // Save new order
  const newOrder=Array.from(parent.querySelectorAll('.dash-section')).map(el=>el.dataset.section).filter(Boolean);
  S.dashboardOrder=newOrder;
  SS('dashboardOrder',newOrder);
}
function dashDragEnd(e){
  e.currentTarget.style.opacity='1';
  document.querySelectorAll('.dash-section.drag-over').forEach(el=>el.classList.remove('drag-over'));
  _draggedSection=null;
}
function showDrillDown(title,trades){
  const rows=trades.map(t=>{
    const type=t._type||'sell';
    const pnl=t._pnl;
    return'<tr><td>'+fmtD(t.date)+'</td><td class="'+(type==='buy'?'positive':'accent')+'">'+type.toUpperCase()+'</td><td class="bold">'+escapeHtml(t.product||'')+'</td><td>'+escapeHtml(t.length||'RL')+'</td><td>'+escapeHtml(type==='buy'?(t.mill||''):(t.customer||''))+'</td><td class="right">'+fmt(t.price||0)+'</td><td class="right">'+fmtN(t.volume||0)+'</td>'+(pnl!==undefined?'<td class="right '+(pnl>=0?'positive':'negative')+' bold">'+fmt(Math.round(pnl))+'</td>':'')+'</tr>';
  }).join('');
  document.getElementById('modal').innerHTML=
    '<div class="modal-overlay" onclick="closeModal()"><div class="modal wide" onclick="event.stopPropagation()">'+
    '<div class="modal-header"><span class="modal-title">'+escapeHtml(title)+'</span><button class="modal-close" onclick="closeModal()">x</button></div>'+
    '<div class="modal-body table-wrap" style="padding:0;max-height:400px"><table class="data-table"><thead><tr><th>Date</th><th>Type</th><th>Product</th><th>Length</th><th>Mill/Customer</th><th class="right">Price</th><th class="right">Volume</th>'+(trades.some(t=>t._pnl!==undefined)?'<th class="right">P&L</th>':'')+'</tr></thead><tbody>'+
    (rows||'<tr><td colspan="8" class="empty-state">No trades found</td></tr>')+
    '</tbody></table></div></div></div>';
}
function drillDownWeek(startDate,endDate){
  const s=new Date(startDate),e=new Date(endDate);
  const buyByOrder={};
  S.buys.forEach(b=>{const ord=normalizeOrderNum(b.orderNum||b.po);if(ord)buyByOrder[ord]=b});
  const trades=[
    ...S.buys.filter(b=>{const d=new Date(b.date);return d>=s&&d<=e}).map(b=>({...b,_type:'buy'})),
    ...S.sells.filter(x=>{const d=new Date(x.date);return d>=s&&d<=e}).map(x=>{
      const ord=normalizeOrderNum(x.orderNum||x.linkedPO||x.oc);
      const buy=ord?buyByOrder[ord]:null;
      const frtMBF=x.volume>0?(x.freight||0)/x.volume:0;
      const pnl=buy?((x.price||0)-frtMBF-(buy.price||0))*(x.volume||0):0;
      return{...x,_type:'sell',_pnl:pnl};
    })
  ].sort((a,b)=>new Date(b.date)-new Date(a.date));
  showDrillDown('Week: '+fmtD(startDate)+' - '+fmtD(endDate),trades);
}
function toggleDashSection(sectionId){
  if(!S.dashboardHidden)S.dashboardHidden=[];
  const idx=S.dashboardHidden.indexOf(sectionId);
  if(idx>=0)S.dashboardHidden.splice(idx,1);
  else S.dashboardHidden.push(sectionId);
  SS('dashboardHidden',S.dashboardHidden);
  render();
}

function _subTabBar(stateKey,tabs,activeTab){
  return `<div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">${tabs.map(t=>`<button class="btn ${activeTab===t.id?'btn-primary':'btn-default'} btn-sm" onclick="S.${stateKey}='${t.id}';SS('${stateKey}','${t.id}');render()">${t.label}</button>`).join('')}</div>`;
}

function render(){
  // Cold-boot redirect: old S.view values from cloud state
  const _resolved=_resolveView(S.view);
  if(_resolved!==S.view){S.view=_resolved;}
  renderNav();renderMkt();renderBreadcrumbs();
  updateMobileNav();
  const _needsAnalytics=(S.view==='dashboard'&&(!S.dashTab||S.dashTab==='overview'));
  const a=_needsAnalytics?analytics():null;
  const nav=NAV.find(n=>n.id===S.view);
  document.getElementById('title').textContent=(nav?.icon||'')+' '+(nav?.label||'');
  const c=document.getElementById('content');

  if(S.view==='dashboard'){
    const _dashTab=S.dashTab||'overview';
    const _dashTabBar=''; // Single tab — overview only
    if(_dashTab==='overview'&&a&&!a.buys.length&&!a.sells.length){
      c.innerHTML=_dashTabBar+`<div class="panel"><div class="panel-body" style="padding:80px;text-align:center"><h2 style="margin-bottom:12px;color:var(--text)">Welcome, ${escapeHtml(S.trader)}!</h2><p style="margin-bottom:24px">${S.trader==='Admin'?'No department trades yet. Traders can add trades from their accounts.':'Start by adding your trades or importing Random Lengths data.'}</p><div style="display:flex;gap:12px;justify-content:center"><button class="btn btn-success" onclick="showBuyModal()">+ Add Buy</button><button class="btn btn-primary" onclick="showSellModal()">+ Add Sell</button><button class="btn btn-warn" onclick="go('details')">Import RL Data</button></div></div></div>`;
      return;
    }
    {
    // --- Dashboard overview ---
    // --- Dashboard data prep ---
    const _now=new Date();
    const _latestRL=S.rl.length?new Date(S.rl[S.rl.length-1].date):null;
    const _latestBuy=a.buys.length?new Date(a.buys[0].date):null;
    const _latestSell=a.sells.length?new Date(a.sells[0].date):null;
    const _latestTrade=_latestBuy&&_latestSell?new Date(Math.max(_latestBuy,_latestSell)):(_latestBuy||_latestSell);
    const rlStale=_latestRL?(_now-_latestRL)>7*86400000:false;
    const tradeStale=_latestTrade?(_now-_latestTrade)>14*86400000:false;
    const staleBadge='<span class="stale-badge"><span class="stale-dot"></span>Data may be stale</span>';
    const movers=calcMarketMovers();
    const pendingApprovals=S.sells.filter(s=>!s.delivered&&!s.linkedPO&&!s.orderNum).length;
    const todayStr=new Date().toISOString().split('T')[0];
    const todayTrades=S.buys.filter(b=>b.date===todayStr).length+S.sells.filter(s=>s.date===todayStr).length;

    // --- Build dashboard sections ---
    const _sections={};

    // Stale RL Banner
    _sections['stale-rl']=_renderStaleRLBanner();

    // KPI Cards Row
    _sections['kpis']=`
      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-label">Total Buys</div>
          <div class="kpi-value">${a.buys.length}</div>
          <div class="kpi-trend">Avg: ${a.buys.length?fmt(Math.round(a.buys.reduce((s,b)=>s+(b.price||0),0)/a.buys.length)):'-'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Sells</div>
          <div class="kpi-value accent">${a.sells.length}</div>
          <div class="kpi-trend">Avg: ${a.sells.length?fmt(Math.round(a.sells.reduce((s,x)=>s+(x.price||0),0)/a.sells.length)):'-'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Today's Trades</div>
          <div class="kpi-value">${todayTrades}</div>
          <div class="kpi-trend">${fmtD(todayStr)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Unmatched Sells</div>
          <div class="kpi-value ${pendingApprovals>0?'warn':''}">${pendingApprovals}</div>
          ${pendingApprovals>0?'<div class="kpi-trend warn">Sells without matched buy</div>':'<div class="kpi-trend positive">All matched</div>'}
        </div>
      </div>`;

    // Sparkline KPIs removed — no volume/margin data from TC

    // Second row: Price Trends + Trade Activity by Product
    _sections['charts-position']=`
      <div class="grid-2" style="margin-top:20px">
        <div class="panel"><div class="panel-header">PRICE TRENDS -- 2x4#2 ${rlStale?staleBadge:''}<div class="range-selector">${['1W','1M','3M','YTD'].map(r=>'<button class="range-btn '+(S.dashChartRange===r?'active':'')+'" onclick="S.dashChartRange=\''+r+'\';SS(\'dashChartRange\',\''+r+'\');renderDashboardCharts()">'+r+'</button>').join('')}</div></div><div class="panel-body">
          ${S.rl.length?'<div style="height:160px"><canvas id="dashboard-price-chart"></canvas></div>':'<div class="empty-state">No RL data yet</div>'}
        </div></div>
        <div class="panel"><div class="panel-header">TRADE COUNTS BY PRODUCT</div><div class="panel-body" style="padding:0">
          ${(()=>{
            const prodCounts={};
            a.buys.forEach(b=>{const p=b.product||'Unknown';if(!prodCounts[p])prodCounts[p]={product:p,buys:0,sells:0};prodCounts[p].buys++});
            a.sells.forEach(s=>{const p=s.product||'Unknown';if(!prodCounts[p])prodCounts[p]={product:p,buys:0,sells:0};prodCounts[p].sells++});
            const rows=Object.values(prodCounts).sort((a,b)=>(b.buys+b.sells)-(a.buys+a.sells)).slice(0,8);
            return'<table class="data-table"><thead><tr><th>Product</th><th class="right">Buys</th><th class="right">Sells</th><th class="right">Total</th></tr></thead><tbody>'+
            (rows.map(p=>'<tr><td class="bold">'+escapeHtml(p.product)+'</td><td class="right">'+p.buys+'</td><td class="right">'+p.sells+'</td><td class="right bold">'+(p.buys+p.sells)+'</td></tr>').join('')||'<tr><td colspan="4" class="empty-state">No trades</td></tr>')+
            '</tbody></table>';
          })()}
        </div></div>
      </div>`;

    // Third row: Activity Feed + Trader Breakdown
    _sections['activity-analytics']=`
      <div class="grid-2" style="margin-top:20px">
        <div class="panel"><div class="panel-header">RECENT ACTIVITY ${tradeStale?staleBadge:''}</div><div class="panel-body" style="padding:0;max-height:320px;overflow-y:auto">
          ${(()=>{
            const feed=[
              ...a.buys.slice(0,5).map(b=>({date:b.date,type:'buy',text:escapeHtml(b.product||'')+' @ '+fmt(b.price),sub:escapeHtml(b.mill||'')})),
              ...a.sells.slice(0,5).map(s=>({date:s.date,type:'sell',text:escapeHtml(s.product||'')+' @ '+fmt(s.price),sub:escapeHtml(s.customer||'')}))
            ].sort((x,y)=>new Date(y.date)-new Date(x.date)).slice(0,8)
            return feed.length?feed.map(f=>'<div class="activity-item"><div><div class="activity-main">'+f.text+'</div><div class="activity-sub">'+f.sub+' -- '+fmtD(f.date)+'</div></div><div class="activity-right"><span class="status-badge status-'+(f.type==='buy'?'pending':'active')+'">'+f.type.toUpperCase()+'</span></div></div>').join(''):'<div class="empty-state">No trades yet</div>'
          })()}
        </div></div>
        <div class="panel"><div class="panel-header">TRADES BY TRADER</div><div class="panel-body" style="padding:0">
          ${(()=>{
            const tc={};
            a.buys.forEach(b=>{const t=b.trader||'Ian P';if(!tc[t])tc[t]={name:t,buys:0,sells:0};tc[t].buys++});
            a.sells.forEach(s=>{const t=s.trader||'Ian P';if(!tc[t])tc[t]={name:t,buys:0,sells:0};tc[t].sells++});
            const rows=Object.values(tc).sort((a,b)=>(b.buys+b.sells)-(a.buys+a.sells));
            return rows.length?rows.map(t=>'<div class="activity-item" style="border-left:3px solid '+traderColor(t.name)+'"><div><div style="font-weight:500">'+escapeHtml(t.name)+'</div><div style="font-size:9px;color:var(--muted)">'+t.buys+' buys / '+t.sells+' sells</div></div><div style="font-weight:700">'+(t.buys+t.sells)+' trades</div></div>').join(''):'<div class="empty-state">No trades</div>';
          })()}
        </div></div>
      </div>`;

    // Fourth row: Market Movers + Top Customers
    _sections['market-movers']=`
      <div class="grid-2" style="margin-top:20px">
        ${movers.length?`<div class="panel"><div class="panel-header">MARKET MOVERS <span style="font-size:9px;color:var(--muted);margin-left:8px">Week-over-Week RL Changes</span></div>
          <div class="panel-body" style="padding:0">
            ${movers.map(m=>'<div class="mover-item"><div><span class="mover-name">'+escapeHtml(m.product)+'</span><span class="mover-region"> ('+escapeHtml(m.region)+')</span></div><div><span class="mover-change '+(m.change>0?'positive':'negative')+'">'+(m.change>0?'&#9650;':'&#9660;')+' '+fmt(Math.abs(m.change))+'</span><span class="mover-pct '+(m.change>0?'positive':'negative')+'">'+(m.pct>0?'+':'')+m.pct.toFixed(1)+'%</span></div></div>').join('')}
          </div></div>`:`<div class="panel"><div class="panel-header">MARKET MOVERS</div><div class="panel-body"><div class="empty-state">Need 2+ weeks of RL data</div></div></div>`}
        <div class="panel"><div class="panel-header">TOP CUSTOMERS</div><div class="panel-body" style="padding:0">
          ${(()=>{
            const cc={};
            a.sells.forEach(s=>{const c=s.customer||'Unknown';if(!cc[c])cc[c]={customer:c,orders:0};cc[c].orders++});
            const top=Object.values(cc).sort((a,b)=>b.orders-a.orders).slice(0,5);
            return top.length?top.map((cu,i)=>'<div class="activity-item" style="padding:8px 12px"><div style="display:flex;align-items:center;gap:8px"><span style="color:'+(i===0?'gold':i===1?'silver':i===2?'#cd7f32':'var(--muted)')+';font-weight:700;width:18px">'+(i+1)+'</span><div><div style="font-weight:500">'+escapeHtml(cu.customer)+'</div></div></div><div style="font-weight:600">'+cu.orders+' orders</div></div>').join(''):'<div class="empty-state" style="padding:20px">No sales yet</div>';
          })()}
        </div></div>
      </div>`;

    // Region mix by trade count
    _sections['info-row']=`
      <div class="grid-2" style="margin-top:20px">
        <div class="panel"><div class="panel-header">REGION MIX (by trade count)</div><div class="panel-body">
          ${(()=>{
            const rc={};let total=0;
            a.buys.forEach(b=>{const r=b.region||'unknown';rc[r]=(rc[r]||0)+1;total++});
            return total?['west','central','east'].map(r=>{const cnt=rc[r]||0;const pct=total?(cnt/total*100):0;return'<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="text-transform:uppercase;font-size:10px">'+r+'</span><span style="color:var(--muted);font-size:10px">'+cnt+' trades ('+pct.toFixed(0)+'%)</span></div><div class="limit-bar"><div class="limit-fill" style="width:'+pct+'%"></div></div></div>'}).join(''):'<div class="empty-state">No buys yet</div>';
          })()}
        </div></div>
        <div class="panel"><div class="panel-header">TOP MILLS</div><div class="panel-body" style="padding:0">
          ${(()=>{
            const mc={};
            a.buys.forEach(b=>{const m=b.mill||'Unknown';if(!mc[m])mc[m]={mill:m,orders:0};mc[m].orders++});
            const top=Object.values(mc).sort((a,b)=>b.orders-a.orders).slice(0,5);
            return top.length?top.map((m,i)=>'<div class="activity-item" style="padding:8px 12px"><div style="display:flex;align-items:center;gap:8px"><span style="color:'+(i===0?'gold':i===1?'silver':i===2?'#cd7f32':'var(--muted)')+';font-weight:700;width:18px">'+(i+1)+'</span><div style="font-weight:500">'+escapeHtml(m.mill)+'</div></div><div style="font-weight:600">'+m.orders+' orders</div></div>').join(''):'<div class="empty-state">No buys yet</div>';
          })()}
        </div></div>
      </div>`;

    // Advanced section removed — no volume/margin/profit data from TC

    // --- Assemble dashboard in saved order with drag-to-reorder ---
    const _defaultOrder=['kpis','charts-position','activity-analytics','market-movers','info-row'];
    const _order=(S.dashboardOrder||_defaultOrder).filter(id=>_sections[id]!==undefined&&_sections[id]!=='');
    // Add any missing sections
    _defaultOrder.forEach(id=>{if(!_order.includes(id)&&_sections[id])_order.push(id);});

    // Widget toggle bar
    if(!S.dashboardHidden)S.dashboardHidden=[];
    const _sectionLabels={kpis:'KPIs','charts-position':'Charts','activity-analytics':'Activity','market-movers':'Market','info-row':'Regions'};
    const _widgetBar='<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px;align-items:center"><span style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-right:4px">Widgets:</span>'+_defaultOrder.map(id=>{
      const hidden=S.dashboardHidden.includes(id);
      return'<button class="btn btn-sm '+(hidden?'btn-default':'btn-primary')+'" style="'+(hidden?'opacity:0.5':'')+'" onclick="toggleDashSection(\''+id+'\')">'+(_sectionLabels[id]||id)+'</button>';
    }).join('')+'</div>';
    const _visibleOrder=_order.filter(id=>!S.dashboardHidden.includes(id));

    c.innerHTML=_dashTabBar+_sections['stale-rl']+_widgetBar+_visibleOrder.map(id=>'<div class="dash-section" data-section="'+id+'" draggable="true" ondragstart="dashDragStart(event)" ondragover="dashDragOver(event)" ondrop="dashDrop(event)" ondragend="dashDragEnd(event)"><span class="dash-drag-handle" title="Drag to reorder">&#8942;&#8942;</span>'+_sections[id]+'</div>').join('')+'<div style="margin-top:16px;text-align:right"><button class="btn btn-info" onclick="exportPDF()">Export PDF</button></div>';
    // Leaderboard removed — TC import doesn't include volume/freight data
    }
  } // end dashboard
  else if(S.view==='analytics'){
    const _aTabBar=_subTabBar('analyticsTab',[{id:'spreads',label:'Spreads'},{id:'charts',label:'Charts'},{id:'compare',label:'Compare'},{id:'forecast',label:'Forecast'},{id:'details',label:'Details'}],S.analyticsTab||'spreads');
    const _aTab=S.analyticsTab||'spreads';
    // --- ANALYTICS TABS DISPATCH ---
    if(_aTab==='spreads'){
      // Spreads tab — powered by /api/rl/spreads batch endpoint
      const spreadRegion=S.filters.reg!=='all'?S.filters.reg:'west';
      const spreadRange=S.spreadRange||'1Y';
      const spreadFrom=S.spreadDateFrom||_rlRangeFrom(spreadRange);
      const spreadTo=S.spreadDateTo||'';
      const spreadCovid=S.spreadExcludeCovid||'0';
      const spreadCacheKey=`spreads_${spreadRegion}_${spreadFrom}_${spreadTo}_covid${spreadCovid}`;
      const spreadData=window._rlCache?.[spreadCacheKey];

      if(spreadData){
        const ranges=['1M','1Y','5Y','10Y','All'];
        let wowHTML='';
        if(spreadData.wow_changes&&spreadData.wow_changes.length){
          wowHTML=`<div class="card" style="margin-bottom:16px"><div class="card-header"><span class="card-title">WEEK-OVER-WEEK CHANGES</span><span style="color:var(--muted);font-size:10px">${spreadData.prev_date||''} → ${spreadData.latest_date||''}</span></div>
            <div class="table-wrap"><table><thead><tr><th>Product</th><th class="right">Prev</th><th class="right">Curr</th><th class="right">Change</th></tr></thead><tbody>
            ${spreadData.wow_changes.map(c=>`<tr><td class="bold">${c.product}</td><td class="right">${fmt(c.prev)}</td><td class="right">${fmt(c.curr)}</td><td class="right ${c.chg>0?'positive':'negative'} bold">${c.chg>0?'+':''}${fmt(c.chg)}</td></tr>`).join('')}
            </tbody></table></div></div>`;
        }

        const lsRows=spreadData.length_spreads||[];
        const dsRows=spreadData.dimension_spreads||[];
        const gsRows=spreadData.grade_spreads||[];

        const pctColor=pct=>pct<=25?'positive':pct>=75?'negative':'';
        const fmtSprd=v=>v!=null?`${v>=0?'+':''}${fmt(v)}`:'—';

        c.innerHTML=_aTabBar+`
          <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
            <div style="display:flex;gap:2px">${ranges.map(r=>`<button class="btn ${spreadRange===r?'btn-primary':'btn-default'} btn-sm" onclick="S.spreadRange='${r}';S.spreadDateFrom='';S.spreadDateTo='';SS('spreadRange','${r}');SS('spreadDateFrom','');SS('spreadDateTo','');render()" style="padding:2px 8px;font-size:10px">${r}</button>`).join('')}</div>
            <button class="btn ${spreadRange==='custom'?'btn-primary':'btn-default'} btn-sm" onclick="document.getElementById('spread-custom').style.display=document.getElementById('spread-custom').style.display==='none'?'flex':'none'" style="padding:2px 8px;font-size:10px">Custom</button>
            <div id="spread-custom" style="display:${spreadRange==='custom'?'flex':'none'};gap:4px;align-items:center">
              <input type="date" id="spread-from" value="${S.spreadDateFrom||''}" style="padding:2px 6px;font-size:10px;background:var(--card);border:1px solid var(--border);color:var(--text)">
              <span style="font-size:10px">to</span>
              <input type="date" id="spread-to" value="${S.spreadDateTo||''}" style="padding:2px 6px;font-size:10px;background:var(--card);border:1px solid var(--border);color:var(--text)">
              <button class="btn btn-primary btn-sm" onclick="S.spreadRange='custom';S.spreadDateFrom=document.getElementById('spread-from').value;S.spreadDateTo=document.getElementById('spread-to').value;SS('spreadRange','custom');SS('spreadDateFrom',S.spreadDateFrom);SS('spreadDateTo',S.spreadDateTo);render()" style="padding:2px 8px;font-size:10px">Apply</button>
            </div>
            <select onchange="S.filters.reg=this.value;render()" style="padding:4px 8px;font-size:11px;background:var(--card);border:1px solid var(--border);color:var(--text)">
              <option value="west" ${spreadRegion==='west'?'selected':''}>West</option>
              <option value="central" ${spreadRegion==='central'?'selected':''}>Central</option>
              <option value="east" ${spreadRegion==='east'?'selected':''}>East</option>
            </select>
            <label style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--muted);cursor:pointer;margin-left:4px" title="Exclude Mar 2020 – Dec 2022 from historical averages">
              <input type="checkbox" ${spreadCovid==='1'?'checked':''} onchange="S.spreadExcludeCovid=this.checked?'1':'0';SS('spreadExcludeCovid',S.spreadExcludeCovid);render()" style="accent-color:var(--accent)">
              Exclude COVID
            </label>
            <span style="font-size:10px;color:var(--muted)">${spreadData.latest_date||'No data'}${spreadData.exclude_covid?' (excl. COVID)':''}</span>
          </div>
          ${wowHTML}
          <div class="card" style="margin-bottom:16px"><div class="card-header"><span class="card-title accent">LENGTH SPREADS (vs 16')</span></div>
            <div class="table-wrap" style="max-height:350px"><table><thead><tr><th>Product</th><th>Length</th><th class="right">16' Base</th><th class="right">Price</th><th class="right">Spread</th><th class="right">Avg</th><th class="right" title="Recency-weighted average (180-day half-life)">WAvg</th><th class="right">Min</th><th class="right">Max</th><th class="right">%ile</th><th class="right" style="color:var(--muted)">n</th></tr></thead><tbody>
            ${lsRows.length?lsRows.map(s=>`<tr><td>${s.product}</td><td>${s.length}'</td><td class="right" style="color:var(--muted)">${fmt(s.base)}</td><td class="right">${fmt(s.price)}</td><td class="right ${s.spread>=0?'positive':'negative'} bold">${fmtSprd(s.spread)}</td><td class="right" style="color:var(--muted)">${fmtSprd(s.avg)}</td><td class="right accent" title="Recency-weighted">${fmtSprd(s.wavg)}</td><td class="right" style="color:var(--muted)">${fmtSprd(s.min)}</td><td class="right" style="color:var(--muted)">${fmtSprd(s.max)}</td><td class="right ${pctColor(s.pct)} bold">${s.pct}%</td><td class="right" style="color:var(--muted);font-size:9px">${s.n||''}</td></tr>`).join(''):'<tr><td colspan="11" class="empty-state">No specified length data available</td></tr>'}
            </tbody></table></div></div>
          <div class="grid-2">
            <div class="card"><div class="card-header"><span class="card-title warn">DIMENSION SPREADS (vs 2x4)</span></div>
              <div class="table-wrap" style="max-height:350px"><table><thead><tr><th>Length</th><th>Dim</th><th class="right">2x4 Base</th><th class="right">Price</th><th class="right">Spread</th><th class="right">Avg</th><th class="right" title="Recency-weighted average">WAvg</th><th class="right">%ile</th><th class="right" style="color:var(--muted)">n</th></tr></thead><tbody>
              ${dsRows.length?dsRows.map(s=>`<tr><td>${s.length==='RL'?'RL':s.length+"'"}</td><td class="bold">${s.dim}</td><td class="right" style="color:var(--muted)">${fmt(s.base)}</td><td class="right">${fmt(s.price)}</td><td class="right ${s.spread>=0?'positive':'negative'} bold">${fmtSprd(s.spread)}</td><td class="right" style="color:var(--muted)">${fmtSprd(s.avg)}</td><td class="right accent">${fmtSprd(s.wavg)}</td><td class="right ${pctColor(s.pct)} bold">${s.pct}%</td><td class="right" style="color:var(--muted);font-size:9px">${s.n||''}</td></tr>`).join(''):'<tr><td colspan="9" class="empty-state">No data</td></tr>'}
              </tbody></table></div></div>
            <div class="card"><div class="card-header"><span class="card-title">GRADE SPREADS (#1 vs #2)</span></div>
              <div class="table-wrap" style="max-height:350px"><table><thead><tr><th>Dim</th><th>Len</th><th class="right">#1</th><th class="right">#2</th><th class="right">Premium</th><th class="right">Avg</th><th class="right" title="Recency-weighted average">WAvg</th><th class="right">%ile</th><th class="right" style="color:var(--muted)">n</th></tr></thead><tbody>
              ${gsRows.length?gsRows.map(s=>`<tr><td class="bold">${s.dim}</td><td>${s.length==='RL'?'RL':s.length+"'"}</td><td class="right accent">${fmt(s.p1)}</td><td class="right">${fmt(s.p2)}</td><td class="right positive bold">+${fmt(s.premium)}</td><td class="right" style="color:var(--muted)">${fmtSprd(s.avg)}</td><td class="right accent">${fmtSprd(s.wavg)}</td><td class="right ${pctColor(s.pct)} bold">${s.pct}%</td><td class="right" style="color:var(--muted);font-size:9px">${s.n||''}</td></tr>`).join(''):'<tr><td colspan="9" class="empty-state">No data</td></tr>'}
              </tbody></table></div></div>
          </div>`;
      }else{
        c.innerHTML=_aTabBar+`<div class="card"><div class="card-body"><div class="empty-state">Loading spreads data...</div></div></div>`;
        rlFetchSpreads(spreadRegion,spreadRange,S.spreadDateFrom,S.spreadDateTo,spreadCovid);
      }
    }
    else if(_aTab==='charts'){
      // Charts tab — price trends via /api/rl/chart-batch
      const chartProduct=S.chartProduct||'2x4#2';
      const rlRange=S.rlRange||'1Y';
      const products=['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2','2x4#1','2x6#1'];
      const ranges=['1M','1Y','5Y','10Y','All'];
      const cacheKey=`${chartProduct}_${rlRange}`;
      const cached=window._rlCache?.[cacheKey];
      const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
      const rlData=S.rl.slice(-12);

      if(cached){
        const westData=cached.west.map(r=>r.price);
        const centralData=cached.central.map(r=>r.price);
        const eastData=cached.east.map(r=>r.price);
        const chartDates=cached.west.map(r=>r.date);
        const spread2x4_2x6=cached.spread46||[];
        const spreadWestCentral=cached.spreadWC||[];
        const allPrices=[...westData,...centralData,...eastData].filter(p=>p>0);
        const minPrice=allPrices.length?Math.floor(Math.min(...allPrices)/10)*10-10:350;
        const maxPrice=allPrices.length?Math.ceil(Math.max(...allPrices)/10)*10+10:500;
        const range=maxPrice-minPrice||100;
        window._chartData={westData,centralData,eastData,minPrice,range,spread2x4_2x6,spreadWestCentral};

        const nPts=chartDates.length;
        const labelFn=nPts>260?d=>d.slice(0,4):nPts>52?d=>d.slice(0,7):d=>d.slice(5);
        const labelStep=Math.max(1,Math.ceil(nPts/8));
        const chartLabels=chartDates.map((d,i)=>i%labelStep===0||i===nPts-1?labelFn(d):'');

        const histLimit=window._rlHistExpanded?cached.west.length:52;
        const histRows=cached.west.slice().reverse().slice(0,histLimit);
        const centralMap=Object.fromEntries(cached.central.map(r=>[r.date,r.price]));
        const eastMap=Object.fromEntries(cached.east.map(r=>[r.date,r.price]));

        c.innerHTML=_aTabBar+`
          <div class="card" style="margin-bottom:16px">
            <div class="card-header">
              <span class="card-title">SYP PRICE TRENDS</span>
              <div style="display:flex;align-items:center;gap:12px">
                <div style="display:flex;gap:2px">${ranges.map(r=>`<button class="btn ${rlRange===r?'btn-primary':'btn-default'} btn-sm" onclick="S.rlRange='${r}';SS('rlRange','${r}');delete window._rlCache?.['${chartProduct}_${r}'];render()" style="padding:2px 8px;font-size:10px">${r}</button>`).join('')}</div>
                <select id="chart-product" onchange="S.chartProduct=this.value;render()" style="padding:4px 8px;font-size:11px;background:var(--card);border:1px solid var(--border);color:var(--text)">
                  ${products.map(p=>`<option value="${p}" ${p===chartProduct?'selected':''}>${p}</option>`).join('')}
                </select>
                <span style="font-size:10px;color:var(--muted)">${nPts} weeks</span>
              </div>
            </div>
            <div class="card-body">
              ${nPts>1?`
                <div style="position:relative;height:250px;margin-bottom:8px">
                  <div style="position:absolute;left:0;top:0;bottom:30px;width:40px;display:flex;flex-direction:column;justify-content:space-between;font-size:9px;color:var(--muted);text-align:right;padding-right:6px">
                    <span>$${maxPrice}</span>
                    <span>$${Math.round(minPrice+(range*0.75))}</span>
                    <span>$${Math.round(minPrice+(range*0.5))}</span>
                    <span>$${Math.round(minPrice+(range*0.25))}</span>
                    <span>$${minPrice}</span>
                  </div>
                  <div style="position:absolute;left:45px;right:10px;top:0;bottom:30px;border-left:1px solid var(--border);border-bottom:1px solid var(--border);background:linear-gradient(180deg,rgba(0,200,150,0.03) 0%,transparent 100%)">
                    <div style="position:absolute;left:0;right:0;top:25%;border-top:1px solid rgba(255,255,255,0.05)"></div>
                    <div style="position:absolute;left:0;right:0;top:50%;border-top:1px solid rgba(255,255,255,0.05)"></div>
                    <div style="position:absolute;left:0;right:0;top:75%;border-top:1px solid rgba(255,255,255,0.05)"></div>
                    <canvas id="price-canvas" style="width:100%;height:100%"></canvas>
                  </div>
                  <div style="position:absolute;left:45px;right:10px;bottom:0;height:25px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:var(--muted)">
                    ${chartLabels.filter(l=>l).map(l=>`<span>${l}</span>`).join('')}
                  </div>
                </div>
                <div style="display:flex;justify-content:center;gap:24px;font-size:11px">
                  <span><span style="display:inline-block;width:16px;height:3px;background:#89b4fa;margin-right:6px"></span>West</span>
                  <span><span style="display:inline-block;width:16px;height:3px;background:#f9e2af;margin-right:6px"></span>Central</span>
                  <span><span style="display:inline-block;width:16px;height:3px;background:#89dceb;margin-right:6px"></span>East</span>
                </div>
              `:'<div class="empty-state">Need at least 2 weeks of data for charts</div>'}
            </div>
          </div>
          <div class="grid-2">
            <div class="card">
              <div class="card-header"><span class="card-title warn">2x4/2x6 SPREAD (West)</span></div>
              <div class="card-body">
                ${spread2x4_2x6.length>1?`
                  <div style="height:120px;position:relative;margin-bottom:8px">
                    <canvas id="spread-canvas" style="width:100%;height:100%"></canvas>
                  </div>
                  <div style="text-align:center;margin-top:12px">
                    <span style="font-size:20px;font-weight:700;color:var(--warn)">$${spread2x4_2x6[spread2x4_2x6.length-1]||0}</span>
                    <div style="font-size:10px;color:var(--muted)">Current Spread</div>
                  </div>
                `:'<div class="empty-state">Need data</div>'}
              </div>
            </div>
            <div class="card">
              <div class="card-header"><span class="card-title info">WEST vs CENTRAL (${chartProduct})</span></div>
              <div class="card-body">
                ${spreadWestCentral.length>1?`
                  <div style="height:120px;position:relative;margin-bottom:8px">
                    <canvas id="regional-canvas" style="width:100%;height:100%"></canvas>
                  </div>
                  <div style="text-align:center;margin-top:12px">
                    <span style="font-size:20px;font-weight:700;color:var(--info)">$${spreadWestCentral[spreadWestCentral.length-1]||0}</span>
                    <div style="font-size:10px;color:var(--muted)">West Premium</div>
                  </div>
                `:'<div class="empty-state">Need data</div>'}
              </div>
            </div>
          </div>
          <div class="card" style="margin-top:16px">
            <div class="card-header"><span class="card-title">SPREAD MONITOR</span></div>
            <div class="card-body">
              <table>
                <thead><tr><th>Spread</th><th>Region</th><th class="right">Current</th><th class="right">4-Wk Avg</th><th class="right">12-Wk Avg</th><th class="right">vs Avg</th></tr></thead>
                <tbody>${typeof generateSpreadTable==='function'?generateSpreadTable(rlData):''}</tbody>
              </table>
            </div>
          </div>
          <div class="card" style="margin-top:16px">
            <div class="card-header">
              <span class="card-title">PRICE HISTORY (${chartProduct})</span>
              <span style="font-size:10px;color:var(--muted)">${cached.west.length} total weeks</span>
            </div>
            <div class="card-body" style="max-height:400px;overflow:auto">
              <table>
                <thead><tr><th>Date</th><th class="right">West</th><th class="right">Central</th><th class="right">East</th></tr></thead>
                <tbody>
                  ${histRows.map(r=>`<tr>
                    <td>${r.date}</td>
                    <td class="right">$${Math.round(r.price)}</td>
                    <td class="right">${centralMap[r.date]?'$'+Math.round(centralMap[r.date]):'—'}</td>
                    <td class="right">${eastMap[r.date]?'$'+Math.round(eastMap[r.date]):'—'}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
              ${cached.west.length>52&&!window._rlHistExpanded?`<div style="text-align:center;padding:8px"><button class="btn btn-default btn-sm" onclick="window._rlHistExpanded=true;render()">Show all ${cached.west.length} rows</button></div>`:''}
            </div>
          </div>`;
      }else{
        c.innerHTML=_aTabBar+`<div class="card"><div class="card-body"><div class="empty-state">Loading ${rlRange} data for ${chartProduct}...</div></div></div>`;
        rlFetchChartData(chartProduct,rlRange);
      }
    }
    else if(_aTab==='compare'){
      // Compare tab — historical spread comparison
      const region=S.filters.reg!=='all'?S.filters.reg:'west';
      const prod1=S.compareProd1||'2x4#2';
      const prod2=S.compareProd2||'2x6#2';
      const len=S.compareLen||'16';
      const compareRange=S.rlRange||'1Y';
      const ranges=['1M','1Y','5Y','10Y','All'];
      const productList=['2x4#1','2x4#2','2x6#1','2x6#2','2x8#1','2x8#2','2x10#1','2x10#2','2x12#1','2x12#2'];
      const compareCacheKey=`compare_${prod1}_${prod2}_${region}_${len}_${compareRange}`;
      const compareCached=window._rlCache?.[compareCacheKey];

      if(compareCached){
        const history=compareCached;
        const validSpreads=history.filter(h=>h.spread!==null);
        const avgSpread=validSpreads.length?Math.round(validSpreads.reduce((s,h)=>s+h.spread,0)/validSpreads.length):0;
        const minSpread=validSpreads.length?Math.min(...validSpreads.map(h=>h.spread)):0;
        const maxSpread=validSpreads.length?Math.max(...validSpreads.map(h=>h.spread)):0;
        const currentSpread=validSpreads.length?validSpreads[validSpreads.length-1].spread:null;
        const pctRank=currentSpread!==null&&validSpreads.length>1?Math.round(validSpreads.filter(h=>h.spread<=currentSpread).length/validSpreads.length*100):null;
        const histLimit=window._rlCompareExpanded?history.length:52;

        c.innerHTML=_aTabBar+`
          <div class="card"><div class="card-header">
            <span class="card-title info">HISTORICAL SPREAD COMPARISON</span>
            <div style="display:flex;gap:2px">${ranges.map(r=>`<button class="btn ${compareRange===r?'btn-primary':'btn-default'} btn-sm" onclick="S.rlRange='${r}';SS('rlRange','${r}');delete window._rlCache?.['${compareCacheKey}'];render()" style="padding:2px 8px;font-size:10px">${r}</button>`).join('')}</div>
          </div>
            <div class="card-body">
              <div class="form-grid" style="margin-bottom:16px">
                <div class="form-group">
                  <label class="form-label">Product 1 (Base)</label>
                  <select id="compare-prod1" onchange="S.compareProd1=this.value;render()" style="width:100%">
                    ${productList.map(p=>`<option value="${p}" ${p===prod1?'selected':''}>${p}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Product 2</label>
                  <select id="compare-prod2" onchange="S.compareProd2=this.value;render()" style="width:100%">
                    ${productList.map(p=>`<option value="${p}" ${p===prod2?'selected':''}>${p}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Length</label>
                  <select id="compare-len" onchange="S.compareLen=this.value;render()" style="width:100%">
                    <option value="RL" ${len==='RL'?'selected':''}>RL (Composite)</option>
                    <option value="8" ${len==='8'?'selected':''}>8'</option>
                    <option value="10" ${len==='10'?'selected':''}>10'</option>
                    <option value="12" ${len==='12'?'selected':''}>12'</option>
                    <option value="14" ${len==='14'?'selected':''}>14'</option>
                    <option value="16" ${len==='16'?'selected':''}>16'</option>
                    <option value="18" ${len==='18'?'selected':''}>18'</option>
                    <option value="20" ${len==='20'?'selected':''}>20'</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Region</label>
                  <select onchange="S.filters.reg=this.value;render()" style="width:100%">
                    <option value="west" ${region==='west'?'selected':''}>West</option>
                    <option value="central" ${region==='central'?'selected':''}>Central</option>
                    <option value="east" ${region==='east'?'selected':''}>East</option>
                  </select>
                </div>
              </div>
              ${validSpreads.length>1?`
                <div style="margin-bottom:16px;padding:12px;background:var(--bg);border:1px solid var(--border)">
                  <div style="display:flex;gap:24px;flex-wrap:wrap">
                    <div><span style="color:var(--muted)">Avg Spread:</span> <span class="bold ${avgSpread>=0?'positive':'negative'}">${fmt(avgSpread)}</span></div>
                    <div><span style="color:var(--muted)">Min:</span> <span class="bold">${fmt(minSpread)}</span></div>
                    <div><span style="color:var(--muted)">Max:</span> <span class="bold">${fmt(maxSpread)}</span></div>
                    <div><span style="color:var(--muted)">Current:</span> <span class="bold accent">${currentSpread!==null?fmt(currentSpread):'—'}</span></div>
                    ${pctRank!==null?`<div><span style="color:var(--muted)">Percentile:</span> <span class="bold">${pctRank}%</span></div>`:''}
                    <div><span style="color:var(--muted)">Data pts:</span> <span class="bold">${validSpreads.length} weeks</span></div>
                  </div>
                </div>
              `:''}
              <div class="table-wrap" style="max-height:400px;overflow-y:auto"><table><thead><tr><th>Date</th><th class="right">${prod1}</th><th class="right">${prod2}</th><th class="right">Spread (${prod2} - ${prod1})</th></tr></thead><tbody>
                ${history.length?history.slice().reverse().slice(0,histLimit).map(h=>`<tr><td>${h.date}</td><td class="right">${h.p1?fmt(h.p1):'—'}</td><td class="right">${h.p2?fmt(h.p2):'—'}</td><td class="right ${h.spread===null?'':(h.spread>=0?'positive':'negative')} bold">${h.spread!==null?(h.spread>=0?'+':'')+fmt(h.spread):'—'}</td></tr>`).join(''):'<tr><td colspan="4" class="empty-state">No data for selected products</td></tr>'}
              </tbody></table></div>
              ${history.length>52&&!window._rlCompareExpanded?`<div style="text-align:center;padding:8px"><button class="btn btn-default btn-sm" onclick="window._rlCompareExpanded=true;render()">Show all ${history.length} rows</button></div>`:''}
            </div>
          </div>`;
      }else{
        c.innerHTML=_aTabBar+`<div class="card"><div class="card-body">
          <div class="form-grid" style="margin-bottom:16px">
            <div class="form-group">
              <label class="form-label">Product 1 (Base)</label>
              <select id="compare-prod1" onchange="S.compareProd1=this.value;render()" style="width:100%">
                ${productList.map(p=>`<option value="${p}" ${p===prod1?'selected':''}>${p}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Product 2</label>
              <select id="compare-prod2" onchange="S.compareProd2=this.value;render()" style="width:100%">
                ${productList.map(p=>`<option value="${p}" ${p===prod2?'selected':''}>${p}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Length</label>
              <select id="compare-len" onchange="S.compareLen=this.value;render()" style="width:100%">
                <option value="RL" ${len==='RL'?'selected':''}>RL (Composite)</option>
                <option value="8" ${len==='8'?'selected':''}>8'</option>
                <option value="10" ${len==='10'?'selected':''}>10'</option>
                <option value="12" ${len==='12'?'selected':''}>12'</option>
                <option value="14" ${len==='14'?'selected':''}>14'</option>
                <option value="16" ${len==='16'?'selected':''}>16'</option>
                <option value="18" ${len==='18'?'selected':''}>18'</option>
                <option value="20" ${len==='20'?'selected':''}>20'</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Region</label>
              <select onchange="S.filters.reg=this.value;render()" style="width:100%">
                <option value="west" ${region==='west'?'selected':''}>West</option>
                <option value="central" ${region==='central'?'selected':''}>Central</option>
                <option value="east" ${region==='east'?'selected':''}>East</option>
              </select>
            </div>
          </div>
          <div class="empty-state">Loading comparison data...</div>
        </div></div>`;
        rlFetchCompareData(prod1,prod2,region,len,compareRange);
      }
    }
    else if(_aTab==='forecast'){
      // Forecast tab — price forecasts + seasonal analysis
      const fProduct=S.forecastProduct||'2x4#2';
      const fRegion=S.forecastRegion||'west';
      const fWeeks=S.forecastWeeks||8;
      const fProducts=['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2'];
      const forecastCacheKey=`forecast_${fProduct}_${fRegion}_${fWeeks}`;
      const seasonalCacheKey=`seasonal_${fProduct}_${fRegion}_5`;
      const forecastData=window._rlCache?.[forecastCacheKey];
      const seasonalData=window._rlCache?.[seasonalCacheKey];

      if(forecastData&&seasonalData){
        // Stats bar
        const fc=forecastData;
        const sc=seasonalData;
        const trendIcon=fc.trend==='up'?'&#9650;':fc.trend==='down'?'&#9660;':'&#9654;';
        const trendColor=fc.trend==='up'?'var(--positive)':fc.trend==='down'?'var(--negative)':'var(--muted)';
        const momColor=fc.momentum>=0?'var(--positive)':'var(--negative)';
        const pctColor=p=>p<=30?'positive':p>=70?'negative':'';

        // Build seasonal heatmap for all 5 core products
        const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const currentMonth=new Date().getMonth()+1;

        // Fetch seasonal data for all products (use cached or trigger fetch)
        const allSeasonalKeys=fProducts.map(p=>`seasonal_${p}_${fRegion}_5`);
        const allSeasonalData=fProducts.map((p,i)=>window._rlCache?.[allSeasonalKeys[i]]);
        const allSeasonalReady=allSeasonalData.every(d=>d&&d.monthlyFactors);

        // If not all seasonal data loaded, trigger fetches for missing ones
        if(!allSeasonalReady){
          fProducts.forEach((p,i)=>{
            if(!allSeasonalData[i])rlFetchSeasonal(p,fRegion,5);
          });
        }

        let heatmapHTML='';
        if(allSeasonalReady){
          heatmapHTML=`<div class="card" style="margin-bottom:16px"><div class="card-header"><span class="card-title warn">SEASONAL HEATMAP</span><span style="color:var(--muted);font-size:10px">${fRegion.toUpperCase()} — 5yr seasonal indices</span></div>
            <div class="table-wrap"><table style="font-size:10px"><thead><tr><th>Product</th>${monthNames.map((m,i)=>`<th class="right" style="${i+1===currentMonth?'background:var(--accent);color:var(--bg);font-weight:700':''}">${m}</th>`).join('')}</tr></thead><tbody>
            ${fProducts.map((p,pi)=>{
              const sd=allSeasonalData[pi];
              if(!sd||!sd.monthlyFactors)return'';
              return`<tr><td class="bold">${p}</td>${sd.monthlyFactors.map((mf,mi)=>{
                const idx=mf.index;
                const bg=idx>=1.02?'rgba(166,227,161,0.25)':idx<=0.98?'rgba(243,139,168,0.25)':'transparent';
                const clr=idx>=1.02?'var(--positive)':idx<=0.98?'var(--negative)':'var(--text)';
                const isCurrent=mi+1===currentMonth;
                return`<td class="right" style="background:${isCurrent?'var(--accent)':bg};color:${isCurrent?'var(--bg)':clr};font-weight:${isCurrent?'700':'400'}">${idx.toFixed(2)}</td>`;
              }).join('')}</tr>`;
            }).join('')}
            </tbody></table></div>
            ${sc.currentPosition?`<div style="padding:8px 12px;margin-top:8px;background:var(--panel-alt);border:1px solid var(--border);font-size:11px">
              <span class="bold accent">Seasonal Insight:</span> ${fProduct} is at the <span class="bold ${pctColor(sc.currentPosition.pctRank)}">${ordinal(sc.currentPosition.pctRank)} percentile</span> for ${monthNames[currentMonth-1]} (index: ${sc.currentPosition.index.toFixed(2)}). ${sc.outlook?.peakMonths?'Peak months: <b>'+sc.outlook.peakMonths+'</b>. Low months: <b>'+sc.outlook.lowMonths+'</b>. Trend: '+sc.outlook.trend+' ($'+sc.outlook.trendPerWeek+'/wk).':''}
            </div>`:''}
          </div>`;
        }

        c.innerHTML=_aTabBar+`
          <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
            <select onchange="S.forecastProduct=this.value;SS('forecastProduct',this.value);delete window._rlCache?.['${forecastCacheKey}'];delete window._rlCache?.['${seasonalCacheKey}'];render()" style="padding:4px 8px;font-size:11px;background:var(--card);border:1px solid var(--border);color:var(--text)">
              ${fProducts.map(p=>`<option value="${p}" ${p===fProduct?'selected':''}>${p}</option>`).join('')}
            </select>
            <select onchange="S.forecastRegion=this.value;SS('forecastRegion',this.value);delete window._rlCache?.['${forecastCacheKey}'];delete window._rlCache?.['${seasonalCacheKey}'];render()" style="padding:4px 8px;font-size:11px;background:var(--card);border:1px solid var(--border);color:var(--text)">
              <option value="west" ${fRegion==='west'?'selected':''}>West</option>
              <option value="central" ${fRegion==='central'?'selected':''}>Central</option>
              <option value="east" ${fRegion==='east'?'selected':''}>East</option>
            </select>
            <span style="font-size:10px;color:var(--muted)">${fc.dataPoints||0} data points</span>
          </div>

          <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
            <div style="padding:10px 16px;background:var(--card);border:1px solid var(--border);flex:1;min-width:120px">
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase">Current</div>
              <div style="font-size:20px;font-weight:700;color:var(--accent)">$${fc.lastPrice||'—'}</div>
            </div>
            <div style="padding:10px 16px;background:var(--card);border:1px solid var(--border);flex:1;min-width:120px">
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase">4-Week Forecast</div>
              <div style="font-size:20px;font-weight:700">$${fc.forecast&&fc.forecast.length>=4?fc.forecast[3].price:'—'}</div>
            </div>
            <div style="padding:10px 16px;background:var(--card);border:1px solid var(--border);flex:1;min-width:120px">
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase">Trend</div>
              <div style="font-size:20px;font-weight:700;color:${trendColor}">${trendIcon} ${(fc.trend||'flat').toUpperCase()}</div>
            </div>
            <div style="padding:10px 16px;background:var(--card);border:1px solid var(--border);flex:1;min-width:120px">
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase">Momentum</div>
              <div style="font-size:20px;font-weight:700;color:${momColor}">${fc.momentum>=0?'+':''}${fc.momentum||0}</div>
            </div>
            <div style="padding:10px 16px;background:var(--card);border:1px solid var(--border);flex:1;min-width:120px">
              <div style="font-size:9px;color:var(--muted);text-transform:uppercase">Seasonal %ile</div>
              <div style="font-size:20px;font-weight:700" class="${pctColor(sc.currentPosition?.pctRank||50)}">${sc.currentPosition?.pctRank||'—'}%</div>
            </div>
          </div>

          <div class="card" style="margin-bottom:16px">
            <div class="card-header"><span class="card-title accent">PRICE FORECAST</span><span style="color:var(--muted);font-size:10px">${fProduct} ${fRegion.toUpperCase()} — ${fWeeks}wk Holt ES + seasonal</span></div>
            <div class="card-body">
              <div style="position:relative;height:280px;width:100%"><canvas id="forecast-chart"></canvas></div>
              ${fc.seasonalOutlook?`<div style="padding:8px 0;font-size:11px;color:var(--muted)">${fc.seasonalOutlook}</div>`:''}
            </div>
          </div>

          ${heatmapHTML}

          <div class="card"><div class="card-header"><span class="card-title info">FORECAST TABLE</span></div>
            <div class="table-wrap"><table style="font-size:10px"><thead><tr><th>Date</th><th class="right">Forecast</th><th class="right">Low</th><th class="right">High</th><th class="right">Band Width</th></tr></thead><tbody>
            ${(fc.forecast||[]).map(f=>`<tr><td>${f.date}</td><td class="right bold">$${f.price}</td><td class="right" style="color:var(--negative)">$${f.low}</td><td class="right" style="color:var(--positive)">$${f.high}</td><td class="right" style="color:var(--muted)">$${f.high-f.low}</td></tr>`).join('')}
            </tbody></table></div>
          </div>`;

        // Render forecast chart after DOM update
        setTimeout(()=>renderForecastChart(fc),50);
      }else{
        c.innerHTML=_aTabBar+`<div class="card"><div class="card-body"><div class="empty-state">Loading forecast data...</div></div></div>`;
        if(!forecastData)rlFetchForecast(fProduct,fRegion,fWeeks);
        if(!seasonalData)rlFetchSeasonal(fProduct,fRegion,5);
      }
    }
    else if(_aTab==='details'){
      // Details tab — RL report details by date
      const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
      const dateTabs=S.rl.slice().reverse().map(r=>`<button class="btn ${S.rlViewDate===r.date?'btn-primary':'btn-default'} btn-sm" onclick="S.rlViewDate='${r.date}';render()" style="margin-right:4px">${r.date}</button>`).join('');
      const selectedRL=S.rlViewDate?S.rl.find(r=>r.date===S.rlViewDate):latestRL;

      let detailHTML='';
      if(selectedRL){
        detailHTML=`<div class="card"><div class="card-header"><span class="card-title">${selectedRL.date} DETAILS</span><button class="btn btn-danger btn-sm" onclick="delRL('${selectedRL.date}')">Delete</button></div><div class="card-body">`;

        if(selectedRL.west||selectedRL.central||selectedRL.east){
          detailHTML+=`<div style="font-weight:600;color:var(--accent);margin-bottom:8px">COMPOSITE PRICES</div>
            <table style="width:100%;font-size:10px;margin-bottom:16px">
            <tr><th>Product</th><th class="right" style="color:var(--accent)">West</th><th class="right" style="color:var(--warn)">Central</th><th class="right" style="color:var(--info)">East</th></tr>
            ${['2x4#1','2x4#2','2x6#1','2x6#2','2x8#2','2x10#2','2x12#2'].map(p=>`<tr><td>${p}</td><td class="right">${selectedRL.west?.[p]?'$'+selectedRL.west[p]:'—'}</td><td class="right">${selectedRL.central?.[p]?'$'+selectedRL.central[p]:'—'}</td><td class="right">${selectedRL.east?.[p]?'$'+selectedRL.east[p]:'—'}</td></tr>`).join('')}
            </table>`;
        }

        if(selectedRL.specified_lengths){
          ['west','central','east'].forEach(region=>{
            if(selectedRL.specified_lengths[region]&&Object.keys(selectedRL.specified_lengths[region]).length>0){
              const regionColor={west:'var(--accent)',central:'var(--warn)',east:'var(--info)'}[region];
              detailHTML+=`<div style="font-weight:600;color:${regionColor};margin:12px 0 8px;text-transform:uppercase">${region} - SPECIFIED LENGTHS</div>
                <div class="table-wrap"><table style="width:100%;font-size:10px;margin-bottom:12px">
                <tr><th>Product</th><th class="right">8'</th><th class="right">10'</th><th class="right">12'</th><th class="right">14'</th><th class="right">16'</th><th class="right">18'</th><th class="right">20'</th></tr>`;
              Object.entries(selectedRL.specified_lengths[region]).forEach(([prod,lengths])=>{
                detailHTML+=`<tr><td>${prod}</td>`;
                ['8','10','12','14','16','18','20'].forEach(len=>{
                  detailHTML+=`<td class="right">${lengths[len]?'$'+lengths[len]:'—'}</td>`;
                });
                detailHTML+=`</tr>`;
              });
              detailHTML+=`</table></div>`;
            }
          });
        }
        detailHTML+=`</div></div>`;
      }

      c.innerHTML=_aTabBar+`
        <div style="margin-bottom:16px;display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap">
          <div style="display:flex;gap:8px;align-items:center">
            <span style="color:var(--muted);font-size:11px">DATES:</span>
            <div style="display:flex;flex-wrap:wrap;gap:4px">${dateTabs||'<span style="color:var(--muted)">No data</span>'}</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-warn" onclick="showParseModal()">Import PDF</button>
            <button class="btn btn-primary" onclick="showRLModal()">+ Manual Entry</button>
          </div>
        </div>
        ${detailHTML||'<div class="empty-state">No RL data uploaded yet</div>'}`;
    }
    else{
      c.innerHTML=_aTabBar+'<div class="empty-state">Select a tab</div>';
    }
  }
  else if(S.view==='trading'&&(!S.tradingTab||S.tradingTab==='blotter')){
    const _tTabBar=''; // Single tab — blotter only
    // Blotter includes cancelled orders (shown grayed out) unlike analytics
    const r=getRange(),inR=d=>new Date(d)>=r.start&&new Date(d)<=r.end;
    const mP=p=>S.filters.prod==='all'||p===S.filters.prod;
    const mR=rg=>S.filters.reg==='all'||rg===S.filters.reg;
    const isAdminUser=S.trader==='Admin';
    const isMyTrade=t=>isAdminUser||t===S.trader||!t;
    const myBuys=S.buys.filter(b=>inR(b.date)&&mP(b.product)&&mR(b.region)&&isMyTrade(b.trader));
    const mySells=S.sells.filter(s=>inR(s.date)&&mP(s.product)&&isMyTrade(s.trader));

    // Calculate sold volume per Order# - normalized (only from my sells)
    const orderSold=buildOrderSold(mySells);

    // Get unique values for filters (only from my trades)
    const mills=[...new Set(myBuys.map(b=>b.mill).filter(Boolean))].sort();
    const customers=[...new Set(mySells.map(s=>s.customer).filter(Boolean))].sort();
    const products=[...new Set([...myBuys.map(b=>b.product),...mySells.map(s=>s.product)].filter(Boolean))].sort();

    // Apply blotter filters
    const bf=S.blotterFilter||{};
    let filteredBuys=myBuys;
    let filteredSells=mySells;

    // Text search filter
    if(bf.search){
      const q=bf.search.toLowerCase();
      filteredBuys=filteredBuys.filter(b=>
        (b.orderNum||b.po||'').toLowerCase().includes(q)||
        (b.mill||'').toLowerCase().includes(q)||
        (b.origin||'').toLowerCase().includes(q)||
        (b.product||'').toLowerCase().includes(q)||
        (b.notes||'').toLowerCase().includes(q)
      );
      filteredSells=filteredSells.filter(s=>
        (s.orderNum||s.linkedPO||s.oc||'').toLowerCase().includes(q)||
        (s.customer||'').toLowerCase().includes(q)||
        (s.destination||'').toLowerCase().includes(q)||
        (s.product||'').toLowerCase().includes(q)||
        (s.notes||'').toLowerCase().includes(q)
      );
    }

    if(bf.mill)filteredBuys=filteredBuys.filter(b=>b.mill===bf.mill);
    if(bf.product){filteredBuys=filteredBuys.filter(b=>b.product===bf.product);filteredSells=filteredSells.filter(s=>s.product===bf.product);}
    if(bf.customer)filteredSells=filteredSells.filter(s=>s.customer===bf.customer);
    if(bf.showShorts){
      // Shorts = sells with orderNum that has no matching buy - normalize for comparison (use my buys only)
      const buyOrders=new Set(myBuys.map(b=>String(b.orderNum||b.po||'').trim()).filter(Boolean));
      filteredSells=filteredSells.filter(s=>{
        const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
        return !ord||!buyOrders.has(ord);
      });
    }
    if(bf.noOrderNum){
      // Show only orders without an order number
      filteredBuys=filteredBuys.filter(b=>!String(b.orderNum||b.po||'').trim());
      filteredSells=filteredSells.filter(s=>!String(s.orderNum||s.linkedPO||s.oc||'').trim());
    }

    // Calculate inventory age (days since buy date)
    const calcAge=d=>{if(!d)return'—';const days=Math.floor((new Date()-new Date(d))/(1000*60*60*24));return days;};
    
    // Apply sorting
    const bs=S.blotterSort||{col:'date',dir:'desc'};
    const sortFn=(a,b,col,dir)=>{
      let av=a[col],bv=b[col];
      if(col==='date'){av=new Date(av||0);bv=new Date(bv||0);}
      if(col==='orderNum'){av=a.orderNum||a.po||a.oc||a.linkedPO||'';bv=b.orderNum||b.po||b.oc||b.linkedPO||'';}
      if(typeof av==='string')av=av.toLowerCase();
      if(typeof bv==='string')bv=bv.toLowerCase();
      if(av<bv)return dir==='asc'?-1:1;
      if(av>bv)return dir==='asc'?1:-1;
      return 0;
    };
    filteredBuys=[...filteredBuys].sort((a,b)=>sortFn(a,b,bs.col,bs.dir));
    filteredSells=[...filteredSells].sort((a,b)=>sortFn(a,b,bs.col,bs.dir));
    
    const sortIcon=(col)=>bs.col===col?(bs.dir==='asc'?'▲':'▼'):'';
    const sortClick=(col)=>`onclick="toggleSort('${col}')"style="cursor:pointer"`;
    
    // Build order lookup for cross-trader visibility
    // Use ALL department data to see if coworkers are involved in linked orders
    const buyByOrder={};
    S.buys.forEach(b=>{
      const ord=normalizeOrderNum(b.orderNum||b.po);
      if(ord)buyByOrder[ord]=b;
    });
    const sellByOrder={};
    S.sells.forEach(s=>{
      const ord=normalizeOrderNum(s.orderNum||s.linkedPO||s.oc);
      if(ord){
        if(!sellByOrder[ord])sellByOrder[ord]=[];
        sellByOrder[ord].push(s);
      }
    });
    
    // Calculate summary stats for footer
    const buyTotalVol=filteredBuys.reduce((s,b)=>s+(b.volume||0),0)
    const sellTotalVol=filteredSells.reduce((s,x)=>s+(x.volume||0),0)
    const hasActiveFilters=!!(bf.search||bf.mill||bf.product||bf.customer||bf.showShorts||bf.noOrderNum);
    const filteredEmptyBuys=hasActiveFilters&&myBuys.length?`<tr><td colspan="${S.trader==='Admin'?12:11}" class="empty-state">No buys match current filters <button class="btn btn-default btn-sm" onclick="clearBlotterFilters()" style="margin-left:8px">Clear Filters</button></td></tr>`:`<tr><td colspan="${S.trader==='Admin'?12:11}" class="empty-state">No buys</td></tr>`;
    const filteredEmptySells=hasActiveFilters&&mySells.length?`<tr><td colspan="${S.trader==='Admin'?11:10}" class="empty-state">No sells match current filters <button class="btn btn-default btn-sm" onclick="clearBlotterFilters()" style="margin-left:8px">Clear Filters</button></td></tr>`:`<tr><td colspan="${S.trader==='Admin'?11:10}" class="empty-state">No sells</td></tr>`;
    // Age class helper
    const ageClass=d=>{if(!d)return'';const days=Math.floor((new Date()-new Date(d))/(1000*60*60*24));return days>30?'age-stale':days>14?'age-old':days>7?'age-week':'age-fresh'}
    // Trade status helper
    const tradeStatus=t=>{if(t.status==='cancelled')return'cancelled';if(t.delivered||t.shipped)return t.delivered?'delivered':'shipped';return t.linkedPO||t.orderNum?'approved':'pending'}

    c.innerHTML=_tTabBar+`
      <div class="panel" style="margin-bottom:12px"><div class="panel-header" style="border-left:3px solid ${traderColor(S.trader)}">
        <div><strong>${S.trader==='Admin'?'All Traders':escapeHtml(S.trader)+"'s Trade Blotter"}</strong> <span style="color:var(--muted)"> -- ${filteredBuys.length} buys, ${filteredSells.length} sells</span></div>
        <div style="display:flex;align-items:center;gap:8px">
          ${S.trader==='Admin'?'<button class="btn btn-default btn-sm" onclick="showImportModal()">Import CSV</button>':''}
          <button class="btn btn-info btn-sm" onclick="expCSV('buys')">Export CSV</button>
          <button class="btn btn-info btn-sm" onclick="exportPDF()">Export PDF</button>
        </div>
      </div></div>
      <div class="panel" style="margin-bottom:16px"><div class="panel-body">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <div style="position:relative;flex:0 0 220px">
            <input type="text" id="blotter-search" placeholder="Search orders, mills, customers..." value="${escapeHtml(bf.search||'')}" onkeyup="handleBlotterSearch(event)" style="width:100%;padding:6px 10px 6px 28px;font-size:11px;background:var(--bg);border:1px solid var(--border);color:var(--text)">
            <span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:12px">&#128269;</span>
          </div>
          <select onchange="setBlotterFilter('mill',this.value)" style="font-size:11px;padding:4px">
            <option value="">All Mills</option>${mills.map(m=>`<option value="${escapeHtml(m)}" ${bf.mill===m?'selected':''}>${escapeHtml(m)}</option>`).join('')}
          </select>
          <select onchange="setBlotterFilter('customer',this.value)" style="font-size:11px;padding:4px">
            <option value="">All Customers</option>${customers.map(cu=>`<option value="${escapeHtml(cu)}" ${bf.customer===cu?'selected':''}>${escapeHtml(cu)}</option>`).join('')}
          </select>
          <select onchange="setBlotterFilter('product',this.value)" style="font-size:11px;padding:4px">
            <option value="">All Products</option>${products.map(p=>`<option value="${escapeHtml(p)}" ${bf.product===p?'selected':''}>${escapeHtml(p)}</option>`).join('')}
          </select>
          <label style="font-size:11px"><input type="checkbox" ${bf.showShorts?'checked':''} onchange="setBlotterFilter('showShorts',this.checked)"> Shorts only</label>
          <label style="font-size:11px;color:var(--warn)"><input type="checkbox" ${bf.noOrderNum?'checked':''} onchange="setBlotterFilter('noOrderNum',this.checked)"> No Order #</label>
          <button class="btn btn-default btn-sm" onclick="clearBlotterFilters()">Clear</button>
        </div>
      </div></div>
      <div class="panel"><div class="panel-header"><span>${S.trader==='Admin'?'ALL BUYS':'MY BUYS'}</span><span style="color:var(--muted);font-size:10px;margin-left:8px">${filteredBuys.length} trades</span></div>
        <div class="panel-body table-wrap" style="padding:0"><table class="data-table"><thead><tr>${S.trader==='Admin'?'<th>Trader</th>':''}<th class="sortable" onclick="toggleSort('orderNum')">Order # ${sortIcon('orderNum')}</th><th class="sortable" onclick="toggleSort('date')">Date ${sortIcon('date')}</th><th>Status</th><th class="right">Age</th><th class="sortable" onclick="toggleSort('mill')">Mill ${sortIcon('mill')}</th><th>Origin</th><th>Reg</th><th class="sortable" onclick="toggleSort('product')">Product ${sortIcon('product')}</th><th>Len</th><th class="right sortable" onclick="toggleSort('price')">Price ${sortIcon('price')}</th><th></th></tr></thead><tbody>
          ${filteredBuys.length?filteredBuys.map(b=>{const ordDisplay=String(b.orderNum||b.po||'').trim();const ord=normalizeOrderNum(b.orderNum||b.po);const sold=orderSold[ord]||0;const avail=(b.volume||0)-sold;const age=calcAge(b.date);const ageCls=ageClass(b.date);const linkedSells=ord?sellByOrder[ord]||[]:[];const coworkerSells=linkedSells.filter(s=>s.trader&&s.trader!==b.trader);const isCancelled=b.status==='cancelled';const st=tradeStatus(b);return`<tr class="${isCancelled?'cancelled-row':''}">${S.trader==='Admin'?`<td><span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:${traderColor(b.trader||'Ian P')};color:var(--bg);font-size:10px;font-weight:700;text-align:center;line-height:20px" title="${escapeHtml(b.trader||'Ian P')}">${traderInitial(b.trader||'Ian P')}</span></td>`:''}<td class="bold accent">${escapeHtml(ordDisplay)||'--'}${coworkerSells.length?` <span style="font-size:9px;color:var(--info)" title="Sold by: ${escapeHtml(coworkerSells.map(s=>s.trader).join(', '))}">->${coworkerSells.map(s=>traderInitial(s.trader)).join(',')}</span>`:''}</td><td>${fmtD(b.date)}</td><td><span class="status-badge status-${st}">${st}</span></td><td class="right ${ageCls}" title="${age} days old">${age}d</td><td>${escapeHtml(b.mill)||'--'}</td><td>${escapeHtml(b.origin)||'--'}</td><td style="text-transform:capitalize">${escapeHtml(b.region)}</td><td class="bold">${escapeHtml(b.product)}${b.msrPremium?' <span style="color:var(--accent);font-size:9px">+'+b.msrPremium+'</span>':''}</td><td>${b.length||'RL'}${b.tally?' <span style="color:var(--warn);font-size:9px">T</span>':''}</td><td class="right positive editable" ondblclick="editCell(this,'price','buy-${b.id}')">${fmt(b.price)}${b.freight?' <span style="color:var(--muted);font-size:9px">FOB</span>':''}</td><td><div class="action-buttons"><button class="btn btn-default btn-sm" onclick="editBuy(${b.id})">Edit</button><button class="btn btn-default btn-sm" onclick="dupBuy(${b.id})">&#x29C9;</button><button class="btn btn-default btn-sm" onclick="cancelBuy(${b.id})" title="${b.status==='cancelled'?'Reactivate':'Cancel'}">${b.status==='cancelled'?'&#x21A9;':'&#x2298;'}</button><button class="btn btn-danger btn-sm" onclick="delBuy(${b.id})">x</button></div></td></tr>`}).join(''):filteredEmptyBuys}
        </tbody></table></div>
        <div class="panel-footer"><span>Avg Price: <strong>${buyTotalVol>0?fmt(Math.round(filteredBuys.reduce((s,b)=>s+(b.price||0)*(b.volume||0),0)/buyTotalVol)):'--'}</strong></span><span>${filteredBuys.length} trades</span></div>
      </div>
      <div class="panel" style="margin-top:16px"><div class="panel-header"><span>${S.trader==='Admin'?'ALL SELLS':'MY SELLS'}</span><span style="color:var(--muted);font-size:10px;margin-left:8px">${filteredSells.length} trades</span></div>
        <div class="panel-body table-wrap" style="padding:0"><table class="data-table"><thead><tr>${S.trader==='Admin'?'<th>Trader</th>':''}<th class="sortable" onclick="toggleSort('orderNum')">Order # ${sortIcon('orderNum')}</th><th class="sortable" onclick="toggleSort('date')">Date ${sortIcon('date')}</th><th>Status</th><th class="sortable" onclick="toggleSort('customer')">Customer ${sortIcon('customer')}</th><th>Dest</th><th class="sortable" onclick="toggleSort('product')">Product ${sortIcon('product')}</th><th>Len</th><th class="right sortable" onclick="toggleSort('price')">Price ${sortIcon('price')}</th><th>Matched</th><th></th></tr></thead><tbody>
          ${filteredSells.length?filteredSells.map(x=>{
            const ordDisplay=String(x.orderNum||x.linkedPO||x.oc||'').trim()
            const ord=normalizeOrderNum(x.orderNum||x.linkedPO||x.oc)
            const buy=ord?buyByOrder[ord]:null
            const isShort=!buy
            const crossTrader=buy&&buy.trader!==x.trader
            const isCancelled=x.status==='cancelled'
            const st=tradeStatus(x)
            return`<tr class="${isCancelled?'cancelled-row':''}">${S.trader==='Admin'?`<td><span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:${traderColor(x.trader||'Ian P')};color:var(--bg);font-size:10px;font-weight:700;text-align:center;line-height:20px" title="${escapeHtml(x.trader||'Ian P')}">${traderInitial(x.trader||'Ian P')}</span></td>`:''}<td class="bold ${isShort?'negative':'accent'}">${escapeHtml(ordDisplay)||'--'}${isShort?' <span class="status-badge status-draft">SHORT</span>':''}${crossTrader?` <span style="font-size:9px;color:${traderColor(buy.trader)}" title="Sourced from ${escapeHtml(buy.trader)}"><-${traderInitial(buy.trader)}</span>`:''}</td><td>${fmtD(x.date)}</td><td><span class="status-badge status-${st}">${st}</span></td><td>${escapeHtml(x.customer)||'--'}</td><td>${escapeHtml(x.destination)||'--'}</td><td class="bold">${escapeHtml(x.product)}${x.msrPremium?' <span style="color:var(--accent);font-size:9px">+'+x.msrPremium+'</span>':''}</td><td>${x.length||'RL'}${x.tally?' <span style="color:var(--warn);font-size:9px">T</span>':''}</td><td class="right accent editable" ondblclick="editCell(this,'price','sell-${x.id}')">${fmt(x.price)}</td><td style="text-align:center">${buy?'<span style="color:var(--positive)" title="Matched to '+escapeHtml(ordDisplay)+'">&#10003;</span>':'<span style="color:var(--negative)">&#10007;</span>'}</td><td><div class="action-buttons"><button class="btn btn-default btn-sm" onclick="editSell(${x.id})">Edit</button><button class="btn btn-default btn-sm" onclick="dupSell(${x.id})">&#x29C9;</button><button class="btn btn-default btn-sm" onclick="cancelSell(${x.id})" title="${x.status==='cancelled'?'Reactivate':'Cancel'}">${x.status==='cancelled'?'&#x21A9;':'&#x2298;'}</button><button class="btn btn-danger btn-sm" onclick="delSell(${x.id})">x</button></div></td></tr>`}).join(''):filteredEmptySells}
        </tbody></table></div>
        <div class="panel-footer"><span>Avg Price: <strong>${sellTotalVol>0?fmt(Math.round(filteredSells.reduce((s,x)=>s+(x.price||0)*(x.volume||0),0)/sellTotalVol)):'--'}</strong></span><span>${filteredSells.length} trades</span></div>
      </div>`;
  }
  else if(S.view==='quotes'){
    // Quotes view with BUILD + Offerings tabs
    const qTab=S.quotesViewTab||'build';
    const _qTabBar=`<div style="display:flex;gap:4px;margin-bottom:16px;background:var(--panel);padding:4px">
      <button class="btn ${qTab==='build'?'btn-primary':'btn-default'}" onclick="S.quotesViewTab='build';render()">🔨 Build</button>
      <button class="btn ${qTab==='offerings'?'btn-primary':'btn-default'}" onclick="S.quotesViewTab='offerings';render()">📋 Offerings <span id="offerings-badge" style="font-size:9px;padding:1px 5px;border-radius:8px;background:var(--accent);color:var(--bg);margin-left:3px;display:none">0</span></button>
    </div>`;

    if(qTab==='offerings'){
      c.innerHTML=_qTabBar+renderOfferingsView();
      // Load pending count
      fetch('/api/offerings/pending-count'+(S.trader?'?trader='+encodeURIComponent(S.trader):'')).then(r=>r.json()).then(d=>{
        const badge=document.getElementById('offerings-badge');
        if(badge&&d.count>0){badge.textContent=d.count;badge.style.display='inline';}
      }).catch(()=>{});
    } else {
    // Quote Engine View — BUILD workflow
    const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
    const customers=myCustomers().filter(c=>c.type!=='mill');
    const items=S.quoteItems||[];

    // Get selected customer destination
    const selectedCustomer=S.qbCustomer?customers.find(c=>c.name===S.qbCustomer):null;
    const customerDest=selectedCustomer?.locations?.[0]||selectedCustomer?.destination||'';

    // Template buttons for BUILD matrix
    const builtInNames=Object.keys(QUOTE_TEMPLATES);
    const allCustom=S.quoteTemplates||[];
    const generalCustom=allCustom.filter(t=>!t.customer);
    const customerCustom=S.qbCustomer?allCustom.filter(t=>t.customer===S.qbCustomer):[];
    const _activeT=S.qeBuildTemplate||'';
    const _esc=s=>s.replace(/'/g,"\\'");
    const _hasCustTpl=S.qbCustomer&&S.customerTemplates&&S.customerTemplates[S.qbCustomer]&&S.customerTemplates[S.qbCustomer].grid&&Object.keys(S.customerTemplates[S.qbCustomer].grid).length>0;
    const templateBtns=[
      _hasCustTpl?`<button class="btn ${'__customer__'===_activeT?'btn-primary':'btn-default'}" style="padding:2px 8px;font-size:10px;min-width:0;border:1px solid var(--positive)" onclick="qeApplyCustomerTemplate()">&#128203; Profile</button>`:'',
      ...builtInNames.map(name=>`<button class="btn ${name===_activeT?'btn-primary':'btn-default'}" style="padding:2px 8px;font-size:10px;min-width:0" onclick="qeApplyTemplate('${_esc(name)}')">${escapeHtml(name)}</button>`),
      ...generalCustom.map(t=>`<button class="btn ${t.name===_activeT?'btn-primary':'btn-default'}" style="padding:2px 8px;font-size:10px;min-width:0" onclick="qeApplyTemplate('${_esc(t.name)}')">${escapeHtml(t.name)} <span onclick="event.stopPropagation();qeDeleteTemplate('${_esc(t.name)}')" style="cursor:pointer;margin-left:2px;opacity:0.5" title="Delete">&times;</span></button>`),
      ...customerCustom.map(t=>`<button class="btn ${t.name===_activeT?'btn-primary':'btn-default'}" style="padding:2px 8px;font-size:10px;min-width:0" onclick="qeApplyTemplate('${_esc(t.name)}')">&#128100; ${escapeHtml(t.name)} <span onclick="event.stopPropagation();qeDeleteTemplate('${_esc(t.name)}','${_esc(t.customer)}')" style="cursor:pointer;margin-left:2px;opacity:0.5" title="Delete">&times;</span></button>`),
      `<button class="btn btn-default" style="padding:2px 8px;font-size:10px;min-width:0;border-style:dashed" onclick="qeSaveTemplate(false)">+ Save</button>`,
      S.qbCustomer?`<button class="btn btn-default" style="padding:2px 8px;font-size:10px;min-width:0;border-style:dashed" onclick="qeSaveTemplate(true)">&#128100; Save for ${escapeHtml(S.qbCustomer)}</button>`:'',
    ].join('');

    // Inline location warning when customer has no destination
    const _noLoc=selectedCustomer&&!customerDest;
    const locationBanner=_noLoc?`<div style="margin-bottom:10px;padding:8px 12px;background:rgba(232,115,74,0.08);border:1px solid var(--accent);font-size:11px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="color:var(--accent)">&#9888; ${escapeHtml(selectedCustomer.name)} has no delivery location — freight can't calculate.</span>
      <input id="qe-add-location-input" type="text" placeholder="City, ST" style="padding:4px 8px;font-size:11px;width:140px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
      <button class="btn btn-primary btn-sm" style="padding:2px 10px;font-size:10px" onclick="qeAddCustomerLocation()">Save</button>
    </div>`:'';

    c.innerHTML=_qTabBar+`
      ${S.trader==='Admin'?`<div style="margin-bottom:12px;padding:8px 12px;background:rgba(232,115,74,0.1);border:1px solid #e8734a;font-size:11px;color:#e8734a">🔑 <strong>Admin View</strong> — Each trader has separate quote items and profiles.</div>`:''}

      <div class="grid-2" style="gap:16px;align-items:start">
        <!-- LEFT: Product Matrix -->
        <div>
          <div class="card" style="margin-bottom:12px">
            <div class="card-header">
              <span class="card-title">SELECT PRODUCTS</span>
              <span id="qe-mx-count" style="font-size:10px;color:var(--muted)"></span>
            </div>
            <div class="card-body">
              <!-- Customer / Destination -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
                <div>
                  <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:2px">Customer</label>
                  <select id="qb-customer-select" onchange="S.qbCustomer=this.value;save('qbCustomer',S.qbCustomer);S.qbCustomDest='';save('qbCustomDest','');render()" style="width:100%;padding:6px 8px;font-size:11px">
                    <option value="">Select customer...</option>
                    ${customers.map(c=>{
                      const dest=c.locations?.[0]||c.destination||'';
                      return`<option value="${escapeHtml(c.name)}" ${S.qbCustomer===c.name?'selected':''}>${escapeHtml(c.name)}${dest?' — '+escapeHtml(dest):''}</option>`;
                    }).join('')}
                  </select>
                </div>
                <div>
                  <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:2px">Destination</label>
                  <input type="text" id="qb-custom-dest" placeholder="City, ST" style="width:100%;padding:6px 8px;font-size:11px" value="${escapeHtml(S.qbCustomDest||customerDest||'')}" onchange="S.qbCustomDest=this.value;save('qbCustomDest',S.qbCustomDest)">
                </div>
              </div>

              ${locationBanner}

              <!-- Templates -->
              <div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:8px">${templateBtns}</div>

              <!-- Matrix -->
              ${qeRenderMatrixHTML()}

              <!-- Actions -->
              <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <button class="btn btn-primary" onclick="qeBuildFromMatrix()">Add to Quote</button>
                <button class="btn btn-default btn-sm" onclick="clearQuoteItems()">Clear All</button>
                <button class="btn btn-default btn-sm" onclick="loadFromMillQuotes()" title="Load from Mill Intel">🏭 Load Mill Quotes</button>
              </div>

              <!-- Text fallback -->
              <details style="margin-top:10px">
                <summary style="font-size:10px;color:var(--muted);cursor:pointer">Manual text entry</summary>
                <div style="margin-top:6px">
                  <textarea id="qb-products-input" placeholder="Enter products (one per line):&#10;2x4#2 16'&#10;2x6#2 RL" style="width:100%;height:60px;padding:8px;font-size:11px;font-family:var(--mono);border:1px solid var(--border);background:var(--bg);color:var(--text);resize:vertical">${items.map(i=>i.product).join('\n')}</textarea>
                  <button class="btn btn-default btn-sm" style="margin-top:4px" onclick="parseQuoteProducts()">Parse</button>
                </div>
              </details>
            </div>
          </div>

          <!-- Freight Settings -->
          <details class="card" style="margin-bottom:12px" ${S.qbShowFreight?'open':''}>
            <summary class="card-header" style="cursor:pointer" onclick="S.qbShowFreight=!S.qbShowFreight;save('qbShowFreight',S.qbShowFreight)">
              <span class="card-title">🚚 Freight Settings</span>
            </summary>
            <div style="padding:12px">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
                <div>
                  <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:2px">Base $/Load</label>
                  <input type="number" value="${S.freightBase||300}" step="25" style="width:100%;padding:4px;font-size:11px" onchange="S.freightBase=+this.value;save('freightBase',S.freightBase)">
                </div>
                <div>
                  <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:2px">MBF/TL</label>
                  <input type="number" value="${S.quoteMBFperTL||23}" style="width:100%;padding:4px;font-size:11px" onchange="S.quoteMBFperTL=+this.value;save('quoteMBFperTL',S.quoteMBFperTL)">
                </div>
              </div>
              <div style="margin-bottom:8px">
                <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:4px">State $/mi Rates</label>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px">
                  ${['AR','LA','TX','MS','AL','NC'].map(st=>`<div style="display:flex;align-items:center;gap:4px">
                    <span style="font-size:9px;color:var(--muted);width:20px">${st}</span>
                    <input type="number" value="${S.stateRates?.[st]||''}" step="0.05" placeholder="0" style="width:45px;padding:3px;font-size:10px" onchange="updateStateRate('${st}',+this.value||0)">
                  </div>`).join('')}
                </div>
              </div>
            </div>
          </details>

          <!-- RL Reference -->
          ${latestRL?`<div class="card" style="margin-bottom:12px">
            <div class="card-header"><span class="card-title">📰 RL Print ${escapeHtml(latestRL.date||'')}</span></div>
            <div style="padding:12px">
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:11px">
                <div style="text-align:center;padding:8px;background:var(--bg)">
                  <div style="color:var(--accent);font-weight:700;font-size:14px">$${latestRL.west?.['2x4#2']||'—'}</div>
                  <div style="font-size:9px;color:var(--muted)">West</div>
                </div>
                <div style="text-align:center;padding:8px;background:var(--bg)">
                  <div style="color:var(--warn);font-weight:700;font-size:14px">$${latestRL.central?.['2x4#2']||'—'}</div>
                  <div style="font-size:9px;color:var(--muted)">Central</div>
                </div>
                <div style="text-align:center;padding:8px;background:var(--bg)">
                  <div style="color:var(--info);font-weight:700;font-size:14px">$${latestRL.east?.['2x4#2']||'—'}</div>
                  <div style="font-size:9px;color:var(--muted)">East</div>
                </div>
              </div>
            </div>
          </div>`:''}
        </div>

        <!-- RIGHT: Pricing Panel -->
        <div>
          <div class="card">
            <div class="card-header">
              <span class="card-title">PRICING ${items.length?'('+items.length+')':''}</span>
              <div style="display:flex;gap:6px">
                <button class="btn btn-success btn-sm" onclick="qeReflowPricing()" title="Re-fetch pricing for all items">🔄 Reflow</button>
                <button class="btn btn-default btn-sm" onclick="applyAllMargin()">+Margin</button>
                <input type="number" id="qb-margin-input" placeholder="+$25" style="width:55px;padding:4px;text-align:center;font-size:11px">
              </div>
            </div>
            <div class="table-wrap">
              <table style="font-size:11px;width:100%;border-collapse:collapse">
                <thead><tr style="border-bottom:2px solid var(--border)">
                  <th style="text-align:left;padding:4px 6px">Product</th>
                  <th style="text-align:right;padding:4px 6px" title="Best mill FOB cost">Cost</th>
                  <th style="text-align:right;padding:4px 6px" title="Freight $/MBF">Frt</th>
                  <th style="text-align:right;padding:4px 6px" title="Mill Cost + Freight">Landed</th>
                  <th style="text-align:center;padding:4px 6px" title="Your sell price delivered">Sell</th>
                  <th style="text-align:right;padding:4px 6px">Margin</th>
                  <th style="text-align:center;padding:4px 6px" title="Truckloads">TLs</th>
                  <th style="text-align:center;padding:4px 6px" title="Ship week">Ship</th>
                  <th style="width:24px"></th>
                </tr></thead>
                <tbody>
                  ${items.length?items.map((item,idx)=>{
                    const parsed=typeof parseProductString==='function'?parseProductString(item.product):{base:item.product,length:null};
                    const region=item.bestMillRegion||'central';
                    const rlPrice=latestRL?getRLPrice(latestRL,parsed.base,parsed.length,region):null;
                    const landed=item.landed||null;
                    const margin=item.sellDlvd&&landed?(item.sellDlvd-landed):null;
                    const marginColor=margin===null?'var(--muted)':margin>=25?'var(--positive)':margin>=0?'var(--warn)':'var(--negative)';
                    return`<tr style="border-bottom:1px solid var(--border)">
                      <td style="padding:4px 6px;font-weight:600;color:var(--accent)">${escapeHtml(item.product||'—')}${rlPrice?'<div style=\"font-size:9px;color:var(--muted)\">RL $'+rlPrice+'</div>':''}</td>
                      <td style="text-align:right;padding:4px 6px">${item.bestMillCost?`<span style="color:var(--positive)">$${item.bestMillCost}</span><div style="font-size:9px;color:var(--muted)">${escapeHtml(item.bestMill||'')}</div>`:'<span style="color:var(--muted)">—</span>'}</td>
                      <td style="text-align:right;padding:4px 6px;color:var(--muted)">${item.freight?'$'+Math.round(item.freight):'—'}</td>
                      <td style="text-align:right;padding:4px 6px;font-weight:600">${landed?'$'+landed:'—'}</td>
                      <td style="text-align:center;padding:4px 2px"><input type="number" value="${item.sellDlvd||''}" placeholder="$" style="width:60px;padding:3px;text-align:center;font-weight:600;font-size:11px" onchange="updateQuoteSellDlvd(${idx},+this.value)"></td>
                      <td style="text-align:right;padding:4px 6px;font-weight:600;color:${marginColor}">${margin!==null?'$'+margin:'—'}</td>
                      <td style="text-align:center;padding:4px 2px"><input type="number" value="${item.tls||1}" min="1" style="width:36px;padding:3px;text-align:center;font-size:11px" onchange="qeUpdateTLs(${idx},this.value)"></td>
                      <td style="text-align:center;padding:4px 2px"><input type="text" value="${escapeHtml(item.shipWeek||'')}" placeholder="Wk" style="width:48px;padding:3px;text-align:center;font-size:10px" onchange="qeUpdateShipWeek(${idx},this.value)"></td>
                      <td style="padding:4px 2px"><button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0 2px" onclick="removeQuoteItem(${idx})" title="Remove">×</button></td>
                    </tr>`;
                  }).join(''):`<tr><td colspan="9" style="padding:30px;text-align:center;color:var(--muted)">Select products from the matrix and click "Add to Quote"</td></tr>`}
                </tbody>
                ${items.length&&items.some(i=>i.sellDlvd)?`<tfoot style="border-top:2px solid var(--border)">
                  <tr style="font-weight:600">
                    <td style="padding:6px">TOTAL</td>
                    <td></td><td></td><td></td><td></td>
                    <td style="text-align:right;padding:6px;color:${items.reduce((s,i)=>(i.sellDlvd&&i.landed)?s+(i.sellDlvd-i.landed):s,0)>=0?'var(--positive)':'var(--negative)'}">$${items.reduce((s,i)=>(i.sellDlvd&&i.landed)?s+(i.sellDlvd-i.landed):s,0)} avg</td>
                    <td style="text-align:center;padding:6px">${items.reduce((s,i)=>s+(i.tls||1),0)} TL</td>
                    <td></td><td></td>
                  </tr>
                </tfoot>`:''}
              </table>
            </div>
            ${items.length?`<div style="padding:10px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span class="status-badge status-${S.quoteStatus||'draft'}">${S.quoteStatus||'draft'}</span>
              <select onchange="S.quoteStatus=this.value;SS('quoteStatus',this.value);render()" style="font-size:10px;padding:3px">
                <option value="draft" ${(S.quoteStatus||'draft')==='draft'?'selected':''}>Draft</option>
                <option value="sent" ${S.quoteStatus==='sent'?'selected':''}>Sent</option>
                <option value="approved" ${S.quoteStatus==='approved'?'selected':''}>Accepted</option>
                <option value="cancelled" ${S.quoteStatus==='cancelled'?'selected':''}>Rejected</option>
              </select>
              <div style="flex:1"></div>
              <button class="btn btn-primary btn-sm" onclick="copyQuickQuote()">📋 Copy Quote</button>
              ${S.quoteStatus==='approved'?'<button class="btn btn-success btn-sm" onclick="convertQuoteToTrades()">Convert to Trades</button>':''}
            </div>`:''}</div>

          <!-- Cached Lanes -->
          ${S.lanes.length?`<div class="card" style="margin-top:12px">
            <div class="card-header">
              <span class="card-title">📍 Cached Lanes (${S.lanes.length})</span>
              <button class="btn btn-default btn-sm" onclick="S.lanes=[];save('lanes',S.lanes);render()">Clear</button>
            </div>
            <div style="max-height:150px;overflow-y:auto;padding:8px">
              <table style="width:100%;font-size:10px;border-collapse:collapse">
                ${S.lanes.slice(0,8).map(l=>`<tr style="border-bottom:1px solid var(--border)"><td style="padding:3px">${escapeHtml(l.origin)}</td><td style="padding:3px">→</td><td style="padding:3px">${escapeHtml(l.dest)}</td><td style="padding:3px;text-align:right;color:var(--accent)">${l.miles} mi</td></tr>`).join('')}
                ${S.lanes.length>8?`<tr><td colspan="4" style="padding:3px;color:var(--muted);text-align:center">+${S.lanes.length-8} more</td></tr>`:''}
              </table>
            </div>
          </div>`:''}
        </div>
      </div>`;

    // Initialize matrix headers after render
    setTimeout(()=>qeUpdateMatrixHeaders(),0);
  }}
  else if(S.view==='crm'){
    // CRM with Prospects and Customers tabs
    const crmTab=S.crmTab||'prospects';
    const mills=myMills();
    const customers=myCustomers();

    // Calculate margin by customer for current trader only
    const buyByOrder={};
    S.buys.forEach(b=>{
      const ord=String(b.orderNum||b.po||'').trim();
      if(ord)buyByOrder[ord]=b;
    });

    const custMargins={};
    S.sells.filter(s=>s.trader===S.trader||!s.trader).forEach(s=>{
      const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
      const buy=ord?buyByOrder[ord]:null;
      const buyCost=buy?.price||0;
      const sellFrtPerMBF=s.volume>0?(s.freight||0)/s.volume:0;
      const fob=(s.price||0)-sellFrtPerMBF;
      const margin=buy?(fob-buyCost):null;

      if(!custMargins[s.customer])custMargins[s.customer]={vol:0,marginVal:0,n:0};
      custMargins[s.customer].n++;
      custMargins[s.customer].vol+=s.volume||0;
      if(margin!==null)custMargins[s.customer].marginVal+=margin*(s.volume||0);
    });

    // Tab navigation
    const tabsHTML=`
      <div style="display:flex;gap:4px;margin-bottom:16px;background:var(--panel);padding:4px">
        <button class="btn ${crmTab==='prospects'?'btn-info':'btn-default'}" onclick="S.crmTab='prospects';render()">📋 Prospects</button>
        <button class="btn ${crmTab==='customers'?'btn-success':'btn-default'}" onclick="S.crmTab='customers';render()">🏢 Customers</button>
        <button class="btn ${crmTab==='mills'?'btn-warn':'btn-default'}" onclick="S.crmTab='mills';render()">🏭 Mills</button>
      </div>`;

    let contentHTML='';

    if(crmTab==='prospects'){
      // Prospects view - fetched from CRM API
      const prospects=S.crmProspects||[];
      const crmStats=S.crmStats||{};
      const statusFilter=S.crmStatusFilter||'all';
      const staleCritical=S.crmStaleCritical||[];
      const staleWarning=S.crmStaleWarning||[];
      const neverContacted=S.crmNeverContacted||[];
      const hasReminders=(staleCritical.length||staleWarning.length||neverContacted.length||(S.crmOverdue||[]).length);

      contentHTML=`
        <div class="kpi-grid" style="margin-bottom:16px">
          <div class="kpi"><div class="kpi-label">TOTAL PROSPECTS</div><div class="kpi-value">${crmStats.total_prospects||0}</div></div>
          <div class="kpi"><div class="kpi-label">NEW</div><div class="kpi-value" style="color:var(--info)">${crmStats.new_prospects||0}</div></div>
          <div class="kpi"><div class="kpi-label">QUALIFIED</div><div class="kpi-value" style="color:var(--warn)">${crmStats.qualified||0}</div></div>
          <div class="kpi"><div class="kpi-label">CONVERTED</div><div class="kpi-value positive">${crmStats.converted||0}</div></div>
        </div>

        ${hasReminders?`
        <!-- REMINDER DASHBOARD -->
        <div style="background:linear-gradient(135deg,rgba(224,82,82,0.1),rgba(232,115,74,0.1));border:1px solid var(--negative);padding:16px;margin-bottom:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;color:var(--negative);font-size:14px">🔔 ACTION REQUIRED</h3>
            <div style="display:flex;gap:12px;font-size:11px">
              ${staleCritical.length?`<span style="color:var(--negative)">🚨 ${staleCritical.length} Critical</span>`:''}
              ${staleWarning.length?`<span style="color:var(--warn)">⚠️ ${staleWarning.length} Warning</span>`:''}
              ${neverContacted.length?`<span style="color:var(--info)">📭 ${neverContacted.length} Never Contacted</span>`:''}
              ${(S.crmOverdue||[]).length?`<span style="color:var(--negative)">📅 ${S.crmOverdue.length} Overdue</span>`:''}
            </div>
          </div>

          <div class="grid-2" style="gap:12px">
            ${staleCritical.length?`
            <div style="background:var(--panel);border-left:4px solid var(--negative);padding:12px">
              <div style="font-weight:600;color:var(--negative);margin-bottom:8px;font-size:11px">🚨 CRITICAL: No contact 14+ days</div>
              ${staleCritical.slice(0,3).map(p=>`
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
                  <div>
                    <div style="font-weight:500;font-size:11px">${escapeHtml(p.company_name||'')}</div>
                    <div style="font-size:9px;color:var(--negative)">${p.days_since_touch} days since last touch</div>
                  </div>
                  <button class="btn btn-danger btn-sm" onclick="showTouchModal(${p.id})" style="font-size:9px;padding:4px 8px">📞 Call Now</button>
                </div>
              `).join('')}
              ${staleCritical.length>3?`<div style="font-size:10px;color:var(--muted);margin-top:8px">+${staleCritical.length-3} more...</div>`:''}
            </div>`:''}

            ${staleWarning.length?`
            <div style="background:var(--panel);border-left:4px solid var(--warn);padding:12px">
              <div style="font-weight:600;color:var(--warn);margin-bottom:8px;font-size:11px">⚠️ WARNING: No contact 7-13 days</div>
              ${staleWarning.slice(0,3).map(p=>`
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
                  <div>
                    <div style="font-weight:500;font-size:11px">${escapeHtml(p.company_name||'')}</div>
                    <div style="font-size:9px;color:var(--warn)">${p.days_since_touch} days since last touch</div>
                  </div>
                  <button class="btn btn-warn btn-sm" onclick="showTouchModal(${p.id})" style="font-size:9px;padding:4px 8px">📞 Follow Up</button>
                </div>
              `).join('')}
              ${staleWarning.length>3?`<div style="font-size:10px;color:var(--muted);margin-top:8px">+${staleWarning.length-3} more...</div>`:''}
            </div>`:''}

            ${neverContacted.length?`
            <div style="background:var(--panel);border-left:4px solid var(--info);padding:12px">
              <div style="font-weight:600;color:var(--info);margin-bottom:8px;font-size:11px">📭 NEVER CONTACTED</div>
              ${neverContacted.slice(0,3).map(p=>`
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
                  <div>
                    <div style="font-weight:500;font-size:11px">${escapeHtml(p.company_name||'')}</div>
                    <div style="font-size:9px;color:var(--info)">Added ${p.days_since_created} days ago</div>
                  </div>
                  <button class="btn btn-info btn-sm" onclick="showTouchModal(${p.id})" style="font-size:9px;padding:4px 8px">📞 First Call</button>
                </div>
              `).join('')}
              ${neverContacted.length>3?`<div style="font-size:10px;color:var(--muted);margin-top:8px">+${neverContacted.length-3} more...</div>`:''}
            </div>`:''}

            ${(S.crmOverdue||[]).length?`
            <div style="background:var(--panel);border-left:4px solid var(--negative);padding:12px">
              <div style="font-weight:600;color:var(--negative);margin-bottom:8px;font-size:11px">📅 OVERDUE FOLLOW-UPS</div>
              ${S.crmOverdue.slice(0,3).map(t=>`
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
                  <div>
                    <div style="font-weight:500;font-size:11px">${escapeHtml(t.company_name||'')}</div>
                    <div style="font-size:9px;color:var(--negative)">Due: ${escapeHtml(t.follow_up_date||'')}</div>
                  </div>
                  <button class="btn btn-danger btn-sm" onclick="showTouchModal(${t.prospect_id})" style="font-size:9px;padding:4px 8px">📞 Call</button>
                </div>
              `).join('')}
              ${S.crmOverdue.length>3?`<div style="font-size:10px;color:var(--muted);margin-top:8px">+${S.crmOverdue.length-3} more...</div>`:''}
            </div>`:''}
          </div>
        </div>
        `:''}

        <div class="card">
          <div class="card-header">
            <span class="card-title info">PROSPECT PIPELINE</span>
            <div style="display:flex;gap:8px;align-items:center">
              <div style="display:flex;gap:2px;background:var(--bg);padding:2px">
                <button class="btn btn-sm ${S.crmViewMode==='table'?'btn-info':'btn-default'}" onclick="S.crmViewMode='table';SS('crmViewMode','table');render()" style="font-size:10px">☰ Table</button>
                <button class="btn btn-sm ${S.crmViewMode==='kanban'?'btn-info':'btn-default'}" onclick="S.crmViewMode='kanban';SS('crmViewMode','kanban');render()" style="font-size:10px">▦ Board</button>
              </div>
              ${S.trader==='Admin'?`<button class="btn btn-danger btn-sm" onclick="resetAllCRMData()" title="Delete all CRM data">🗑️ Reset All</button>
              <button class="btn btn-default btn-sm" onclick="seedMockData()" title="Load test data">🧪 Mock Data</button>`:''}
              ${S.crmViewMode==='table'?`<select onchange="S.crmStatusFilter=this.value;loadCRMProspects()" style="padding:4px 8px;font-size:10px">
                <option value="all" ${statusFilter==='all'?'selected':''}>All Status</option>
                <option value="prospect" ${statusFilter==='prospect'?'selected':''}>New Prospects</option>
                <option value="qualified" ${statusFilter==='qualified'?'selected':''}>Qualified</option>
                <option value="converted" ${statusFilter==='converted'?'selected':''}>Converted</option>
                <option value="lost" ${statusFilter==='lost'?'selected':''}>Lost</option>
              </select>`:''}
              <button class="btn btn-info btn-sm" onclick="showProspectModal()">+ Add Prospect</button>
            </div>
          </div>
          ${S.crmViewMode==='kanban'?`
          <div class="card-body">
            <div class="kanban-board">
              ${['prospect','qualified','converted','lost'].map(status=>{
                const col={prospect:{label:'New Prospects',color:'var(--info)'},qualified:{label:'Qualified',color:'var(--warn)'},converted:{label:'Converted',color:'var(--positive)'},lost:{label:'Lost',color:'var(--negative)'}}[status];
                const items=(S.crmProspects||[]).filter(p=>p.status===status);
                return`<div class="kanban-column" data-status="${status}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="handleKanbanDrop(event,'${status}');this.classList.remove('drag-over')" style="border-top:3px solid ${col.color}">
                  <div class="kanban-header"><span>${col.label}</span><span class="kanban-count">${items.length}</span></div>
                  <div class="kanban-cards">
                    ${items.map(p=>`<div class="kanban-card" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${p.id}')" onclick="viewProspect(${p.id})">
                      <div class="kanban-card-title">${escapeHtml(p.company_name||'')}</div>
                      <div class="kanban-card-sub">${escapeHtml(p.contact_name||'No contact')}</div>
                      <div class="kanban-card-meta"><span>${escapeHtml(p.phone||'')}</span><span style="color:var(--muted)">${p.updated_at?new Date(p.updated_at).toLocaleDateString():''}</span></div>
                    </div>`).join('')}
                    ${!items.length?'<div class="empty-state" style="padding:20px;font-size:11px">No prospects</div>':''}
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>`:`
          <div class="table-filter-bar">
            <input type="text" placeholder="Search prospects..." oninput="S.crmSearch=this.value;render()">
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Company</th><th>Contact</th><th>Phone</th><th>Status</th><th>Last Touch</th><th>Actions</th></tr></thead>
              <tbody>
                ${prospects.length?prospects.filter(p=>!S.crmSearch||p.company_name.toLowerCase().includes((S.crmSearch||'').toLowerCase())||((p.contact_name||'')).toLowerCase().includes((S.crmSearch||'').toLowerCase())).map(p=>{
                  const statusBadge={prospect:'badge-pending',qualified:'badge-warn',converted:'badge-success',lost:'badge-danger'}[p.status]||'badge-pending';
                  return`<tr>
                    <td class="bold">${escapeHtml(p.company_name||'')}</td>
                    <td>${escapeHtml(p.contact_name||'—')}</td>
                    <td>${escapeHtml(p.phone||'—')}</td>
                    <td><span class="badge ${statusBadge}">${p.status}</span></td>
                    <td style="font-size:10px">${p.updated_at?new Date(p.updated_at).toLocaleDateString():'—'}</td>
                    <td style="white-space:nowrap">
                      <span class="row-actions">
                      <button class="btn btn-default btn-sm" onclick="showTouchModal(${p.id})">📞 Log</button>
                      <button class="btn btn-default btn-sm" onclick="viewProspect(${p.id})">View</button>
                      ${p.status!=='converted'?`<button class="btn btn-success btn-sm" onclick="convertProspect(${p.id})">→ Convert</button>`:''}
                      </span>
                    </td>
                  </tr>`;
                }).join(''):'<tr><td colspan="6" class="empty-state">No prospects yet. Click "Mock Data" to load test data or add your first prospect!</td></tr>'}
              </tbody>
            </table>
          </div>`}
        </div>

        ${(S.crmRecent||[]).length?`
        <div class="card" style="margin-top:16px">
          <div class="card-header"><span class="card-title">📋 RECENT ACTIVITY</span></div>
          <div class="card-body">
            ${S.crmRecent.slice(0,5).map(t=>`
              <div class="activity-item">
                <div>
                  <div class="activity-main">${escapeHtml(t.company_name||'')}</div>
                  <div class="activity-sub">${escapeHtml(t.touch_type||'')}: ${escapeHtml((t.notes||'').substring(0,50))}${(t.notes||'').length>50?'...':''}</div>
                </div>
                <div class="activity-right">
                  <div style="font-size:10px;color:var(--muted)">${new Date(t.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>`:''}`;
    }
    else if(crmTab==='customers'){
      // Build enriched customer data for 360 view
      const custData=customers.map(cu=>{
        const locs=cu.locations||[cu.destination].filter(Boolean)
        const trades=S.trader==='Admin'?S.sells.filter(s=>s.customer===cu.name):S.sells.filter(s=>s.customer===cu.name&&(s.trader===S.trader||!s.trader))
        const vol=trades.reduce((s,x)=>s+(x.volume||0),0)
        const cm=custMargins[cu.name]||{vol:0,marginVal:0,n:0}
        const avgMargin=cm.vol>0?cm.marginVal/cm.vol:0
        const creditLimit=cu.creditLimit||50000
        const exposure=trades.filter(t=>!t.delivered).reduce((s,x)=>s+(x.price||0)*(x.volume||0),0)
        const creditUtil=creditLimit>0?exposure/creditLimit*100:0
        return{...cu,locs,trades,vol,avgMargin,creditLimit,exposure,creditUtil,tradeCount:trades.length}
      })
      // Sort customers
      const _cs=S.crmSort||{col:'name',dir:'asc'};
      const _csI=c=>_cs.col===c?(_cs.dir==='asc'?'▲':'▼'):'';
      const _csC=c=>'onclick="toggleCrmSort(\''+c+'\')" style="cursor:pointer"';
      custData.sort((a,b)=>{
        let va,vb;
        if(_cs.col==='name'){va=a.name||'';vb=b.name||'';return _cs.dir==='asc'?va.localeCompare(vb):vb.localeCompare(va)}
        if(_cs.col==='trades'){va=a.tradeCount;vb=b.tradeCount}
        else if(_cs.col==='vol'){va=a.vol;vb=b.vol}
        else if(_cs.col==='margin'){va=a.avgMargin;vb=b.avgMargin}
        else{va=0;vb=0}
        return _cs.dir==='asc'?va-vb:vb-va;
      });
      // Selected customer for 360 detail
      const selCust=S.selectedCustomer?custData.find(c=>c.name===S.selectedCustomer):null

      contentHTML=`
        <div class="panel"><div class="panel-header"><span>${S.trader==='Admin'?'ALL CUSTOMERS':'MY CUSTOMERS'}</span><button class="btn btn-default btn-sm" onclick="showCustModal()">+ Add</button></div>
          <div class="panel-body table-wrap" style="padding:0"><table class="data-table"><thead><tr>${S.trader==='Admin'?'<th>Trader</th>':''}<th class="sortable" ${_csC('name')}>Customer ${_csI('name')}</th><th>Locations</th><th class="right sortable" ${_csC('trades')}>Trades ${_csI('trades')}</th><th class="right sortable" ${_csC('vol')}>Volume ${_csI('vol')}</th><th class="right sortable" ${_csC('margin')}>Avg Margin ${_csI('margin')}</th><th>Credit Status</th><th></th></tr></thead><tbody>
            ${custData.length?custData.map(cu=>{
              const creditColor=cu.creditUtil>90?'var(--negative)':cu.creditUtil>70?'var(--warn)':'var(--positive)'
              return`<tr style="${S.selectedCustomer===cu.name?'background:var(--panel-alt)':''}">${S.trader==='Admin'?`<td><span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${traderColor(cu.trader||'Ian P')};color:var(--bg);font-size:9px;font-weight:700;text-align:center;line-height:18px" title="${escapeHtml(cu.trader||'Ian P')}">${traderInitial(cu.trader||'Ian P')}</span></td>`:''}<td class="bold" style="cursor:pointer" onclick="S.selectedCustomer='${escapeHtml(cu.name||'')}';render()">${escapeHtml(cu.name||'')}</td><td style="font-size:10px">${cu.locs.length?escapeHtml(cu.locs.join(', ')):'--'}</td><td class="right">${cu.tradeCount}</td><td class="right">${fmtN(cu.vol)} MBF</td><td class="right ${cu.avgMargin>=0?'positive':'negative'} bold">${cu.vol>0?fmt(Math.round(cu.avgMargin)):''}</td><td><div class="limit-bar" style="width:100px;display:inline-block;vertical-align:middle"><div class="limit-fill" style="width:${Math.min(100,cu.creditUtil)}%;background:${creditColor}"></div></div> <span style="font-size:9px;color:${creditColor}">${Math.round(cu.creditUtil)}%</span></td><td style="white-space:nowrap">${typeof erOpenUnifiedByName==='function'?`<button class="btn btn-default btn-sm" onclick="erOpenUnifiedByName('${escapeHtml(cu.name||'')}','customer')" title="Unified Entity View">🔗</button> `:''}<button class="btn btn-default btn-sm" onclick="showCustomerTemplateModal('${escapeHtml(cu.name||'')}')" title="Product Template" style="${S.customerTemplates&&S.customerTemplates[cu.name]?'color:var(--positive)':''}">Tpl</button> <button class="btn btn-default btn-sm" onclick="S.selectedCustomer='${escapeHtml(cu.name||'')}';render()">360</button> <button class="btn btn-default btn-sm" onclick="editCust('${escapeHtml(cu.name||'')}')">Edit</button> <button class="btn btn-default btn-sm" onclick="deleteCust('${escapeHtml(cu.name||'')}')" style="color:var(--negative)">x</button></td></tr>`
            }).join(''):`<tr><td colspan="${S.trader==='Admin'?8:7}" class="empty-state">No customers yet</td></tr>`}
          </tbody></table></div></div>

        ${selCust?`
        <!-- 360 Customer View -->
        <div class="panel" style="margin-top:16px;border-left:3px solid var(--accent)"><div class="panel-header">${escapeHtml(selCust.name)} -- 360 View <button onclick="S.selectedCustomer=null;render()" style="background:transparent;border:none;color:var(--text);cursor:pointer;font-size:16px">x</button></div><div class="panel-body">
          <div class="grid-3" style="margin-bottom:16px">
            <div class="panel"><div class="panel-header">CONTACT INFO</div><div class="panel-body">
              <div style="font-size:11px;line-height:1.8">
                <div><strong>${escapeHtml(selCust.name)}</strong></div>
                <div style="color:var(--muted)">${selCust.locs.length?escapeHtml(selCust.locs.join(', ')):'No locations'}</div>
                ${selCust.phone?`<div>${escapeHtml(selCust.phone)}</div>`:''}
                ${selCust.email?`<div>${escapeHtml(selCust.email)}</div>`:''}
                ${selCust.contact?`<div>Contact: ${escapeHtml(selCust.contact)}</div>`:''}
              </div>
            </div></div>
            <div class="panel"><div class="panel-header">CREDIT STATUS</div><div class="panel-body">
              <div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span>Limit: ${fmt(selCust.creditLimit)}</span><span>Exposure: ${fmt(Math.round(selCust.exposure))}</span></div>
              <div class="limit-bar"><div class="limit-fill" style="width:${Math.min(100,selCust.creditUtil)}%;background:${selCust.creditUtil>90?'var(--negative)':selCust.creditUtil>70?'var(--warn)':'var(--positive)'}"></div></div>
              <div style="text-align:center;font-size:10px;margin-top:4px;color:${selCust.creditUtil>90?'var(--negative)':selCust.creditUtil>70?'var(--warn)':'var(--positive)'}">${Math.round(selCust.creditUtil)}% utilized</div></div>
            </div></div>
            <div class="panel"><div class="panel-header">TRADING SUMMARY</div><div class="panel-body">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px">
                <div>Total Trades: <strong>${selCust.tradeCount}</strong></div>
                <div>Total Volume: <strong>${fmtN(selCust.vol)} MBF</strong></div>
                <div>Avg Margin: <strong class="${selCust.avgMargin>=0?'positive':'negative'}">${fmt(Math.round(selCust.avgMargin))}/MBF</strong></div>
                <div>Total Profit: <strong class="${selCust.avgMargin*selCust.vol>=0?'positive':'negative'}">${fmt(Math.round(selCust.avgMargin*selCust.vol))}</strong></div>
              </div>
            </div></div>
          </div>
          <!-- Order History -->
          <div class="panel"><div class="panel-header">ORDER HISTORY</div><div class="panel-body table-wrap" style="padding:0;max-height:300px">
            <table class="data-table"><thead><tr><th>Date</th><th>Order #</th><th>Product</th><th class="right">Vol</th><th class="right">Price</th><th>Status</th><th class="right">Margin</th></tr></thead><tbody>
              ${selCust.trades.length?selCust.trades.sort((x,y)=>new Date(y.date)-new Date(x.date)).slice(0,20).map(t=>{
                const ord=String(t.orderNum||t.linkedPO||t.oc||'').trim()
                const buy=ord?buyByOrder[ord]:null
                const sellFrtMBF=t.volume>0?(t.freight||0)/t.volume:0
                const margin=buy?((t.price||0)-sellFrtMBF)-(buy.price||0):null
                const st=t.delivered?'delivered':t.shipped?'shipped':ord?'approved':'pending'
                return`<tr><td>${fmtD(t.date)}</td><td class="bold">${escapeHtml(ord)||'--'}</td><td>${escapeHtml(t.product)}</td><td class="right">${fmtN(t.volume)} MBF</td><td class="right">${fmt(t.price)}</td><td><span class="status-badge status-${st}">${st}</span></td><td class="right ${margin===null?'':margin>=0?'positive':'negative'} bold">${margin!==null?fmt(Math.round(margin)):''}</td></tr>`
              }).join(''):'<tr><td colspan="7" class="empty-state">No trades</td></tr>'}
            </tbody></table>
          </div></div>
          <!-- Product Mix -->
          <div class="panel" style="margin-top:12px"><div class="panel-header">PRODUCT MIX</div><div class="panel-body">
            ${(()=>{
              const prodMix={}
              selCust.trades.forEach(t=>{
                const p=t.product||'Unknown'
                if(!prodMix[p])prodMix[p]={product:p,vol:0,count:0}
                prodMix[p].vol+=t.volume||0
                prodMix[p].count++
              })
              const items=Object.values(prodMix).sort((a,b)=>b.vol-a.vol)
              const maxVol=items[0]?.vol||1
              return items.length?items.map(p=>`<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><span class="bold">${escapeHtml(p.product)}</span><span>${fmtN(p.vol)} MBF (${p.count} trades)</span></div><div class="limit-bar"><div class="limit-fill" style="width:${p.vol/maxVol*100}%"></div></div></div>`).join(''):'<div class="empty-state">No data</div>'
            })()}
          </div></div>
          <!-- Offering History -->
          <div class="panel" style="margin-top:12px"><div class="panel-header">OFFERING HISTORY <button class="btn btn-default btn-sm" style="float:right;padding:1px 8px;font-size:9px" onclick="S.quotesViewTab='offerings';S.offeringsTab='profiles';SS('offeringsTab','profiles');S.view='quotes';render()">Manage Profile</button></div><div class="panel-body" id="cust-offering-history-${selCust.id}">
            <div style="color:var(--muted);font-size:11px">Loading...</div>
          </div></div>
          ${(()=>{
            setTimeout(()=>{
              fetch('/api/offerings/history/'+selCust.id+'?limit=10').then(r=>r.json()).then(offerings=>{
                const el=document.getElementById('cust-offering-history-'+selCust.id);
                if(!el)return;
                if(!offerings.length){el.innerHTML='<div style="color:var(--muted);font-size:11px">No offerings sent yet. <a href="#" onclick="S.quotesViewTab=\'offerings\';S.offeringsTab=\'profiles\';SS(\'offeringsTab\',\'profiles\');S.view=\'quotes\';render();return false" style="color:var(--accent)">Set up a profile</a></div>';return;}
                const stats={sent:0,approved:0,total:offerings.length};
                offerings.forEach(o=>{if(o.status==='sent')stats.sent++;if(o.status==='approved')stats.approved++;});
                el.innerHTML='<div style="margin-bottom:8px;font-size:10px;color:var(--muted)">'+stats.total+' offerings total, '+stats.approved+' approved, '+stats.sent+' sent</div>'+
                  '<table style="width:100%;font-size:10px;border-collapse:collapse"><thead><tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:4px">Date</th><th style="text-align:left;padding:4px">Products</th><th style="text-align:center;padding:4px">Status</th><th style="text-align:right;padding:4px">Margin</th></tr></thead><tbody>'+
                  offerings.map(o=>{
                    const prods=(o.products||[]).filter(p=>!p.error);
                    return'<tr style="border-bottom:1px solid var(--border)"><td style="padding:4px">'+new Date(o.generated_at).toLocaleDateString()+'</td><td style="padding:4px">'+prods.map(p=>p.product).join(', ')+'</td><td style="text-align:center;padding:4px"><span class="status-badge status-'+(o.status==='approved'?'approved':'draft')+'">'+o.status+'</span></td><td style="text-align:right;padding:4px">$'+Math.round(o.total_margin||0)+'/MBF</td></tr>';
                  }).join('')+'</tbody></table>';
              }).catch(()=>{});
            },50);
            return '';
          })()}
        </div></div>
        `:''}

        <div class="panel" style="margin-top:16px"><div class="panel-header">CUSTOMER PROFITABILITY</div>
          <div class="panel-body table-wrap" style="padding:0"><table class="data-table"><thead><tr><th>Customer</th><th class="right">Trades</th><th class="right">Volume</th><th class="right">Avg Margin/MBF</th></tr></thead><tbody>
            ${Object.keys(custMargins).length?Object.entries(custMargins).filter(([cu,d])=>d.vol>0).sort((x,y)=>(y[1].marginVal/y[1].vol)-(x[1].marginVal/x[1].vol)).map(([cu,d])=>{
              const avgMargin=d.vol>0?d.marginVal/d.vol:0
              return`<tr><td class="bold">${escapeHtml(cu)}</td><td class="right">${d.n}</td><td class="right">${fmtN(d.vol)} MBF</td><td class="right ${avgMargin>=0?'positive':'negative'} bold">${fmt(Math.round(avgMargin))}</td></tr>`
            }).join(''):'<tr><td colspan="4" class="empty-state">No linked sales yet</td></tr>'}
          </tbody></table></div></div>`;
    }
    else if(crmTab==='mills'){
      const _ms=S.crmSort||{col:'name',dir:'asc'};
      const _msI=c=>_ms.col===c?(_ms.dir==='asc'?'▲':'▼'):'';
      const _msC=c=>'onclick="toggleCrmSort(\''+c+'\')" style="cursor:pointer"';
      // Enrich mills with trade data for sorting
      const enrichedMills=mills.map(m=>{
        const company=m.name;
        const trades=S.trader==='Admin'?S.buys.filter(b=>extractMillCompany(b.mill)===company):S.buys.filter(b=>extractMillCompany(b.mill)===company&&(b.trader===S.trader||!b.trader));
        const vol=trades.reduce((s,b)=>s+(b.volume||0),0);
        return{...m,_trades:trades,_vol:vol,_tradeCount:trades.length};
      });
      enrichedMills.sort((a,b)=>{
        let va,vb;
        if(_ms.col==='name'){va=a.name||'';vb=b.name||'';return _ms.dir==='asc'?va.localeCompare(vb):vb.localeCompare(va)}
        if(_ms.col==='trades'){va=a._tradeCount;vb=b._tradeCount}
        else if(_ms.col==='vol'){va=a._vol;vb=b._vol}
        else{va=0;vb=0}
        return _ms.dir==='asc'?va-vb:vb-va;
      });
      contentHTML=`
        <div class="card"><div class="card-header"><span class="card-title warn">${S.trader==='Admin'?'ALL MILLS':'MY MILLS'}</span><button class="btn btn-default btn-sm" onclick="showMillModal()">+ Add</button></div>
          <div class="table-wrap"><table><thead><tr>${S.trader==='Admin'?'<th>👤</th>':''}<th class="sortable" ${_msC('name')}>Mill ${_msI('name')}</th><th>Locations</th><th>Last Quoted</th><th class="right sortable" ${_msC('trades')}>Trades ${_msI('trades')}</th><th class="right sortable" ${_msC('vol')}>Volume ${_msI('vol')}</th><th></th></tr></thead><tbody>
            ${enrichedMills.length?enrichedMills.map(m=>{
              const rawLocs=Array.isArray(m.locations)?m.locations:[];
              const locs=rawLocs.length?rawLocs.map(l=>typeof l==='string'?l:l.label||`${l.city}, ${l.state||''}`):[m.origin||m.location].filter(Boolean);
              const lq=m.last_quoted;
              const lqAge=lq?Math.floor((new Date()-new Date(lq))/(1000*60*60*24)):null;
              const lqColor=lqAge===null?'var(--muted)':lqAge<=3?'var(--positive)':lqAge<=7?'var(--warn,var(--accent))':'var(--negative)';
              const lqLabel=lq?(lqAge===0?'Today':lqAge===1?'Yesterday':lqAge+'d ago'):'Never';
              const lqTitle=lq?`${lq} (${m.quote_count||0} quotes)`:'No quotes on file';
              return`<tr>${S.trader==='Admin'?`<td><span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${traderColor(m.trader||'Ian P')};color:var(--bg);font-size:9px;font-weight:700;text-align:center;line-height:18px" title="${escapeHtml(m.trader||'Ian P')}">${traderInitial(m.trader||'Ian P')}</span></td>`:''}<td class="bold">${escapeHtml(m.name||'')}</td><td style="font-size:10px">${locs.length?escapeHtml(locs.join(', ')):'—'}</td><td style="font-size:10px;color:${lqColor}" title="${escapeHtml(lqTitle)}">${lqLabel}</td><td class="right">${m._tradeCount}</td><td class="right">${fmtN(m._vol)} MBF</td><td style="white-space:nowrap">${typeof erOpenUnifiedByName==='function'?`<button class="btn btn-default btn-sm" onclick="erOpenUnifiedByName('${escapeHtml(m.name||'')}','mill')" title="Unified Entity View">🔗</button> `:''}<button class="btn btn-default btn-sm" onclick="editMill('${escapeHtml(m.name||'')}')">Edit</button> <button class="btn btn-default btn-sm" onclick="deleteMill('${escapeHtml(m.name||'')}')" style="color:var(--negative)">×</button></td></tr>`;
            }).join(''):`<tr><td colspan="${S.trader==='Admin'?7:6}" class="empty-state">No mills yet</td></tr>`}
          </tbody></table></div></div>`;
    }

    c.innerHTML=`
      <div style="margin-bottom:12px;padding:8px 12px;background:var(--panel);border-left:3px solid ${traderColor(S.trader)};font-size:12px">
        <strong>${S.trader==='Admin'?'🔑 All Traders':S.trader+"'s CRM"}</strong>
      </div>
      ${tabsHTML}
      ${contentHTML}`;
    // Add CRM FAB for quick touch logging
    if(crmTab==='prospects'){
      const fab=document.createElement('button');
      fab.className='crm-fab';
      fab.title='Quick log a touch';
      fab.textContent='+';
      fab.onclick=()=>showQuickTouchModal();
      c.appendChild(fab);
    }
  }
  else if(S.view==='millintel'&&(!S.miTab||S.miTab==='intake')){
    const _miTabBar=_subTabBar('miTab',[{id:'intake',label:'Intake'},{id:'prices',label:'Prices'}],S.miTab||'intake');
    renderMiIntake();
    const _mc=document.getElementById('content');
    if(_mc)_mc.innerHTML=_miTabBar+_mc.innerHTML;
  }
  else if(S.view==='millintel'&&S.miTab==='prices'){
    const _miTabBar=_subTabBar('miTab',[{id:'intake',label:'Intake'},{id:'prices',label:'Prices'}],'prices');
    renderMiAggregated();
    const _mc=document.getElementById('content');
    if(_mc)_mc.insertAdjacentHTML('afterbegin',_miTabBar);
  }
  // P&L tab removed — TC import doesn't include volume/freight data
  else if(S.view==='intelligence'){
    const _iTabBar=_subTabBar('intelligenceTab',[{id:'regime',label:'Regime'},{id:'signals',label:'Spread Signals'},{id:'millmoves',label:'Mill Moves'}],S.intelligenceTab||'regime');
    const _iTab=S.intelligenceTab||'regime';
    const intelRegion=S.intelRegion||'west';

    if(_iTab==='regime'){
      // Regime Detection Tab
      const regimeKey=`regime_${intelRegion}`;
      const regimeData=window._intelCache?.[regimeKey];

      if(regimeData){
        const r=regimeData;
        const regimeColors={Rally:'#22c55e',Topping:'#eab308',Decline:'#ef4444',Bottoming:'#3b82f6',Choppy:'#6b7280',Unknown:'#9ca3af'};
        const regimeBg={Rally:'rgba(34,197,94,0.1)',Topping:'rgba(234,179,8,0.1)',Decline:'rgba(239,68,68,0.1)',Bottoming:'rgba(59,130,246,0.1)',Choppy:'rgba(107,114,128,0.1)',Unknown:'rgba(156,163,175,0.1)'};
        const rc=regimeColors[r.regime]||'#6b7280';
        const rb=regimeBg[r.regime]||'rgba(107,114,128,0.1)';

        const rocArrow=v=>v>0?`<span style="color:#22c55e">▲ +${v}%</span>`:`<span style="color:#ef4444">▼ ${v}%</span>`;
        const chgFmt=v=>v>0?`<span class="positive bold">+$${Math.abs(v)}</span>`:`<span class="negative bold">-$${Math.abs(v)}</span>`;

        // Mini sparkline from priceHistory
        let sparkSVG='';
        if(r.priceHistory&&r.priceHistory.length>1){
          const ph=r.priceHistory;
          const minP=Math.min(...ph.map(p=>p.price));
          const maxP=Math.max(...ph.map(p=>p.price));
          const range=maxP-minP||1;
          const w=280,h=60;
          const pts=ph.map((p,i)=>`${(i/(ph.length-1))*w},${h-((p.price-minP)/range)*h}`).join(' ');
          sparkSVG=`<svg width="${w}" height="${h}" style="margin-top:8px"><polyline points="${pts}" fill="none" stroke="${rc}" stroke-width="2"/><circle cx="${w}" cy="${h-((ph[ph.length-1].price-minP)/range)*h}" r="3" fill="${rc}"/></svg>`;
        }

        const regionBtns=['west','central','east'].map(rg=>
          `<button class="btn ${intelRegion===rg?'btn-primary':'btn-default'} btn-sm" onclick="S.intelRegion='${rg}';SS('intelRegion','${rg}');if(window._intelCache)delete window._intelCache['regime_${rg}'];render()">${rg.charAt(0).toUpperCase()+rg.slice(1)}</button>`
        ).join('');

        c.innerHTML=_iTabBar+`
          <div style="display:flex;gap:6px;margin-bottom:16px">${regionBtns}</div>
          <div class="card" style="margin-bottom:16px;border-left:4px solid ${rc}">
            <div class="card-header"><span class="card-title">MARKET REGIME</span><span style="color:var(--muted);font-size:11px">${r.product} · ${r.region} · ${r.currentDate||''}</span></div>
            <div style="padding:16px">
              <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
                <span style="background:${rb};color:${rc};font-weight:700;font-size:24px;padding:8px 20px;border-radius:8px;border:2px solid ${rc}">${r.regime}</span>
                <div>
                  <div style="font-size:12px;color:var(--muted)">Confidence</div>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div style="width:120px;height:8px;background:var(--border);border-radius:4px;overflow:hidden"><div style="width:${r.confidence}%;height:100%;background:${rc};border-radius:4px"></div></div>
                    <span style="font-weight:600">${r.confidence}%</span>
                  </div>
                </div>
                <div style="margin-left:auto;text-align:right">
                  <div style="font-size:24px;font-weight:700">$${r.currentPrice}</div>
                  <div style="font-size:11px;color:var(--muted)">${r.product} ${r.region}</div>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
                <div class="card" style="padding:12px;text-align:center"><div style="font-size:11px;color:var(--muted)">2-Week</div><div style="font-size:16px;font-weight:600">${rocArrow(r.roc['2wk'])}</div><div style="font-size:13px">${chgFmt(r.changes['2wk'])}/MBF</div></div>
                <div class="card" style="padding:12px;text-align:center"><div style="font-size:11px;color:var(--muted)">4-Week</div><div style="font-size:16px;font-weight:600">${rocArrow(r.roc['4wk'])}</div><div style="font-size:13px">${chgFmt(r.changes['4wk'])}/MBF</div></div>
                <div class="card" style="padding:12px;text-align:center"><div style="font-size:11px;color:var(--muted)">8-Week</div><div style="font-size:16px;font-weight:600">${rocArrow(r.roc['8wk'])}</div><div style="font-size:13px">${chgFmt(r.changes['8wk'])}/MBF</div></div>
              </div>
              ${sparkSVG?`<div style="margin-bottom:16px">${sparkSVG}<div style="font-size:10px;color:var(--muted)">Last 20 data points</div></div>`:''}
              <div style="background:${rb};padding:12px;border-radius:6px;margin-bottom:8px"><strong>Context:</strong> ${r.context}</div>
              <div style="background:var(--bg);padding:12px;border-radius:6px;border:1px solid var(--border)"><strong>Trading Bias:</strong> ${r.tradingBias}</div>
            </div>
          </div>`;
      } else {
        // Fetch regime data
        if(!window._intelCache)window._intelCache={};
        c.innerHTML=_iTabBar+`<div style="display:flex;gap:6px;margin-bottom:16px">${['west','central','east'].map(rg=>`<button class="btn ${intelRegion===rg?'btn-primary':'btn-default'} btn-sm" onclick="S.intelRegion='${rg}';SS('intelRegion','${rg}');render()">${rg.charAt(0).toUpperCase()+rg.slice(1)}</button>`).join('')}</div><div class="card"><div style="padding:40px;text-align:center;color:var(--muted)">Loading regime data...</div></div>`;
        fetch(`/api/intelligence/regime?region=${intelRegion}&product=2x4%232`)
          .then(r=>r.json()).then(data=>{
            if(!window._intelCache)window._intelCache={};
            window._intelCache[`regime_${intelRegion}`]=data;
            render();
          }).catch(e=>console.error('Regime fetch error:',e));
      }
    }
    else if(_iTab==='signals'){
      // Spread Signals Tab
      const sigKey=`signals_${intelRegion}`;
      const sigData=window._intelCache?.[sigKey];

      if(sigData){
        const regionBtns=['west','central','east'].map(rg=>
          `<button class="btn ${intelRegion===rg?'btn-primary':'btn-default'} btn-sm" onclick="S.intelRegion='${rg}';SS('intelRegion','${rg}');if(window._intelCache)delete window._intelCache['signals_${rg}'];render()">${rg.charAt(0).toUpperCase()+rg.slice(1)}</button>`
        ).join('');

        // Merge backend signals with frontend cross-zone signals
        const backendSigs=sigData.signals||[];
        let zoneSigs=[];
        try{
          zoneSigs=(typeof generateSpreadSignals==='function'?generateSpreadSignals():[]).map(z=>{
            const regAL=z.region.charAt(0).toUpperCase()+z.region.slice(1);
            const regBL=z.regionB.charAt(0).toUpperCase()+z.regionB.slice(1);
            return{
              spread:`${z.product} ${regAL}→${regBL}`,
              category:'zone',
              current:z.spread,
              avg:z.avg,
              wavg:z.avg,
              percentile:z.percentile,
              reversionProb:z.revertProb,
              context:z.reason,
              actionable:z.direction==='buy'?`Spread unusually ${z.spread<z.avg?'narrow':'wide'} — ${regAL} may be undervalued vs ${regBL}`:`Spread unusually ${z.spread>z.avg?'wide':'narrow'} — consider ${regAL} sell / ${regBL} buy`,
              zScore:z.zScore,
              strength:z.strength
            };
          });
        }catch(e){console.warn('Zone signal gen error:',e)}
        const allSigs=[...backendSigs,...zoneSigs];
        const totalCount=allSigs.length;

        // Render signal card helper
        const renderSigCard=s=>{
          const isOpp=s.reversionProb&&s.reversionProb>=60;
          const isZone=s.category==='zone';
          const border=isOpp?'border-left:4px solid #22c55e':isZone?'border-left:4px solid #8b5cf6':'border-left:4px solid var(--border)';
          const catBg=isZone?(isOpp?'rgba(34,197,94,0.1)':'rgba(139,92,246,0.1)'):(isOpp?'rgba(34,197,94,0.1)':'var(--bg)');
          const catColor=isZone?(isOpp?'#22c55e':'#8b5cf6'):(isOpp?'#22c55e':'var(--muted)');
          const pctBar=`<div style="width:100%;height:6px;background:var(--border);border-radius:3px;margin:4px 0"><div style="width:${s.percentile}%;height:100%;background:${s.percentile<=10?'#3b82f6':s.percentile>=90?'#ef4444':'#6b7280'};border-radius:3px"></div></div>`;
          return `<div class="card" style="${border};margin-bottom:12px">
            <div style="padding:14px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <span style="font-weight:700;font-size:14px">${s.spread}</span>
                <div style="display:flex;gap:6px;align-items:center">
                  ${s.zScore!=null?`<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--bg);color:var(--muted)">z: ${s.zScore}</span>`:''}
                  <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${catBg};color:${catColor}">${s.category}</span>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px;font-size:12px">
                <div><span style="color:var(--muted)">Current</span><br><strong>${s.current>=0?'+':''}$${s.current}</strong></div>
                <div><span style="color:var(--muted)">Avg</span><br>$${s.avg}</div>
                <div><span style="color:var(--muted)">${isZone?'Z-Score':'WAvg'}</span><br>${isZone?(s.zScore!=null?s.zScore:'—'):'$'+s.wavg}</div>
                <div><span style="color:var(--muted)">Percentile</span><br><strong>${s.percentile}th</strong></div>
              </div>
              ${pctBar}
              ${s.reversionProb!=null?`<div style="font-size:13px;margin:8px 0"><strong>Reversion Probability:</strong> <span style="color:${s.reversionProb>=60?'#22c55e':'var(--muted)'}; font-weight:700">${s.reversionProb}%</span> <span style="color:var(--muted);font-size:11px">(within 4 weeks)</span></div>`:''}
              <div style="font-size:12px;color:var(--muted);margin-top:6px">${s.context}</div>
              <div style="font-size:12px;margin-top:4px;color:var(--text)">${s.actionable}</div>
            </div>
          </div>`;
        };

        let sigHTML='';
        if(allSigs.length){
          // Separate backend (dimension/length/grade) from zone signals
          const nonZone=allSigs.filter(s=>s.category!=='zone');
          const zones=allSigs.filter(s=>s.category==='zone');
          if(nonZone.length){
            sigHTML+=nonZone.map(renderSigCard).join('');
          }
          if(zones.length){
            sigHTML+=`<div style="margin:20px 0 12px;padding:8px 12px;background:rgba(139,92,246,0.08);border-radius:6px;display:flex;align-items:center;gap:8px">
              <span style="font-size:13px;font-weight:700;color:#8b5cf6">CROSS-ZONE ARBITRAGE</span>
              <span style="font-size:11px;color:var(--muted)">${zones.length} signal${zones.length!==1?'s':''} · Same product across regions</span>
            </div>`;
            sigHTML+=zones.map(renderSigCard).join('');
          }
        } else {
          sigHTML='<div class="card"><div style="padding:40px;text-align:center;color:var(--muted)">No extreme spread signals currently.<br><span style="font-size:12px">Signals appear when spreads hit ≤10th or ≥90th percentile.</span></div></div>';
        }

        c.innerHTML=_iTabBar+`
          <div style="display:flex;gap:6px;margin-bottom:16px">${regionBtns}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div style="font-size:12px;color:var(--muted)">${totalCount} signal${totalCount!==1?'s':''} · Regime: <strong>${sigData.regime||'Unknown'}</strong> · As of ${sigData.asOf||''}</div>
          </div>
          ${sigHTML}`;
      } else {
        if(!window._intelCache)window._intelCache={};
        c.innerHTML=_iTabBar+`<div style="display:flex;gap:6px;margin-bottom:16px">${['west','central','east'].map(rg=>`<button class="btn ${intelRegion===rg?'btn-primary':'btn-default'} btn-sm" onclick="S.intelRegion='${rg}';SS('intelRegion','${rg}');render()">${rg.charAt(0).toUpperCase()+rg.slice(1)}</button>`).join('')}</div><div class="card"><div style="padding:40px;text-align:center;color:var(--muted)">Loading spread signals...</div></div>`;
        fetch(`/api/intelligence/spread-signals?region=${intelRegion}&type=all`)
          .then(r=>r.json()).then(data=>{
            if(!window._intelCache)window._intelCache={};
            window._intelCache[`signals_${intelRegion}`]=data;
            render();
          }).catch(e=>console.error('Signals fetch error:',e));
      }
    }
    else if(_iTab==='millmoves'){
      // Mill Moves Tab
      const mmKey='millmoves';
      const mmData=window._intelCache?.[mmKey];

      if(mmData){
        let tableHTML='';
        if(mmData.changes&&mmData.changes.length){
          tableHTML=`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Mill</th><th>Product</th><th class="right">Old</th><th class="right">New</th><th class="right">Change</th><th class="right">%</th></tr></thead><tbody>
            ${mmData.changes.map(c=>{
              const chg=c.change||0;
              const cls=chg<0?'positive':chg>0?'negative':'';
              return `<tr><td>${c.date}</td><td class="bold">${c.mill_name}</td><td>${c.product}</td><td class="right">$${c.old_price||'—'}</td><td class="right">$${c.new_price}</td><td class="right ${cls} bold">${chg>0?'+':''}$${chg}</td><td class="right ${cls}">${c.pct_change!=null?(chg>0?'+':'')+c.pct_change+'%':'—'}</td></tr>`;
            }).join('')}
          </tbody></table></div>`;
        } else {
          tableHTML='<div style="padding:40px;text-align:center;color:var(--muted)">No mill price changes recorded yet.<br><span style="font-size:12px">Changes are tracked automatically when mill quotes are submitted with different prices.</span></div>';
        }

        const sum=mmData.summary||{};
        c.innerHTML=_iTabBar+`
          <div class="card" style="margin-bottom:16px">
            <div class="card-header"><span class="card-title">MILL PRICE CHANGES</span><span style="color:var(--muted);font-size:11px">Last ${mmData.days||30} days</span></div>
            <div style="display:flex;gap:16px;padding:12px 16px;border-bottom:1px solid var(--border);font-size:13px">
              <span><strong>${sum.total||0}</strong> changes</span>
              <span style="color:#22c55e">▼ ${sum.down||0} decreases</span>
              <span style="color:#ef4444">▲ ${sum.up||0} increases</span>
              <span>Avg: <strong>${(sum.avgChange||0)>0?'+':''}$${sum.avgChange||0}</strong></span>
            </div>
            ${sum.mostActive&&sum.mostActive.length?`<div style="padding:8px 16px;font-size:11px;color:var(--muted)">Most active: ${sum.mostActive.map(m=>`<strong>${m.mill}</strong> (${m.count})`).join(', ')}</div>`:''}
            ${tableHTML}
          </div>`;
      } else {
        if(!window._intelCache)window._intelCache={};
        c.innerHTML=_iTabBar+`<div class="card"><div style="padding:40px;text-align:center;color:var(--muted)">Loading mill moves...</div></div>`;
        fetch('/api/intelligence/mill-moves?days=30')
          .then(r=>r.json()).then(data=>{
            if(!window._intelCache)window._intelCache={};
            window._intelCache[mmKey]=data;
            render();
          }).catch(e=>console.error('Mill moves fetch error:',e));
      }
    }
  }
  else if(S.view==='poanalysis'){
    renderPOAnalysis();
    setTimeout(renderPOCharts,10);
  }
  else if(S.view==='settings'){
    const sbUrl=LS('supabaseUrl','')||(typeof DEFAULT_SUPABASE_URL!=='undefined'?DEFAULT_SUPABASE_URL:'');
    const sbKey=LS('supabaseKey','')||(typeof DEFAULT_SUPABASE_KEY!=='undefined'?DEFAULT_SUPABASE_KEY:'');
    const sbUser=LS('supabaseUserId','')||'default';
    const isConnected=sbUrl&&sbKey;
    
    c.innerHTML=`
      <div class="card"><div class="card-header"><span class="card-title">AI SETTINGS</span></div><div class="card-body">
        <div class="form-group" style="margin-bottom:16px">
          <label class="form-label">Claude API Key</label>
          <input type="password" id="api-key" value="${S.apiKey}" placeholder="sk-ant-..." style="width:100%;max-width:500px">
          <div style="color:var(--muted);font-size:10px;margin-top:4px">Get your key at console.anthropic.com • Required for AI features</div>
        </div>
        <button class="btn btn-primary" onclick="saveKey()">Save API Key</button>
        <div class="form-group" style="margin-top:16px">
          <label class="form-label">AI Chat Model</label>
          <select id="ai-model" onchange="S.aiModel=this.value;save('aiModel',S.aiModel)" style="width:100%;max-width:500px;padding:8px">
            <option value="claude-opus-4-20250514"${S.aiModel==='claude-opus-4-20250514'?' selected':''}>Claude Opus 4 (Best reasoning, higher cost)</option>
            <option value="claude-sonnet-4-20250514"${S.aiModel==='claude-sonnet-4-20250514'?' selected':''}>Claude Sonnet 4 (Fast, lower cost)</option>
          </select>
          <div style="color:var(--muted);font-size:10px;margin-top:4px">Opus is used for chat; Sonnet is always used for order parsing & quote pricing</div>
        </div>
      </div></div>
      
      <div class="card"><div class="card-header"><span class="card-title warn">🔒 YOUR PROFILE: ${S.trader}</span></div><div class="card-body">
        <div style="margin-bottom:16px;padding:12px;background:rgba(0,200,150,0.1);border:1px solid ${traderColor(S.trader)}">
          <span style="color:${traderColor(S.trader)};font-weight:600">Logged in as ${S.trader}</span>
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label class="form-label">Change Your Password</label>
          <input type="password" id="new-app-password" placeholder="New password" style="width:200px">
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-warn" onclick="setAppPassword(document.getElementById('new-app-password').value)">Update Password</button>
          <button class="btn btn-danger" onclick="doLogout()">🚪 Logout</button>
        </div>
      </div></div>
      
      <div class="card"><div class="card-header"><span class="card-title info">☁️ CLOUD SYNC</span></div><div class="card-body">
        <div style="margin-bottom:16px;padding:12px;background:rgba(74,158,110,0.1);border:1px solid var(--positive)">
          <span style="color:var(--positive)">✓ Cloud sync pre-configured</span>
          <span style="color:var(--muted);margin-left:12px">Team ID: ${sbUser}</span>
        </div>
        
        <div class="form-group" style="margin-bottom:16px">
          <label class="form-label">Team ID</label>
          <input type="text" id="sb-user" value="${sbUser}" placeholder="buckeye_dept" style="width:200px">
          <div style="color:var(--muted);font-size:10px;margin-top:4px">Same ID for all traders to share department data</div>
        </div>
        
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
          <button class="btn btn-primary" onclick="saveUserIdOnly()">Save Team ID</button>
          <button class="btn btn-success" onclick="doCloudSync('push')">⬆️ Push to Cloud</button>
          <button class="btn btn-warn" onclick="doCloudSync('pull')">⬇️ Pull from Cloud</button>
        </div>
        <div style="margin-top:12px">
          <label><input type="checkbox" id="auto-sync" ${S.autoSync?'checked':''} onchange="toggleAutoSync()"> Auto-sync on changes</label>
        </div>
        <div id="sync-status" style="margin-top:12px;font-size:11px;color:var(--muted)"></div>
      </div></div>
      
      <div class="card"><div class="card-header"><span class="card-title warn">FREIGHT SETTINGS</span></div><div class="card-body">
        <div class="form-group" style="margin-bottom:16px">
          <label class="form-label">Flat Rate ($/mile)</label>
          <input type="number" id="flat-rate" value="${S.flatRate||3.50}" step="0.01" style="width:150px">
          <div style="color:var(--muted);font-size:10px;margin-top:4px">Used to auto-calculate freight from mileage</div>
        </div>
        <button class="btn btn-warn" onclick="saveFlatRate()">Save Flat Rate</button>
      </div></div>

      <div class="card"><div class="card-header"><span class="card-title accent">📦 UNITS & MBF SETTINGS</span></div><div class="card-body">
        <div style="margin-bottom:16px;padding:12px;background:rgba(110,158,207,0.1);border:1px solid var(--info)">
          <div style="font-weight:600;color:var(--info);margin-bottom:8px">Pieces Per Unit (PPU)</div>
          <div style="font-size:11px;color:var(--muted)">Configure how many pieces are in each "unit" (bunk/package) for auto-calculating MBF from units.</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;margin-bottom:16px">
          ${Object.entries(S.ppu||{}).map(([dim,ppu])=>`
            <div class="form-group" style="margin:0">
              <label class="form-label" style="font-size:10px;color:var(--muted)">${dim}</label>
              <input type="number" class="ppu-input" data-dim="${dim}" value="${ppu}" style="width:100%">
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
          <button class="btn btn-primary" onclick="savePPUSettings()">Save PPU Settings</button>
          <button class="btn btn-default" onclick="resetPPUDefaults()">Reset to Defaults</button>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:16px">
          <div class="form-group" style="margin-bottom:12px">
            <label class="form-label">Add New Dimension</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="text" id="new-ppu-dim" placeholder="e.g. 2x14" style="width:100px">
              <input type="number" id="new-ppu-val" placeholder="PPU" style="width:80px">
              <button class="btn btn-success btn-sm" onclick="addPPUDimension()">+ Add</button>
            </div>
          </div>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:16px">
          <label><input type="checkbox" id="units-mode" ${S.unitsMode?'checked':''} onchange="S.unitsMode=this.checked;save('unitsMode',S.unitsMode)"> Use Units as primary input (auto-calc MBF)</label>
          <div style="color:var(--muted);font-size:10px;margin-top:4px">When enabled, entering units will auto-calculate MBF volume</div>
        </div>
      </div></div>

      <div class="card"><div class="card-header"><span class="card-title">DATA MANAGEMENT</span></div><div class="card-body">
        <div style="margin-bottom:12px;font-size:11px;color:var(--muted)">
          Storage: IndexedDB (primary, ~50MB+) + localStorage (backup)
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
          <button class="btn btn-default" onclick="expAll()">📤 Export All (JSON)</button>
          <button class="btn btn-default" onclick="document.getElementById('imp-file').click()">📥 Import (JSON)</button>
          <input type="file" id="imp-file" accept=".json" style="display:none" onchange="impData(event)">
        </div>
        <div style="border-top:1px solid var(--border);padding-top:16px">
          <button class="btn btn-danger" onclick="if(confirm('⚠ This will permanently delete ALL trading data, customers, mills, and settings. This cannot be undone.\\n\\nAre you sure?'))clearAll()">🗑️ Clear All Data</button>
        </div>
      </div></div>

      <div class="card"><div class="card-header"><span class="card-title">🔄 TRADE CENTRAL SYNC</span></div><div class="card-body">
        <div style="font-size:12px;color:var(--muted);margin-bottom:12px">Import orders from Trade Central (FCTG) — eliminates double entry. Deduplicates by order number.</div>
        <div id="tc-sync-settings"><div class="spinner" style="margin:12px auto"></div></div>
      </div></div>

      <div class="card"><div class="card-header"><span class="card-title">🔗 ENTITY RESOLUTION</span></div><div class="card-body">
        <div style="font-size:12px;color:var(--muted);margin-bottom:12px">Unified identity system — links mills and customers across CRM, Mill Intel, and trading data via fuzzy name matching.</div>
        <div id="er-settings"><div class="spinner" style="margin:12px auto"></div></div>
      </div></div>

      <div class="card"><div class="card-header"><span class="card-title">KEYBOARD SHORTCUTS</span></div><div class="card-body">
        <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font-size:11px">
          <kbd style="background:var(--bg);padding:4px 8px;font-family:var(--mono)">Ctrl+K</kbd><span>Universal Search</span>
          <kbd style="background:var(--bg);padding:4px 8px;font-family:var(--mono)">Esc</kbd><span>Close modals/panels</span>
          <kbd style="background:var(--bg);padding:4px 8px;font-family:var(--mono)">Double-click</kbd><span>Inline edit table cells</span>
        </div>
      </div></div>`;
  }
  
  // Render entity resolution settings if on settings page
  if(S.view==='settings'&&typeof renderEntityResolutionSettings==='function')setTimeout(renderEntityResolutionSettings,10);
  if(S.view==='settings'&&typeof renderTCSyncSettings==='function')setTimeout(renderTCSyncSettings,10);

  // Draw charts after DOM update
  if(S.view==='analytics'&&S.analyticsTab==='charts')setTimeout(drawCharts,10);
  if(S.view==='dashboard'&&(!S.dashTab||S.dashTab==='overview')){
    setTimeout(renderDashboardCharts,10);
    // Draw KPI sparklines
    setTimeout(()=>{
      const a=analytics();
      const wp=calcWeeklyPerformance(S.buys,S.sells);
      drawSparkline('spark-bvol',wp.map(w=>w.buyVol),'#5b8af5');
      drawSparkline('spark-svol',wp.map(w=>w.sellVol),'#e8734a');
      drawSparkline('spark-mvol',wp.map(w=>Math.min(w.buyVol,w.sellVol)),'#4a9e6e');
      drawSparkline('spark-inv',wp.map(w=>w.buyVol-w.sellVol),'#6e9ecf');
      drawSparkline('spark-margin',wp.map(w=>w.sellVol>0?w.profit/w.sellVol:0),'#4a9e6e');
      drawSparkline('spark-profit',wp.map(w=>w.profit),'#5b8af5');
    },20);
  }

  // Render AI side panel
  if(S.aiPanelOpen)renderAIPanel();
}

// Inline cell editing for blotter
function editCell(td,field,ref){
  if(td.querySelector('input'))return
  const origText=td.textContent.trim().replace(/[,$MBF]/g,'')
  const origVal=parseFloat(origText)||0
  const input=document.createElement('input')
  input.type='number'
  input.value=origVal
  input.style.cssText='width:70px;padding:2px 4px;font-size:11px;text-align:right;background:var(--bg);border:1px solid var(--accent);color:var(--text)'
  input.onblur=()=>{
    const newVal=parseFloat(input.value)||0
    if(newVal!==origVal){
      const [type,idStr]=ref.split('-')
      const id=parseInt(idStr)
      const arr=type==='buy'?S.buys:S.sells
      const item=arr.find(x=>x.id===id)
      if(item){
        item[field]=newVal
        if(typeof save==='function')save()
        render()
        showToast(`Updated ${field} to ${newVal}`,'info')
      }
    }else{
      render()
    }
  }
  input.onkeydown=e=>{
    if(e.key==='Enter')input.blur()
    if(e.key==='Escape'){input.value=origVal;input.blur()}
  }
  td.textContent=''
  td.appendChild(input)
  input.focus()
  input.select()
}

// Sort blotter columns (alias for toggleSort if not defined)
function sortBlotter(field){
  if(typeof toggleSort==='function')toggleSort(field)
}

// ==================== AUTO-OFFERINGS ====================

window._offeringsCache={pending:null,history:null,profiles:null};

function renderOfferingsView(){
  const tab=S.offeringsTab||'pending';
  const tabBar=`<div style="display:flex;gap:4px;margin-bottom:12px">
    <button class="btn ${tab==='pending'?'btn-info':'btn-default'} btn-sm" onclick="S.offeringsTab='pending';SS('offeringsTab','pending');render()">Pending Drafts</button>
    <button class="btn ${tab==='profiles'?'btn-info':'btn-default'} btn-sm" onclick="S.offeringsTab='profiles';SS('offeringsTab','profiles');render()">Profiles</button>
    <button class="btn ${tab==='history'?'btn-info':'btn-default'} btn-sm" onclick="S.offeringsTab='history';SS('offeringsTab','history');render()">History</button>
    <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="offeringsGenerate()">&#x26A1; Generate Now</button>
  </div>`;

  if(tab==='pending') return tabBar+'<div id="offerings-pending">Loading...</div>'+_offeringsLoadPending();
  if(tab==='profiles') return tabBar+'<div id="offerings-profiles">Loading...</div>'+_offeringsLoadProfiles();
  if(tab==='history') return tabBar+'<div id="offerings-history">Loading...</div>'+_offeringsLoadHistory();
  return tabBar;
}

function _offeringsLoadPending(){
  setTimeout(()=>{
    const trader=S.trader?'&trader='+encodeURIComponent(S.trader):'';
    fetch('/api/offerings?status=draft'+trader).then(r=>r.json()).then(offerings=>{
      const el=document.getElementById('offerings-pending');
      if(!el)return;
      if(!offerings.length){el.innerHTML='<div style="padding:40px;text-align:center;color:var(--muted)">No pending offerings. Click <b>Generate Now</b> or set up profiles.</div>';return;}
      el.innerHTML=offerings.map(o=>{
        const prods=o.products||[];
        const validProds=prods.filter(p=>!p.error);
        const expanded=window._offeringExpanded===o.id;
        return`<div class="card" style="margin-bottom:8px">
          <div class="card-header" style="cursor:pointer" onclick="window._offeringExpanded=${expanded?'null':o.id};render()">
            <span class="card-title">${escapeHtml(o.customer_name)}</span>
            <span style="font-size:10px;color:var(--muted)">${o.destination} &bull; ${validProds.length} products &bull; $${Math.round(o.total_margin||0)}/MBF avg margin &bull; ${new Date(o.generated_at).toLocaleDateString()}</span>
          </div>
          ${expanded?`<div style="padding:12px">
            <table style="width:100%;font-size:11px;border-collapse:collapse">
              <thead><tr style="border-bottom:2px solid var(--border)">
                <th style="text-align:left;padding:4px">Product</th>
                <th style="text-align:left;padding:4px">Mill</th>
                <th style="text-align:right;padding:4px">FOB</th>
                <th style="text-align:right;padding:4px">Freight</th>
                <th style="text-align:right;padding:4px">Landed</th>
                <th style="text-align:right;padding:4px">Margin</th>
                <th style="text-align:right;padding:4px">Price</th>
                <th style="text-align:left;padding:4px">Note</th>
              </tr></thead>
              <tbody>${prods.map((p,i)=>p.error?
                `<tr><td style="padding:4px">${escapeHtml(p.product)}</td><td colspan="6" style="padding:4px;color:var(--negative)">${escapeHtml(p.error)}</td><td></td></tr>`:
                `<tr style="border-bottom:1px solid var(--border)">
                  <td style="padding:4px;font-weight:600">${escapeHtml(p.product)}</td>
                  <td style="padding:4px">${escapeHtml(p.mill)}</td>
                  <td style="text-align:right;padding:4px">$${p.fob}</td>
                  <td style="text-align:right;padding:4px">$${p.freight}</td>
                  <td style="text-align:right;padding:4px;font-weight:600">$${p.landed}</td>
                  <td style="text-align:right;padding:4px;color:var(--accent)">$${Math.round(p.margin)}</td>
                  <td style="text-align:right;padding:4px"><input type="number" value="${Math.round(p.price)}" style="width:65px;padding:2px 4px;text-align:right;font-size:11px;font-weight:700;border:1px solid var(--border);background:var(--bg);color:var(--text)" onchange="offeringsEditPrice(${o.id},${i},+this.value)"></td>
                  <td style="padding:4px;font-size:9px;color:var(--muted)">${escapeHtml(p.seasonalNote||'')}</td>
                </tr>`).join('')}</tbody>
            </table>
            <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
              <button class="btn btn-success btn-sm" onclick="offeringsApproveAndCopy(${o.id})">&#x2714; Approve & Copy</button>
              <button class="btn btn-default btn-sm" onclick="offeringsSkip(${o.id})">Skip</button>
              <input type="text" id="offering-notes-${o.id}" placeholder="Add notes..." value="${escapeHtml(o.edit_notes||'')}" style="flex:1;padding:4px 8px;font-size:11px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
            </div>
          </div>`:''}
        </div>`;
      }).join('');
    }).catch(e=>{
      const el=document.getElementById('offerings-pending');
      if(el)el.innerHTML='<div style="color:var(--negative);padding:12px">Error loading offerings: '+escapeHtml(String(e))+'</div>';
    });
  },0);
  return '';
}

function _offeringsLoadProfiles(){
  setTimeout(()=>{
    const trader=S.trader?'?trader='+encodeURIComponent(S.trader):'';
    fetch('/api/offerings/profiles'+trader).then(r=>r.json()).then(profiles=>{
      const el=document.getElementById('offerings-profiles');
      if(!el)return;
      const customers=myCustomers().filter(c=>c.type!=='mill');
      let html=`<div style="margin-bottom:12px">
        <button class="btn btn-primary btn-sm" onclick="offeringsShowNewProfile()">+ New Profile</button>
      </div>
      <div id="offerings-new-profile-form" style="display:none;margin-bottom:16px"></div>`;

      if(!profiles.length){
        html+='<div style="padding:30px;text-align:center;color:var(--muted)">No offering profiles configured. Create one to start auto-generating offerings.</div>';
      } else {
        html+=`<table style="width:100%;font-size:11px;border-collapse:collapse">
          <thead><tr style="border-bottom:2px solid var(--border)">
            <th style="text-align:left;padding:6px">Customer</th>
            <th style="text-align:left;padding:6px">Destination</th>
            <th style="text-align:left;padding:6px">Products</th>
            <th style="text-align:right;padding:6px">Margin</th>
            <th style="text-align:center;padding:6px">Frequency</th>
            <th style="text-align:center;padding:6px">Active</th>
            <th style="text-align:center;padding:6px">Actions</th>
          </tr></thead>
          <tbody>${profiles.map(p=>`<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:6px;font-weight:600">${escapeHtml(p.customer_name)}</td>
            <td style="padding:6px">${escapeHtml(p.destination)}</td>
            <td style="padding:6px;font-size:10px">${(p.products||[]).join(', ')}</td>
            <td style="text-align:right;padding:6px">$${p.margin_target}/MBF</td>
            <td style="text-align:center;padding:6px"><span class="status-badge status-${p.active?'approved':'cancelled'}">${p.frequency}${p.frequency!=='daily'?' ('+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][p.day_of_week]+')':''}</span></td>
            <td style="text-align:center;padding:6px">${p.active?'<span style="color:var(--positive)">&#10003;</span>':'<span style="color:var(--negative)">&#10007;</span>'}</td>
            <td style="text-align:center;padding:6px">
              <button class="btn btn-default btn-sm" style="padding:1px 6px;font-size:10px" onclick="offeringsEditProfile(${p.id})">Edit</button>
              <button class="btn btn-default btn-sm" style="padding:1px 6px;font-size:10px" onclick="offeringsToggleProfile(${p.id},${p.active?0:1})">${p.active?'Pause':'Activate'}</button>
              <button class="btn btn-danger btn-sm" style="padding:1px 6px;font-size:10px" onclick="offeringsDeleteProfile(${p.id})">&#x2715;</button>
            </td>
          </tr>`).join('')}</tbody>
        </table>`;
      }
      el.innerHTML=html;
    }).catch(e=>{
      const el=document.getElementById('offerings-profiles');
      if(el)el.innerHTML='<div style="color:var(--negative);padding:12px">Error: '+escapeHtml(String(e))+'</div>';
    });
  },0);
  return '';
}

function _offeringsLoadHistory(){
  setTimeout(()=>{
    const trader=S.trader?'&trader='+encodeURIComponent(S.trader):'';
    fetch('/api/offerings?limit=30'+trader).then(r=>r.json()).then(offerings=>{
      const el=document.getElementById('offerings-history');
      if(!el)return;
      if(!offerings.length){el.innerHTML='<div style="padding:30px;text-align:center;color:var(--muted)">No offering history yet.</div>';return;}
      el.innerHTML=`<table style="width:100%;font-size:11px;border-collapse:collapse">
        <thead><tr style="border-bottom:2px solid var(--border)">
          <th style="text-align:left;padding:6px">Date</th>
          <th style="text-align:left;padding:6px">Customer</th>
          <th style="text-align:left;padding:6px">Products</th>
          <th style="text-align:center;padding:6px">Status</th>
          <th style="text-align:right;padding:6px">Avg Margin</th>
        </tr></thead>
        <tbody>${offerings.map(o=>{
          const prods=(o.products||[]).filter(p=>!p.error);
          const statusClass=o.status==='approved'?'approved':o.status==='sent'?'confirmed':o.status==='draft'?'draft':'cancelled';
          return`<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="window._offeringExpanded=${window._offeringExpanded===o.id?'null':o.id};S.offeringsTab='pending';SS('offeringsTab','pending');render()">
            <td style="padding:6px">${new Date(o.generated_at).toLocaleDateString()}</td>
            <td style="padding:6px;font-weight:600">${escapeHtml(o.customer_name)}</td>
            <td style="padding:6px;font-size:10px">${prods.map(p=>p.product).join(', ')}</td>
            <td style="text-align:center;padding:6px"><span class="status-badge status-${statusClass}">${o.status}</span></td>
            <td style="text-align:right;padding:6px">$${Math.round(o.total_margin||0)}/MBF</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    }).catch(e=>{
      const el=document.getElementById('offerings-history');
      if(el)el.innerHTML='<div style="color:var(--negative);padding:12px">Error: '+escapeHtml(String(e))+'</div>';
    });
  },0);
  return '';
}

// --- Offering Actions ---

function offeringsGenerate(){
  fetch('/api/offerings/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({force:true})})
    .then(r=>r.json()).then(d=>{
      if(d.error){showToast('Error: '+d.error,'danger');return;}
      showToast(`Generated ${d.generated} offering(s)`,'success');
      S.offeringsTab='pending';SS('offeringsTab','pending');
      render();
    }).catch(e=>showToast('Error: '+e,'danger'));
}

function offeringsEditPrice(offeringId,productIdx,newPrice){
  fetch('/api/offerings/'+offeringId).then(r=>r.json()).then(o=>{
    const prods=o.products||[];
    if(prods[productIdx]){
      const p=prods[productIdx];
      p.margin=newPrice-p.landed;
      p.price=newPrice;
    }
    return fetch('/api/offerings/'+offeringId,{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({products:prods})});
  }).then(r=>r.json()).then(()=>{render();}).catch(e=>showToast('Error: '+e,'danger'));
}

function offeringsApproveAndCopy(offeringId){
  const notesEl=document.getElementById('offering-notes-'+offeringId);
  const notes=notesEl?notesEl.value:'';
  fetch('/api/offerings/'+offeringId).then(r=>r.json()).then(o=>{
    // Build clipboard text
    const prods=(o.products||[]).filter(p=>!p.error);
    let txt=o.customer_name+' — '+o.destination+'\n';
    txt+='Date: '+new Date().toLocaleDateString()+'\n\n';
    txt+='Product\tPrice\n';
    prods.forEach(p=>{txt+=p.product+'\t$'+Math.round(p.price)+'\n';});
    if(notes)txt+='\nNotes: '+notes+'\n';
    navigator.clipboard.writeText(txt);

    // Mark approved
    return fetch('/api/offerings/'+offeringId+'/approve',{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({notes:notes})});
  }).then(r=>r.json()).then(()=>{
    showToast('Offering approved & copied to clipboard','success');
    window._offeringExpanded=null;
    render();
  }).catch(e=>showToast('Error: '+e,'danger'));
}

function offeringsSkip(offeringId){
  fetch('/api/offerings/'+offeringId,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({status:'skipped'})})
    .then(r=>r.json()).then(()=>{showToast('Offering skipped');render();})
    .catch(e=>showToast('Error: '+e,'danger'));
}

// --- Profile Management ---

function offeringsShowNewProfile(){
  const form=document.getElementById('offerings-new-profile-form');
  if(!form)return;
  if(form.style.display!=='none'){form.style.display='none';return;}
  const customers=myCustomers().filter(c=>c.type!=='mill');
  const allProducts=['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2','2x4 Stud','2x6 Stud','2x4#3','2x6#3'];
  const packages={'Studs #2':['2x4#2','2x6#2'],'Full #2':['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2'],'Full Line':allProducts};

  form.style.display='block';
  form.innerHTML=`<div class="card"><div class="card-header"><span class="card-title">New Offering Profile</span></div>
    <div style="padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:11px">
      <div>
        <label style="font-weight:600;margin-bottom:4px;display:block">Customer</label>
        <select id="op-customer" style="width:100%;padding:6px;font-size:11px;border:1px solid var(--border);background:var(--bg);color:var(--text)" onchange="offeringsProfileCustomerChanged()">
          <option value="">Select...</option>
          ${customers.map(c=>`<option value="${c.id}" data-name="${escapeHtml(c.name)}" data-dest="${escapeHtml(c.locations?.[0]||c.destination||'')}">${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-weight:600;margin-bottom:4px;display:block">Destination</label>
        <input id="op-dest" type="text" placeholder="City, ST" style="width:100%;padding:6px;font-size:11px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
      </div>
      <div>
        <label style="font-weight:600;margin-bottom:4px;display:block">Products</label>
        <div style="margin-bottom:6px;display:flex;gap:4px;flex-wrap:wrap">
          ${Object.keys(packages).map(k=>`<button class="btn btn-default" style="padding:1px 6px;font-size:9px" onclick="offeringsQuickSelect('${k}')">${k}</button>`).join('')}
        </div>
        <div id="op-products" style="display:flex;flex-wrap:wrap;gap:4px">
          ${allProducts.map(p=>`<label style="display:inline-flex;align-items:center;gap:2px;font-size:10px"><input type="checkbox" value="${p}" class="op-prod-cb"> ${p}</label>`).join('')}
        </div>
      </div>
      <div>
        <label style="font-weight:600;margin-bottom:4px;display:block">Margin Target ($/MBF)</label>
        <input id="op-margin" type="number" value="25" style="width:80px;padding:6px;font-size:11px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
        <div style="margin-top:12px">
          <label style="font-weight:600;margin-bottom:4px;display:block">Frequency</label>
          <select id="op-freq" style="padding:6px;font-size:11px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
            <option value="daily">Daily</option>
            <option value="weekly" selected>Weekly</option>
            <option value="biweekly">Biweekly</option>
          </select>
          <select id="op-dow" style="padding:6px;font-size:11px;margin-left:4px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
            <option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option>
          </select>
        </div>
        <div style="margin-top:12px">
          <label style="font-weight:600;margin-bottom:4px;display:block">Notes</label>
          <input id="op-notes" type="text" placeholder="Optional notes" style="width:100%;padding:6px;font-size:11px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
        </div>
      </div>
    </div>
    <div style="padding:8px 12px;display:flex;gap:8px;border-top:1px solid var(--border)">
      <button class="btn btn-primary btn-sm" onclick="offeringsSaveProfile()">Save Profile</button>
      <button class="btn btn-default btn-sm" onclick="document.getElementById('offerings-new-profile-form').style.display='none'">Cancel</button>
    </div>
  </div>`;
}

function offeringsProfileCustomerChanged(){
  const sel=document.getElementById('op-customer');
  const opt=sel?.selectedOptions[0];
  if(opt){
    const dest=opt.getAttribute('data-dest')||'';
    const destInput=document.getElementById('op-dest');
    if(destInput)destInput.value=dest;
  }
}

function offeringsQuickSelect(pkg){
  const packages={'Studs #2':['2x4#2','2x6#2'],'Full #2':['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2'],'Full Line':['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2','2x4 Stud','2x6 Stud','2x4#3','2x6#3']};
  const prods=packages[pkg]||[];
  document.querySelectorAll('.op-prod-cb').forEach(cb=>{cb.checked=prods.includes(cb.value);});
}

function offeringsSaveProfile(){
  const sel=document.getElementById('op-customer');
  const opt=sel?.selectedOptions[0];
  if(!opt||!opt.value){showToast('Select a customer','danger');return;}
  const dest=document.getElementById('op-dest')?.value?.trim();
  if(!dest){showToast('Destination required','danger');return;}
  const products=Array.from(document.querySelectorAll('.op-prod-cb:checked')).map(cb=>cb.value);
  if(!products.length){showToast('Select at least one product','danger');return;}

  const body={
    customer_id:+opt.value,
    customer_name:opt.getAttribute('data-name'),
    destination:dest,
    products:products,
    margin_target:+(document.getElementById('op-margin')?.value||25),
    frequency:document.getElementById('op-freq')?.value||'weekly',
    day_of_week:+(document.getElementById('op-dow')?.value||1),
    notes:document.getElementById('op-notes')?.value||'',
    trader:S.trader||'Ian P'
  };

  fetch('/api/offerings/profiles',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(r=>r.json()).then(d=>{
      if(d.error){showToast('Error: '+d.error,'danger');return;}
      showToast('Profile created','success');
      render();
    }).catch(e=>showToast('Error: '+e,'danger'));
}

function offeringsToggleProfile(pid,active){
  fetch('/api/offerings/profiles/'+pid,{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({active:!!active})})
    .then(r=>r.json()).then(()=>{showToast(active?'Profile activated':'Profile paused');render();})
    .catch(e=>showToast('Error: '+e,'danger'));
}

function offeringsDeleteProfile(pid){
  if(!confirm('Delete this offering profile?'))return;
  fetch('/api/offerings/profiles/'+pid,{method:'DELETE'})
    .then(r=>r.json()).then(()=>{showToast('Profile deleted');render();})
    .catch(e=>showToast('Error: '+e,'danger'));
}

function offeringsEditProfile(pid){
  showToast('Edit via new profile form — delete old and create new','info');
}
