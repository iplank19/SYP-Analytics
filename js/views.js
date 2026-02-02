// SYP Analytics - Views & Render
function renderNav(){
  const navMap={};
  NAV.forEach(n=>navMap[n.id]=n);
  document.getElementById('nav').innerHTML=NAV_GROUPS.map(g=>{
    const items=g.items.map(id=>navMap[id]).filter(Boolean);
    return `<div class="nav-group"><div class="nav-group-label">${g.label}</div>${items.map(n=>`<button class="nav-item ${S.view===n.id?'active':''}" onclick="go('${n.id}')"><span>${n.icon}</span><span class="nav-label">${n.label}</span></button>`).join('')}</div>`;
  }).join('');
}

function renderBreadcrumbs(){
  const bc=document.getElementById('breadcrumbs');
  if(!bc)return;
  const navItem=NAV.find(n=>n.id===S.view);
  const group=NAV_GROUPS.find(g=>g.items.includes(S.view));
  if(!navItem||!group){bc.innerHTML='';return}
  let crumb=`<span>${group.label}</span> <span>›</span> <span class="bc-current">${navItem.label}</span>`;
  if(S.view==='crm'&&S.crmTab){
    crumb+=` <span>›</span> <span class="bc-current">${S.crmTab.charAt(0).toUpperCase()+S.crmTab.slice(1)}</span>`;
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

function go(v){
  // Clear any pending blotter search timeout
  if(window._blotterSearchTimeout){clearTimeout(window._blotterSearchTimeout);window._blotterSearchTimeout=null;}
  const content=document.getElementById('content');
  if(content)content.classList.add('fading');
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
  msgs.innerHTML=S.aiMsgs.map(m=>`<div class="ai-msg ${m.role}">${m.role==='user'?escapeHtml(m.content):renderMarkdown(m.content)}</div>`).join('');
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
  const kpis=`<div class="kpi-grid" style="margin-bottom:16px">
    <div class="kpi"><div class="kpi-label">MONTH P&L</div><div class="kpi-value ${monthTotal>=0?'positive':'negative'}">${fmt(Math.round(monthTotal))}</div></div>
    <div class="kpi"><div class="kpi-label">BEST DAY</div><div class="kpi-value positive">${bestDay?fmt(Math.round(bestDay.val))+' ('+bestDay.day+')':'—'}</div></div>
    <div class="kpi"><div class="kpi-label">WORST DAY</div><div class="kpi-value negative">${worstDay?fmt(Math.round(worstDay.val))+' ('+worstDay.day+')':'—'}</div></div>
    <div class="kpi"><div class="kpi-label">TRADING DAYS</div><div class="kpi-value">${tradingDays}</div></div>
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
  const barChart=`<div class="card" style="margin-top:16px"><div class="card-header"><span class="card-title">DAILY P&L</span></div><div class="card-body"><div style="height:200px"><canvas id="pnl-daily-bar-chart"></canvas></div></div></div>`;

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
    <td>${t.orderNum||'—'}</td>
    <td class="bold">${t.customer}</td>
    <td>${t.product}</td>
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
    <div class="card-body" style="padding:0;overflow-x:auto">
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

function render(){
  renderNav();renderMkt();renderBreadcrumbs();
  updateMobileNav();
  const a=analytics();
  const nav=NAV.find(n=>n.id===S.view);
  document.getElementById('title').textContent=(nav?.icon||'')+' '+(nav?.label||'');
  const c=document.getElementById('content');

  if(S.view==='dashboard'){
    if(!a.buys.length&&!a.sells.length){
      c.innerHTML=`<div class="empty-state" style="padding:80px"><div style="font-size:48px;margin-bottom:20px">${S.trader==='Admin'?'🔑':'📊'}</div><h2 style="margin-bottom:12px;color:var(--text)">Welcome, ${S.trader}!</h2><p style="margin-bottom:24px">${S.trader==='Admin'?'No department trades yet. Traders can add trades from their accounts.':'Start by adding your trades or importing Random Lengths data.'}</p><div style="display:flex;gap:12px;justify-content:center"><button class="btn btn-success" onclick="showBuyModal()">+ Add Buy</button><button class="btn btn-primary" onclick="showSellModal()">+ Add Sell</button><button class="btn btn-warn" onclick="go('rldata')">Import RL Data</button></div></div>`;
      return;
    }
    // --- Dashboard data prep ---
    const weeklyPerf=calcWeeklyPerformance(S.buys,S.sells);
    const wpBuyVols=weeklyPerf.map(w=>w.buyVol);
    const wpSellVols=weeklyPerf.map(w=>w.sellVol);
    const wpProfits=weeklyPerf.map(w=>w.profit);
    const wpInvDeltas=weeklyPerf.map(w=>w.buyVol-w.sellVol);
    const currWk=weeklyPerf[weeklyPerf.length-1]||{buyVol:0,sellVol:0,profit:0};
    const prevWk=weeklyPerf[weeklyPerf.length-2]||{buyVol:0,sellVol:0,profit:0};
    function wowDelta(curr,prev){
      if(!prev||prev===0)return '';
      const pct=((curr-prev)/Math.abs(prev)*100);
      const cls=pct>=0?'up':'down';
      const arrow=pct>=0?'&#9650;':'&#9660;';
      return '<div class="kpi-delta '+cls+'">'+arrow+' '+Math.abs(pct).toFixed(1)+'%</div>';
    }
    // Stale data check
    const _now=new Date();
    const _latestRL=S.rl.length?new Date(S.rl[S.rl.length-1].date):null;
    const _latestBuy=a.buys.length?new Date(a.buys[0].date):null;
    const _latestSell=a.sells.length?new Date(a.sells[0].date):null;
    const _latestTrade=_latestBuy&&_latestSell?new Date(Math.max(_latestBuy,_latestSell)):(_latestBuy||_latestSell);
    const rlStale=_latestRL?(_now-_latestRL)>7*86400000:false;
    const tradeStale=_latestTrade?(_now-_latestTrade)>14*86400000:false;
    const staleBadge='<span class="stale-badge"><span class="stale-dot"></span>Data may be stale</span>';
    // Market movers
    const movers=calcMarketMovers();
    // KPI threshold border helper
    function kpiBorder(cond){return cond?'border-left:3px solid '+cond:'';}
    const invBorder=a.inv<-50?'var(--negative)':Math.abs(a.inv)>25?'var(--warn)':'';
    const marginBorder=a.margin<0?'var(--negative)':a.marginPct>10?'var(--positive)':'';
    const profitBorder=a.profit>0?'var(--positive)':a.profit<0?'var(--negative)':'';

    // --- Build dashboard sections ---
    const _sections={};

    _sections['kpis']=`
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">BUY VOLUME</div><div class="kpi-content"><div><span class="kpi-value">${fmtN(a.bVol)} MBF</span><span class="kpi-sub">${fmt(a.bVal)}</span>${wowDelta(currWk.buyVol,prevWk.buyVol)}</div><canvas id="spark-bvol" class="kpi-spark" width="60" height="24"></canvas></div></div>
        <div class="kpi"><div class="kpi-label">SELL VOLUME</div><div class="kpi-content"><div><span class="kpi-value">${fmtN(a.sVol)} MBF</span><span class="kpi-sub">${fmt(a.sVal)}</span>${wowDelta(currWk.sellVol,prevWk.sellVol)}</div><canvas id="spark-svol" class="kpi-spark" width="60" height="24"></canvas></div></div>
        <div class="kpi"><div class="kpi-label">MATCHED VOL</div><div class="kpi-content"><div><span class="kpi-value">${fmtN(a.matchedVol)} MBF</span></div><canvas id="spark-mvol" class="kpi-spark" width="60" height="24"></canvas></div></div>
        <div class="kpi" style="${kpiBorder(invBorder)}"><div class="kpi-label">OPEN POSITION</div><div class="kpi-content"><div><span class="kpi-value ${a.inv>0?'warn':a.inv<0?'negative':''}">${fmtN(a.inv)} MBF</span><span class="kpi-sub">${a.inv>0?'long':a.inv<0?'short':'flat'}</span>${wowDelta(currWk.buyVol-currWk.sellVol,prevWk.buyVol-prevWk.sellVol)}</div><canvas id="spark-inv" class="kpi-spark" width="60" height="24"></canvas></div></div>
        <div class="kpi" style="${kpiBorder(marginBorder)}"><div class="kpi-label">MARGIN (MATCHED)</div><div class="kpi-content"><div><span class="kpi-value ${a.margin>=0?'positive':'negative'}">${fmt(Math.round(a.margin))}</span><span class="kpi-sub">${fmtPct(a.marginPct)}</span>${wowDelta(currWk.profit,prevWk.profit)}</div><canvas id="spark-margin" class="kpi-spark" width="60" height="24"></canvas></div></div>
        <div class="kpi" style="${kpiBorder(profitBorder)}"><div class="kpi-label">REALIZED PROFIT</div><div class="kpi-content"><div><span class="kpi-value ${a.profit>=0?'positive':'negative'}">${fmt(Math.round(a.profit))}</span>${wowDelta(currWk.profit,prevWk.profit)}</div><canvas id="spark-profit" class="kpi-spark" width="60" height="24"></canvas></div></div>
      </div>`;

    _sections['info-row']=`
      <div class="grid-3" style="margin-bottom:20px">
        <div class="card"><div class="card-header"><span class="card-title">POSITION vs RL</span><button class="card-expand-btn" onclick="expandCard(this)" title="Expand">&#x26F6;</button></div><div class="card-body">
          <div style="display:flex;justify-content:space-between;margin-bottom:12px"><span style="color:var(--muted)">Avg vs Market</span><span style="font-size:18px;font-weight:700;color:${a.avgVsRL<=0?'var(--positive)':'var(--negative)'}">${a.avgVsRL<=0?'&#9660;':'&#9650;'} ${fmt(Math.abs(a.avgVsRL))}</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">Total Impact</span><span style="font-weight:600;color:${a.totVsRL<=0?'var(--positive)':'var(--negative)'}">${fmt(Math.abs(Math.round(a.totVsRL)))} ${a.totVsRL<=0?'saved':'over'}</span></div>
        </div></div>
        <div class="card"><div class="card-header"><span class="card-title">INVENTORY</span><button class="card-expand-btn" onclick="expandCard(this)" title="Expand">&#x26F6;</button></div><div class="card-body">
          <div style="display:flex;justify-content:space-between;margin-bottom:12px"><span style="color:var(--muted)">Open Volume</span><span style="font-size:18px;font-weight:700;color:${a.inv>0?'var(--warn)':'var(--text)'}">${fmtN(a.inv)} MBF</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">Est. Value</span><span style="font-weight:600">${fmt(Math.round(a.inv*a.avgB))}</span></div>
        </div></div>
        <div class="card"><div class="card-header"><span class="card-title warn">FREIGHT</span><button class="card-expand-btn" onclick="expandCard(this)" title="Expand">&#x26F6;</button></div><div class="card-body">
          <div style="display:flex;justify-content:space-between;margin-bottom:12px"><span style="color:var(--muted)">Avg per MBF</span><span style="font-size:18px;font-weight:700;color:var(--warn)">${fmt(Math.round(a.avgFr))}</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">Total Cost</span><span style="font-weight:600">${fmt(Math.round(a.avgFr*a.sVol))}</span></div>
        </div></div>
      </div>`;

    _sections['market-movers']=movers.length?`
      <div class="card" style="margin-bottom:20px"><div class="card-header"><span class="card-title">MARKET MOVERS</span><span style="font-size:9px;color:var(--muted);margin-left:8px">Week-over-Week RL Changes</span><button class="card-expand-btn" onclick="expandCard(this)" title="Expand">&#x26F6;</button></div>
        <div class="card-body" style="padding:0">
          ${movers.map(m=>'<div class="mover-item"><div><span class="mover-name">'+m.product+'</span><span class="mover-region"> ('+m.region+')</span></div><div><span class="mover-change '+(m.change>0?'positive':'negative')+'">'+(m.change>0?'&#9650;':'&#9660;')+' '+fmt(Math.abs(m.change))+'</span><span class="mover-pct '+(m.change>0?'positive':'negative')+'">'+(m.pct>0?'+':'')+m.pct.toFixed(1)+'%</span></div></div>').join('')}
        </div></div>`:'';

    _sections['price-region']=`
      <div class="grid-2-1" style="margin-bottom:20px">
        <div class="card"><div class="card-header"><span class="card-title">PRICE TRENDS — 2x4#2</span>${rlStale?staleBadge:''}<div class="range-selector">${['1W','1M','3M','YTD'].map(r=>'<button class="range-btn '+(S.dashChartRange===r?'active':'')+'" onclick="S.dashChartRange=\''+r+'\';SS(\'dashChartRange\',\''+r+'\');renderDashboardCharts()">'+r+'</button>').join('')}</div><button class="card-expand-btn" onclick="expandCard(this)" title="Expand">&#x26F6;</button></div><div class="card-body">
          ${S.rl.length?'<div style="height:160px"><canvas id="dashboard-price-chart"></canvas></div>':'<div class="empty-state">No RL data yet</div>'}
        </div></div>
        <div class="card"><div class="card-header"><span class="card-title">REGION MIX</span><button class="card-expand-btn" onclick="expandCard(this)" title="Expand">&#x26F6;</button></div><div class="card-body">
          ${a.bVol?REGIONS.map(r=>{const pct=a.bVol?(a.byReg[r].vol/a.bVol*100):0;const col={west:'accent',central:'warn',east:'info'}[r];return'<div style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="text-transform:uppercase;font-size:10px">'+r+'</span><span style="color:var(--muted);font-size:10px">'+fmtN(a.byReg[r].vol)+' MBF ('+pct.toFixed(0)+'%)</span></div><div class="progress-bar"><div class="progress-fill '+col+'" style="width:'+pct+'%"></div></div></div>'}).join(''):'<div class="empty-state">No buys yet</div>'}
        </div></div>
      </div>`;

    _sections['activity']=`
      <div class="grid-2">
        <div class="card"><div class="card-header"><span class="card-title positive">RECENT BUYS</span>${tradeStale?staleBadge:''}<button class="card-expand-btn" onclick="expandCard(this)" title="Expand">&#x26F6;</button></div>
          ${a.buys.length?a.buys.slice(0,5).map(b=>'<div class="activity-item"><div><div class="activity-main">'+b.product+' @ '+fmt(b.price)+'</div><div class="activity-sub">'+b.mill+' &bull; '+b.date+'</div></div><div class="activity-right"><div class="activity-value positive">'+fmtN(b.volume)+' MBF</div><span class="badge '+(b.shipped?'badge-success':'badge-pending')+'">'+(b.shipped?'Shipped':'Pending')+'</span></div></div>').join(''):'<div class="empty-state">No buys yet</div>'}
        </div>
        <div class="card"><div class="card-header"><span class="card-title">RECENT SELLS</span>${tradeStale?staleBadge:''}<button class="card-expand-btn" onclick="expandCard(this)" title="Expand">&#x26F6;</button></div>
          ${a.sells.length?a.sells.slice(0,5).map(x=>'<div class="activity-item"><div><div class="activity-main">'+x.product+' @ '+fmt(x.price)+' DLVD</div><div class="activity-sub">'+x.customer+' &bull; '+x.destination+'</div></div><div class="activity-right"><div class="activity-value accent">'+fmtN(x.volume)+' MBF</div><span class="badge '+(x.delivered?'badge-success':'badge-pending')+'">'+(x.delivered?'Delivered':'Pending')+'</span></div></div>').join(''):'<div class="empty-state">No sells yet</div>'}
        </div>
      </div>`;

    // Build advanced analytics section
    const topProducts=calcTopProducts(a.buys,a.sells);
    const topCustomers=calcTopCustomers(a.sells);
    const agingSummary=calcAgingSummary(a.buys);

    _sections['advanced']=`
      <div style="margin-top:24px;padding-top:20px;border-top:2px solid var(--border)">
        <h3 style="color:var(--accent);margin-bottom:16px;font-size:14px">Advanced Analytics</h3>
        <div class="grid-3" style="margin-bottom:20px">
          <div class="card"><div class="card-header"><span class="card-title">TOP PRODUCTS (Vol)</span><button class="card-expand-btn" onclick="expandCard(this)" title="Expand">&#x26F6;</button></div><div class="card-body" style="padding:0">
            ${topProducts.byVolume.slice(0,5).map((p,i)=>'<div class="activity-item" style="padding:8px 12px"><div style="display:flex;align-items:center;gap:8px"><span style="color:'+(i===0?'gold':i===1?'silver':i===2?'#cd7f32':'var(--muted)')+';font-weight:700;width:18px">'+(i+1)+'</span><span style="font-weight:500">'+p.product+'</span></div><span style="font-weight:600">'+fmtN(p.volume)+' MBF</span></div>').join('')||'<div class="empty-state" style="padding:20px">No data</div>'}
          </div></div>
          <div class="card"><div class="card-header"><span class="card-title">TOP CUSTOMERS</span><button class="card-expand-btn" onclick="expandCard(this)" title="Expand">&#x26F6;</button></div><div class="card-body" style="padding:0">
            ${topCustomers.slice(0,5).map((c,i)=>'<div class="activity-item" style="padding:8px 12px"><div style="display:flex;align-items:center;gap:8px"><span style="color:'+(i===0?'gold':i===1?'silver':i===2?'#cd7f32':'var(--muted)')+';font-weight:700;width:18px">'+(i+1)+'</span><div><div style="font-weight:500">'+c.customer+'</div><div style="font-size:9px;color:var(--muted)">'+c.orders+' orders</div></div></div><div style="text-align:right"><div style="font-weight:600">'+fmtN(c.volume)+' MBF</div><div style="font-size:9px;color:var(--positive)">'+fmt(c.profit)+'</div></div></div>').join('')||'<div class="empty-state" style="padding:20px">No sales yet</div>'}
          </div></div>
          <div class="card"><div class="card-header"><span class="card-title warn">INVENTORY AGING</span><button class="card-expand-btn" onclick="expandCard(this)" title="Expand">&#x26F6;</button></div><div class="card-body">
            <div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:10px;color:var(--positive)">0-7 days</span><span style="font-weight:600">${fmtN(agingSummary.fresh)} MBF</span></div><div class="progress-bar"><div class="progress-fill accent" style="width:${agingSummary.total?agingSummary.fresh/agingSummary.total*100:0}%"></div></div></div>
            <div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:10px;color:var(--muted)">8-14 days</span><span style="font-weight:600">${fmtN(agingSummary.week)} MBF</span></div><div class="progress-bar"><div class="progress-fill info" style="width:${agingSummary.total?agingSummary.week/agingSummary.total*100:0}%"></div></div></div>
            <div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:10px;color:var(--warn)">15-30 days</span><span style="font-weight:600">${fmtN(agingSummary.twoWeek)} MBF</span></div><div class="progress-bar"><div class="progress-fill warn" style="width:${agingSummary.total?agingSummary.twoWeek/agingSummary.total*100:0}%"></div></div></div>
            <div><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:10px;color:var(--negative)">30+ days</span><span style="font-weight:600;color:var(--negative)">${fmtN(agingSummary.old)} MBF</span></div><div class="progress-bar"><div class="progress-fill" style="width:${agingSummary.total?agingSummary.old/agingSummary.total*100:0}%;background:var(--negative)"></div></div></div>
          </div></div>
        </div>
        <div class="card"><div class="card-header"><span class="card-title">WEEKLY PERFORMANCE (Last 8 Weeks)</span><span style="font-size:9px;color:var(--muted)">Volume & Profit Trends</span><button class="card-expand-btn" onclick="expandCard(this)" title="Expand">&#x26F6;</button></div><div class="card-body">
          ${weeklyPerf.length?'<div style="display:flex;gap:4px;align-items:flex-end;height:140px;padding:10px 0;border-bottom:1px solid var(--border)">'+weeklyPerf.map(w=>{const maxVol=Math.max(...weeklyPerf.map(x=>x.buyVol+x.sellVol))||1;const buyH=Math.max(4,(w.buyVol/maxVol)*100);const sellH=Math.max(4,(w.sellVol/maxVol)*100);return'<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px"><div style="display:flex;gap:2px;align-items:flex-end;height:100px"><div style="width:14px;background:var(--positive);border-radius:2px 2px 0 0;height:'+buyH+'px" title="Buy: '+fmtN(w.buyVol)+' MBF"></div><div style="width:14px;background:var(--accent);border-radius:2px 2px 0 0;height:'+sellH+'px" title="Sell: '+fmtN(w.sellVol)+' MBF"></div></div><div style="font-size:8px;color:var(--muted);text-align:center">'+w.label+'</div><div style="font-size:9px;color:'+(w.profit>=0?'var(--positive)':'var(--negative)')+'">'+(w.profit>=0?'+':'')+Math.round(w.profit/1000)+'k</div></div>'}).join('')+'</div><div class="chart-legend" style="margin-top:8px"><div class="legend-item"><div style="width:10px;height:10px;background:var(--positive)"></div><span class="legend-text">Buys</span></div><div class="legend-item"><div style="width:10px;height:10px;background:var(--accent)"></div><span class="legend-text">Sells</span></div></div>':'<div class="empty-state">Not enough data for weekly trends</div>'}
        </div></div>
        <div class="grid-2" style="margin-top:16px">
          <div class="card"><div class="card-header"><span class="card-title positive">MOST PROFITABLE PRODUCTS</span><button class="card-expand-btn" onclick="expandCard(this)" title="Expand">&#x26F6;</button></div><div style="overflow-x:auto"><table style="font-size:11px"><thead><tr><th>Product</th><th class="right">Margin</th><th class="right">Volume</th><th class="right">Profit</th></tr></thead><tbody>
            ${topProducts.byProfit.slice(0,5).map(p=>'<tr><td class="bold">'+p.product+'</td><td class="right '+(p.margin>=0?'positive':'negative')+'">'+fmt(Math.round(p.margin))+'/MBF</td><td class="right">'+fmtN(p.volume)+' MBF</td><td class="right '+(p.profit>=0?'positive':'negative')+' bold">'+fmt(Math.round(p.profit))+'</td></tr>').join('')||'<tr><td colspan="4" class="empty-state">No matched trades</td></tr>'}
          </tbody></table></div></div>
          <div class="card"><div class="card-header"><span class="card-title negative">LEAST PROFITABLE PRODUCTS</span><button class="card-expand-btn" onclick="expandCard(this)" title="Expand">&#x26F6;</button></div><div style="overflow-x:auto"><table style="font-size:11px"><thead><tr><th>Product</th><th class="right">Margin</th><th class="right">Volume</th><th class="right">Profit</th></tr></thead><tbody>
            ${topProducts.byProfit.slice(-5).reverse().filter(p=>p.profit<topProducts.byProfit[0]?.profit).map(p=>'<tr><td class="bold">'+p.product+'</td><td class="right '+(p.margin>=0?'positive':'negative')+'">'+fmt(Math.round(p.margin))+'/MBF</td><td class="right">'+fmtN(p.volume)+' MBF</td><td class="right '+(p.profit>=0?'positive':'negative')+' bold">'+fmt(Math.round(p.profit))+'</td></tr>').join('')||'<tr><td colspan="4" class="empty-state">All products profitable!</td></tr>'}
          </tbody></table></div></div>
        </div>
      </div>`;

    // --- Assemble dashboard in saved order with drag-to-reorder ---
    const _defaultOrder=['kpis','info-row','market-movers','price-region','activity','advanced'];
    const _order=(S.dashboardOrder||_defaultOrder).filter(id=>_sections[id]!==undefined&&_sections[id]!=='');
    // Add any missing sections
    _defaultOrder.forEach(id=>{if(!_order.includes(id)&&_sections[id])_order.push(id);});

    c.innerHTML=_order.map(id=>'<div class="dash-section" data-section="'+id+'" draggable="true" ondragstart="dashDragStart(event)" ondragover="dashDragOver(event)" ondrop="dashDrop(event)" ondragend="dashDragEnd(event)"><span class="dash-drag-handle" title="Drag to reorder">&#8942;&#8942;</span>'+_sections[id]+'</div>').join('')+'<div style="margin-top:16px;text-align:right"><button class="btn btn-info" onclick="exportPDF()">Export PDF</button></div>';
  }
  else if(S.view==='leaderboard'){
    // Enhanced Department Leaderboard with time periods, achievements, goals
    const period=S.leaderboardPeriod||'30d';
    const r=getLeaderboardRange(period);
    const inR=d=>new Date(d)>=r.start&&new Date(d)<=r.end;
    const allBuys=S.buys.filter(b=>inR(b.date));
    const allSells=S.sells.filter(s=>inR(s.date));

    // Calculate detailed stats per trader using helper function
    const traderStats=TRADERS.map(t=>{
      const buys=allBuys.filter(b=>b.trader===t||(!b.trader&&t==='Ian P'));
      const sells=allSells.filter(s=>s.trader===t||(!s.trader&&t==='Ian P'));
      const stats=calcTraderStats(t,buys,sells);
      // Check for new achievements
      checkAchievements(t,stats);
      return stats;
    });

    // Sort by different metrics
    const byVolume=[...traderStats].sort((a,b)=>b.totalVol-a.totalVol);
    const byMargin=[...traderStats].sort((a,b)=>b.margin-a.margin);
    const byProfit=[...traderStats].sort((a,b)=>b.profit-a.profit);
    const byTrades=[...traderStats].sort((a,b)=>b.trades-a.trades);

    // Department totals
    const deptStats={
      buyVol:traderStats.reduce((s,t)=>s+t.buyVol,0),
      sellVol:traderStats.reduce((s,t)=>s+t.sellVol,0),
      profit:traderStats.reduce((s,t)=>s+t.profit,0),
      trades:traderStats.reduce((s,t)=>s+t.trades,0),
      matchedSells:traderStats.reduce((s,t)=>s+t.matchedSells,0)
    };

    // Current trader's stats and achievements
    const myStats=traderStats.find(t=>t.name===S.trader)||traderStats[0];
    const myAchievements=S.achievements.filter(a=>a.trader===S.trader);
    const myGoals=S.traderGoals[S.trader]||{};

    // Period labels
    const periodLabels={today:'Today',week:'This Week',month:'This Month',quarter:'This Quarter',ytd:'Year to Date','7d':'Last 7 Days','30d':'Last 30 Days','90d':'Last 90 Days',all:'All Time'};

    c.innerHTML=`
      <!-- Time Period Tabs -->
      <div style="display:flex;gap:4px;margin-bottom:16px;flex-wrap:wrap">
        ${['today','week','month','quarter','ytd','30d','90d','all'].map(p=>`
          <button class="btn ${period===p?'btn-primary':'btn-default'} btn-sm" onclick="S.leaderboardPeriod='${p}';SS('leaderboardPeriod','${p}');render()">${periodLabels[p]}</button>
        `).join('')}
      </div>

      <!-- Department KPIs -->
      <div class="kpi-grid" style="margin-bottom:16px">
        <div class="kpi"><div class="kpi-value">${fmtN(deptStats.sellVol)}</div><div class="kpi-label">DEPT SELL VOL (MBF)</div></div>
        <div class="kpi"><div class="kpi-value ${deptStats.profit>=0?'positive':'negative'}">${fmt(deptStats.profit,0)}</div><div class="kpi-label">DEPT MATCHED PROFIT</div></div>
        <div class="kpi"><div class="kpi-value">${deptStats.matchedSells}</div><div class="kpi-label">MATCHED SELLS</div></div>
        <div class="kpi"><div class="kpi-value">${fmtN(deptStats.buyVol)}</div><div class="kpi-label">DEPT BUY VOL (MBF)</div></div>
      </div>

      ${S.trader!=='Admin'?`
      <!-- Personal Scorecard -->
      <div class="card" style="margin-bottom:16px;border-color:${traderColor(S.trader)}">
        <div class="card-header" style="background:linear-gradient(90deg,${traderColor(S.trader)}22,transparent)">
          <span class="card-title" style="color:${traderColor(S.trader)}">📊 YOUR SCORECARD - ${S.trader}</span>
          <span style="font-size:10px;color:var(--muted)">${periodLabels[period]}</span>
        </div>
        <div class="card-body">
          <div class="grid-2" style="gap:20px">
            <div>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
                <div style="text-align:center;padding:12px;background:var(--panel-alt);border-radius:4px">
                  <div style="font-size:20px;font-weight:700">${fmtN(myStats.sellVol)}</div>
                  <div style="font-size:9px;color:var(--muted)">SELL VOL (MBF)</div>
                  ${myGoals.volume?`<div style="margin-top:4px"><div class="progress-bar"><div class="progress-fill accent" style="width:${Math.min(100,myStats.sellVol/myGoals.volume*100)}%"></div></div><div style="font-size:8px;color:var(--muted)">${Math.round(myStats.sellVol/myGoals.volume*100)}% of ${myGoals.volume} goal</div></div>`:''}
                </div>
                <div style="text-align:center;padding:12px;background:var(--panel-alt);border-radius:4px">
                  <div style="font-size:20px;font-weight:700;color:${myStats.profit>=0?'var(--positive)':'var(--negative)'}">${fmt(myStats.profit,0)}</div>
                  <div style="font-size:9px;color:var(--muted)">MATCHED PROFIT</div>
                  ${myGoals.profit?`<div style="margin-top:4px"><div class="progress-bar"><div class="progress-fill accent" style="width:${Math.min(100,myStats.profit/myGoals.profit*100)}%"></div></div><div style="font-size:8px;color:var(--muted)">${Math.round(myStats.profit/myGoals.profit*100)}% of ${fmt(myGoals.profit,0)} goal</div></div>`:''}
                </div>
                <div style="text-align:center;padding:12px;background:var(--panel-alt);border-radius:4px">
                  <div style="font-size:20px;font-weight:700;color:${myStats.margin>=0?'var(--positive)':'var(--negative)'}">${fmt(myStats.margin)}</div>
                  <div style="font-size:9px;color:var(--muted)">MARGIN/MBF</div>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
                <div style="text-align:center;padding:8px;background:var(--bg);border-radius:4px">
                  <div style="font-size:14px;font-weight:600">${myStats.matchedSells}</div>
                  <div style="font-size:8px;color:var(--muted)">MATCHED SELLS</div>
                </div>
                <div style="text-align:center;padding:8px;background:var(--bg);border-radius:4px">
                  <div style="font-size:14px;font-weight:600">${myStats.customerCount}</div>
                  <div style="font-size:8px;color:var(--muted)">CUSTOMERS</div>
                </div>
                <div style="text-align:center;padding:8px;background:var(--bg);border-radius:4px">
                  <div style="font-size:14px;font-weight:600;color:var(--accent)">${fmt(myStats.bestProfit,0)}</div>
                  <div style="font-size:8px;color:var(--muted)">BEST TRADE</div>
                </div>
              </div>
            </div>
            <div>
              <div style="font-size:10px;color:var(--muted);margin-bottom:8px">YOUR ACHIEVEMENTS (${myAchievements.length}/${ACHIEVEMENTS.length})</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                ${ACHIEVEMENTS.map(ach=>{
                  const earned=myAchievements.find(a=>a.id===ach.id);
                  return`<div title="${ach.name}: ${ach.desc}" style="padding:6px 10px;background:${earned?'var(--panel-alt)':'var(--bg)'};border:1px solid ${earned?'var(--accent)':'var(--border)'};border-radius:4px;opacity:${earned?1:0.4};cursor:help">
                    <span style="font-size:14px">${ach.icon}</span>
                    <span style="font-size:9px;margin-left:4px;color:${earned?'var(--accent)':'var(--muted)'}">${ach.name}</span>
                  </div>`;
                }).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
      `:''}

      <!-- Leaderboard Cards -->
      <div class="grid-2" style="margin-bottom:16px">
        <div class="card">
          <div class="card-header"><span class="card-title positive">🏆 VOLUME LEADERS</span></div>
          <div class="card-body" style="padding:0">
            ${byVolume.map((t,i)=>`
              <div class="activity-item" style="border-left:3px solid ${traderColor(t.name)}">
                <div style="display:flex;align-items:center;gap:12px">
                  <span style="font-size:16px;font-weight:700;color:${i===0?'gold':i===1?'silver':i===2?'#cd7f32':'var(--muted)'};width:24px">${i+1}</span>
                  <div>
                    <div style="font-weight:600">${t.name}${t.name===S.trader?' ⭐':''}</div>
                    <div style="font-size:10px;color:var(--muted)">B:${fmtN(t.buyVol)} S:${fmtN(t.sellVol)}</div>
                  </div>
                </div>
                <span style="font-weight:700;font-size:14px">${fmtN(t.totalVol)} MBF</span>
              </div>`).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title accent">💰 SALES PROFIT LEADERS</span></div>
          <div class="card-body" style="padding:0">
            ${byProfit.filter(t=>t.matchedSells>0).map((t,i)=>`
              <div class="activity-item" style="border-left:3px solid ${traderColor(t.name)}">
                <div style="display:flex;align-items:center;gap:12px">
                  <span style="font-size:16px;font-weight:700;color:${i===0?'gold':i===1?'silver':i===2?'#cd7f32':'var(--muted)'};width:24px">${i+1}</span>
                  <div>
                    <div style="font-weight:600">${t.name}${t.name===S.trader?' ⭐':''}</div>
                    <div style="font-size:10px;color:var(--muted)">${fmt(t.margin)}/MBF on ${fmtN(t.matchedVol)} MBF</div>
                  </div>
                </div>
                <span style="font-weight:700;font-size:14px;color:${t.profit>=0?'var(--positive)':'var(--negative)'}">${fmt(t.profit,0)}</span>
              </div>`).join('')||'<div class="empty-state">No matched sells yet</div>'}
          </div>
        </div>
      </div>

      <!-- Detailed Table -->
      <div class="card">
        <div class="card-header"><span class="card-title">📋 SALES BREAKDOWN</span></div>
        <div class="card-body" style="overflow-x:auto">
          <table style="font-size:11px">
            <thead>
              <tr>
                <th>Trader</th>
                <th class="right">Buy Vol</th>
                <th class="right">Sell Vol</th>
                <th class="right">Matched</th>
                <th class="right">Margin/MBF</th>
                <th class="right">Profit</th>
                <th class="right">Best Trade</th>
                <th class="right">Customers</th>
              </tr>
            </thead>
            <tbody>
              ${traderStats.map(t=>`
                <tr style="border-left:3px solid ${traderColor(t.name)}${t.name===S.trader?';background:var(--panel-alt)':''}">
                  <td class="bold">${t.name}${t.name===S.trader?' (you)':''}</td>
                  <td class="right">${fmtN(t.buyVol)} <span style="color:var(--muted);font-size:9px">MBF</span></td>
                  <td class="right">${fmtN(t.sellVol)} <span style="color:var(--muted);font-size:9px">MBF</span></td>
                  <td class="right">${t.matchedSells>0?`${t.matchedSells} <span style="color:var(--muted);font-size:9px">(${fmtN(t.matchedVol)} MBF)</span>`:'—'}</td>
                  <td class="right ${t.margin>=0?'positive':'negative'}">${t.matchedSells>0?fmt(t.margin)+'/M':'—'}</td>
                  <td class="right ${t.profit>=0?'positive':'negative'} bold">${t.matchedSells>0?fmt(t.profit,0):'—'}</td>
                  <td class="right accent">${t.bestProfit>0?fmt(t.bestProfit,0):'—'}</td>
                  <td class="right">${t.customerCount}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr style="font-weight:700;border-top:2px solid var(--border)">
                <td>DEPARTMENT</td>
                <td class="right">${fmtN(deptStats.buyVol)} MBF</td>
                <td class="right">${fmtN(deptStats.sellVol)} MBF</td>
                <td class="right">${deptStats.matchedSells}</td>
                <td class="right">—</td>
                <td class="right ${deptStats.profit>=0?'positive':'negative'}">${fmt(deptStats.profit,0)}</td>
                <td class="right">—</td>
                <td class="right">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      ${S.trader==='Admin'?`
      <!-- Admin Section: Goal Setting -->
      <div class="card" style="margin-top:16px;border-color:var(--warn)">
        <div class="card-header" style="background:linear-gradient(90deg,rgba(232,115,74,0.2),transparent)">
          <span class="card-title warn">🔑 ADMIN: TEAM GOALS & MANAGEMENT</span>
        </div>
        <div class="card-body">
          <div style="margin-bottom:16px">
            <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Set monthly goals for each trader:</div>
            <table style="font-size:11px">
              <thead><tr><th>Trader</th><th>Volume Goal (MBF)</th><th>Profit Goal ($)</th><th>Progress</th><th></th></tr></thead>
              <tbody>
                ${TRADERS.map(t=>{
                  const goals=S.traderGoals[t]||{};
                  const stats=traderStats.find(s=>s.name===t)||{totalVol:0,profit:0};
                  const volPct=goals.volume?Math.round(stats.totalVol/goals.volume*100):0;
                  const profitPct=goals.profit?Math.round(stats.profit/goals.profit*100):0;
                  return`<tr style="border-left:3px solid ${traderColor(t)}">
                    <td class="bold">${t}</td>
                    <td><input type="number" id="goal-vol-${t}" value="${goals.volume||''}" placeholder="e.g. 500" style="width:80px"></td>
                    <td><input type="number" id="goal-profit-${t}" value="${goals.profit||''}" placeholder="e.g. 25000" style="width:100px"></td>
                    <td style="min-width:150px">
                      ${goals.volume||goals.profit?`
                        <div style="display:flex;gap:8px;align-items:center">
                          ${goals.volume?`<div style="flex:1"><div class="progress-bar"><div class="progress-fill ${volPct>=100?'accent':'info'}" style="width:${Math.min(100,volPct)}%"></div></div><div style="font-size:8px">${volPct}% vol</div></div>`:''}
                          ${goals.profit?`<div style="flex:1"><div class="progress-bar"><div class="progress-fill ${profitPct>=100?'accent':'info'}" style="width:${Math.min(100,profitPct)}%"></div></div><div style="font-size:8px">${profitPct}% profit</div></div>`:''}
                        </div>
                      `:'<span style="color:var(--muted)">No goals set</span>'}
                    </td>
                    <td><button class="btn btn-sm btn-primary" onclick="saveTraderGoal('${t}')">Save</button></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-default" onclick="exportLeaderboardReport()">📊 Export Report</button>
            <button class="btn btn-default" onclick="showAllAchievements()">🏆 All Achievements</button>
          </div>
        </div>
      </div>
      `:''}

      <!-- Achievement Showcase -->
      <div class="card" style="margin-top:16px">
        <div class="card-header"><span class="card-title warn">🏆 RECENT ACHIEVEMENTS</span></div>
        <div class="card-body">
          ${S.achievements.length?`
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              ${S.achievements.slice(-12).reverse().map(a=>`
                <div style="padding:8px 12px;background:var(--panel-alt);border:1px solid var(--border);border-radius:4px;display:flex;align-items:center;gap:8px">
                  <span style="font-size:18px">${a.icon}</span>
                  <div>
                    <div style="font-size:11px;font-weight:600">${a.name}</div>
                    <div style="font-size:9px;color:${traderColor(a.trader)}">${a.trader}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          `:'<div class="empty-state">No achievements earned yet. Keep trading!</div>'}
        </div>
      </div>`;
  }
  else if(S.view==='insights'){
    // Daily Briefing View
    const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
    const prevRL=S.rl.length>1?S.rl[S.rl.length-2]:null;
    
    // Calculate key metrics
    const openBuys=S.buys.filter(b=>!b.shipped).length;
    const openSells=S.sells.filter(s=>!s.delivered).length;
    const shortPositions=S.sells.filter(s=>!s.linkedPO&&!s.orderNum);
    
    // Week over week changes
    const wowChanges=[];
    if(latestRL&&prevRL){
      ['west','central','east'].forEach(region=>{
        ['2x4#2','2x6#2','2x8#2'].forEach(prod=>{
          const curr=latestRL[region]?.[prod];
          const prev=prevRL[region]?.[prod];
          if(curr&&prev&&curr!==prev){
            wowChanges.push({region,prod,curr,prev,chg:curr-prev});
          }
        });
      });
    }
    
    // Spreads
    const spreads=[];
    if(latestRL){
      ['west','central','east'].forEach(region=>{
        const p4=latestRL[region]?.['2x4#2'];
        const p6=latestRL[region]?.['2x6#2'];
        const p8=latestRL[region]?.['2x8#2'];
        if(p4&&p6)spreads.push({region,spread:'2x4/2x6',val:p6-p4});
        if(p6&&p8)spreads.push({region,spread:'2x6/2x8',val:p8-p6});
      });
    }
    
    // Upcoming deliveries (sells not delivered in next 7 days - we don't have dates so just show pending)
    const pendingSells=S.sells.filter(s=>!s.delivered).slice(0,5);
    const pendingBuys=S.buys.filter(b=>!b.shipped).slice(0,5);
    
    c.innerHTML=`
      <div class="grid-2" style="margin-bottom:16px">
        <div class="card">
          <div class="card-header">
            <span class="card-title">🌅 GOOD MORNING, IAN</span>
            <span style="color:var(--muted);font-size:10px">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</span>
          </div>
          <div class="card-body">
            <div id="ai-briefing" style="line-height:1.6;color:var(--text)">
              <div style="text-align:center;padding:20px;color:var(--muted)">
                <button class="btn btn-primary" onclick="generateDailyBriefing()">🤖 Generate Today's Briefing</button>
              </div>
            </div>
          </div>
        </div>
        
        <div>
          <div class="card">
            <div class="card-header"><span class="card-title info">🎯 MARKET MOMENTUM</span></div>
            <div class="card-body">
              ${latestRL&&prevRL?`
                ${(()=>{
                  const westChg=(latestRL.west?.['2x4#2']||0)-(prevRL.west?.['2x4#2']||0);
                  const centralChg=(latestRL.central?.['2x4#2']||0)-(prevRL.central?.['2x4#2']||0);
                  const eastChg=(latestRL.east?.['2x4#2']||0)-(prevRL.east?.['2x4#2']||0);
                  const avgChg=(westChg+centralChg+eastChg)/3;
                  const trend=avgChg>3?'UP':avgChg<-3?'DOWN':'FLAT';
                  const trendColor=trend==='UP'?'var(--positive)':trend==='DOWN'?'var(--negative)':'var(--warn)';
                  const trendIcon=trend==='UP'?'📈':trend==='DOWN'?'📉':'➡️';
                  
                  // 4-week trend if available
                  let trend4wk='';
                  if(S.rl.length>=4){
                    const oldest=S.rl[S.rl.length-4];
                    const chg4=(latestRL.west?.['2x4#2']||0)-(oldest.west?.['2x4#2']||0);
                    trend4wk=chg4>0?'+$'+chg4:'$'+chg4;
                  }
                  
                  return`
                    <div style="text-align:center;padding:12px">
                      <div style="font-size:48px;margin-bottom:8px">${trendIcon}</div>
                      <div style="font-size:24px;font-weight:700;color:${trendColor}">${trend}</div>
                      <div style="font-size:11px;color:var(--muted);margin-top:4px">Avg WoW: ${avgChg>=0?'+':''}${fmt(Math.round(avgChg))}</div>
                      ${trend4wk?`<div style="font-size:10px;color:var(--muted);margin-top:2px">4-Week: ${trend4wk}</div>`:''}
                    </div>`;
                })()}
              `:'<div style="padding:16px;text-align:center;color:var(--muted)">Need 2+ weeks of RL data</div>'}
            </div>
          </div>
          
          <div class="card">
            <div class="card-header"><span class="card-title info">📊 MARKET SNAPSHOT</span></div>
            <div class="card-body" style="padding:0">
              ${latestRL?`
                <div style="padding:12px;border-bottom:1px solid var(--border)">
                  <div style="font-size:10px;color:var(--muted);margin-bottom:8px">RANDOM LENGTHS ${latestRL.date}</div>
                  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
                    <div><div style="color:var(--accent);font-weight:700;font-size:16px">${fmt(latestRL.west?.['2x4#2'])}</div><div style="font-size:9px;color:var(--muted)">West 2x4</div></div>
                    <div><div style="color:var(--warn);font-weight:700;font-size:16px">${fmt(latestRL.central?.['2x4#2'])}</div><div style="font-size:9px;color:var(--muted)">Central 2x4</div></div>
                    <div><div style="color:var(--info);font-weight:700;font-size:16px">${fmt(latestRL.east?.['2x4#2'])}</div><div style="font-size:9px;color:var(--muted)">East 2x4</div></div>
                  </div>
                </div>
                ${wowChanges.length?`
                  <div style="padding:12px">
                    <div style="font-size:10px;color:var(--muted);margin-bottom:8px">WEEK-OVER-WEEK</div>
                    ${wowChanges.slice(0,4).map(c=>`<div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:11px">
                      <span style="text-transform:capitalize">${c.region} ${c.prod}</span>
                      <span style="color:${c.chg>0?'var(--positive)':'var(--negative)'};font-weight:600">${c.chg>0?'+':''}${fmt(c.chg)}</span>
                    </div>`).join('')}
                  </div>
                `:''}
              `:'<div style="padding:16px;text-align:center;color:var(--muted)">No RL data. <a href="#" onclick="go(\'rldata\');return false" style="color:var(--accent)">Import →</a></div>'}
            </div>
          </div>
        </div>
      </div>
      
      <div class="grid-3">
        <div class="card">
          <div class="card-header"><span class="card-title accent">🗺️ REGIONAL VALUE</span></div>
          <div class="card-body">
            ${latestRL?`
              ${(()=>{
                const regions=[
                  {name:'West',price:latestRL.west?.['2x4#2']||0,color:'var(--accent)'},
                  {name:'Central',price:latestRL.central?.['2x4#2']||0,color:'var(--warn)'},
                  {name:'East',price:latestRL.east?.['2x4#2']||0,color:'var(--info)'}
                ].filter(r=>r.price>0).sort((a,b)=>a.price-b.price);
                
                if(!regions.length)return'<div class="empty-state">No price data</div>';
                
                const best=regions[0];
                const worst=regions[regions.length-1];
                const savings=worst.price-best.price;
                
                return`
                  <div style="text-align:center;margin-bottom:12px">
                    <div style="font-size:10px;color:var(--muted)">BEST VALUE</div>
                    <div style="font-size:24px;font-weight:700;color:${best.color}">${best.name}</div>
                    <div style="font-size:14px;color:var(--positive)">${fmt(savings)} cheaper than ${worst.name}</div>
                  </div>
                  <div style="font-size:11px">
                    ${regions.map((r,i)=>`<div style="display:flex;justify-content:space-between;padding:6px 0;${i<regions.length-1?'border-bottom:1px solid var(--border)':''}">
                      <span style="color:${r.color}">${i+1}. ${r.name}</span>
                      <span style="font-weight:600">${fmt(r.price)}</span>
                    </div>`).join('')}
                  </div>`;
              })()}
            `:'<div class="empty-state">Need RL data</div>'}
          </div>
        </div>
        
        <div class="card">
          <div class="card-header"><span class="card-title warn">📏 VOLUME PACE</span></div>
          <div class="card-body">
            ${(()=>{
              // Calculate this week's volume
              const today=new Date();
              const weekStart=new Date(today);
              weekStart.setDate(today.getDate()-today.getDay());
              const weekStartStr=weekStart.toISOString().split('T')[0];
              
              const thisWeekBuys=S.buys.filter(b=>b.date>=weekStartStr).reduce((s,b)=>s+(b.volume||0),0);
              const thisWeekSells=S.sells.filter(s=>s.date>=weekStartStr).reduce((s,s2)=>s+(s2.volume||0),0);
              const thisWeekTotal=thisWeekBuys+thisWeekSells;
              
              // Calculate average weekly volume (last 4 weeks)
              const fourWeeksAgo=new Date(today);
              fourWeeksAgo.setDate(today.getDate()-28);
              const fourWeeksStr=fourWeeksAgo.toISOString().split('T')[0];
              
              const last4wkBuys=S.buys.filter(b=>b.date>=fourWeeksStr&&b.date<weekStartStr).reduce((s,b)=>s+(b.volume||0),0);
              const last4wkSells=S.sells.filter(s=>s.date>=fourWeeksStr&&s.date<weekStartStr).reduce((s,s2)=>s+(s2.volume||0),0);
              const avgWeekly=Math.round((last4wkBuys+last4wkSells)/4);
              
              const pct=avgWeekly>0?Math.round((thisWeekTotal/avgWeekly)*100):0;
              const status=pct>=100?'AHEAD':pct>=75?'ON PACE':'BEHIND';
              const statusColor=pct>=100?'var(--positive)':pct>=75?'var(--warn)':'var(--negative)';
              
              return`
                <div style="text-align:center;margin-bottom:12px">
                  <div style="font-size:10px;color:var(--muted)">THIS WEEK</div>
                  <div style="font-size:28px;font-weight:700">${fmtN(thisWeekTotal)} <span style="font-size:14px;color:var(--muted)">MBF</span></div>
                  <div style="font-size:12px;color:${statusColor};font-weight:600">${status}</div>
                </div>
                <div style="margin-bottom:8px">
                  <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-bottom:4px">
                    <span>Progress</span>
                    <span>${pct}%</span>
                  </div>
                  <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
                    <div style="height:100%;width:${Math.min(pct,100)}%;background:${statusColor};border-radius:4px"></div>
                  </div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted)">
                  <span>Avg Week: ${fmtN(avgWeekly)} MBF</span>
                  <span>B:${fmtN(thisWeekBuys)} S:${fmtN(thisWeekSells)}</span>
                </div>`;
            })()}
          </div>
        </div>
        
        <div class="card">
          <div class="card-header"><span class="card-title">📐 KEY SPREADS</span></div>
          <div class="card-body" style="padding:0">
            ${spreads.length?spreads.map(s=>`<div class="activity-item"><span style="text-transform:capitalize">${s.region} ${s.spread}</span><span style="font-weight:600">${fmt(s.val)}</span></div>`).join(''):'<div class="empty-state">No spread data</div>'}
          </div>
        </div>
      </div>
      
      <div class="card" style="margin-top:16px">
        <div class="card-header">
          <span class="card-title positive">📝 WEEKLY MARKET REPORT</span>
          <button class="btn btn-success btn-sm" onclick="generateWeeklyReport()">🤖 Generate Report</button>
        </div>
        <div class="card-body">
          <div id="weekly-report" style="line-height:1.6">
            <div style="color:var(--muted);text-align:center;padding:20px">Click "Generate Report" to create a market commentary for your customers</div>
          </div>
        </div>
      </div>`;
  }
  else if(S.view==='charts'){
    // Redirect old charts view to rldata
    S.view='rldata';S.rlTab='charts';render();return;
  }
  else if(S.view==='blotter'){
    // Blotter includes cancelled orders (shown grayed out) unlike analytics
    const r=getRange(),inR=d=>new Date(d)>=r.start&&new Date(d)<=r.end;
    const mP=p=>S.filters.prod==='all'||p===S.filters.prod;
    const mR=rg=>S.filters.reg==='all'||rg===S.filters.reg;
    const isAdminUser=S.trader==='Admin';
    const isMyTrade=t=>isAdminUser||t===S.trader||!t;
    const myBuys=S.buys.filter(b=>inR(b.date)&&mP(b.product)&&mR(b.region)&&isMyTrade(b.trader));
    const mySells=S.sells.filter(s=>inR(s.date)&&mP(s.product)&&isMyTrade(s.trader));

    // Calculate sold volume per Order# - normalize to strings (only from my sells)
    const orderSold={};
    mySells.forEach(s=>{
      const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
      if(ord)orderSold[ord]=(orderSold[ord]||0)+(s.volume||0);
    });

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
      const ord=String(b.orderNum||b.po||'').trim();
      if(ord)buyByOrder[ord]=b;
    });
    const sellByOrder={};
    S.sells.forEach(s=>{
      const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
      if(ord){
        if(!sellByOrder[ord])sellByOrder[ord]=[];
        sellByOrder[ord].push(s);
      }
    });
    
    c.innerHTML=`
      <div style="margin-bottom:12px;padding:8px 12px;background:var(--panel);border-left:3px solid ${traderColor(S.trader)};font-size:12px;display:flex;justify-content:space-between;align-items:center">
        <div><strong>${S.trader==='Admin'?'🔑 All Traders':S.trader+"'s Trade Blotter"}</strong> <span style="color:var(--muted)">— ${filteredBuys.length} buys, ${filteredSells.length} sells</span></div>
        <div style="display:flex;align-items:center;gap:8px">
          ${S.trader==='Admin'?'<button class="btn btn-default btn-sm" onclick="showImportModal()">📥 Import CSV</button>':''}
          <button class="btn btn-info btn-sm" onclick="exportPDF()">Export PDF</button>
          ${S.trader!=='Admin'?`<span style="font-size:10px;color:var(--muted)">📊 See Risk & Leaderboard for dept-wide data</span>`:''}
        </div>
      </div>
      <div class="card" style="margin-bottom:16px;padding:12px">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <div style="position:relative;flex:0 0 200px">
            <input type="text" id="blotter-search" placeholder="Search orders, mills, customers..." value="${bf.search||''}" onkeyup="handleBlotterSearch(event)" style="width:100%;padding:6px 10px 6px 28px;font-size:11px;background:var(--bg);border:1px solid var(--border);color:var(--text)">
            <span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:12px">🔍</span>
          </div>
          <span style="color:var(--muted);font-size:11px">|</span>
          <select onchange="setBlotterFilter('mill',this.value)" style="font-size:11px;padding:4px">
            <option value="">All Mills</option>${mills.map(m=>`<option value="${m}" ${bf.mill===m?'selected':''}>${m}</option>`).join('')}
          </select>
          <select onchange="setBlotterFilter('customer',this.value)" style="font-size:11px;padding:4px">
            <option value="">All Customers</option>${customers.map(c=>`<option value="${c}" ${bf.customer===c?'selected':''}>${c}</option>`).join('')}
          </select>
          <select onchange="setBlotterFilter('product',this.value)" style="font-size:11px;padding:4px">
            <option value="">All Products</option>${products.map(p=>`<option value="${p}" ${bf.product===p?'selected':''}>${p}</option>`).join('')}
          </select>
          <label style="font-size:11px"><input type="checkbox" ${bf.showShorts?'checked':''} onchange="setBlotterFilter('showShorts',this.checked)"> Shorts only</label>
          <label style="font-size:11px;color:var(--warn)"><input type="checkbox" ${bf.noOrderNum?'checked':''} onchange="setBlotterFilter('noOrderNum',this.checked)"> No Order #</label>
          <button class="btn btn-default btn-sm" onclick="clearBlotterFilters()">Clear</button>
        </div>
      </div>
      <div class="card"><div class="card-header"><span class="card-title positive">${S.trader==='Admin'?'ALL BUYS':'MY BUYS'}</span><span style="color:var(--muted);font-size:10px;margin-left:8px">${filteredBuys.length} trades</span><button class="btn btn-default btn-sm" onclick="expCSV('buys')">Export CSV</button></div>
        <div style="overflow-x:auto"><table><thead><tr>${S.trader==='Admin'?'<th>👤</th>':''}<th ${sortClick('orderNum')}>Order # ${sortIcon('orderNum')}</th><th ${sortClick('date')}>Date ${sortIcon('date')}</th><th class="right" title="Days since purchase">Age</th><th ${sortClick('mill')}>Mill ${sortIcon('mill')}</th><th>Origin</th><th>Reg</th><th ${sortClick('product')}>Product ${sortIcon('product')}</th><th>Len</th><th class="right" ${sortClick('price')}>Price ${sortIcon('price')}</th><th class="right">Frt</th><th class="right" ${sortClick('volume')}>Vol ${sortIcon('volume')}</th><th class="right">Sold</th><th class="right">Avail</th><th></th></tr></thead><tbody>
          ${filteredBuys.length?filteredBuys.map(b=>{const ord=String(b.orderNum||b.po||'').trim();const sold=orderSold[ord]||0;const avail=(b.volume||0)-sold;const buyFrtMBF=b.volume>0?(b.freight||0)/b.volume:0;const age=calcAge(b.date);const ageColor=age>30?'var(--negative)':age>14?'var(--warn)':'var(--muted)';const linkedSells=ord?sellByOrder[ord]||[]:[];const coworkerSells=linkedSells.filter(s=>s.trader&&s.trader!==b.trader);const isCancelled=b.status==='cancelled';return`<tr style="${isCancelled?'opacity:0.4;text-decoration:line-through':''}">${S.trader==='Admin'?`<td><span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:${traderColor(b.trader||'Ian P')};color:var(--bg);font-size:10px;font-weight:700;text-align:center;line-height:20px" title="${b.trader||'Ian P'}">${traderInitial(b.trader||'Ian P')}</span></td>`:''}<td class="bold accent">${ord||'—'}${coworkerSells.length?` <span style="font-size:9px;color:var(--info)" title="Sold by: ${coworkerSells.map(s=>s.trader).join(', ')}">→${coworkerSells.map(s=>traderInitial(s.trader)).join(',')}</span>`:''}</td><td>${fmtD(b.date)}</td><td class="right" style="color:${ageColor};font-size:10px" title="${age} days old">${age}d</td><td>${b.mill||'—'}</td><td>${b.origin||'—'}</td><td style="text-transform:capitalize">${b.region}</td><td class="bold">${b.product}${b.msrPremium?' <span style="color:var(--accent);font-size:9px">+'+b.msrPremium+'</span>':''}</td><td>${b.length||'RL'}${b.tally?' <span style="color:var(--warn);font-size:9px">T</span>':''}</td><td class="right positive">${fmt(b.price)}${b.freight?' <span style="color:var(--muted);font-size:9px">FOB</span>':''}</td><td class="right ${b.freight?'warn':''}">${b.freight?fmt(b.freight):'—'}</td><td class="right">${fmtN(b.volume)}</td><td class="right ${sold>0?'warn':''}">${fmtN(sold)}</td><td class="right ${avail>0?'positive':''}">${fmtN(avail)}</td><td><div class="action-buttons"><button class="btn btn-default btn-sm" onclick="editBuy(${b.id})">Edit</button><button class="btn btn-default btn-sm" onclick="dupBuy(${b.id})">⧉</button><button class="btn btn-default btn-sm" onclick="cancelBuy(${b.id})" title="${b.status==='cancelled'?'Reactivate':'Cancel'}">${b.status==='cancelled'?'↩':'⊘'}</button><button class="btn btn-danger btn-sm" onclick="delBuy(${b.id})">×</button></div></td></tr>`}).join(''):`<tr><td colspan="${S.trader==='Admin'?15:14}" class="empty-state">No buys</td></tr>`}
        </tbody></table></div></div>
      <div class="card"><div class="card-header"><span class="card-title">${S.trader==='Admin'?'ALL SELLS':'MY SELLS'}</span><span style="color:var(--muted);font-size:10px;margin-left:8px">${filteredSells.length} trades</span><button class="btn btn-default btn-sm" onclick="expCSV('sells')">Export CSV</button></div>
        <div style="overflow-x:auto"><table><thead><tr>${S.trader==='Admin'?'<th>👤</th>':''}<th ${sortClick('orderNum')}>Order # ${sortIcon('orderNum')}</th><th ${sortClick('date')}>Date ${sortIcon('date')}</th><th ${sortClick('customer')}>Customer ${sortIcon('customer')}</th><th>Dest</th><th ${sortClick('product')}>Product ${sortIcon('product')}</th><th>Len</th><th class="right" ${sortClick('price')}>DLVD ${sortIcon('price')}</th><th class="right">Frt</th><th class="right">Frt/MBF</th><th class="right">Margin</th><th class="right" ${sortClick('volume')}>Vol ${sortIcon('volume')}</th><th class="right">Profit</th><th></th></tr></thead><tbody>
          ${filteredSells.length?filteredSells.map(x=>{
            const ord=String(x.orderNum||x.linkedPO||x.oc||'').trim();
            const buy=ord?buyByOrder[ord]:null;
            const buyCost=buy?.price||0;
            const sellFrtPerMBF=x.volume>0?(x.freight||0)/x.volume:0;
            const fob=(x.price||0)-sellFrtPerMBF;
            const margin=buy?fob-buyCost:null;
            const profit=margin!==null?margin*(x.volume||0):null;
            const isShort=!buy;
            const crossTrader=buy&&buy.trader!==x.trader;
            const isCancelled=x.status==='cancelled';
            return`<tr style="${isCancelled?'opacity:0.4;text-decoration:line-through':''}">${S.trader==='Admin'?`<td><span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:${traderColor(x.trader||'Ian P')};color:var(--bg);font-size:10px;font-weight:700;text-align:center;line-height:20px" title="${x.trader||'Ian P'}">${traderInitial(x.trader||'Ian P')}</span></td>`:''}<td class="bold ${isShort?'negative':'accent'}">${ord||'—'}${isShort?' <span style="font-size:9px">(SHORT)</span>':''}${crossTrader?` <span style="font-size:9px;color:${traderColor(buy.trader)}" title="Sourced from ${buy.trader}">←${traderInitial(buy.trader)}</span>`:''}</td><td>${fmtD(x.date)}</td><td>${x.customer||'—'}</td><td>${x.destination||'—'}</td><td class="bold">${x.product}${x.msrPremium?' <span style="color:var(--accent);font-size:9px">+'+x.msrPremium+'</span>':''}</td><td>${x.length||'RL'}${x.tally?' <span style="color:var(--warn);font-size:9px">T</span>':''}</td><td class="right accent">${fmt(x.price)}</td><td class="right warn">${fmt(x.freight)}</td><td class="right" style="color:var(--muted)">${fmt(Math.round(sellFrtPerMBF))}</td><td class="right ${margin===null?'':margin>=0?'positive':'negative'} bold">${margin!==null?fmt(Math.round(margin)):'—'}</td><td class="right">${fmtN(x.volume)}</td><td class="right ${profit===null?'':profit>=0?'positive':'negative'} bold">${profit!==null?fmt(Math.round(profit)):'—'}</td><td><div class="action-buttons"><button class="btn btn-default btn-sm" onclick="editSell(${x.id})">Edit</button><button class="btn btn-default btn-sm" onclick="dupSell(${x.id})">⧉</button><button class="btn btn-default btn-sm" onclick="cancelSell(${x.id})" title="${x.status==='cancelled'?'Reactivate':'Cancel'}">${x.status==='cancelled'?'↩':'⊘'}</button><button class="btn btn-danger btn-sm" onclick="delSell(${x.id})">×</button></div></td></tr>`}).join(''):`<tr><td colspan="${S.trader==='Admin'?14:13}" class="empty-state">No sells</td></tr>`}
        </tbody></table></div></div>`;
  }
  else if(S.view==='benchmark'){
    // Filter out MSR/2400 from market comparison (they're premiums)
    const standardBench=a.bench.filter(b=>!b.isMSR);
    const msrBench=a.bench.filter(b=>b.isMSR);

    // Calculate regional performance
    const byRegion={west:{vol:0,diff:0,count:0},central:{vol:0,diff:0,count:0},east:{vol:0,diff:0,count:0}};
    standardBench.filter(b=>b.diff!=null).forEach(b=>{
      const r=b.region||'west';
      byRegion[r].vol+=b.volume||0;
      byRegion[r].diff+=b.diff*(b.volume||0);
      byRegion[r].count++;
    });

    // Best and worst buys
    const withDiff=standardBench.filter(b=>b.diff!=null).sort((x,y)=>x.diff-y.diff);
    const bestBuys=withDiff.slice(0,3);
    const worstBuys=withDiff.slice(-3).reverse();

    // Total savings/overpay
    const totalImpact=standardBench.filter(b=>b.diff!=null).reduce((s,b)=>s+(b.diff||0)*(b.volume||0),0);
    const matchedVol=standardBench.filter(b=>b.diff!=null).reduce((s,b)=>s+(b.volume||0),0);

    // Historical vs market trend (by week)
    const weeklyVsMarket=calcWeeklyVsMarket(S.buys,S.rl);

    // Filtering
    const benchFilter=S.benchFilter||{};
    let filteredBench=standardBench;
    if(benchFilter.region)filteredBench=filteredBench.filter(b=>b.region===benchFilter.region);
    if(benchFilter.product)filteredBench=filteredBench.filter(b=>b.product===benchFilter.product);
    if(benchFilter.showBelow)filteredBench=filteredBench.filter(b=>b.diff!=null&&b.diff<0);
    if(benchFilter.showAbove)filteredBench=filteredBench.filter(b=>b.diff!=null&&b.diff>0);

    // Sorting
    const benchSort=S.benchSort||{col:'date',dir:'desc'};
    filteredBench=[...filteredBench].sort((x,y)=>{
      let av=x[benchSort.col],bv=y[benchSort.col];
      if(benchSort.col==='date'){av=new Date(av||0);bv=new Date(bv||0);}
      if(benchSort.col==='diff'){av=av??999;bv=bv??999;}
      if(typeof av==='string')av=av.toLowerCase();
      if(typeof bv==='string')bv=bv.toLowerCase();
      return benchSort.dir==='asc'?(av>bv?1:-1):(av<bv?1:-1);
    });

    const benchProducts=[...new Set(standardBench.map(b=>b.product))].sort();
    const benchSortIcon=col=>benchSort.col===col?(benchSort.dir==='asc'?'▲':'▼'):'';
    const benchSortClick=col=>`onclick="toggleBenchSort('${col}')" style="cursor:pointer"`;

    c.innerHTML=`
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">AVG vs MARKET</div><div><span class="kpi-value ${a.avgVsRL<=0?'positive':'negative'}">${a.avgVsRL<=0?'▼':'▲'} ${fmt(Math.abs(a.avgVsRL))}</span><span class="kpi-sub">/MBF</span></div></div>
        <div class="kpi"><div class="kpi-label">TOTAL IMPACT</div><div><span class="kpi-value ${totalImpact<=0?'positive':'negative'}">${totalImpact<=0?'':'+'} ${fmt(Math.abs(Math.round(totalImpact)))}</span><span class="kpi-sub">${totalImpact<=0?'saved':'over'}</span></div></div>
        <div class="kpi"><div class="kpi-label">TRADES MATCHED</div><div><span class="kpi-value">${standardBench.filter(b=>b.rlP).length}/${standardBench.length}</span><span class="kpi-sub">${fmtN(matchedVol)} MBF</span></div></div>
        <div class="kpi"><div class="kpi-label">MSR/2400 TRADES</div><div><span class="kpi-value accent">${msrBench.length}</span></div></div>
      </div>

      <!-- Regional Performance -->
      <div class="grid-3" style="margin-bottom:16px">
        ${['west','central','east'].map(r=>{
          const d=byRegion[r];
          const avg=d.vol>0?d.diff/d.vol:0;
          const color=r==='west'?'accent':r==='central'?'warn':'info';
          return`<div class="card">
            <div class="card-header"><span class="card-title" style="color:var(--${color});text-transform:capitalize">${r.toUpperCase()}</span></div>
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                <span style="color:var(--muted)">Avg vs RL</span>
                <span class="bold ${avg<=0?'positive':'negative'}">${avg<=0?'▼':'▲'} ${fmt(Math.abs(Math.round(avg)))}/MBF</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                <span style="color:var(--muted)">Volume</span>
                <span>${fmtN(d.vol)} MBF</span>
              </div>
              <div style="display:flex;justify-content:space-between">
                <span style="color:var(--muted)">Trades</span>
                <span>${d.count}</span>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>

      <!-- Weekly Trend Chart -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><span class="card-title">VS MARKET TREND (Last 8 Weeks)</span></div>
        <div class="card-body">
          ${weeklyVsMarket.length?`
          <div style="display:flex;gap:4px;align-items:center;height:120px;padding:10px 0">
            ${weeklyVsMarket.map(w=>{
              const maxAbs=Math.max(...weeklyVsMarket.map(x=>Math.abs(x.avgDiff)))||1;
              const h=Math.max(8,Math.abs(w.avgDiff)/maxAbs*50);
              const isBelow=w.avgDiff<=0;
              return`<div style="flex:1;display:flex;flex-direction:column;align-items:center;height:100%">
                <div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;width:100%">
                  ${isBelow?`<div style="width:80%;background:var(--positive);height:${h}px;border-radius:2px" title="$${Math.round(w.avgDiff)}/MBF"></div>`:''}
                  <div style="height:1px;width:100%;background:var(--border);margin:2px 0"></div>
                  ${!isBelow?`<div style="width:80%;background:var(--negative);height:${h}px;border-radius:2px" title="+$${Math.round(w.avgDiff)}/MBF"></div>`:''}
                </div>
                <div style="font-size:8px;color:var(--muted);margin-top:4px">${w.label}</div>
                <div style="font-size:9px;color:${isBelow?'var(--positive)':'var(--negative)'}">${isBelow?'':'+'}${Math.round(w.avgDiff)}</div>
              </div>`;
            }).join('')}
          </div>
          <div style="text-align:center;font-size:9px;color:var(--muted);margin-top:8px">
            <span style="color:var(--positive)">▼ Below market = Good</span> &nbsp;|&nbsp; <span style="color:var(--negative)">▲ Above market = Overpaid</span>
          </div>
          `:'<div class="empty-state">Not enough data for trend</div>'}
        </div>
      </div>

      <!-- Best & Worst Buys -->
      <div class="grid-2" style="margin-bottom:16px">
        <div class="card">
          <div class="card-header"><span class="card-title positive">BEST BUYS (vs Market)</span></div>
          <div class="card-body" style="padding:0">
            ${bestBuys.length?bestBuys.map(b=>`
              <div class="activity-item">
                <div>
                  <div class="activity-main">${b.product} ${b.length||'RL'}</div>
                  <div class="activity-sub">${b.mill||'—'} • ${fmtD(b.date)}</div>
                </div>
                <div class="activity-right">
                  <div class="activity-value positive">▼ ${fmt(Math.abs(b.diff))}</div>
                  <div style="font-size:9px;color:var(--muted)">${fmtN(b.volume)} MBF</div>
                </div>
              </div>
            `).join(''):'<div class="empty-state">No matched buys</div>'}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title negative">WORST BUYS (vs Market)</span></div>
          <div class="card-body" style="padding:0">
            ${worstBuys.filter(b=>b.diff>0).length?worstBuys.filter(b=>b.diff>0).map(b=>`
              <div class="activity-item">
                <div>
                  <div class="activity-main">${b.product} ${b.length||'RL'}</div>
                  <div class="activity-sub">${b.mill||'—'} • ${fmtD(b.date)}</div>
                </div>
                <div class="activity-right">
                  <div class="activity-value negative">▲ +${fmt(b.diff)}</div>
                  <div style="font-size:9px;color:var(--muted)">${fmtN(b.volume)} MBF</div>
                </div>
              </div>
            `).join(''):'<div class="empty-state" style="padding:20px;color:var(--positive)">All buys at or below market!</div>'}
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="card" style="margin-bottom:16px;padding:12px">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <span style="color:var(--muted);font-size:11px">FILTERS:</span>
          <select onchange="setBenchFilter('region',this.value)" style="font-size:11px;padding:4px">
            <option value="">All Regions</option>
            <option value="west" ${benchFilter.region==='west'?'selected':''}>West</option>
            <option value="central" ${benchFilter.region==='central'?'selected':''}>Central</option>
            <option value="east" ${benchFilter.region==='east'?'selected':''}>East</option>
          </select>
          <select onchange="setBenchFilter('product',this.value)" style="font-size:11px;padding:4px">
            <option value="">All Products</option>
            ${benchProducts.map(p=>`<option value="${p}" ${benchFilter.product===p?'selected':''}>${p}</option>`).join('')}
          </select>
          <label style="font-size:11px;color:var(--positive)"><input type="checkbox" ${benchFilter.showBelow?'checked':''} onchange="setBenchFilter('showBelow',this.checked)"> Below market only</label>
          <label style="font-size:11px;color:var(--negative)"><input type="checkbox" ${benchFilter.showAbove?'checked':''} onchange="setBenchFilter('showAbove',this.checked)"> Above market only</label>
          <button class="btn btn-default btn-sm" onclick="S.benchFilter={};render()">Clear</button>
        </div>
      </div>

      <div class="card"><div class="card-header"><span class="card-title">STANDARD GRADES vs RANDOM LENGTHS</span><span style="color:var(--muted);font-size:10px">${filteredBench.length} trades • Latest RL: ${a.latestRL?.date||'None'}</span></div>
        <div style="overflow-x:auto"><table><thead><tr><th ${benchSortClick('date')}>Date ${benchSortIcon('date')}</th><th ${benchSortClick('mill')}>Mill ${benchSortIcon('mill')}</th><th ${benchSortClick('product')}>Product ${benchSortIcon('product')}</th><th>Len</th><th ${benchSortClick('region')}>Region ${benchSortIcon('region')}</th><th class="right" ${benchSortClick('price')}>Your Price ${benchSortIcon('price')}</th><th class="right">RL #1</th><th class="right" ${benchSortClick('diff')}>Diff ${benchSortIcon('diff')}</th><th class="right" ${benchSortClick('volume')}>Volume ${benchSortIcon('volume')}</th></tr></thead><tbody>
          ${filteredBench.length?filteredBench.map(b=>`<tr><td>${fmtD(b.date)}</td><td>${b.mill||'—'}</td><td class="bold">${b.product}</td><td>${b.length||'RL'}</td><td style="text-transform:capitalize">${b.region}</td><td class="right">${fmt(b.price)}</td><td class="right" style="color:var(--muted)">${b.rlP?fmt(b.rlP):'<span style="color:var(--negative)">No match</span>'}</td><td class="right ${b.diff==null?'':b.diff<=0?'positive':'negative'} bold">${b.diff!=null?`${b.diff<=0?'':'+'}${fmt(b.diff)}`:'—'}</td><td class="right">${fmtN(b.volume)} MBF</td></tr>`).join(''):'<tr><td colspan="9" class="empty-state">No trades match filters</td></tr>'}
        </tbody></table></div>
        ${standardBench.some(b=>!b.rlP)?`<div style="padding:12px;color:var(--muted);font-size:10px;border-top:1px solid var(--border)">💡 "No match" means the product/length/region combo wasn't found in RL data.</div>`:''}
      </div>
      ${msrBench.length?`<div class="card" style="margin-top:16px"><div class="card-header"><span class="card-title accent">MSR / 2400f TRADES (Premium over #1)</span></div>
        <div style="overflow-x:auto"><table><thead><tr><th>Date</th><th>Mill</th><th>Product</th><th>Len</th><th>Region</th><th class="right">Your Price</th><th class="right">Base #1</th><th class="right">Premium</th><th class="right">Volume</th></tr></thead><tbody>
          ${msrBench.map(b=>`<tr><td>${fmtD(b.date)}</td><td>${b.mill||'—'}</td><td class="bold accent">${b.product}</td><td>${b.length||'RL'}</td><td style="text-transform:capitalize">${b.region}</td><td class="right">${fmt(b.price)}</td><td class="right" style="color:var(--muted)">${b.basePrice?fmt(b.basePrice):(b.rlP?fmt(b.rlP):'—')}</td><td class="right accent bold">${b.msrPremium?'+'+fmt(b.msrPremium):(b.rlP?'+'+fmt(b.price-b.rlP):'—')}</td><td class="right">${fmtN(b.volume)} MBF</td></tr>`).join('')}
        </tbody></table></div>
        <div style="padding:12px;color:var(--muted);font-size:10px;border-top:1px solid var(--border)">MSR/2400 prices shown as premium over #1 base price. These do not affect market comparison metrics.</div>
      </div>`:''}`
  }
  else if(S.view==='risk'){
    // Risk analytics shows DEPARTMENT-WIDE data for all traders to see overall exposure
    const deptBuys=S.buys;
    const deptSells=S.sells;

    // Calculate positions by product (bought vs sold) - DEPT WIDE
    const normLen=l=>String(l||'RL').replace(/'/g,'');
    const positions={};
    deptBuys.forEach(b=>{
      const len=normLen(b.length);
      const key=`${b.product}|${len}`;
      if(!positions[key])positions[key]={product:b.product,length:len,region:b.region||'west',bought:0,sold:0,boughtVal:0,soldVal:0};
      positions[key].bought+=b.volume||0;
      positions[key].boughtVal+=(b.price||0)*(b.volume||0);
    });
    deptSells.forEach(s=>{
      const len=normLen(s.length);
      const key=`${s.product}|${len}`;
      if(!positions[key])positions[key]={product:s.product,length:len,region:s.region||'west',bought:0,sold:0,boughtVal:0,soldVal:0};
      positions[key].sold+=s.volume||0;
      const freightPerMBF=s.volume>0?(s.freight||0)/s.volume:0;
      positions[key].soldVal+=((s.price||0)-freightPerMBF)*(s.volume||0);
    });

    // Split into long/short
    const longPos=Object.values(positions).filter(p=>p.bought>p.sold).map(p=>({...p,net:p.bought-p.sold,avgCost:p.bought?p.boughtVal/p.bought:0}));
    const shortPos=Object.values(positions).filter(p=>p.sold>p.bought).map(p=>({...p,net:p.sold-p.bought,avgSell:p.sold?p.soldVal/p.sold:0}));

    const totalLong=longPos.reduce((s,p)=>s+p.net,0);
    const totalShort=shortPos.reduce((s,p)=>s+p.net,0);
    const longExposure=longPos.reduce((s,p)=>s+p.net*p.avgCost,0);
    const shortExposure=shortPos.reduce((s,p)=>s+p.net*p.avgSell,0);
    const netPosition=totalLong-totalShort;

    // Concentration risk - find largest position
    const allPos=[...longPos,...shortPos].sort((a,b)=>(b.net*b.avgCost||b.net*b.avgSell)-(a.net*a.avgCost||a.net*a.avgSell));
    const largestPos=allPos[0];
    const totalExposure=longExposure+shortExposure;
    const concentrationPct=totalExposure>0&&largestPos?(largestPos.net*(largestPos.avgCost||largestPos.avgSell))/totalExposure*100:0;

    // Uncovered sells (sells without matching buy order) - DEPT WIDE
    const buyOrders=new Set(deptBuys.map(b=>String(b.orderNum||b.po||'').trim()).filter(Boolean));
    const uncoveredSells=deptSells.filter(s=>{
      const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
      return !ord||!buyOrders.has(ord);
    });
    const uncoveredVol=uncoveredSells.reduce((s,x)=>s+(x.volume||0),0);

    c.innerHTML=`
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">NET POSITION</div><div><span class="kpi-value ${netPosition>0?'warn':netPosition<0?'negative':''}">${netPosition>0?'+':''}${fmtN(netPosition)} MBF</span><span class="kpi-sub">${netPosition>0?'long':netPosition<0?'short':'flat'}</span></div></div>
        <div class="kpi"><div class="kpi-label">LONG EXPOSURE</div><div><span class="kpi-value ${totalLong>0?'warn':''}">${fmtN(totalLong)} MBF</span><span class="kpi-sub">${fmt(Math.round(longExposure))}</span></div></div>
        <div class="kpi"><div class="kpi-label">SHORT EXPOSURE</div><div><span class="kpi-value ${totalShort>0?'negative':''}">${fmtN(totalShort)} MBF</span><span class="kpi-sub">${fmt(Math.round(shortExposure))}</span></div></div>
        <div class="kpi"><div class="kpi-label">UNCOVERED SELLS</div><div><span class="kpi-value ${uncoveredVol>0?'negative':''}">${fmtN(uncoveredVol)} MBF</span><span class="kpi-sub">${uncoveredSells.length} orders</span></div></div>
      </div>

      <!-- Concentration Risk -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <span class="card-title ${concentrationPct>50?'negative':concentrationPct>30?'warn':''}">CONCENTRATION RISK</span>
          ${concentrationPct>50?'<span style="background:var(--negative);color:#fff;padding:2px 8px;border-radius:10px;font-size:9px">HIGH RISK</span>':''}
          ${concentrationPct>30&&concentrationPct<=50?'<span style="background:var(--warn);color:var(--bg);padding:2px 8px;border-radius:10px;font-size:9px">MODERATE</span>':''}
        </div>
        <div class="card-body">
          ${allPos.length?`
          <div style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="color:var(--muted);font-size:11px">Top position: <strong>${largestPos?.product||'—'} ${largestPos?.length||''}</strong></span>
              <span style="font-size:11px;color:${concentrationPct>50?'var(--negative)':concentrationPct>30?'var(--warn)':'var(--muted)'}">${fmtN(concentrationPct)}% of exposure</span>
            </div>
            <div class="progress-bar" style="height:8px">
              <div class="progress-fill" style="width:${Math.min(100,concentrationPct)}%;background:${concentrationPct>50?'var(--negative)':concentrationPct>30?'var(--warn)':'var(--accent)'}"></div>
            </div>
          </div>
          <table style="font-size:11px"><thead><tr><th>Product</th><th>Length</th><th class="right">Position</th><th class="right">Exposure</th><th class="right">% of Total</th></tr></thead><tbody>
            ${allPos.slice(0,5).map(p=>{
              const exp=p.net*(p.avgCost||p.avgSell);
              const pct=totalExposure>0?exp/totalExposure*100:0;
              const isLong=p.bought>p.sold;
              return`<tr>
                <td class="bold">${p.product}</td>
                <td>${p.length}</td>
                <td class="right ${isLong?'warn':'negative'}">${isLong?'+':'-'}${fmtN(p.net)} MBF</td>
                <td class="right">${fmt(Math.round(exp))}</td>
                <td class="right" style="color:${pct>30?'var(--negative)':pct>20?'var(--warn)':'var(--muted)'}">${fmtN(pct)}%</td>
              </tr>`;
            }).join('')}
          </tbody></table>
          `:'<div class="empty-state">No positions</div>'}
        </div>
      </div>

      <!-- Long/Short Position Tables -->
      <div class="grid-2">
        <div class="card"><div class="card-header"><span class="card-title warn">LONG POSITIONS</span><span style="color:var(--muted);font-size:10px">${longPos.length} products</span></div>
          <div style="overflow-x:auto;max-height:300px"><table><thead><tr><th>Product</th><th>Len</th><th class="right">Bought</th><th class="right">Sold</th><th class="right">Net</th><th class="right">Avg Cost</th><th class="right">Exposure</th><th></th></tr></thead><tbody>
            ${longPos.length?longPos.sort((a,b)=>b.net-a.net).map(p=>{const prodEsc=(p.product||'').replace(/'/g,"\\'");const lenEsc=(p.length||'').replace(/'/g,"\\'");return`<tr><td class="bold">${p.product}</td><td>${p.length}</td><td class="right">${fmtN(p.bought)}</td><td class="right">${fmtN(p.sold)}</td><td class="right warn bold">${fmtN(p.net)}</td><td class="right">${fmt(Math.round(p.avgCost))}</td><td class="right">${fmt(Math.round(p.net*p.avgCost))}</td><td><button class="btn btn-primary btn-sm" onclick="sellPosition('${prodEsc}','${lenEsc}',${p.net})">Sell</button></td></tr>`}).join(''):'<tr><td colspan="8" class="empty-state">No long positions</td></tr>'}
          </tbody></table></div></div>
        <div class="card"><div class="card-header"><span class="card-title negative">SHORT POSITIONS</span><span style="color:var(--muted);font-size:10px">${shortPos.length} products</span></div>
          <div style="overflow-x:auto;max-height:300px"><table><thead><tr><th>Product</th><th>Len</th><th class="right">Bought</th><th class="right">Sold</th><th class="right">Net</th><th class="right">Avg Sell</th><th class="right">Exposure</th><th></th></tr></thead><tbody>
            ${shortPos.length?shortPos.sort((a,b)=>b.net-a.net).map(p=>{const prodEsc=(p.product||'').replace(/'/g,"\\'");const lenEsc=(p.length||'').replace(/'/g,"\\'");return`<tr><td class="bold">${p.product}</td><td>${p.length}</td><td class="right">${fmtN(p.bought)}</td><td class="right">${fmtN(p.sold)}</td><td class="right negative bold">${fmtN(p.net)}</td><td class="right">${fmt(Math.round(p.avgSell))}</td><td class="right">${fmt(Math.round(p.net*p.avgSell))}</td><td><button class="btn btn-success btn-sm" onclick="coverPosition('${prodEsc}','${lenEsc}',${p.net})">Cover</button></td></tr>`}).join(''):'<tr><td colspan="8" class="empty-state">No short positions</td></tr>'}
          </tbody></table></div></div>
      </div>

      <!-- Uncovered Sells -->
      ${uncoveredSells.length?`
      <div class="card" style="margin-top:16px;border-color:var(--negative)">
        <div class="card-header" style="background:rgba(224,82,82,0.1)"><span class="card-title negative">UNCOVERED SELLS (Need Coverage)</span><span style="color:var(--negative);font-size:10px">${fmtN(uncoveredVol)} MBF at risk</span></div>
        <div style="overflow-x:auto;max-height:250px"><table><thead><tr><th>Order #</th><th>Date</th><th>Customer</th><th>Product</th><th>Len</th><th class="right">Volume</th><th class="right">Price</th><th></th></tr></thead><tbody>
          ${uncoveredSells.slice(0,10).map(s=>{
            const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
            return`<tr>
              <td class="bold negative">${ord||'—'}</td>
              <td>${fmtD(s.date)}</td>
              <td>${s.customer||'—'}</td>
              <td class="bold">${s.product}</td>
              <td>${s.length||'RL'}</td>
              <td class="right">${fmtN(s.volume)} MBF</td>
              <td class="right">${fmt(s.price)}</td>
              <td><button class="btn btn-success btn-sm" onclick="coverSell(${s.id})">Cover</button></td>
            </tr>`;
          }).join('')}
          ${uncoveredSells.length>10?`<tr><td colspan="8" style="text-align:center;color:var(--muted);font-size:10px">...and ${uncoveredSells.length-10} more</td></tr>`:''}
        </tbody></table></div>
      </div>
      `:''}`
  }
  else if(S.view==='quotes'||S.view==='mi-quotes'){
    // Quote Engine View — with SOURCE / BUILD tabs
    const _qeTab=S.view==='mi-quotes'?'source':(S.quoteTab||'build');
    if(S.view==='mi-quotes'){S.view='quotes';S.quoteTab='source';}

    // SOURCE tab: render Smart Quotes inline
    if(_qeTab==='source'){
      c.innerHTML=`
        <div style="display:flex;gap:0;margin-bottom:16px">
          <button class="btn ${_qeTab==='source'?'btn-primary':'btn-default'}" style="border-radius:var(--radius) 0 0 var(--radius)" onclick="S.quoteTab='source';render()">💡 SOURCE</button>
          <button class="btn ${_qeTab==='build'?'btn-primary':'btn-default'}" style="border-radius:0 var(--radius) var(--radius) 0;position:relative" onclick="S.quoteTab='build';render()">📋 BUILD${(S.quoteItems||[]).length?' <span style=\"background:var(--accent);color:var(--bg);border-radius:8px;padding:1px 6px;font-size:9px;margin-left:4px\">'+(S.quoteItems||[]).length+'</span>':''}</button>
        </div>
        <div id="mi-quotes-inline"></div>`;
      // Render Smart Quotes into the inline container
      setTimeout(()=>{
        const container=document.getElementById('mi-quotes-inline');
        if(container) renderMiSmartQuotesInline(container);
      },0);
      return;
    }

    const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
    const mills=myMills().length?myMills():MILL_COMPANIES.map(c=>({name:c,location:getMillLocations(c).map(l=>l.label).join(', ')}));
    const defaultOrigins=['Warren, AR','Gurdon, AR','Camden, AR','Monticello, AR','Clarendon, NC','Huttig, AR','DeQuincy, LA'];
    const origins=[...new Set([...defaultOrigins,...mills.map(m=>m.location||m.city||'').filter(Boolean)])];

    // Get customers for current profile (filtered to current trader)
    const currentProfile=S.quoteProfile||'default';
    const profiles=S.quoteProfiles||{default:{name:'Default',customers:[]}};
    const profileCustomerIds=profiles[currentProfile]?.customers||[];
    const customers=myCustomers().filter(c=>c.type!=='mill');

    // Calculate stats
    const items=S.quoteItems||[];
    const selectedItems=items.filter(i=>i.selected!==false);
    const totalTLs=selectedItems.reduce((s,i)=>s+(i.tls||0),0);
    // Determine current destination for landed cost calc
    const _qeDest=S.specificCity||S.singleQuoteCustomer&&(()=>{const c=customers.find(x=>x.name===S.singleQuoteCustomer);return c?.locations?.[0]||c?.destination||'';})() ||'';

    c.innerHTML=`
      <div style="display:flex;gap:0;margin-bottom:16px">
        <button class="btn ${_qeTab==='source'?'btn-primary':'btn-default'}" style="border-radius:var(--radius) 0 0 var(--radius)" onclick="S.quoteTab='source';render()">💡 SOURCE</button>
        <button class="btn ${_qeTab==='build'?'btn-primary':'btn-default'}" style="border-radius:0 var(--radius) var(--radius) 0" onclick="S.quoteTab='build';render()">📋 BUILD${items.length?' <span style=\"background:var(--accent);color:var(--bg);border-radius:8px;padding:1px 6px;font-size:9px;margin-left:4px\">'+items.length+'</span>':''}</button>
      </div>
      ${S.trader==='Admin'?`<div style="margin-bottom:12px;padding:8px 12px;background:rgba(232,115,74,0.1);border:1px solid #e8734a;border-radius:4px;font-size:11px;color:#e8734a">🔑 <strong>Admin View</strong> — This is the Admin quote engine. Each trader has their own separate quote items and profiles.</div>`:''}
      <!-- Profile Selector -->
      <div class="card" style="margin-bottom:12px;padding:10px">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span style="font-weight:600;color:var(--accent)">📁 Profile:</span>
          <select id="quote-profile-select" onchange="switchQuoteProfile(this.value)" style="padding:6px 10px;min-width:150px">
            ${Object.entries(profiles).map(([id,p])=>`<option value="${id}" ${id===currentProfile?'selected':''}>${p.name}</option>`).join('')}
          </select>
          <button class="btn btn-default btn-sm" onclick="showNewProfileModal()">+ New Profile</button>
          <button class="btn btn-default btn-sm" onclick="editCurrentProfile()">✏️ Edit</button>
          ${currentProfile!=='default'?'<button class="btn btn-default btn-sm" onclick="deleteCurrentProfile()" style="color:var(--negative)">🗑️</button>':''}
          <div style="flex:1"></div>
          <span style="font-size:10px;color:var(--muted)">${profiles[currentProfile]?.items?.length||items.length} products • ${profileCustomerIds.length||customers.filter(c=>c.quoteSelected).length} customers</span>
        </div>
      </div>
      
      <div class="quote-grid">
        <div>
          <div class="quote-toolbar">
            <span style="font-weight:600;color:var(--accent)">📋 Quote Builder</span>
            <div style="flex:1"></div>
            <button class="btn btn-primary btn-sm" onclick="S.quoteTab='source';render()" title="Find best sources from Mill Intel">💡 Smart Source</button>
            <button class="btn btn-warn btn-sm" onclick="showQuickEntryModal()" title="Spreadsheet-style rapid entry">Quick Entry</button>
            <button class="btn btn-success btn-sm" onclick="addQuoteItem(false)">+ Add</button>
            <button class="btn btn-default btn-sm" onclick="loadFromMillQuotes()" title="Load current mill offers from Mill Intel DB">🏭 Mill Quotes</button>
            <button class="btn btn-default btn-sm" onclick="clearQuoteItems()">Clear</button>
          </div>
          
          <div class="card">
            <div class="quote-stats">
              <div class="quote-stat"><span class="quote-stat-val">${selectedItems.length}</span><span class="quote-stat-lbl">Items</span></div>
              <div class="quote-stat"><span class="quote-stat-val">${totalTLs}</span><span class="quote-stat-lbl">TLs</span></div>
              <div class="quote-stat"><span class="quote-stat-val">${S.lanes.length}</span><span class="quote-stat-lbl">Lanes</span></div>
            </div>
            <div style="overflow-x:auto;max-height:400px;overflow-y:auto">
              <table class="quote-table">
                <thead><tr>
                  <th class="col-cb"><input type="checkbox" ${selectedItems.length===items.length?'checked':''} onchange="toggleAllQuoteItems(this.checked)"></th>
                  <th class="col-prod">Product</th>
                  <th class="col-origin">Origin</th>
                  <th style="width:55px">Ship Wk</th>
                  <th style="width:45px">TLs</th>
                  <th style="width:70px" title="Mill FOB cost">Cost</th>
                  <th style="width:70px">FOB Sell</th>
                  <th style="width:70px" title="FOB Sell + freight to destination">Landed</th>
                  <th class="col-act"></th>
                </tr></thead>
                <tbody id="quote-items-body">
                  ${items.length?items.map((item,idx)=>{
                    const isMSR=item.product?.toUpperCase().includes('MSR')||item.product?.toUpperCase().includes('2400');
                    const destMiles=_qeDest?getLaneMiles(item.origin,_qeDest):null;
                    const frt=destMiles?calcFreightPerMBF(destMiles,item.origin,isMSR):null;
                    const landed=frt!=null&&item.fob?(item.fob+frt):null;
                    return`<tr data-idx="${idx}">
                      <td><input type="checkbox" ${item.selected!==false?'checked':''} onchange="toggleQuoteItem(${idx},this.checked)"></td>
                      <td><input type="text" value="${item.product||''}" onchange="updateQuoteItem(${idx},'product',this.value)" placeholder="2x4 #2 16'"></td>
                      <td><input type="text" value="${item.origin||''}" onchange="updateQuoteItem(${idx},'origin',this.value)" placeholder="City, ST" list="origin-list"></td>
                      <td><input type="text" value="${item.shipWeek||''}" onchange="updateQuoteItem(${idx},'shipWeek',this.value)" placeholder="W1" style="width:45px;text-align:center"></td>
                      <td><input type="number" value="${item.tls||1}" onchange="updateQuoteItem(${idx},'tls',+this.value)" min="1" style="width:40px;text-align:center"></td>
                      <td style="text-align:right;font-size:10px"><span style="color:var(--muted)">${item.cost?'$'+item.cost:'—'}</span></td>
                      <td><input type="number" value="${item.fob||''}" onchange="updateQuoteItem(${idx},'fob',+this.value)" placeholder="$" style="width:60px"></td>
                      <td style="text-align:right;font-size:10px;font-weight:600">${landed!=null?'<span style="color:var(--positive)">$'+landed+'</span>':'<span style="color:var(--muted)">—</span>'}</td>
                      <td><button class="quote-del-btn" onclick="removeQuoteItem(${idx})">×</button></td>
                    </tr>`;
                  }).join(''):'<tr><td colspan="9" class="empty-state">No items yet. Click "Smart Source" or "+ Add" to start.</td></tr>'}
                </tbody>
              </table>
              <datalist id="origin-list">
                ${[...new Set([...origins,...S.lanes.map(l=>l.origin)])].filter(Boolean).sort().map(o=>`<option value="${o}">`).join('')}
              </datalist>
          </div>
        </div>
        
        <div>
          <!-- Freight Panel with Base + State Rate Model -->
          <div class="freight-panel">
            <div class="freight-title">🚚 Freight Calculator</div>
            
            <!-- Base and Floor -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
              <div>
                <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:2px">Base $/Load</label>
                <input type="number" value="${S.freightBase||450}" step="25" style="width:100%;padding:4px;font-size:11px" onchange="S.freightBase=+this.value;save('freightBase',S.freightBase);render()">
              </div>
              <div>
                <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:2px">Floor $/MBF</label>
                <input type="number" value="${S.shortHaulFloor||0}" step="5" style="width:100%;padding:4px;font-size:11px" onchange="S.shortHaulFloor=+this.value;save('shortHaulFloor',S.shortHaulFloor);render()">
              </div>
            </div>
            
            <!-- State Rates ($/mi by origin) -->
            <div style="margin-bottom:10px">
              <label style="font-size:9px;color:var(--muted);display:block;margin-bottom:4px">State $/mi Rates (by origin)</label>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
                ${['AR','LA','TX','MS','AL','FL','GA','SC','NC'].map(st=>`<div style="display:flex;align-items:center;gap:4px">
                  <span style="font-size:10px;color:var(--muted);width:22px">${st}</span>
                  <input type="number" value="${S.stateRates?.[st]||''}" step="0.05" placeholder="0" style="width:50px;padding:4px;font-size:10px" onchange="updateStateRate('${st}',+this.value||0)">
                </div>`).join('')}
              </div>
            </div>
            
            <div style="font-size:9px;color:var(--muted);margin-bottom:8px;padding:6px;background:var(--bg);border-radius:4px">
              <strong>Formula:</strong> (Base + Miles × StateRate) ÷ MBF/TL<br>
              <span style="color:var(--accent)">AR 150mi:</span> ($${S.freightBase||450} + 150 × $${S.stateRates?.AR||0}) ÷ ${S.quoteMBFperTL||23} = <strong>$${Math.round(((S.freightBase||450) + 150*(S.stateRates?.AR||0))/(S.quoteMBFperTL||23))}/MBF</strong>
              &nbsp;|&nbsp;
              <span style="color:var(--warn)">AR 400mi:</span> <strong>$${Math.round(((S.freightBase||450) + 400*(S.stateRates?.AR||0))/(S.quoteMBFperTL||23))}/MBF</strong>
            </div>
            
            <div style="display:flex;gap:12px;align-items:center;padding-top:8px;border-top:1px solid var(--border);flex-wrap:wrap">
              <div style="display:flex;align-items:center;gap:6px">
                <label class="freight-lbl" style="margin:0">Std MBF/TL:</label>
                <input type="number" value="${S.quoteMBFperTL||23}" style="width:45px;padding:4px;font-size:10px" onchange="S.quoteMBFperTL=+this.value;render()">
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <label class="freight-lbl" style="margin:0;color:var(--warn)">MSR:</label>
                <span style="font-size:10px;color:var(--warn)">20 MBF/TL</span>
              </div>
            </div>
          </div>
          
          <!-- RL Reference -->
          ${latestRL?`<div style="padding:10px;background:var(--card);border:1px solid var(--border);border-radius:6px;margin-bottom:12px">
            <div style="font-size:10px;color:var(--muted);margin-bottom:6px">📰 RL ${latestRL.date}</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;font-size:10px">
              <div><span style="color:var(--accent)">W:</span> $${latestRL.west?.['2x4#2']||'—'}</div>
              <div><span style="color:var(--warn)">C:</span> $${latestRL.central?.['2x4#2']||'—'}</div>
              <div><span style="color:var(--info)">E:</span> $${latestRL.east?.['2x4#2']||'—'}</div>
            </div>
          </div>`:''}
          
          <!-- Specific City Quote -->
          <div class="card" style="margin-bottom:14px">
            <div class="card-header"><span class="card-title">📍 Quote to City</span></div>
            <div style="padding:10px">
              <div style="display:flex;gap:8px;margin-bottom:8px">
                <input type="text" id="specific-city" placeholder="City, ST" style="flex:1;padding:8px;font-size:12px" value="${S.specificCity||''}">
                <button class="btn btn-primary btn-sm" onclick="generateSpecificCityQuote()">Generate</button>
              </div>
              <div style="font-size:9px;color:var(--muted)">Enter any city to get a one-off quote</div>
            </div>
          </div>
          
          <!-- Recipients (Bulk) -->
          <div class="card" style="margin-bottom:14px">
            <div class="card-header"><span class="card-title">📋 Bulk Quote</span><span style="font-size:9px;color:var(--accent)">${customers.filter(c=>c.quoteSelected).length} selected</span></div>
            <div style="padding:0">
              <div class="customer-list">
                ${customers.length?customers.map((cust,i)=>{
                  const locs=cust.locations||[cust.destination].filter(Boolean);
                  const locCount=locs.length;
                  const locsDisplay=locs.slice(0,2).map(l=>{
                    const lane=S.lanes.find(ln=>ln.dest.toLowerCase().includes(l.split(',')[0].toLowerCase()));
                    return`<span style="display:inline-flex;align-items:center;gap:4px">📍 ${l}${lane?' <span style="color:var(--muted);font-size:9px">('+lane.miles+' mi)</span>':''}</span>`;
                  }).join('<br>');
                  const moreCount=locCount>2?locCount-2:0;
                  return`<div class="customer-item" style="align-items:flex-start">
                    <input type="checkbox" ${cust.quoteSelected?'checked':''} onchange="toggleQuoteCustomer(${i},this.checked)" style="margin-top:4px">
                    <div class="customer-info" style="flex:1">
                      <div class="customer-name">${cust.name}${locCount>1?' <span style="background:var(--info);color:var(--bg);padding:1px 5px;border-radius:8px;font-size:8px;margin-left:4px">'+locCount+' locs</span>':''}</div>
                      <div class="customer-dest" style="font-size:10px;line-height:1.5">${locsDisplay}${moreCount?' <span style="color:var(--muted)">+'+moreCount+' more</span>':''}</div>
                    </div>
                  </div>`;
                }).join(''):'<div class="empty-state">No customers in CRM</div>'}
              </div>
            </div>
            <div style="padding:8px 10px;border-top:1px solid var(--border);display:flex;gap:8px">
              <button class="btn btn-default btn-sm" onclick="uncheckAllQuoteCustomers()">Uncheck All</button>
              <button class="btn btn-default btn-sm" onclick="checkAllQuoteCustomers()">Check All</button>
            </div>
          </div>
          
          <!-- Market Blurb -->
          <div class="card" style="margin-bottom:12px">
            <div class="card-header"><span class="card-title">📝 Market Blurb</span><span style="font-size:9px;color:var(--muted)">Optional message above quote</span></div>
            <div style="padding:10px">
              <textarea id="market-blurb" placeholder="Add market commentary, notes, or greeting here..." style="width:100%;height:60px;padding:8px;font-size:11px;resize:vertical;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)" onchange="saveMarketBlurb()">${S.marketBlurb||''}</textarea>
            </div>
          </div>
          
          <!-- Generate Actions -->
          <div class="card" style="margin-bottom:12px">
            <div style="padding:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <button class="btn btn-success" onclick="generateAllQuotes()" style="flex:1">📋 Copy All (${customers.filter(c=>c.quoteSelected).reduce((sum,c)=>{const locs=c.locations||[c.destination].filter(Boolean);return sum+(locs.length||1)},0)} quotes)</button>
            </div>
          </div>
          
          <!-- Single Quote Preview -->
          <div class="card">
            <div class="card-header"><span class="card-title">Single Quote</span>
              <div style="display:flex;gap:6px">
                <button class="btn btn-default btn-sm" onclick="copyQuoteOutput()">📋 Copy</button>
                <button class="btn btn-primary btn-sm" onclick="createSingleDraft()">✉️ Draft</button>
              </div>
            </div>
            <div style="padding:10px;border-bottom:1px solid var(--border)">
              <select id="single-quote-customer" onchange="S.singleQuoteCustomer=this.value;render()" style="width:100%;padding:8px;font-size:12px">
                <option value="">Select customer...</option>
                ${customers.map(c=>{
                  const locs=c.locations||[c.destination].filter(Boolean);
                  return`<option value="${c.name}" ${S.singleQuoteCustomer===c.name?'selected':''}>${c.name} (${locs.length} location${locs.length!==1?'s':''})</option>`;
                }).join('')}
              </select>
            </div>
            <div id="quote-status" style="padding:4px 10px;font-size:10px;color:var(--warn);min-height:16px"></div>
            <div style="padding:10px;padding-top:0">
              <div class="output-preview" id="quote-output">${generateMultiLocationPreview(selectedItems,S.singleQuoteCustomer?customers.find(c=>c.name===S.singleQuoteCustomer):customers[0])}</div>
            </div>
          </div>
        </div>
      </div>`;
  }
  else if(S.view==='products'){
    // Calculate comprehensive product analytics
    const buyByOrder={};
    S.buys.forEach(b=>{
      const ord=String(b.orderNum||b.po||'').trim();
      if(ord)buyByOrder[ord]=b;
    });

    const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;

    const prodData={};
    // Process buys
    a.buys.forEach(b=>{
      const prod=b.product||'Unknown';
      if(!prodData[prod])prodData[prod]={product:prod,bVol:0,sVol:0,bVal:0,sVal:0,marginVol:0,marginVal:0,profit:0,trades:0,buys:[],sells:[]};
      prodData[prod].bVol+=b.volume||0;
      prodData[prod].bVal+=(b.price||0)*(b.volume||0);
      prodData[prod].trades++;
      prodData[prod].buys.push(b);
    });

    // Process sells and calculate margins
    a.sells.forEach(s=>{
      const prod=s.product||'Unknown';
      if(!prodData[prod])prodData[prod]={product:prod,bVol:0,sVol:0,bVal:0,sVal:0,marginVol:0,marginVal:0,profit:0,trades:0,buys:[],sells:[]};

      const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
      const buy=ord?buyByOrder[ord]:null;
      const sellFrtPerMBF=s.volume>0?(s.freight||0)/s.volume:0;
      const fob=(s.price||0)-sellFrtPerMBF;

      prodData[prod].sVol+=s.volume||0;
      prodData[prod].sVal+=fob*(s.volume||0);
      prodData[prod].trades++;
      prodData[prod].sells.push(s);

      if(buy){
        const buyCost=buy.price||0;
        const margin=fob-buyCost;
        prodData[prod].marginVol+=s.volume||0;
        prodData[prod].marginVal+=margin*(s.volume||0);
        prodData[prod].profit+=margin*(s.volume||0);
      }
    });

    // Calculate derived metrics
    const products=Object.values(prodData).map(p=>({
      ...p,
      avgBuy:p.bVol>0?p.bVal/p.bVol:0,
      avgSell:p.sVol>0?p.sVal/p.sVol:0,
      avgMargin:p.marginVol>0?p.marginVal/p.marginVol:null,
      position:p.bVol-p.sVol,
      rlPrice:latestRL?(latestRL.west?.[p.product]||latestRL.central?.[p.product]||latestRL.east?.[p.product]):null
    }));

    // Find best/worst
    const withMargin=products.filter(p=>p.avgMargin!==null);
    const bestProduct=withMargin.length?withMargin.reduce((best,p)=>p.avgMargin>best.avgMargin?p:best):null;
    const worstProduct=withMargin.length?withMargin.reduce((worst,p)=>p.avgMargin<worst.avgMargin?p:worst):null;
    const totalProfit=products.reduce((s,p)=>s+p.profit,0);
    const totalVolume=products.reduce((s,p)=>s+p.bVol+p.sVol,0);

    // Product filter
    const prodFilter=S.prodFilter||{};
    let filteredProducts=products;
    if(prodFilter.showLong)filteredProducts=filteredProducts.filter(p=>p.position>0);
    if(prodFilter.showShort)filteredProducts=filteredProducts.filter(p=>p.position<0);
    if(prodFilter.showProfit)filteredProducts=filteredProducts.filter(p=>p.profit>0);
    if(prodFilter.showLoss)filteredProducts=filteredProducts.filter(p=>p.profit<0);

    // Sorting
    const prodSort=S.prodSort||{col:'profit',dir:'desc'};
    filteredProducts=[...filteredProducts].sort((x,y)=>{
      let av=x[prodSort.col],bv=y[prodSort.col];
      if(av===null)av=-Infinity;
      if(bv===null)bv=-Infinity;
      return prodSort.dir==='asc'?(av>bv?1:-1):(av<bv?1:-1);
    });

    const prodSortIcon=col=>prodSort.col===col?(prodSort.dir==='asc'?'▲':'▼'):'';
    const prodSortClick=col=>`onclick="toggleProdSort('${col}')" style="cursor:pointer"`;

    // Selected product for detail view
    const selectedProd=S.selectedProduct||null;
    const selectedData=selectedProd?prodData[selectedProd]:null;

    c.innerHTML=`
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">TOTAL PROFIT</div><div><span class="kpi-value ${totalProfit>=0?'positive':'negative'}">${fmt(Math.round(totalProfit))}</span></div></div>
        <div class="kpi"><div class="kpi-label">BEST PRODUCT</div><div><span class="kpi-value positive" style="font-size:14px">${bestProduct?.product||'—'}</span><span class="kpi-sub">${bestProduct?fmt(Math.round(bestProduct.avgMargin))+'/MBF':''}</span></div></div>
        <div class="kpi"><div class="kpi-label">WORST PRODUCT</div><div><span class="kpi-value negative" style="font-size:14px">${worstProduct?.product||'—'}</span><span class="kpi-sub">${worstProduct?fmt(Math.round(worstProduct.avgMargin))+'/MBF':''}</span></div></div>
        <div class="kpi"><div class="kpi-label">PRODUCTS TRADED</div><div><span class="kpi-value">${products.length}</span><span class="kpi-sub">${fmtN(totalVolume)} MBF</span></div></div>
      </div>

      <!-- Margin Bar Chart -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><span class="card-title">MARGIN BY PRODUCT</span></div>
        <div class="card-body">
          ${withMargin.length?`
          <div style="display:flex;flex-direction:column;gap:8px">
            ${withMargin.sort((a,b)=>b.avgMargin-a.avgMargin).slice(0,10).map(p=>{
              const maxMargin=Math.max(...withMargin.map(x=>Math.abs(x.avgMargin)))||1;
              const w=Math.abs(p.avgMargin)/maxMargin*100;
              const isPos=p.avgMargin>=0;
              return`<div style="display:flex;align-items:center;gap:8px">
                <div style="width:80px;font-size:11px;font-weight:500;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${p.product}">${p.product}</div>
                <div style="flex:1;height:20px;background:var(--panel-alt);border-radius:2px;overflow:hidden;display:flex;align-items:center;${isPos?'':'justify-content:flex-end'}">
                  <div style="width:${w}%;height:100%;background:${isPos?'var(--positive)':'var(--negative)'};border-radius:2px"></div>
                </div>
                <div style="width:60px;font-size:11px;font-weight:600;color:${isPos?'var(--positive)':'var(--negative)'}">${isPos?'+':''}${fmt(Math.round(p.avgMargin))}</div>
              </div>`;
            }).join('')}
          </div>
          `:'<div class="empty-state">No matched trades yet</div>'}
        </div>
      </div>

      <!-- Filters -->
      <div class="card" style="margin-bottom:16px;padding:12px">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <span style="color:var(--muted);font-size:11px">FILTERS:</span>
          <label style="font-size:11px;color:var(--warn)"><input type="checkbox" ${prodFilter.showLong?'checked':''} onchange="setProdFilter('showLong',this.checked)"> Long only</label>
          <label style="font-size:11px;color:var(--info)"><input type="checkbox" ${prodFilter.showShort?'checked':''} onchange="setProdFilter('showShort',this.checked)"> Short only</label>
          <label style="font-size:11px;color:var(--positive)"><input type="checkbox" ${prodFilter.showProfit?'checked':''} onchange="setProdFilter('showProfit',this.checked)"> Profitable only</label>
          <label style="font-size:11px;color:var(--negative)"><input type="checkbox" ${prodFilter.showLoss?'checked':''} onchange="setProdFilter('showLoss',this.checked)"> Losing only</label>
          <button class="btn btn-default btn-sm" onclick="S.prodFilter={};render()">Clear</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">PERFORMANCE BY PRODUCT</span><span style="color:var(--muted);font-size:10px">${filteredProducts.length} products</span></div>
        <div style="overflow-x:auto"><table><thead><tr>
          <th ${prodSortClick('product')}>Product ${prodSortIcon('product')}</th>
          <th class="right" ${prodSortClick('bVol')}>Buy Vol ${prodSortIcon('bVol')}</th>
          <th class="right" ${prodSortClick('sVol')}>Sell Vol ${prodSortIcon('sVol')}</th>
          <th class="right" ${prodSortClick('position')}>Position ${prodSortIcon('position')}</th>
          <th class="right" ${prodSortClick('avgBuy')}>Avg Buy ${prodSortIcon('avgBuy')}</th>
          <th class="right" ${prodSortClick('avgSell')}>Avg Sell ${prodSortIcon('avgSell')}</th>
          <th class="right">RL Mkt</th>
          <th class="right" ${prodSortClick('avgMargin')}>Margin ${prodSortIcon('avgMargin')}</th>
          <th class="right" ${prodSortClick('profit')}>Profit ${prodSortIcon('profit')}</th>
          <th></th>
        </tr></thead><tbody>
          ${filteredProducts.length?filteredProducts.map(p=>`<tr style="${selectedProd===p.product?'background:var(--panel-alt)':''}">
            <td class="bold">${p.product}</td>
            <td class="right">${fmtN(p.bVol)} MBF</td>
            <td class="right">${fmtN(p.sVol)} MBF</td>
            <td class="right ${p.position>0?'warn':p.position<0?'negative':''} bold">${p.position>0?'+':''}${fmtN(p.position)} MBF</td>
            <td class="right">${p.bVol?fmt(Math.round(p.avgBuy)):'—'}</td>
            <td class="right">${p.sVol?fmt(Math.round(p.avgSell)):'—'}</td>
            <td class="right" style="color:var(--accent)">${p.rlPrice?fmt(p.rlPrice):'—'}</td>
            <td class="right ${p.avgMargin===null?'':p.avgMargin>=0?'positive':'negative'} bold">${p.avgMargin!==null?fmt(Math.round(p.avgMargin)):'—'}</td>
            <td class="right ${p.profit>=0?'positive':'negative'} bold">${fmt(Math.round(p.profit))}</td>
            <td><button class="btn btn-default btn-sm" onclick="showProductDetail('${p.product.replace(/'/g,"\\'")}')">View</button></td>
          </tr>`).join(''):'<tr><td colspan="10" class="empty-state">No products match filters</td></tr>'}
        </tbody></table></div>
      </div>

      <!-- Product Detail Panel -->
      ${selectedData?`
      <div class="card" style="margin-top:16px;border-color:var(--accent)">
        <div class="card-header" style="background:var(--accent);color:var(--bg)">
          <span style="font-weight:700">${selectedProd} — Detail View</span>
          <button onclick="S.selectedProduct=null;render()" style="background:transparent;border:none;color:var(--bg);cursor:pointer;font-size:16px">×</button>
        </div>
        <div class="card-body">
          <div class="grid-2" style="margin-bottom:16px">
            <div>
              <h4 style="color:var(--positive);margin-bottom:8px;font-size:12px">BUYS (${selectedData.buys.length})</h4>
              <div style="max-height:200px;overflow-y:auto">
                <table style="font-size:10px"><thead><tr><th>Date</th><th>Mill</th><th class="right">Price</th><th class="right">Vol</th></tr></thead><tbody>
                  ${selectedData.buys.length?selectedData.buys.map(b=>`<tr><td>${fmtD(b.date)}</td><td>${b.mill||'—'}</td><td class="right">${fmt(b.price)}</td><td class="right">${fmtN(b.volume)}</td></tr>`).join(''):'<tr><td colspan="4" class="empty-state">No buys</td></tr>'}
                </tbody></table>
              </div>
            </div>
            <div>
              <h4 style="color:var(--accent);margin-bottom:8px;font-size:12px">SELLS (${selectedData.sells.length})</h4>
              <div style="max-height:200px;overflow-y:auto">
                <table style="font-size:10px"><thead><tr><th>Date</th><th>Customer</th><th class="right">Price</th><th class="right">Vol</th></tr></thead><tbody>
                  ${selectedData.sells.length?selectedData.sells.map(s=>`<tr><td>${fmtD(s.date)}</td><td>${s.customer||'—'}</td><td class="right">${fmt(s.price)}</td><td class="right">${fmtN(s.volume)}</td></tr>`).join(''):'<tr><td colspan="4" class="empty-state">No sells</td></tr>'}
                </tbody></table>
              </div>
            </div>
          </div>

          <!-- Price History Chart -->
          ${(()=>{
            const allTrades=[
              ...selectedData.buys.map(b=>({date:b.date,price:b.price,type:'buy'})),
              ...selectedData.sells.map(s=>({date:s.date,price:s.price,type:'sell'}))
            ].sort((a,b)=>new Date(a.date)-new Date(b.date));
            if(allTrades.length<2)return'<div style="color:var(--muted);font-size:11px">Not enough trades for price chart</div>';
            const prices=allTrades.map(t=>t.price);
            const minP=Math.min(...prices)-10;
            const maxP=Math.max(...prices)+10;
            const range=maxP-minP||1;
            return`
            <h4 style="color:var(--muted);margin-bottom:8px;font-size:12px">PRICE HISTORY</h4>
            <div style="display:flex;gap:2px;align-items:flex-end;height:80px;padding:8px 0;border:1px solid var(--border);border-radius:4px;background:var(--bg)">
              ${allTrades.slice(-20).map(t=>{
                const h=((t.price-minP)/range)*60+10;
                const color=t.type==='buy'?'var(--positive)':'var(--accent)';
                return`<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
                  <div style="width:80%;background:${color};height:${h}px;border-radius:2px 2px 0 0" title="${t.type}: $${t.price} on ${t.date}"></div>
                </div>`;
              }).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-top:4px">
              <span>${allTrades[0]?.date||''}</span>
              <span>
                <span style="color:var(--positive)">● Buy</span> &nbsp;
                <span style="color:var(--accent)">● Sell</span>
              </span>
              <span>${allTrades[allTrades.length-1]?.date||''}</span>
            </div>`;
          })()}
        </div>
      </div>
      `:''}

      <!-- Region Breakdown -->
      <div class="card" style="margin-top:16px">
        <div class="card-header"><span class="card-title">PURCHASES BY PRODUCT & REGION</span></div>
        <div class="card-body">
          ${(()=>{
            const byProdReg={};
            a.buys.forEach(b=>{
              const key=`${b.product}|${b.region||'west'}`;
              if(!byProdReg[key])byProdReg[key]={product:b.product,region:b.region||'west',vol:0};
              byProdReg[key].vol+=b.volume||0;
            });
            const list=Object.values(byProdReg).sort((a,b)=>b.vol-a.vol).slice(0,15);
            if(!list.length)return'<div class="empty-state">No data</div>';
            return`<table style="font-size:11px"><thead><tr><th>Product</th><th>Region</th><th class="right">Volume</th></tr></thead><tbody>
              ${list.map(r=>{
                const regColor=r.region==='west'?'accent':r.region==='central'?'warn':'info';
                return`<tr><td class="bold">${r.product}</td><td style="color:var(--${regColor});text-transform:capitalize">${r.region}</td><td class="right">${fmtN(r.vol)} MBF</td></tr>`;
              }).join('')}
            </tbody></table>`;
          })()}
        </div>
      </div>`;
  }
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
      <div style="display:flex;gap:4px;margin-bottom:16px;background:var(--panel);padding:4px;border-radius:4px">
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
        <div style="background:linear-gradient(135deg,rgba(224,82,82,0.1),rgba(232,115,74,0.1));border:1px solid var(--negative);border-radius:8px;padding:16px;margin-bottom:20px">
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
            <div style="background:var(--panel);border-left:4px solid var(--negative);padding:12px;border-radius:4px">
              <div style="font-weight:600;color:var(--negative);margin-bottom:8px;font-size:11px">🚨 CRITICAL: No contact 14+ days</div>
              ${staleCritical.slice(0,3).map(p=>`
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
                  <div>
                    <div style="font-weight:500;font-size:11px">${p.company_name}</div>
                    <div style="font-size:9px;color:var(--negative)">${p.days_since_touch} days since last touch</div>
                  </div>
                  <button class="btn btn-danger btn-sm" onclick="showTouchModal(${p.id})" style="font-size:9px;padding:4px 8px">📞 Call Now</button>
                </div>
              `).join('')}
              ${staleCritical.length>3?`<div style="font-size:10px;color:var(--muted);margin-top:8px">+${staleCritical.length-3} more...</div>`:''}
            </div>`:''}

            ${staleWarning.length?`
            <div style="background:var(--panel);border-left:4px solid var(--warn);padding:12px;border-radius:4px">
              <div style="font-weight:600;color:var(--warn);margin-bottom:8px;font-size:11px">⚠️ WARNING: No contact 7-13 days</div>
              ${staleWarning.slice(0,3).map(p=>`
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
                  <div>
                    <div style="font-weight:500;font-size:11px">${p.company_name}</div>
                    <div style="font-size:9px;color:var(--warn)">${p.days_since_touch} days since last touch</div>
                  </div>
                  <button class="btn btn-warn btn-sm" onclick="showTouchModal(${p.id})" style="font-size:9px;padding:4px 8px">📞 Follow Up</button>
                </div>
              `).join('')}
              ${staleWarning.length>3?`<div style="font-size:10px;color:var(--muted);margin-top:8px">+${staleWarning.length-3} more...</div>`:''}
            </div>`:''}

            ${neverContacted.length?`
            <div style="background:var(--panel);border-left:4px solid var(--info);padding:12px;border-radius:4px">
              <div style="font-weight:600;color:var(--info);margin-bottom:8px;font-size:11px">📭 NEVER CONTACTED</div>
              ${neverContacted.slice(0,3).map(p=>`
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
                  <div>
                    <div style="font-weight:500;font-size:11px">${p.company_name}</div>
                    <div style="font-size:9px;color:var(--info)">Added ${p.days_since_created} days ago</div>
                  </div>
                  <button class="btn btn-info btn-sm" onclick="showTouchModal(${p.id})" style="font-size:9px;padding:4px 8px">📞 First Call</button>
                </div>
              `).join('')}
              ${neverContacted.length>3?`<div style="font-size:10px;color:var(--muted);margin-top:8px">+${neverContacted.length-3} more...</div>`:''}
            </div>`:''}

            ${(S.crmOverdue||[]).length?`
            <div style="background:var(--panel);border-left:4px solid var(--negative);padding:12px;border-radius:4px">
              <div style="font-weight:600;color:var(--negative);margin-bottom:8px;font-size:11px">📅 OVERDUE FOLLOW-UPS</div>
              ${S.crmOverdue.slice(0,3).map(t=>`
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
                  <div>
                    <div style="font-weight:500;font-size:11px">${t.company_name}</div>
                    <div style="font-size:9px;color:var(--negative)">Due: ${t.follow_up_date}</div>
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
              <div style="display:flex;gap:2px;background:var(--bg);padding:2px;border-radius:6px">
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
                      <div class="kanban-card-title">${p.company_name}</div>
                      <div class="kanban-card-sub">${p.contact_name||'No contact'}</div>
                      <div class="kanban-card-meta"><span>${p.phone||''}</span><span style="color:var(--muted)">${p.updated_at?new Date(p.updated_at).toLocaleDateString():''}</span></div>
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
          <div style="overflow-x:auto">
            <table>
              <thead><tr><th>Company</th><th>Contact</th><th>Phone</th><th>Status</th><th>Last Touch</th><th>Actions</th></tr></thead>
              <tbody>
                ${prospects.length?prospects.filter(p=>!S.crmSearch||p.company_name.toLowerCase().includes((S.crmSearch||'').toLowerCase())||((p.contact_name||'')).toLowerCase().includes((S.crmSearch||'').toLowerCase())).map(p=>{
                  const statusBadge={prospect:'badge-pending',qualified:'badge-warn',converted:'badge-success',lost:'badge-danger'}[p.status]||'badge-pending';
                  return`<tr>
                    <td class="bold">${p.company_name}</td>
                    <td>${p.contact_name||'—'}</td>
                    <td>${p.phone||'—'}</td>
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
                  <div class="activity-main">${t.company_name}</div>
                  <div class="activity-sub">${t.touch_type}: ${(t.notes||'').substring(0,50)}${(t.notes||'').length>50?'...':''}</div>
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
      contentHTML=`
        <div class="card"><div class="card-header"><span class="card-title positive">${S.trader==='Admin'?'ALL CUSTOMERS':'MY CUSTOMERS'}</span><button class="btn btn-default btn-sm" onclick="showCustModal()">+ Add</button></div>
          <div style="overflow-x:auto"><table><thead><tr>${S.trader==='Admin'?'<th>👤</th>':''}<th>Customer</th><th>Locations</th><th>Trades</th><th>Volume</th><th></th></tr></thead><tbody>
            ${customers.length?customers.map(c=>{
              const locs=c.locations||[c.destination].filter(Boolean);
              const trades=S.trader==='Admin'?S.sells.filter(s=>s.customer===c.name):S.sells.filter(s=>s.customer===c.name&&(s.trader===S.trader||!s.trader));
              const vol=trades.reduce((s,x)=>s+(x.volume||0),0);
              return`<tr>${S.trader==='Admin'?`<td><span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${traderColor(c.trader||'Ian P')};color:var(--bg);font-size:9px;font-weight:700;text-align:center;line-height:18px" title="${c.trader||'Ian P'}">${traderInitial(c.trader||'Ian P')}</span></td>`:''}<td class="bold">${c.name}</td><td style="font-size:10px">${locs.length?locs.join(', '):'—'}</td><td class="right">${trades.length}</td><td class="right">${fmtN(vol)} MBF</td><td style="white-space:nowrap"><button class="btn btn-default btn-sm" onclick="editCust('${c.name}')">Edit</button> <button class="btn btn-default btn-sm" onclick="deleteCust('${c.name}')" style="color:var(--negative)">×</button></td></tr>`;
            }).join(''):`<tr><td colspan="${S.trader==='Admin'?6:5}" class="empty-state">No customers yet</td></tr>`}
          </tbody></table></div></div>
        <div class="card" style="margin-top:16px"><div class="card-header"><span class="card-title warn">CUSTOMER PROFITABILITY</span></div>
          <div style="overflow-x:auto"><table><thead><tr><th>Customer</th><th class="right">Trades</th><th class="right">Volume</th><th class="right">Avg Margin/MBF</th></tr></thead><tbody>
            ${Object.keys(custMargins).length?Object.entries(custMargins).filter(([c,d])=>d.vol>0).sort((x,y)=>(y[1].marginVal/y[1].vol)-(x[1].marginVal/x[1].vol)).map(([c,d])=>{
              const avgMargin=d.vol>0?d.marginVal/d.vol:0;
              return`<tr><td class="bold">${c}</td><td class="right">${d.n}</td><td class="right">${fmtN(d.vol)} MBF</td><td class="right ${avgMargin>=0?'positive':'negative'} bold">${fmt(Math.round(avgMargin))}</td></tr>`;
            }).join(''):'<tr><td colspan="4" class="empty-state">No linked sales yet</td></tr>'}
          </tbody></table></div></div>`;
    }
    else if(crmTab==='mills'){
      contentHTML=`
        <div class="card"><div class="card-header"><span class="card-title warn">${S.trader==='Admin'?'ALL MILLS':'MY MILLS'}</span><button class="btn btn-default btn-sm" onclick="showMillModal()">+ Add</button></div>
          <div style="overflow-x:auto"><table><thead><tr>${S.trader==='Admin'?'<th>👤</th>':''}<th>Mill</th><th>Locations</th><th>Last Quoted</th><th>Trades</th><th>Volume</th><th></th></tr></thead><tbody>
            ${mills.length?mills.map(m=>{
              const rawLocs=Array.isArray(m.locations)?m.locations:[];
              const locs=rawLocs.length?rawLocs.map(l=>typeof l==='string'?l:l.label||`${l.city}, ${l.state||''}`):[m.origin||m.location].filter(Boolean);
              const company=m.name;
              const trades=S.trader==='Admin'?S.buys.filter(b=>extractMillCompany(b.mill)===company):S.buys.filter(b=>extractMillCompany(b.mill)===company&&(b.trader===S.trader||!b.trader));
              const vol=trades.reduce((s,b)=>s+(b.volume||0),0);
              const lq=m.last_quoted;
              const lqAge=lq?Math.floor((new Date()-new Date(lq))/(1000*60*60*24)):null;
              const lqColor=lqAge===null?'var(--muted)':lqAge<=3?'var(--positive)':lqAge<=7?'var(--warn,var(--accent))':'var(--negative)';
              const lqLabel=lq?(lqAge===0?'Today':lqAge===1?'Yesterday':lqAge+'d ago'):'Never';
              const lqTitle=lq?`${lq} (${m.quote_count||0} quotes)`:'No quotes on file';
              return`<tr>${S.trader==='Admin'?`<td><span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${traderColor(m.trader||'Ian P')};color:var(--bg);font-size:9px;font-weight:700;text-align:center;line-height:18px" title="${m.trader||'Ian P'}">${traderInitial(m.trader||'Ian P')}</span></td>`:''}<td class="bold">${m.name}</td><td style="font-size:10px">${locs.length?locs.join(', '):'—'}</td><td style="font-size:10px;color:${lqColor}" title="${lqTitle}">${lqLabel}</td><td class="right">${trades.length}</td><td class="right">${fmtN(vol)} MBF</td><td style="white-space:nowrap"><button class="btn btn-default btn-sm" onclick="editMill('${m.name}')">Edit</button> <button class="btn btn-default btn-sm" onclick="deleteMill('${m.name}')" style="color:var(--negative)">×</button></td></tr>`;
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
  else if(S.view==='rldata'){
    // Combined RL Data & Charts View
    const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
    const prevRL=S.rl.length>1?S.rl[S.rl.length-2]:null;
    const rlData=S.rl.slice(-12); // Last 12 weeks for charts

    // Charts HTML
    let chartsHTML='';
    if(rlData.length>0){
      const chartProduct=S.chartProduct||'2x4#2';
      const products=['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2','2x4#1','2x6#1'];
      const chartLabels=rlData.map(r=>r.date?.split('/').slice(0,2).join('/')||'');
      const westData=rlData.map(r=>r.west?.[chartProduct]||0);
      const centralData=rlData.map(r=>r.central?.[chartProduct]||0);
      const eastData=rlData.map(r=>r.east?.[chartProduct]||0);
      const spread2x4_2x6=rlData.map(r=>(r.west?.['2x6#2']||0)-(r.west?.['2x4#2']||0));
      const spreadWestCentral=rlData.map(r=>(r.west?.[chartProduct]||0)-(r.central?.[chartProduct]||0));
      const allPrices=[...westData,...centralData,...eastData].filter(p=>p>0);
      const minPrice=allPrices.length?Math.floor(Math.min(...allPrices)/10)*10-10:350;
      const maxPrice=allPrices.length?Math.ceil(Math.max(...allPrices)/10)*10+10:500;
      const range=maxPrice-minPrice||100;
      window._chartData={westData,centralData,eastData,minPrice,range,spread2x4_2x6,spreadWestCentral};

      chartsHTML=`
        <div class="card" style="margin-bottom:16px">
          <div class="card-header">
            <span class="card-title">📈 SYP PRICE TRENDS</span>
            <div style="display:flex;align-items:center;gap:12px">
              <select id="chart-product" onchange="S.chartProduct=this.value;render()" style="padding:4px 8px;font-size:11px;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:4px">
                ${products.map(p=>`<option value="${p}" ${p===chartProduct?'selected':''}>${p}</option>`).join('')}
              </select>
              <span style="font-size:10px;color:var(--muted)">${rlData.length} weeks</span>
            </div>
          </div>
          <div class="card-body">
            ${rlData.length>1?`
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
                  ${chartLabels.filter((l,i)=>i%Math.ceil(chartLabels.length/6)===0||i===chartLabels.length-1).map(l=>`<span>${l}</span>`).join('')}
                </div>
              </div>
              <div style="display:flex;justify-content:center;gap:24px;font-size:11px">
                <span><span style="display:inline-block;width:16px;height:3px;background:#5b8af5;margin-right:6px;border-radius:2px"></span>West</span>
                <span><span style="display:inline-block;width:16px;height:3px;background:#e8734a;margin-right:6px;border-radius:2px"></span>Central</span>
                <span><span style="display:inline-block;width:16px;height:3px;background:#6e9ecf;margin-right:6px;border-radius:2px"></span>East</span>
              </div>
            `:'<div class="empty-state">Need at least 2 weeks of data for charts</div>'}
          </div>
        </div>
        <div class="grid-2">
          <div class="card">
            <div class="card-header"><span class="card-title warn">📐 2x4/2x6 SPREAD (West)</span></div>
            <div class="card-body">
              ${rlData.length>1?`
                <div style="height:120px;position:relative;margin-bottom:8px">
                  <canvas id="spread-canvas" style="width:100%;height:100%"></canvas>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted)">
                  ${chartLabels.filter((l,i)=>i%3===0).map(l=>`<span>${l}</span>`).join('')}
                </div>
                <div style="text-align:center;margin-top:12px">
                  <span style="font-size:20px;font-weight:700;color:var(--warn)">$${spread2x4_2x6[spread2x4_2x6.length-1]||0}</span>
                  <div style="font-size:10px;color:var(--muted)">Current Spread</div>
                </div>
              `:'<div class="empty-state">Need data</div>'}
            </div>
          </div>
          <div class="card">
            <div class="card-header"><span class="card-title info">🗺️ WEST vs CENTRAL (${chartProduct})</span></div>
            <div class="card-body">
              ${rlData.length>1?`
                <div style="height:120px;position:relative;margin-bottom:8px">
                  <canvas id="regional-canvas" style="width:100%;height:100%"></canvas>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted)">
                  ${chartLabels.filter((l,i)=>i%3===0).map(l=>`<span>${l}</span>`).join('')}
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
          <div class="card-header"><span class="card-title">📊 SPREAD MONITOR</span></div>
          <div class="card-body">
            <table>
              <thead><tr><th>Spread</th><th>Region</th><th class="right">Current</th><th class="right">4-Wk Avg</th><th class="right">12-Wk Avg</th><th class="right">vs Avg</th></tr></thead>
              <tbody>${generateSpreadTable(rlData)}</tbody>
            </table>
          </div>
        </div>
        <div class="card" style="margin-top:16px">
          <div class="card-header"><span class="card-title">📜 PRICE HISTORY</span></div>
          <div class="card-body" style="max-height:300px;overflow:auto">
            <table>
              <thead><tr><th>Date</th><th class="right">W 2x4</th><th class="right">W 2x6</th><th class="right">C 2x4</th><th class="right">C 2x6</th><th class="right">E 2x4</th><th class="right">E 2x6</th></tr></thead>
              <tbody>
                ${rlData.slice().reverse().map(r=>`<tr>
                  <td>${r.date||'—'}</td>
                  <td class="right">${r.west?.['2x4#2']?'$'+r.west['2x4#2']:'—'}</td>
                  <td class="right">${r.west?.['2x6#2']?'$'+r.west['2x6#2']:'—'}</td>
                  <td class="right">${r.central?.['2x4#2']?'$'+r.central['2x4#2']:'—'}</td>
                  <td class="right">${r.central?.['2x6#2']?'$'+r.central['2x6#2']:'—'}</td>
                  <td class="right">${r.east?.['2x4#2']?'$'+r.east['2x4#2']:'—'}</td>
                  <td class="right">${r.east?.['2x6#2']?'$'+r.east['2x6#2']:'—'}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    }else{
      chartsHTML='<div class="card"><div class="card-body"><div class="empty-state">No data yet. Import a Random Lengths PDF to get started.</div></div></div>';
    }

    // Calculate spreads if we have data
    let spreadsHTML='';
    if(latestRL){
      const region=S.filters.reg!=='all'?S.filters.reg:'west';
      const sl=latestRL.specified_lengths?.[region]||{};
      
      // Length spreads (16' as base)
      const lengthSpreads=[];
      Object.entries(sl).forEach(([prod,lengths])=>{
        if(lengths['16']){
          const base=lengths['16'];
          ['8','10','12','14','18','20'].forEach(len=>{
            if(lengths[len]){
              lengthSpreads.push({prod,len,base,price:lengths[len],spread:lengths[len]-base});
            }
          });
        }
      });
      
      // Dimension spreads (2x4 as base for each length)
      const dimSpreads=[];
      ['8','10','12','14','16','18','20'].forEach(len=>{
        const base2x4=sl['2x4#2']?.[len]||sl['2x4#1']?.[len];
        if(base2x4){
          ['2x6','2x8','2x10','2x12'].forEach(dim=>{
            const price=sl[dim+'#2']?.[len]||sl[dim+'#1']?.[len];
            if(price)dimSpreads.push({len,dim,base:base2x4,price,spread:price-base2x4});
          });
        }
      });
      
      // Grade spreads (#1 vs #2)
      const gradeSpreads=[];
      ['2x4','2x6','2x8','2x10','2x12'].forEach(dim=>{
        ['8','10','12','14','16','18','20'].forEach(len=>{
          const p1=sl[dim+'#1']?.[len];
          const p2=sl[dim+'#2']?.[len];
          if(p1&&p2)gradeSpreads.push({dim,len,p1,p2,spread:p1-p2});
        });
      });
      
      // Week-over-week changes
      let wowHTML='';
      if(prevRL){
        const changes=[];
        ['west','central','east'].forEach(reg=>{
          ['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2'].forEach(prod=>{
            const curr=latestRL[reg]?.[prod];
            const prev=prevRL[reg]?.[prod];
            if(curr&&prev&&curr!==prev){
              changes.push({reg,prod,curr,prev,chg:curr-prev});
            }
          });
        });
        if(changes.length){
          wowHTML=`<div class="card"><div class="card-header"><span class="card-title">WEEK-OVER-WEEK CHANGES</span><span style="color:var(--muted);font-size:10px">${prevRL.date} → ${latestRL.date}</span></div>
            <div style="overflow-x:auto"><table><thead><tr><th>Region</th><th>Product</th><th class="right">Prev</th><th class="right">Curr</th><th class="right">Change</th></tr></thead><tbody>
            ${changes.map(c=>`<tr><td style="text-transform:capitalize">${c.reg}</td><td class="bold">${c.prod}</td><td class="right">${fmt(c.prev)}</td><td class="right">${fmt(c.curr)}</td><td class="right ${c.chg>0?'positive':'negative'} bold">${c.chg>0?'+':''}${fmt(c.chg)}</td></tr>`).join('')}
            </tbody></table></div></div>`;
        }
      }
      
      spreadsHTML=`
        ${wowHTML}
        <div class="grid-2">
          <div class="card"><div class="card-header"><span class="card-title accent">LENGTH SPREADS (vs 16')</span><span style="color:var(--muted);font-size:10px">${region}</span></div>
            <div style="overflow-x:auto;max-height:300px"><table><thead><tr><th>Product</th><th>Length</th><th class="right">16' Base</th><th class="right">Price</th><th class="right">Spread</th></tr></thead><tbody>
            ${lengthSpreads.length?lengthSpreads.slice(0,20).map(s=>`<tr><td>${s.prod}</td><td>${s.len}'</td><td class="right" style="color:var(--muted)">${fmt(s.base)}</td><td class="right">${fmt(s.price)}</td><td class="right ${s.spread>=0?'positive':'negative'} bold">${s.spread>=0?'+':''}${fmt(s.spread)}</td></tr>`).join(''):'<tr><td colspan="5" class="empty-state">No data</td></tr>'}
            </tbody></table></div></div>
          <div class="card"><div class="card-header"><span class="card-title warn">DIMENSION SPREADS (vs 2x4)</span><span style="color:var(--muted);font-size:10px">${region}</span></div>
            <div style="overflow-x:auto;max-height:300px"><table><thead><tr><th>Length</th><th>Dim</th><th class="right">2x4 Base</th><th class="right">Price</th><th class="right">Spread</th></tr></thead><tbody>
            ${dimSpreads.length?dimSpreads.slice(0,20).map(s=>`<tr><td>${s.len}'</td><td class="bold">${s.dim}</td><td class="right" style="color:var(--muted)">${fmt(s.base)}</td><td class="right">${fmt(s.price)}</td><td class="right ${s.spread>=0?'positive':'negative'} bold">+${fmt(s.spread)}</td></tr>`).join(''):'<tr><td colspan="5" class="empty-state">No data</td></tr>'}
            </tbody></table></div></div>
        </div>
        <div class="card"><div class="card-header"><span class="card-title">GRADE SPREADS (#1 vs #2)</span><span style="color:var(--muted);font-size:10px">${region}</span></div>
          <div style="overflow-x:auto"><table><thead><tr><th>Dim</th><th>Len</th><th class="right">#1</th><th class="right">#2</th><th class="right">#1 Premium</th></tr></thead><tbody>
          ${gradeSpreads.length?gradeSpreads.slice(0,15).map(s=>`<tr><td class="bold">${s.dim}</td><td>${s.len}'</td><td class="right accent">${fmt(s.p1)}</td><td class="right">${fmt(s.p2)}</td><td class="right positive bold">+${fmt(s.spread)}</td></tr>`).join(''):'<tr><td colspan="5" class="empty-state">No data</td></tr>'}
          </tbody></table></div></div>`;
    }
    
    // Build product list for comparison
    const allProducts=new Set();
    S.rl.forEach(r=>{
      ['west','central','east'].forEach(reg=>{
        if(r[reg])Object.keys(r[reg]).forEach(p=>allProducts.add(p));
        if(r.specified_lengths?.[reg])Object.keys(r.specified_lengths[reg]).forEach(p=>allProducts.add(p));
      });
    });
    const productList=[...allProducts].sort();
    
    // Historical comparison view
    let compareHTML='';
    if(S.rl.length>0){
      const region=S.filters.reg!=='all'?S.filters.reg:'west';
      const prod1=S.compareProd1||'2x4#2';
      const prod2=S.compareProd2||'2x6#2';
      const len=S.compareLen||'16';
      
      // Build history for selected products
      const history=S.rl.map(r=>{
        let p1=null,p2=null;
        // Try specified lengths first
        if(r.specified_lengths?.[region]?.[prod1]?.[len]){
          p1=r.specified_lengths[region][prod1][len];
        }else if(r[region]?.[prod1]){
          p1=r[region][prod1];
        }
        if(r.specified_lengths?.[region]?.[prod2]?.[len]){
          p2=r.specified_lengths[region][prod2][len];
        }else if(r[region]?.[prod2]){
          p2=r[region][prod2];
        }
        return{date:r.date,p1,p2,spread:p1&&p2?p2-p1:null};
      }).filter(h=>h.p1||h.p2);
      
      compareHTML=`
        <div class="card"><div class="card-header"><span class="card-title info">HISTORICAL SPREAD COMPARISON</span></div>
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
                  <option value="8" ${len==='8'?'selected':''}>8'</option>
                  <option value="10" ${len==='10'?'selected':''}>10'</option>
                  <option value="12" ${len==='12'?'selected':''}>12'</option>
                  <option value="14" ${len==='14'?'selected':''}>14'</option>
                  <option value="16" ${len==='16'?'selected':''}>16'</option>
                  <option value="18" ${len==='18'?'selected':''}>18'</option>
                  <option value="20" ${len==='20'?'selected':''}>20'</option>
                  <option value="composite" ${len==='composite'?'selected':''}>Composite</option>
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
            <div style="overflow-x:auto"><table><thead><tr><th>Date</th><th class="right">${prod1}</th><th class="right">${prod2}</th><th class="right">Spread (${prod2} - ${prod1})</th></tr></thead><tbody>
              ${history.length?history.slice().reverse().map(h=>`<tr><td>${h.date}</td><td class="right">${h.p1?fmt(h.p1):'—'}</td><td class="right">${h.p2?fmt(h.p2):'—'}</td><td class="right ${h.spread===null?'':(h.spread>=0?'positive':'negative')} bold">${h.spread!==null?(h.spread>=0?'+':'')+fmt(h.spread):'—'}</td></tr>`).join(''):'<tr><td colspan="4" class="empty-state">No data for selected products</td></tr>'}
            </tbody></table></div>
            ${history.length>1?`
              <div style="margin-top:16px;padding:12px;background:var(--bg);border:1px solid var(--border)">
                <div style="display:flex;gap:24px;flex-wrap:wrap">
                  <div><span style="color:var(--muted)">Avg Spread:</span> <span class="bold ${(history.reduce((s,h)=>s+(h.spread||0),0)/history.filter(h=>h.spread!==null).length)>=0?'positive':'negative'}">${fmt(Math.round(history.reduce((s,h)=>s+(h.spread||0),0)/history.filter(h=>h.spread!==null).length))}</span></div>
                  <div><span style="color:var(--muted)">Min:</span> <span class="bold">${fmt(Math.min(...history.filter(h=>h.spread!==null).map(h=>h.spread)))}</span></div>
                  <div><span style="color:var(--muted)">Max:</span> <span class="bold">${fmt(Math.max(...history.filter(h=>h.spread!==null).map(h=>h.spread)))}</span></div>
                  <div><span style="color:var(--muted)">Current:</span> <span class="bold accent">${history.length&&history[history.length-1].spread!==null?fmt(history[history.length-1].spread):'—'}</span></div>
                </div>
              </div>
            `:''}
          </div>
        </div>`;
    }
    
    // Date selector tabs
    const dateTabs=S.rl.slice().reverse().map(r=>`<button class="btn ${S.rlViewDate===r.date?'btn-primary':'btn-default'} btn-sm" onclick="S.rlViewDate='${r.date}';render()" style="margin-right:4px">${r.date}</button>`).join('');
    
    // Get selected RL report
    const selectedRL=S.rlViewDate?S.rl.find(r=>r.date===S.rlViewDate):latestRL;
    
    let detailHTML='';
    if(selectedRL){
      detailHTML=`<div class="card"><div class="card-header"><span class="card-title">${selectedRL.date} DETAILS</span><button class="btn btn-danger btn-sm" onclick="delRL('${selectedRL.date}')">Delete</button></div><div class="card-body">`;
      
      // Composite prices
      if(selectedRL.west||selectedRL.central||selectedRL.east){
        detailHTML+=`<div style="font-weight:600;color:var(--accent);margin-bottom:8px">COMPOSITE PRICES</div>
          <table style="width:100%;font-size:10px;margin-bottom:16px">
          <tr><th>Product</th><th class="right" style="color:var(--accent)">West</th><th class="right" style="color:var(--warn)">Central</th><th class="right" style="color:var(--info)">East</th></tr>
          ${['2x4#1','2x4#2','2x6#1','2x6#2','2x8#2','2x10#2','2x12#2'].map(p=>`<tr><td>${p}</td><td class="right">${selectedRL.west?.[p]?'$'+selectedRL.west[p]:'—'}</td><td class="right">${selectedRL.central?.[p]?'$'+selectedRL.central[p]:'—'}</td><td class="right">${selectedRL.east?.[p]?'$'+selectedRL.east[p]:'—'}</td></tr>`).join('')}
          </table>`;
      }
      
      // Specified lengths
      if(selectedRL.specified_lengths){
        ['west','central','east'].forEach(region=>{
          if(selectedRL.specified_lengths[region]&&Object.keys(selectedRL.specified_lengths[region]).length>0){
            const regionColor={west:'var(--accent)',central:'var(--warn)',east:'var(--info)'}[region];
            detailHTML+=`<div style="font-weight:600;color:${regionColor};margin:12px 0 8px;text-transform:uppercase">${region} - SPECIFIED LENGTHS</div>
              <div style="overflow-x:auto"><table style="width:100%;font-size:10px;margin-bottom:12px">
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
    
    c.innerHTML=`
      <div style="margin-bottom:16px;display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap">
        <div style="display:flex;gap:8px;align-items:center">
          <span style="color:var(--muted);font-size:11px">DATES:</span>
          <div style="display:flex;flex-wrap:wrap;gap:4px">${dateTabs||'<span style="color:var(--muted)">No data</span>'}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-warn" onclick="showParseModal()">📄 Import PDF</button>
          <button class="btn btn-primary" onclick="showRLModal()">+ Manual Entry</button>
        </div>
      </div>
      ${S.rl.length===0?`<div class="card"><div class="card-body"><div class="empty-state">No RL data yet. Import a Random Lengths PDF to get started.</div></div></div>`:`
        <div style="margin-bottom:16px">
          <div style="display:flex;gap:8px;margin-bottom:12px">
            <button class="btn ${!S.rlTab||S.rlTab==='charts'?'btn-primary':'btn-default'} btn-sm" onclick="S.rlTab='charts';render()">📈 Charts</button>
            <button class="btn ${S.rlTab==='analytics'?'btn-primary':'btn-default'} btn-sm" onclick="S.rlTab='analytics';render()">📊 Analytics</button>
            <button class="btn ${S.rlTab==='compare'?'btn-primary':'btn-default'} btn-sm" onclick="S.rlTab='compare';render()">🔀 Compare</button>
            <button class="btn ${S.rlTab==='details'?'btn-primary':'btn-default'} btn-sm" onclick="S.rlTab='details';render()">📋 Details</button>
          </div>
        </div>
        ${!S.rlTab||S.rlTab==='charts'?chartsHTML:(S.rlTab==='analytics'?spreadsHTML:(S.rlTab==='compare'?compareHTML:detailHTML))}
      `}`;
  }
  else if(S.view==='mill-pricing'){
    renderMillPricing();
  }
  else if(S.view==='mi-intake'){
    renderMiIntake();
  }
  else if(S.view==='mi-prices'){
    renderMiAggregated();
  }
  else if(S.view==='mi-intel'){
    renderMiIntelligence();
  }
  else if(S.view==='mi-quotes'){
    renderMiSmartQuotes();
  }
  else if(S.view==='pnl-calendar'){
    c.innerHTML=renderPnLCalendar();
    setTimeout(()=>{
      const dailyPnL=calcDailyPnL();
      const month=S.calendarMonth||today().slice(0,7);
      const yr=parseInt(month.split('-')[0]),mo=parseInt(month.split('-')[1]);
      const daysInMonth=new Date(yr,mo,0).getDate();
      const labels=[],data=[];
      for(let d=1;d<=daysInMonth;d++){
        const key=`${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        labels.push(String(d));
        data.push(dailyPnL[key]?Math.round(dailyPnL[key].total):0);
      }
      renderPnLBarChart(labels,data);
    },10);
  }
  else if(S.view==='settings'){
    const sbUrl=LS('supabaseUrl','')||DEFAULT_SUPABASE_URL;
    const sbKey=LS('supabaseKey','')||DEFAULT_SUPABASE_KEY;
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
        <div style="margin-bottom:16px;padding:12px;background:rgba(0,200,150,0.1);border:1px solid ${traderColor(S.trader)};border-radius:4px">
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
        <div style="margin-bottom:16px;padding:12px;background:rgba(74,158,110,0.1);border:1px solid var(--positive);border-radius:4px">
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
        <div style="margin-bottom:16px;padding:12px;background:rgba(110,158,207,0.1);border:1px solid var(--info);border-radius:4px">
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
          <button class="btn btn-danger" onclick="clearAll()">🗑️ Clear All Data</button>
        </div>
      </div></div>`;
  }
  
  // Draw charts after DOM update
  if(S.view==='rldata'&&(!S.rlTab||S.rlTab==='charts'))setTimeout(drawCharts,10);
  if(S.view==='dashboard'){
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
