// SYP Analytics - Chart Functions
// Chart.js integration + legacy canvas chart helpers

// Chart instance management (prevent memory leaks on re-render)
window._charts={};
function destroyChart(id){if(window._charts[id]){window._charts[id].destroy();delete window._charts[id]}}
function destroyAllCharts(){Object.keys(window._charts).forEach(destroyChart)}

// SYP Forward Curve chart — plots contract prices across months
function renderForwardCurveChart(){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById('syp-curve-chart');
  if(!ctx||!S.futuresContracts||!S.futuresContracts.length)return;
  destroyChart('syp-curve');
  const rl=S.rl.length?S.rl[S.rl.length-1]:null;
  const cashPrice=(rl&&rl.east&&rl.east['2x4#2'])||0;
  const labels=S.futuresContracts.map(c=>c.month);
  const prices=S.futuresContracts.map(c=>c.price);
  const datasets=[{
    label:'Futures Price',data:prices,borderColor:'#f5a623',backgroundColor:'rgba(245,166,35,0.15)',tension:0.3,fill:true,pointRadius:5,pointBackgroundColor:'#f5a623',borderWidth:2.5
  }];
  // Add cash price line if available
  if(cashPrice){
    datasets.push({
      label:'Cash (East 2x4#2)',data:labels.map(()=>cashPrice),borderColor:'#3b82f6',borderWidth:2,borderDash:[6,4],pointRadius:0,fill:false
    });
  }
  window._charts['syp-curve']=new Chart(ctx,{
    type:'line',
    data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#6b7c93',font:{size:11,family:'Inter'}}},tooltip:{mode:'index',intersect:false,backgroundColor:'#1a2535',titleColor:'#e8eaed',bodyColor:'#e8eaed',borderColor:'#1e3a5f',borderWidth:1}},scales:{x:{ticks:{color:'#6b7c93',font:{size:11}},grid:{color:'rgba(255,255,255,0.05)'}},y:{ticks:{color:'#6b7c93',font:{size:10},callback:v=>'$'+v},grid:{color:'rgba(255,255,255,0.05)'}}}}
  });
}

// Live SYP daily price chart with volume — uses persisted front history as fallback
function renderLivePriceChart(){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById('syp-live-price-chart');
  if(!ctx)return;
  destroyChart('syp-live-price');
  const history=getFrontHistory();
  if(history.length<2)return;
  const labels=history.map(h=>{const d=new Date(h.timestamp*1000);return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})});
  const prices=history.map(h=>h.close);
  const volumes=history.map(h=>h.volume||null);
  const hasVol=volumes.some(v=>v&&v>0);
  const datasets=[{label:'SYP Front Month',data:prices,borderColor:'#f5a623',backgroundColor:'rgba(245,166,35,0.1)',tension:0.3,fill:true,pointRadius:0,borderWidth:2.5,yAxisID:'y'}];
  if(hasVol){
    datasets.push({label:'Volume',data:volumes,type:'bar',backgroundColor:'rgba(255,255,255,0.08)',borderColor:'rgba(255,255,255,0.15)',borderWidth:1,yAxisID:'yVol',barPercentage:0.8,categoryPercentage:1.0,order:10});
  }
  const scales={x:{ticks:{color:'#6b7c93',font:{size:10},maxTicksLimit:12},grid:{color:'rgba(255,255,255,0.05)'}},y:{ticks:{color:'#6b7c93',font:{size:10},callback:v=>'$'+v},grid:{color:'rgba(255,255,255,0.05)'}}};
  if(hasVol)scales.yVol={display:false,beginAtZero:true,max:Math.max(...volumes.filter(Boolean))*4};
  window._charts['syp-live-price']=new Chart(ctx,{
    type:'line',
    data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#6b7c93',font:{size:11,family:'Inter'},filter:item=>item.text!=='Volume'}},tooltip:{mode:'index',intersect:false,backgroundColor:'#1a2535',titleColor:'#e8eaed',bodyColor:'#e8eaed',borderColor:'#1e3a5f',borderWidth:1,callbacks:{label:function(ctx){if(ctx.dataset.label==='Volume')return'Vol: '+(ctx.parsed.y?ctx.parsed.y.toLocaleString():'—');return'$'+ctx.parsed.y+'/MBF'}}}},scales}
  });
}

// Cash vs Futures over time — daily resolution from front-month history
function renderCashVsFuturesChart(){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById('syp-cash-fut-chart');
  if(!ctx)return;
  destroyChart('syp-cash-fut');
  const daily=getDailyBasis();
  if(daily.length<2)return;
  const nearestFut=S.futuresContracts&&S.futuresContracts.length?S.futuresContracts[0]:null;
  const labels=daily.map(d=>fmtD(d.date));
  const futData=daily.map(d=>d.futPrice);
  const hasCash=daily.some(d=>d.cash!==null);
  const datasets=[
    {label:(nearestFut?nearestFut.month:'SYP')+' Futures',data:futData,borderColor:'#f5a623',backgroundColor:'rgba(245,166,35,0.1)',tension:0.3,fill:false,pointRadius:0,borderWidth:2.5}
  ];
  if(hasCash){
    datasets.push({label:'Cash (East 2x4#2)',data:daily.map(d=>d.cash),borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.1)',tension:0.3,fill:false,pointRadius:0,borderWidth:2});
    datasets.push({label:'Basis',data:daily.map(d=>d.basis!==null?Math.round(d.basis):null),borderColor:'#00d4aa',backgroundColor:'rgba(0,212,170,0.1)',tension:0.3,fill:true,pointRadius:0,borderWidth:2,yAxisID:'y1'});
  }
  const scales={x:{ticks:{color:'#6b7c93',font:{size:9},maxTicksLimit:12,maxRotation:45},grid:{color:'rgba(255,255,255,0.05)'}},y:{position:'left',ticks:{color:'#6b7c93',font:{size:10},callback:v=>'$'+v},grid:{color:'rgba(255,255,255,0.05)'}}};
  if(hasCash)scales.y1={position:'right',ticks:{color:'#00d4aa',font:{size:10},callback:v=>'$'+v},grid:{display:false}};
  window._charts['syp-cash-fut']=new Chart(ctx,{
    type:'line',
    data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#6b7c93',font:{size:10,family:'Inter'}}},tooltip:{mode:'index',intersect:false,backgroundColor:'#1a2535',titleColor:'#e8eaed',bodyColor:'#e8eaed'}},scales}
  });
}

// Chart.js dashboard charts
function renderDashboardCharts(){
  if(typeof Chart==='undefined')return;
  // Price trend chart
  const ctx=document.getElementById('dashboard-price-chart');
  if(!ctx||!S.rl||!S.rl.length)return;
  destroyChart('price-trend');
  const labels=S.rl.slice(-12).map(r=>fmtD(r.date));
  window._charts['price-trend']=new Chart(ctx,{
    type:'line',
    data:{labels,datasets:[
      {label:'West',data:S.rl.slice(-12).map(r=>(r.west&&r.west['2x4#2'])||null),borderColor:'#00d4aa',backgroundColor:'rgba(0,212,170,0.1)',tension:0.3,fill:true,pointRadius:3,borderWidth:2},
      {label:'Central',data:S.rl.slice(-12).map(r=>(r.central&&r.central['2x4#2'])||null),borderColor:'#f5a623',backgroundColor:'rgba(245,166,35,0.1)',tension:0.3,fill:true,pointRadius:3,borderWidth:2},
      {label:'East',data:S.rl.slice(-12).map(r=>(r.east&&r.east['2x4#2'])||null),borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.1)',tension:0.3,fill:true,pointRadius:3,borderWidth:2}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#6b7c93',font:{size:11,family:'Inter'}}},tooltip:{mode:'index',intersect:false,backgroundColor:'#1a2535',titleColor:'#e8eaed',bodyColor:'#e8eaed',borderColor:'#1e3a5f',borderWidth:1}},scales:{x:{ticks:{color:'#6b7c93',font:{size:10}},grid:{color:'rgba(255,255,255,0.05)'}},y:{ticks:{color:'#6b7c93',font:{size:10},callback:v=>'$'+v},grid:{color:'rgba(255,255,255,0.05)'}}}}
  });
}

function renderWeeklyChart(){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById('weekly-perf-chart');
  if(!ctx)return;
  destroyChart('weekly-perf');
  const a=analytics();
  if(!a.weeklyPerf||!a.weeklyPerf.length)return;
  const wp=a.weeklyPerf.slice(-8);
  window._charts['weekly-perf']=new Chart(ctx,{
    type:'bar',
    data:{labels:wp.map(w=>w.label),datasets:[
      {label:'Buys (MBF)',data:wp.map(w=>w.bVol),backgroundColor:'rgba(0,212,170,0.6)',borderRadius:4},
      {label:'Sells (MBF)',data:wp.map(w=>w.sVol),backgroundColor:'rgba(59,130,246,0.6)',borderRadius:4}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#6b7c93',font:{size:11,family:'Inter'}}}},scales:{x:{ticks:{color:'#6b7c93',font:{size:10}},grid:{display:false}},y:{ticks:{color:'#6b7c93',font:{size:10}},grid:{color:'rgba(255,255,255,0.05)'}}}}
  });
}

function drawSparkline(canvasId,data,color){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById(canvasId);
  if(!ctx||!data||!data.length)return;
  destroyChart('spark-'+canvasId);
  window._charts['spark-'+canvasId]=new Chart(ctx,{
    type:'line',
    data:{labels:data.map((_,i)=>i),datasets:[{data,borderColor:color||'#00d4aa',borderWidth:1.5,pointRadius:0,fill:false,tension:0.4}]},
    options:{responsive:false,plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{display:false},y:{display:false}},animation:false}
  });
}

// Legacy canvas chart helpers (for RL Data view)
// Draw canvas charts (called after render for charts view)
function drawCharts(){
  const data=window._chartData;
  if(!data)return;
  
  // Main price chart
  const priceCanvas=document.getElementById('price-canvas');
  if(priceCanvas){
    const ctx=priceCanvas.getContext('2d');
    const rect=priceCanvas.getBoundingClientRect();
    priceCanvas.width=rect.width*2;
    priceCanvas.height=rect.height*2;
    ctx.scale(2,2);
    const w=rect.width,h=rect.height;
    
    function drawLine(vals,color){
      const valid=vals.map((v,i)=>({v,i})).filter(p=>p.v>0);
      if(valid.length<2)return;
      ctx.beginPath();
      ctx.strokeStyle=color;
      ctx.lineWidth=2.5;
      ctx.lineJoin='round';
      ctx.lineCap='round';
      valid.forEach((p,idx)=>{
        const x=(p.i/(vals.length-1))*w;
        const y=h-((p.v-data.minPrice)/data.range)*h;
        if(idx===0)ctx.moveTo(x,y);
        else ctx.lineTo(x,y);
      });
      ctx.stroke();
      // Draw dots
      valid.forEach(p=>{
        const x=(p.i/(vals.length-1))*w;
        const y=h-((p.v-data.minPrice)/data.range)*h;
        ctx.beginPath();
        ctx.arc(x,y,4,0,Math.PI*2);
        ctx.fillStyle=color;
        ctx.fill();
      });
    }
    drawLine(data.westData,'#00c896');
    drawLine(data.centralData,'#f5a623');
    drawLine(data.eastData,'#4a9eff');
  }
  
  // Spread chart
  const spreadCanvas=document.getElementById('spread-canvas');
  if(spreadCanvas&&data.spread2x4_2x6){
    const ctx=spreadCanvas.getContext('2d');
    const rect=spreadCanvas.getBoundingClientRect();
    spreadCanvas.width=rect.width*2;
    spreadCanvas.height=rect.height*2;
    ctx.scale(2,2);
    const w=rect.width,h=rect.height;
    const vals=data.spread2x4_2x6;
    const maxVal=Math.max(...vals.map(Math.abs),1);
    const barW=w/vals.length*0.7;
    vals.forEach((v,i)=>{
      const barH=Math.abs(v)/maxVal*(h/2-5);
      const x=i*(w/vals.length)+(w/vals.length-barW)/2;
      const y=v>=0?h/2-barH:h/2;
      ctx.fillStyle=v>=0?'#f5a623':'#ff6b6b';
      ctx.fillRect(x,y,barW,barH);
    });
    ctx.strokeStyle='rgba(255,255,255,0.2)';
    ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
  }
  
  // Regional spread chart
  const regionalCanvas=document.getElementById('regional-canvas');
  if(regionalCanvas&&data.spreadWestCentral){
    const ctx=regionalCanvas.getContext('2d');
    const rect=regionalCanvas.getBoundingClientRect();
    regionalCanvas.width=rect.width*2;
    regionalCanvas.height=rect.height*2;
    ctx.scale(2,2);
    const w=rect.width,h=rect.height;
    const vals=data.spreadWestCentral;
    const maxVal=Math.max(...vals.map(Math.abs),1);
    const barW=w/vals.length*0.7;
    vals.forEach((v,i)=>{
      const barH=Math.abs(v)/maxVal*(h/2-5);
      const x=i*(w/vals.length)+(w/vals.length-barW)/2;
      const y=v>=0?h/2-barH:h/2;
      ctx.fillStyle=v>=0?'#4a9eff':'#ff6b6b';
      ctx.fillRect(x,y,barW,barH);
    });
    ctx.strokeStyle='rgba(255,255,255,0.2)';
    ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
  }
}

function generateChartLine(data,min,range,color){
  if(!data.length)return '';
  const n=data.length;
  if(n<2)return '';
  
  // Filter to only valid data points with their indices
  const validPoints=data.map((val,i)=>({val,i})).filter(p=>p.val>0);
  if(validPoints.length<2)return '';
  
  // Build polyline points string
  const pointsStr=validPoints.map(p=>{
    const x=(p.i/(n-1))*100;
    const y=((1-(p.val-min)/range)*100);
    return`${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  
  // Generate dots at each valid point
  const dots=validPoints.map(p=>{
    const x=(p.i/(n-1))*100;
    const y=((1-(p.val-min)/range)*100);
    return`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${color}"/>`;
  }).join('');
  
  return`<polyline points="${pointsStr}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
}

function generateBarChart(data,color){
  if(!data.length)return '';
  const maxVal=Math.max(...data.map(Math.abs),1);
  const barWidth=80/data.length;
  const midY=50;
  
  return data.map((val,i)=>{
    const height=Math.abs(val)/maxVal*40;
    const x=10+i*(80/data.length);
    const y=val>=0?midY-height:midY;
    return`<rect x="${x}%" y="${y}%" width="${barWidth*0.8}%" height="${height}%" fill="${val>=0?color:'var(--negative)'}" opacity="0.8"/>`;
  }).join('');
}

// Futures basis history chart
function renderBasisChart(){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById('basis-history-chart');
  if(!ctx)return;
  destroyChart('basis-history');
  const daily=getDailyBasis();
  if(daily.length<2)return;
  const nearestFut=S.futuresContracts&&S.futuresContracts.length?S.futuresContracts[0]:null;
  const labels=daily.map(d=>fmtD(d.date));
  const futData=daily.map(d=>d.futPrice);
  const volData=daily.map(d=>d.volume);
  const hasCash=daily.some(d=>d.cash!==null);
  const datasets=[
    {label:(nearestFut?nearestFut.month:'SYP')+' Futures',data:futData,borderColor:'#f5a623',backgroundColor:'rgba(245,166,35,0.1)',tension:0.3,fill:false,pointRadius:0,borderWidth:2.5,yAxisID:'y'}
  ];
  if(hasCash){
    datasets.push({label:'Cash (East 2x4#2)',data:daily.map(d=>d.cash),borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.1)',tension:0.3,fill:false,pointRadius:0,borderWidth:2,yAxisID:'y'});
    datasets.push({label:'Basis',data:daily.map(d=>d.basis!==null?Math.round(d.basis):null),borderColor:'#00d4aa',backgroundColor:'rgba(0,212,170,0.15)',tension:0.3,fill:true,pointRadius:0,borderWidth:2,yAxisID:'y2'});
  }
  // Volume bars
  const hasVol=volData.some(v=>v&&v>0);
  if(hasVol){
    datasets.push({label:'Volume',data:volData,type:'bar',backgroundColor:'rgba(255,255,255,0.08)',borderColor:'rgba(255,255,255,0.15)',borderWidth:1,yAxisID:'yVol',barPercentage:0.8,categoryPercentage:1.0,order:10});
  }
  const scales={x:{ticks:{color:'#6b7c93',font:{size:10},maxTicksLimit:12},grid:{color:'rgba(255,255,255,0.05)'}},y:{position:'left',ticks:{color:'#6b7c93',font:{size:10},callback:v=>'$'+v},grid:{color:'rgba(255,255,255,0.05)'}}};
  if(hasCash)scales.y2={position:'right',ticks:{color:'#00d4aa',font:{size:10},callback:v=>'$'+v},grid:{display:false}};
  if(hasVol)scales.yVol={position:'right',display:false,beginAtZero:true,max:Math.max(...volData.filter(Boolean))*4};
  window._charts['basis-history']=new Chart(ctx,{
    type:'line',
    data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#6b7c93',font:{size:11,family:'Inter'},filter:item=>item.text!=='Volume'}},tooltip:{mode:'index',intersect:false,backgroundColor:'#1a2535',titleColor:'#e8eaed',bodyColor:'#e8eaed',borderColor:'#1e3a5f',borderWidth:1,callbacks:{label:function(ctx){if(ctx.dataset.label==='Volume')return'Vol: '+(ctx.parsed.y?ctx.parsed.y.toLocaleString():'—');return ctx.dataset.label+': $'+ctx.parsed.y}}}},scales}
  });
}

// Basis Z-Score chart — Z-score over last N RL prints with threshold lines
function renderBasisZScoreChart(){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById('basis-zscore-chart');
  if(!ctx)return;
  destroyChart('basis-zscore');
  const p=S.futuresParams;
  const dailyAll=getDailyBasis();
  const daily=dailyAll.filter(d=>d.basis!==null);
  if(daily.length<3)return;
  const basisVals=daily.map(d=>d.basis);
  const avg=basisVals.reduce((a,b)=>a+b,0)/basisVals.length;
  const stdDev=Math.sqrt(basisVals.reduce((s,v)=>s+Math.pow(v-avg,2),0)/(basisVals.length-1));
  if(!stdDev||stdDev===0)return;
  const zScores=basisVals.map(v=>parseFloat(((v-avg)/stdDev).toFixed(2)));
  const labels=daily.map(d=>fmtD(d.date));
  const sellThresh=p.zScoreSellThreshold||-1.5;
  const buyThresh=p.zScoreBuyThreshold||1.5;
  window._charts['basis-zscore']=new Chart(ctx,{
    type:'line',
    data:{labels,datasets:[
      {label:'Z-Score',data:zScores,borderColor:'#f5a623',backgroundColor:'rgba(245,166,35,0.1)',tension:0.3,fill:true,pointRadius:0,borderWidth:2.5,segment:{borderColor:ctx2=>{const v=ctx2.p1.parsed.y;return v<=sellThresh?'#ff6b6b':v>=buyThresh?'#00d4aa':'#f5a623';}}},
      {label:'Sell Threshold',data:labels.map(()=>sellThresh),borderColor:'#ff6b6b',borderWidth:2,borderDash:[6,4],pointRadius:0,fill:false},
      {label:'Buy Threshold',data:labels.map(()=>buyThresh),borderColor:'#00d4aa',borderWidth:2,borderDash:[6,4],pointRadius:0,fill:false}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#6b7c93',font:{size:11,family:'Inter'}}},tooltip:{mode:'index',intersect:false,backgroundColor:'#1a2535',titleColor:'#e8eaed',bodyColor:'#e8eaed',borderColor:'#1e3a5f',borderWidth:1}},scales:{x:{ticks:{color:'#6b7c93',font:{size:10},maxTicksLimit:10},grid:{color:'rgba(255,255,255,0.05)'}},y:{ticks:{color:'#6b7c93',font:{size:10}},grid:{color:'rgba(255,255,255,0.05)'}}}}
  });
}

// P&L Calendar daily bar chart
function renderPnLBarChart(labels,data){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById('pnl-daily-bar-chart');
  if(!ctx)return;
  destroyChart('pnl-daily-bar');
  const colors=data.map(v=>v>=0?'rgba(34,197,94,0.7)':'rgba(239,68,68,0.7)');
  const borderColors=data.map(v=>v>=0?'#22c55e':'#ef4444');
  window._charts['pnl-daily-bar']=new Chart(ctx,{
    type:'bar',
    data:{labels,datasets:[{label:'Daily P&L',data,backgroundColor:colors,borderColor:borderColors,borderWidth:1,borderRadius:3}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#1a2535',titleColor:'#e8eaed',bodyColor:'#e8eaed',borderColor:'#1e3a5f',borderWidth:1,callbacks:{label:function(ctx){return'Day '+ctx.label+': $'+ctx.parsed.y.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}}}},scales:{x:{ticks:{color:'#6b7c93',font:{size:10}},grid:{display:false}},y:{ticks:{color:'#6b7c93',font:{size:10},callback:v=>'$'+v.toLocaleString()},grid:{color:'rgba(255,255,255,0.05)'}}}}
  });
}

function generateSpreadTable(rlData){
  const spreads=[
    {name:'2x4/2x6',region:'west',calc:r=>(r.west?.['2x6#2']||0)-(r.west?.['2x4#2']||0)},
    {name:'2x4/2x6',region:'central',calc:r=>(r.central?.['2x6#2']||0)-(r.central?.['2x4#2']||0)},
    {name:'2x4/2x6',region:'east',calc:r=>(r.east?.['2x6#2']||0)-(r.east?.['2x4#2']||0)},
    {name:'2x6/2x8',region:'west',calc:r=>(r.west?.['2x8#2']||0)-(r.west?.['2x6#2']||0)},
    {name:'West/Central',region:'2x4',calc:r=>(r.west?.['2x4#2']||0)-(r.central?.['2x4#2']||0)},
    {name:'West/East',region:'2x4',calc:r=>(r.west?.['2x4#2']||0)-(r.east?.['2x4#2']||0)}
  ];
  
  return spreads.map(s=>{
    const vals=rlData.map(s.calc).filter(v=>v!==0);
    const current=vals[vals.length-1]||0;
    const avg4=vals.slice(-4).reduce((a,b)=>a+b,0)/(Math.min(vals.length,4)||1);
    const avg12=vals.reduce((a,b)=>a+b,0)/(vals.length||1);
    const diff=current-avg12;
    
    return`<tr>
      <td class="bold">${s.name}</td>
      <td style="text-transform:capitalize">${s.region}</td>
      <td class="right">$${current}</td>
      <td class="right" style="color:var(--muted)">$${Math.round(avg4)}</td>
      <td class="right" style="color:var(--muted)">$${Math.round(avg12)}</td>
      <td class="right ${diff>5?'positive':diff<-5?'negative':''}">${diff>0?'+':''}$${Math.round(diff)}</td>
    </tr>`;
  }).join('');
}
