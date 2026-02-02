// SYP Analytics - Chart Functions
// Chart.js integration + legacy canvas chart helpers

// Chart instance management (prevent memory leaks on re-render)
window._charts={};
function destroyChart(id){if(window._charts[id]){window._charts[id].destroy();delete window._charts[id]}}
function destroyAllCharts(){Object.keys(window._charts).forEach(destroyChart)}

// Gradient fill helper — creates CanvasGradient fading from color to transparent
function hexToGradient(hex,canvasCtx,height){
  const g=canvasCtx.createLinearGradient(0,0,0,height||160);
  const r=parseInt(hex.slice(1,3),16),gr=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  g.addColorStop(0,'rgba('+r+','+gr+','+b+',0.3)');
  g.addColorStop(1,'rgba('+r+','+gr+','+b+',0.0)');
  return g;
}

// Crosshair plugin — vertical dashed line at tooltip position
const crosshairPlugin={
  id:'crosshair',
  afterDraw(chart){
    if(chart.tooltip&&chart.tooltip._active&&chart.tooltip._active.length){
      const x=chart.tooltip._active[0].element.x;
      const yAxis=chart.scales.y;
      const ctx=chart.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x,yAxis.top);
      ctx.lineTo(x,yAxis.bottom);
      ctx.lineWidth=1;
      ctx.strokeStyle='rgba(208,212,218,0.2)';
      ctx.setLineDash([4,4]);
      ctx.stroke();
      ctx.restore();
    }
  }
};

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
    label:'Futures Price',data:prices,borderColor:'#f9e2af',backgroundColor:'rgba(249,226,175,0.15)',tension:0.3,fill:true,pointRadius:5,pointBackgroundColor:'#f9e2af',borderWidth:2.5
  }];
  // Add cash price line if available
  if(cashPrice){
    datasets.push({
      label:'Cash (East 2x4#2)',data:labels.map(()=>cashPrice),borderColor:'#89dceb',borderWidth:2,borderDash:[6,4],pointRadius:0,fill:false
    });
  }
  window._charts['syp-curve']=new Chart(ctx,{
    type:'line',
    data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#a0a0b8',font:{size:11,family:'Inter'}}},tooltip:{mode:'index',intersect:false,backgroundColor:'#2a2a3c',titleColor:'#f5f5f7',bodyColor:'#f5f5f7',borderColor:'#3e3e56',borderWidth:1}},scales:{x:{ticks:{color:'#a0a0b8',font:{size:11}},grid:{color:'rgba(62,62,86,0.8)'}},y:{ticks:{color:'#a0a0b8',font:{size:10},callback:v=>'$'+v},grid:{color:'rgba(62,62,86,0.8)'}}}}
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
  const datasets=[{label:'SYP Front Month',data:prices,borderColor:'#f9e2af',backgroundColor:'rgba(249,226,175,0.1)',tension:0.3,fill:true,pointRadius:0,borderWidth:2.5,yAxisID:'y'}];
  if(hasVol){
    datasets.push({label:'Volume',data:volumes,type:'bar',backgroundColor:'rgba(137,180,250,0.12)',borderColor:'rgba(137,180,250,0.2)',borderWidth:1,yAxisID:'yVol',barPercentage:0.8,categoryPercentage:1.0,order:10});
  }
  const scales={x:{ticks:{color:'#a0a0b8',font:{size:10},maxTicksLimit:12},grid:{color:'rgba(62,62,86,0.8)'}},y:{ticks:{color:'#a0a0b8',font:{size:10},callback:v=>'$'+v},grid:{color:'rgba(62,62,86,0.8)'}}};
  if(hasVol)scales.yVol={display:false,beginAtZero:true,max:Math.max(...volumes.filter(Boolean))*4};
  window._charts['syp-live-price']=new Chart(ctx,{
    type:'line',
    data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#a0a0b8',font:{size:11,family:'Inter'},filter:item=>item.text!=='Volume'}},tooltip:{mode:'index',intersect:false,backgroundColor:'#2a2a3c',titleColor:'#f5f5f7',bodyColor:'#f5f5f7',borderColor:'#3e3e56',borderWidth:1,callbacks:{label:function(ctx){if(ctx.dataset.label==='Volume')return'Vol: '+(ctx.parsed.y?ctx.parsed.y.toLocaleString():'—');return'$'+ctx.parsed.y+'/MBF'}}}},scales}
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
    {label:(nearestFut?nearestFut.month:'SYP')+' Futures',data:futData,borderColor:'#f9e2af',backgroundColor:'rgba(249,226,175,0.1)',tension:0.3,fill:false,pointRadius:0,borderWidth:2.5}
  ];
  if(hasCash){
    datasets.push({label:'Cash (East 2x4#2)',data:daily.map(d=>d.cash),borderColor:'#89dceb',backgroundColor:'rgba(137,220,235,0.1)',tension:0.3,fill:false,pointRadius:0,borderWidth:2});
    datasets.push({label:'Basis',data:daily.map(d=>d.basis!==null?Math.round(d.basis):null),borderColor:'#89b4fa',backgroundColor:'rgba(137,180,250,0.1)',tension:0.3,fill:true,pointRadius:0,borderWidth:2,yAxisID:'y1'});
  }
  const scales={x:{ticks:{color:'#a0a0b8',font:{size:9},maxTicksLimit:12,maxRotation:45},grid:{color:'rgba(62,62,86,0.8)'}},y:{position:'left',ticks:{color:'#a0a0b8',font:{size:10},callback:v=>'$'+v},grid:{color:'rgba(62,62,86,0.8)'}}};
  if(hasCash)scales.y1={position:'right',ticks:{color:'#89b4fa',font:{size:10},callback:v=>'$'+v},grid:{display:false}};
  window._charts['syp-cash-fut']=new Chart(ctx,{
    type:'line',
    data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#a0a0b8',font:{size:10,family:'Inter'}}},tooltip:{mode:'index',intersect:false,backgroundColor:'#2a2a3c',titleColor:'#f5f5f7',bodyColor:'#f5f5f7'}},scales}
  });
}

// Chart.js dashboard charts
function renderDashboardCharts(){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById('dashboard-price-chart');
  if(!ctx||!S.rl||!S.rl.length)return;
  destroyChart('price-trend');
  // Determine slice count based on range
  // Update range button active state
  document.querySelectorAll('.range-btn').forEach(b=>{b.classList.toggle('active',b.textContent===S.dashChartRange);});
  const range=S.dashChartRange||'1M';
  let count;
  switch(range){
    case '1W':count=1;break;
    case '1M':count=4;break;
    case '3M':count=13;break;
    case 'YTD':const jan1=new Date(new Date().getFullYear(),0,1);count=S.rl.filter(r=>new Date(r.date)>=jan1).length||4;break;
    default:count=4;
  }
  count=Math.max(count,2);
  const sliced=S.rl.slice(-count);
  const labels=sliced.map(r=>fmtD(r.date));
  const canvasCtx=ctx.getContext('2d');
  const h=ctx.parentElement?ctx.parentElement.offsetHeight:160;
  window._charts['price-trend']=new Chart(ctx,{
    type:'line',
    plugins:[crosshairPlugin],
    data:{labels,datasets:[
      {label:'West',data:sliced.map(r=>(r.west&&r.west['2x4#2'])||null),borderColor:'#89b4fa',backgroundColor:hexToGradient('#89b4fa',canvasCtx,h),tension:0.3,fill:true,pointRadius:3,borderWidth:2},
      {label:'Central',data:sliced.map(r=>(r.central&&r.central['2x4#2'])||null),borderColor:'#f9e2af',backgroundColor:hexToGradient('#f9e2af',canvasCtx,h),tension:0.3,fill:true,pointRadius:3,borderWidth:2},
      {label:'East',data:sliced.map(r=>(r.east&&r.east['2x4#2'])||null),borderColor:'#89dceb',backgroundColor:hexToGradient('#89dceb',canvasCtx,h),tension:0.3,fill:true,pointRadius:3,borderWidth:2}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#a0a0b8',font:{size:11,family:'Inter'}}},tooltip:{mode:'index',intersect:false,backgroundColor:'#2a2a3c',titleColor:'#f5f5f7',bodyColor:'#f5f5f7',borderColor:'#3e3e56',borderWidth:1}},scales:{x:{ticks:{color:'#a0a0b8',font:{size:10}},grid:{color:'rgba(62,62,86,0.8)'}},y:{ticks:{color:'#a0a0b8',font:{size:10},callback:v=>'$'+v},grid:{color:'rgba(62,62,86,0.8)'}}}}
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
      {label:'Buys (MBF)',data:wp.map(w=>w.bVol),backgroundColor:'rgba(137,180,250,0.6)',borderRadius:4},
      {label:'Sells (MBF)',data:wp.map(w=>w.sVol),backgroundColor:'rgba(137,220,235,0.6)',borderRadius:4}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#a0a0b8',font:{size:11,family:'Inter'}}}},scales:{x:{ticks:{color:'#a0a0b8',font:{size:10}},grid:{display:false}},y:{ticks:{color:'#a0a0b8',font:{size:10}},grid:{color:'rgba(62,62,86,0.8)'}}}}
  });
}

function drawSparkline(canvasId,data,color){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById(canvasId);
  if(!ctx||!data||!data.length)return;
  destroyChart('spark-'+canvasId);
  window._charts['spark-'+canvasId]=new Chart(ctx,{
    type:'line',
    data:{labels:data.map((_,i)=>i),datasets:[{data,borderColor:color||'#89b4fa',borderWidth:1.5,pointRadius:0,fill:false,tension:0.4}]},
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
    drawLine(data.westData,'#89b4fa');
    drawLine(data.centralData,'#f9e2af');
    drawLine(data.eastData,'#89dceb');
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
      ctx.fillStyle=v>=0?'#f9e2af':'#f38ba8';
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
      ctx.fillStyle=v>=0?'#89dceb':'#f38ba8';
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
    {label:(nearestFut?nearestFut.month:'SYP')+' Futures',data:futData,borderColor:'#f9e2af',backgroundColor:'rgba(249,226,175,0.1)',tension:0.3,fill:false,pointRadius:0,borderWidth:2.5,yAxisID:'y'}
  ];
  if(hasCash){
    datasets.push({label:'Cash (East 2x4#2)',data:daily.map(d=>d.cash),borderColor:'#89dceb',backgroundColor:'rgba(137,220,235,0.1)',tension:0.3,fill:false,pointRadius:0,borderWidth:2,yAxisID:'y'});
    datasets.push({label:'Basis',data:daily.map(d=>d.basis!==null?Math.round(d.basis):null),borderColor:'#89b4fa',backgroundColor:'rgba(137,180,250,0.15)',tension:0.3,fill:true,pointRadius:0,borderWidth:2,yAxisID:'y2'});
  }
  // Volume bars
  const hasVol=volData.some(v=>v&&v>0);
  if(hasVol){
    datasets.push({label:'Volume',data:volData,type:'bar',backgroundColor:'rgba(137,180,250,0.12)',borderColor:'rgba(137,180,250,0.2)',borderWidth:1,yAxisID:'yVol',barPercentage:0.8,categoryPercentage:1.0,order:10});
  }
  const scales={x:{ticks:{color:'#a0a0b8',font:{size:10},maxTicksLimit:12},grid:{color:'rgba(62,62,86,0.8)'}},y:{position:'left',ticks:{color:'#a0a0b8',font:{size:10},callback:v=>'$'+v},grid:{color:'rgba(62,62,86,0.8)'}}};
  if(hasCash)scales.y2={position:'right',ticks:{color:'#89b4fa',font:{size:10},callback:v=>'$'+v},grid:{display:false}};
  if(hasVol)scales.yVol={position:'right',display:false,beginAtZero:true,max:Math.max(...volData.filter(Boolean))*4};
  window._charts['basis-history']=new Chart(ctx,{
    type:'line',
    data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#a0a0b8',font:{size:11,family:'Inter'},filter:item=>item.text!=='Volume'}},tooltip:{mode:'index',intersect:false,backgroundColor:'#2a2a3c',titleColor:'#f5f5f7',bodyColor:'#f5f5f7',borderColor:'#3e3e56',borderWidth:1,callbacks:{label:function(ctx){if(ctx.dataset.label==='Volume')return'Vol: '+(ctx.parsed.y?ctx.parsed.y.toLocaleString():'—');return ctx.dataset.label+': $'+ctx.parsed.y}}}},scales}
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
      {label:'Z-Score',data:zScores,borderColor:'#f9e2af',backgroundColor:'rgba(249,226,175,0.1)',tension:0.3,fill:true,pointRadius:0,borderWidth:2.5,segment:{borderColor:ctx2=>{const v=ctx2.p1.parsed.y;return v<=sellThresh?'#f38ba8':v>=buyThresh?'#89b4fa':'#f9e2af';}}},
      {label:'Sell Threshold',data:labels.map(()=>sellThresh),borderColor:'#f38ba8',borderWidth:2,borderDash:[6,4],pointRadius:0,fill:false},
      {label:'Buy Threshold',data:labels.map(()=>buyThresh),borderColor:'#89b4fa',borderWidth:2,borderDash:[6,4],pointRadius:0,fill:false}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#a0a0b8',font:{size:11,family:'Inter'}}},tooltip:{mode:'index',intersect:false,backgroundColor:'#2a2a3c',titleColor:'#f5f5f7',bodyColor:'#f5f5f7',borderColor:'#3e3e56',borderWidth:1}},scales:{x:{ticks:{color:'#a0a0b8',font:{size:10},maxTicksLimit:10},grid:{color:'rgba(62,62,86,0.8)'}},y:{ticks:{color:'#a0a0b8',font:{size:10}},grid:{color:'rgba(62,62,86,0.8)'}}}}
  });
}

// P&L Calendar daily bar chart
function renderPnLBarChart(labels,data){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById('pnl-daily-bar-chart');
  if(!ctx)return;
  destroyChart('pnl-daily-bar');
  const colors=data.map(v=>v>=0?'rgba(0,230,118,0.7)':'rgba(255,82,82,0.7)');
  const borderColors=data.map(v=>v>=0?'#a6e3a1':'#f38ba8');
  window._charts['pnl-daily-bar']=new Chart(ctx,{
    type:'bar',
    data:{labels,datasets:[{label:'Daily P&L',data,backgroundColor:colors,borderColor:borderColors,borderWidth:1,borderRadius:3}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#2a2a3c',titleColor:'#f5f5f7',bodyColor:'#f5f5f7',borderColor:'#3e3e56',borderWidth:1,callbacks:{label:function(ctx){return'Day '+ctx.label+': $'+ctx.parsed.y.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}}}},scales:{x:{ticks:{color:'#a0a0b8',font:{size:10}},grid:{display:false}},y:{ticks:{color:'#a0a0b8',font:{size:10},callback:v=>'$'+v.toLocaleString()},grid:{color:'rgba(62,62,86,0.8)'}}}}
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
