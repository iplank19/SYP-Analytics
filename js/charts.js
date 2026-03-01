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

// Forecast chart — actual prices + forecast line with confidence band
function renderForecastChart(fc){
  if(typeof Chart==='undefined'||!fc)return;
  const ctx=document.getElementById('forecast-chart');
  if(!ctx)return;
  destroyChart('forecast');

  const actuals=fc.actuals||[];
  const forecasts=fc.forecast||[];
  if(!actuals.length&&!forecasts.length)return;

  // Build labels: actual dates + forecast dates
  const actualLabels=actuals.map(a=>a.date);
  const forecastLabels=forecasts.map(f=>f.date);
  const labels=[...actualLabels,...forecastLabels];

  // Actual price data (null-padded for forecast portion)
  const actualPrices=actuals.map(a=>a.price);
  const actualData=[...actualPrices,...forecasts.map(()=>null)];

  // Forecast data: null for actuals, then forecast prices (with bridge from last actual)
  const forecastPrices=forecasts.map(f=>f.price);
  const forecastData=[...actuals.map(()=>null)];
  // Bridge: set last actual slot to actual price so the line connects
  if(forecastData.length>0&&actualPrices.length>0){
    forecastData[forecastData.length-1]=actualPrices[actualPrices.length-1];
  }
  forecastData.push(...forecastPrices);

  // Confidence bands (only during forecast period)
  const highData=[...actuals.map(()=>null)];
  const lowData=[...actuals.map(()=>null)];
  if(highData.length>0&&actualPrices.length>0){
    highData[highData.length-1]=actualPrices[actualPrices.length-1];
    lowData[lowData.length-1]=actualPrices[actualPrices.length-1];
  }
  forecasts.forEach(f=>{highData.push(f.high);lowData.push(f.low)});

  const datasets=[
    {label:'Actual',data:actualData,borderColor:'#89b4fa',backgroundColor:'rgba(137,180,250,0.1)',tension:0.3,fill:false,pointRadius:0,borderWidth:2.5},
    {label:'Forecast',data:forecastData,borderColor:'#f9e2af',backgroundColor:'rgba(249,226,175,0.1)',tension:0.3,fill:false,pointRadius:3,pointBackgroundColor:'#f9e2af',borderWidth:2.5,borderDash:[6,4]},
    {label:'Upper Band',data:highData,borderColor:'rgba(166,227,161,0.3)',backgroundColor:'rgba(166,227,161,0.08)',tension:0.3,fill:'+1',pointRadius:0,borderWidth:1,borderDash:[3,3]},
    {label:'Lower Band',data:lowData,borderColor:'rgba(243,139,168,0.3)',backgroundColor:'transparent',tension:0.3,fill:false,pointRadius:0,borderWidth:1,borderDash:[3,3]}
  ];

  window._charts['forecast']=new Chart(ctx,{
    type:'line',
    data:{labels,datasets},
    plugins:[crosshairPlugin],
    options:{responsive:true,maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{labels:{color:'#a0a0b8',font:{size:10,family:'Inter'},filter:item=>!item.text.includes('Band')}},
        tooltip:{mode:'index',intersect:false,backgroundColor:'#2a2a3c',titleColor:'#f5f5f7',bodyColor:'#f5f5f7',borderColor:'#3e3e56',borderWidth:1,
          filter:item=>!item.dataset.label.includes('Band'),
          callbacks:{label:function(ctx){return ctx.dataset.label+': $'+ctx.parsed.y}}
        }
      },
      scales:{
        x:{ticks:{color:'#a0a0b8',font:{size:9},maxTicksLimit:12,maxRotation:45},grid:{color:'rgba(62,62,86,0.8)'}},
        y:{ticks:{color:'#a0a0b8',font:{size:10},callback:v=>'$'+v},grid:{color:'rgba(62,62,86,0.8)'}}
      }
    }
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
    options:{responsive:true,maintainAspectRatio:false,onClick:(evt,elements)=>{
      if(!elements.length)return;
      const idx=elements[0].index;
      const rlDate=sliced[idx]?.date;
      if(!rlDate)return;
      const d=new Date(rlDate);
      const start=new Date(d);start.setDate(start.getDate()-3);
      const end=new Date(d);end.setDate(end.getDate()+3);
      const trades=[
        ...S.buys.filter(b=>{const bd=new Date(b.date);return bd>=start&&bd<=end}).map(b=>({...b,_type:'buy'})),
        ...S.sells.filter(s=>{const sd=new Date(s.date);return sd>=start&&sd<=end}).map(s=>({...s,_type:'sell'}))
      ].sort((a,b)=>new Date(b.date)-new Date(a.date));
      if(typeof showDrillDown==='function')showDrillDown('Trades near '+fmtD(rlDate),trades);
    },plugins:{legend:{labels:{color:'#a0a0b8',font:{size:11,family:'Inter'}}},tooltip:{mode:'index',intersect:false,backgroundColor:'#2a2a3c',titleColor:'#f5f5f7',bodyColor:'#f5f5f7',borderColor:'#3e3e56',borderWidth:1}},scales:{x:{ticks:{color:'#a0a0b8',font:{size:10}},grid:{color:'rgba(62,62,86,0.8)'}},y:{ticks:{color:'#a0a0b8',font:{size:10},callback:v=>'$'+v},grid:{color:'rgba(62,62,86,0.8)'}}}}
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
      // Draw dots (skip when too many points to avoid clutter)
      if(valid.length<=52){
        valid.forEach(p=>{
          const x=(p.i/(vals.length-1))*w;
          const y=h-((p.v-data.minPrice)/data.range)*h;
          ctx.beginPath();
          ctx.arc(x,y,4,0,Math.PI*2);
          ctx.fillStyle=color;
          ctx.fill();
        });
      }
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
  const colors=data.map(v=>v>=0?'rgba(166,227,161,0.7)':'rgba(243,139,168,0.7)');
  const borderColors=data.map(v=>v>=0?'#a6e3a1':'#f38ba8');
  window._charts['pnl-daily-bar']=new Chart(ctx,{
    type:'bar',
    data:{labels,datasets:[{label:'Daily P&L',data,backgroundColor:colors,borderColor:borderColors,borderWidth:1,borderRadius:3}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#2a2a3c',titleColor:'#f5f5f7',bodyColor:'#f5f5f7',borderColor:'#3e3e56',borderWidth:1,callbacks:{label:function(ctx){return'Day '+ctx.label+': $'+ctx.parsed.y.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}}}},scales:{x:{ticks:{color:'#a0a0b8',font:{size:10}},grid:{display:false}},y:{ticks:{color:'#a0a0b8',font:{size:10},callback:v=>'$'+v.toLocaleString()},grid:{color:'rgba(62,62,86,0.8)'}}}}
  });
}

function generateSpreadTable(rlData){
  // Helper: return spread only when BOTH products have data, otherwise null
  const _sp=(a,b)=>(a&&b)?a-b:null;

  // Dimension spreads (same zone, different product)
  const dimSpreads=[
    {name:'2x4/2x6',region:'west',calc:r=>_sp(r.west?.['2x6#2'],r.west?.['2x4#2'])},
    {name:'2x4/2x6',region:'central',calc:r=>_sp(r.central?.['2x6#2'],r.central?.['2x4#2'])},
    {name:'2x4/2x6',region:'east',calc:r=>_sp(r.east?.['2x6#2'],r.east?.['2x4#2'])},
    {name:'2x6/2x8',region:'west',calc:r=>_sp(r.west?.['2x8#2'],r.west?.['2x6#2'])},
  ];

  // Cross-zone spreads (same product, different zone)
  const zoneSpreads=[
    {name:'W→C 2x4#2',region:'zone',calc:r=>_sp(r.west?.['2x4#2'],r.central?.['2x4#2'])},
    {name:'W→E 2x4#2',region:'zone',calc:r=>_sp(r.west?.['2x4#2'],r.east?.['2x4#2'])},
    {name:'C→E 2x4#2',region:'zone',calc:r=>_sp(r.central?.['2x4#2'],r.east?.['2x4#2'])},
    {name:'W→C 2x6#2',region:'zone',calc:r=>_sp(r.west?.['2x6#2'],r.central?.['2x6#2'])},
    {name:'W→E 2x6#2',region:'zone',calc:r=>_sp(r.west?.['2x6#2'],r.east?.['2x6#2'])},
    {name:'C→E 2x6#2',region:'zone',calc:r=>_sp(r.central?.['2x6#2'],r.east?.['2x6#2'])},
    {name:'W→C 2x4#3',region:'zone',calc:r=>_sp(r.west?.['2x4#3'],r.central?.['2x4#3'])},
    {name:'W→E 2x4#3',region:'zone',calc:r=>_sp(r.west?.['2x4#3'],r.east?.['2x4#3'])},
  ];

  const spreads=[...dimSpreads,...zoneSpreads];

  const _renderRow=(s,isZone)=>{
    const vals=rlData.map(s.calc).filter(v=>v!==null&&v!==undefined);
    if(!vals.length)return'';
    const current=vals[vals.length-1];
    const avg4=vals.slice(-4).reduce((a,b)=>a+b,0)/(Math.min(vals.length,4)||1);
    const avg12=vals.reduce((a,b)=>a+b,0)/(vals.length||1);
    const diff=current-avg12;

    // Percentile rank for zone spreads
    let pctBadge='';
    if(isZone&&vals.length>=8){
      const sorted=[...vals].sort((a,b)=>a-b);
      const pct=Math.round(sorted.filter(v=>v<=current).length/sorted.length*100);
      const pctColor=pct<=15||pct>=85?'var(--negative)':pct<=25||pct>=75?'var(--warn)':'var(--muted)';
      pctBadge=`<span style="font-size:9px;color:${pctColor};margin-left:4px">${pct}p</span>`;
    }

    return`<tr>
      <td class="bold">${s.name}${pctBadge}</td>
      <td style="text-transform:capitalize;font-size:10px">${isZone?'cross':''}${isZone?'':s.region}</td>
      <td class="right">$${current}</td>
      <td class="right" style="color:var(--muted)">$${Math.round(avg4)}</td>
      <td class="right" style="color:var(--muted)">$${Math.round(avg12)}</td>
      <td class="right ${diff>5?'positive':diff<-5?'negative':''}">${diff>0?'+':''}$${Math.round(diff)}</td>
    </tr>`;
  };

  const dimRows=dimSpreads.map(s=>_renderRow(s,false)).filter(Boolean).join('');
  const zoneRows=zoneSpreads.map(s=>_renderRow(s,true)).filter(Boolean).join('');

  let html=dimRows;
  if(zoneRows){
    html+=`<tr><td colspan="6" style="font-size:10px;color:var(--accent);padding:6px 0 2px;border-top:1px solid var(--border)">CROSS-ZONE ARBITRAGE</td></tr>`;
    html+=zoneRows;
  }
  return html;
}

// ============================================================================
// RISK DASHBOARD CHARTS
// ============================================================================

// Risk gauge chart (semi-circular gauge)
function renderRiskGaugeChart(score,level){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById('risk-gauge-chart');
  if(!ctx)return;
  destroyChart('risk-gauge');

  const remaining=100-score;
  const color=level==='CRITICAL'?'#ff5252':level==='HIGH'?'#ffab40':level==='MODERATE'?'#ffd54f':'#00e676';

  window._charts['risk-gauge']=new Chart(ctx,{
    type:'doughnut',
    data:{
      datasets:[{
        data:[score,remaining],
        backgroundColor:[color,'rgba(28,28,42,0.5)'],
        borderWidth:0,
        circumference:180,
        rotation:270
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      cutout:'75%',
      plugins:{
        legend:{display:false},
        tooltip:{enabled:false}
      }
    }
  });
}

// Exposure bar chart
function renderExposureChart(){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById('exposure-chart');
  if(!ctx)return;
  destroyChart('exposure');

  const exposure=getExposure('product');
  const products=Object.keys(exposure).slice(0,8);
  const longs=products.map(p=>exposure[p].long);
  const shorts=products.map(p=>-exposure[p].short);

  window._charts['exposure']=new Chart(ctx,{
    type:'bar',
    data:{
      labels:products,
      datasets:[
        {label:'Long',data:longs,backgroundColor:'rgba(0,230,118,0.7)',borderRadius:4},
        {label:'Short',data:shorts,backgroundColor:'rgba(255,82,82,0.7)',borderRadius:4}
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      indexAxis:'y',
      plugins:{
        legend:{labels:{color:'#5a6270',font:{size:10}}}
      },
      scales:{
        x:{
          ticks:{color:'#5a6270',font:{size:10}},
          grid:{color:'rgba(28,28,42,0.8)'}
        },
        y:{
          ticks:{color:'#5a6270',font:{size:10}},
          grid:{display:false}
        }
      }
    }
  });
}

// VaR contribution chart
function renderVaRChart(){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById('var-chart');
  if(!ctx)return;
  destroyChart('var');

  const varReport=getVaRReport(0.95);
  const products=varReport.byProduct.slice(0,6);
  const labels=products.map(p=>p.product);
  const values=products.map(p=>p.var);

  window._charts['var']=new Chart(ctx,{
    type:'bar',
    data:{
      labels,
      datasets:[{
        label:'VaR Contribution',
        data:values,
        backgroundColor:'rgba(255,82,82,0.7)',
        borderRadius:4
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{
          callbacks:{
            label:ctx=>'$'+ctx.parsed.y.toLocaleString()
          }
        }
      },
      scales:{
        x:{ticks:{color:'#5a6270',font:{size:10}},grid:{display:false}},
        y:{ticks:{color:'#5a6270',font:{size:10},callback:v=>'$'+v.toLocaleString()},grid:{color:'rgba(28,28,42,0.8)'}}
      }
    }
  });
}

// Drawdown chart
function renderDrawdownChart(){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById('drawdown-chart');
  if(!ctx)return;
  destroyChart('drawdown');

  const dd=calcDrawdown('90d');
  if(!dd.cumulativePnL||dd.cumulativePnL.length<2)return;

  const labels=dd.cumulativePnL.map(d=>fmtD(d.date));
  const cumulative=dd.cumulativePnL.map(d=>d.cumulative);

  // Calculate drawdown from peak at each point
  let peak=cumulative[0];
  const drawdowns=cumulative.map(v=>{
    if(v>peak)peak=v;
    return v-peak;
  });

  window._charts['drawdown']=new Chart(ctx,{
    type:'line',
    data:{
      labels,
      datasets:[
        {label:'Cumulative P&L',data:cumulative,borderColor:'#4d8df7',backgroundColor:'rgba(77,141,247,0.1)',fill:true,tension:0.3,pointRadius:0,borderWidth:2},
        {label:'Drawdown',data:drawdowns,borderColor:'#ff5252',backgroundColor:'rgba(255,82,82,0.1)',fill:true,tension:0.3,pointRadius:0,borderWidth:2}
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#5a6270',font:{size:10}}}},
      scales:{
        x:{ticks:{color:'#5a6270',font:{size:10},maxTicksLimit:8},grid:{color:'rgba(28,28,42,0.8)'}},
        y:{ticks:{color:'#5a6270',font:{size:10},callback:v=>'$'+v.toLocaleString()},grid:{color:'rgba(28,28,42,0.8)'}}
      }
    }
  });
}

// ============================================================================
// P&L CHARTS
// ============================================================================

// P&L by product chart
function renderPnLByProductChart(canvasId,breakdown){
  if(typeof Chart==='undefined')return;
  const id=canvasId||'pnl-product-chart';
  const ctx=document.getElementById(id);
  if(!ctx)return;
  destroyChart(id);

  // Get data from breakdown or calculate fresh
  let items=[];
  if(breakdown&&breakdown.items){
    items=breakdown.items.slice(0,8);
  }else if(typeof getPnLBreakdown==='function'){
    const pnl=getPnLBreakdown({groupBy:'product',period:'30d'});
    items=pnl.items.slice(0,8);
  }

  const labels=items.map(p=>p.key||p.product||'Unknown');
  const values=items.map(p=>p.pnl||p.totalPnL||0);
  const colors=values.map(v=>v>=0?'rgba(0,230,118,0.7)':'rgba(255,82,82,0.7)');

  window._charts[id]=new Chart(ctx,{
    type:'bar',
    data:{
      labels,
      datasets:[{label:'P&L',data:values,backgroundColor:colors,borderRadius:4}]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:'#5a6270',font:{size:10}},grid:{display:false}},
        y:{ticks:{color:'#5a6270',font:{size:10},callback:v=>'$'+v.toLocaleString()},grid:{color:'rgba(28,28,42,0.8)'}}
      }
    }
  });
}

// Rolling P&L trend chart
function renderRollingPnLChart(canvasId){
  if(typeof Chart==='undefined')return;
  const id=canvasId||'rolling-pnl-chart';
  const ctx=document.getElementById(id);
  if(!ctx)return;
  destroyChart(id);

  // Get rolling data from pnl.js
  let rollingData=[];
  if(typeof getRollingPnL==='function'){
    rollingData=getRollingPnL(30);
  }

  const labels=rollingData.map(d=>d.date?.substring(5)||'');
  const pnl=rollingData.map(d=>d.pnl||0);
  const cumulative=rollingData.map(d=>d.cumulative||0);

  const canvasCtx=ctx.getContext('2d');
  window._charts[id]=new Chart(ctx,{
    type:'bar',
    data:{
      labels,
      datasets:[
        {label:'Daily P&L',data:pnl,type:'bar',backgroundColor:pnl.map(v=>v>=0?'rgba(0,230,118,0.6)':'rgba(255,82,82,0.6)'),borderRadius:4,yAxisID:'y'},
        {label:'Cumulative',data:cumulative,type:'line',borderColor:'#4d8df7',backgroundColor:hexToGradient('#4d8df7',canvasCtx,160),fill:true,tension:0.3,pointRadius:0,borderWidth:2,yAxisID:'y2'}
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#5a6270',font:{size:10}}}},
      scales:{
        x:{ticks:{color:'#5a6270',font:{size:10},maxRotation:0},grid:{display:false}},
        y:{position:'left',ticks:{color:'#5a6270',font:{size:10},callback:v=>'$'+v.toLocaleString()},grid:{color:'rgba(28,28,42,0.8)'}},
        y2:{position:'right',ticks:{color:'#4d8df7',font:{size:10},callback:v=>'$'+v.toLocaleString()},grid:{display:false}}
      }
    }
  });
}

// Trader comparison chart
function renderTraderComparisonChart(){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById('trader-chart');
  if(!ctx)return;
  destroyChart('trader');

  const perf=getTraderPerformance('30d');
  const labels=perf.map(t=>t.trader);
  const pnl=perf.map(t=>t.pnl);
  const colors=pnl.map(v=>v>=0?'rgba(0,230,118,0.7)':'rgba(255,82,82,0.7)');

  window._charts['trader']=new Chart(ctx,{
    type:'bar',
    data:{
      labels,
      datasets:[{label:'P&L',data:pnl,backgroundColor:colors,borderRadius:4}]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      indexAxis:'y',
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:'#5a6270',font:{size:10},callback:v=>'$'+v.toLocaleString()},grid:{color:'rgba(28,28,42,0.8)'}},
        y:{ticks:{color:'#5a6270',font:{size:10}},grid:{display:false}}
      }
    }
  });
}

// ============================================================================
// CORRELATION HEATMAP
// ============================================================================

// Render correlation matrix as HTML table (Chart.js doesn't have native heatmaps)
function renderCorrelationHeatmap(){
  const container=document.getElementById('correlation-heatmap');
  if(!container)return;

  const matrix=getCorrelationMatrix(12);
  const products=matrix.products;

  let html='<table class="heatmap-table" style="width:100%;border-collapse:collapse;font-size:11px;">';
  html+='<tr><th style="padding:8px;"></th>';
  products.forEach(p=>html+=`<th style="padding:8px;color:#5a6270;font-weight:500;">${p.replace('#2','')}</th>`);
  html+='</tr>';

  products.forEach(p1=>{
    html+=`<tr><td style="padding:8px;color:#5a6270;font-weight:500;">${p1.replace('#2','')}</td>`;
    products.forEach(p2=>{
      const corr=matrix.matrix[p1][p2];
      const color=getCorrelationColor(corr);
      html+=`<td style="padding:8px;background:${color};text-align:center;color:#fff;font-weight:500;">${corr.toFixed(2)}</td>`;
    });
    html+='</tr>';
  });
  html+='</table>';

  container.innerHTML=html;
}

function getCorrelationColor(corr){
  if(corr>=0.8)return'#00e676';
  if(corr>=0.5)return'#4caf50';
  if(corr>=0.2)return'#8bc34a';
  if(corr>=-0.2)return'#5a6270';
  if(corr>=-0.5)return'#ff9800';
  return'#ff5252';
}

// ============================================================================
// VOLATILITY CHART
// ============================================================================

function renderVolatilityChart(){
  if(typeof Chart==='undefined')return;
  const ctx=document.getElementById('volatility-chart');
  if(!ctx)return;
  destroyChart('volatility');

  const vol=getVolatilityReport(12);
  const data=vol.byProduct.slice(0,12);
  const labels=data.map(v=>`${v.product} ${v.region.charAt(0).toUpperCase()}`);
  const values=data.map(v=>v.annualizedVol);

  window._charts['volatility']=new Chart(ctx,{
    type:'bar',
    data:{
      labels,
      datasets:[{label:'Annualized Vol %',data:values,backgroundColor:'rgba(255,171,64,0.7)',borderRadius:4}]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:'#5a6270',font:{size:9},maxRotation:45},grid:{display:false}},
        y:{ticks:{color:'#5a6270',font:{size:10},callback:v=>v+'%'},grid:{color:'rgba(28,28,42,0.8)'}}
      }
    }
  });
}

// ============================================================================
// SIGNALS CHART
// ============================================================================

function renderSignalsChart(canvasId,typeCounts){
  if(typeof Chart==='undefined')return;
  const id=canvasId||'signals-chart';
  const ctx=document.getElementById(id);
  if(!ctx)return;
  destroyChart(id);

  // Get signal counts by type
  let counts=typeCounts||{};
  if(!typeCounts&&typeof generateSignals==='function'){
    const signals=generateSignals();
    signals.forEach(s=>{counts[s.type]=(counts[s.type]||0)+1});
  }

  const types=['trend','meanReversion','seasonal','spread','momentum','position'];
  const data=types.map(t=>counts[t]||0);
  const hasData=data.some(d=>d>0);

  if(!hasData){
    // Show empty state message
    ctx.parentElement.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:12px">No signals generated. Add RL price data to enable signal analysis.</div>';
    return;
  }

  window._charts[id]=new Chart(ctx,{
    type:'doughnut',
    data:{
      labels:types.map(t=>t.charAt(0).toUpperCase()+t.slice(1).replace(/([A-Z])/g,' $1')),
      datasets:[{
        data,
        backgroundColor:['#4d8df7','#00e676','#ffab40','#ff5252','#9c27b0','#607d8b'],
        borderWidth:0
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{position:'right',labels:{color:'#5a6270',font:{size:10},padding:8}}
      }
    }
  });
}

// ============================================================================
// MARGIN HEATMAP
// ============================================================================

// Render margin heatmap: products (rows) x customers (columns), avg margin per cell
function renderMarginHeatmap(){
  const container=document.getElementById('margin-heatmap');
  if(!container)return;

  const buyByOrder=buildBuyByOrder();
  const cells={}; // key: product|customer -> {totalMargin, volume}
  const products=new Set();
  const customers=new Set();

  S.sells.forEach(s=>{
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    const buy=ord?buyByOrder[ord]:null;
    if(!buy)return;

    const vol=s.volume||0;
    if(vol<=0)return;
    const freightPerMBF=vol>0?(s.freight||0)/vol:0;
    const sellFOB=(s.price||0)-freightPerMBF;
    const margin=(sellFOB-(buy.price||0))*vol;

    const product=s.product||'Unknown';
    const customer=s.customer||'Unknown';
    products.add(product);
    customers.add(customer);

    const key=product+'|'+customer;
    if(!cells[key])cells[key]={totalMargin:0,volume:0};
    cells[key].totalMargin+=margin;
    cells[key].volume+=vol;
  });

  const prodList=[...products].sort();
  // Sort customers by total volume descending, take top 10
  const custVolumes={};
  customers.forEach(c=>{
    custVolumes[c]=0;
    prodList.forEach(p=>{
      const cell=cells[p+'|'+c];
      if(cell)custVolumes[c]+=cell.volume;
    });
  });
  const custList=[...customers].sort((a,b)=>(custVolumes[b]||0)-(custVolumes[a]||0)).slice(0,10);

  if(prodList.length===0||custList.length===0){
    container.innerHTML='<div style="color:var(--muted);font-size:12px;padding:16px;text-align:center">No matched trades for margin heatmap.</div>';
    return;
  }

  // Compute avg margin per cell and find range for color scale
  const avgMargins={};
  let minM=Infinity,maxM=-Infinity;
  prodList.forEach(p=>{
    custList.forEach(c=>{
      const cell=cells[p+'|'+c];
      if(cell&&cell.volume>0){
        const avg=cell.totalMargin/cell.volume;
        avgMargins[p+'|'+c]=avg;
        if(avg<minM)minM=avg;
        if(avg>maxM)maxM=avg;
      }
    });
  });
  if(!isFinite(minM))minM=0;
  if(!isFinite(maxM))maxM=0;

  // Color function: red for negative, yellow for ~0, green for positive
  function marginColor(val){
    if(val===undefined)return'transparent';
    if(val>0){
      const t=Math.min(val/(maxM||1),1);
      const r=Math.round(255-(255-0)*t);
      const g=Math.round(255-(255-180)*t);
      const b=Math.round(100-(100-80)*t);
      return'rgba('+r+','+g+','+b+',0.7)';
    }else if(val<0){
      const t=Math.min(Math.abs(val)/(Math.abs(minM)||1),1);
      const r=Math.round(255);
      const g=Math.round(255-(255-80)*t);
      const b=Math.round(100-(100-80)*t);
      return'rgba('+r+','+g+','+b+',0.7)';
    }
    return'rgba(255,255,100,0.5)';
  }

  let html='<table style="width:100%;border-collapse:collapse;font-size:10px;">';
  html+='<tr><th style="padding:6px;color:#5a6270;text-align:left;font-size:9px;">Product \\ Customer</th>';
  custList.forEach(c=>{
    const short=c.length>12?c.substring(0,11)+'..':c;
    html+='<th style="padding:6px;color:#5a6270;font-size:9px;text-align:center;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+c+'">'+short+'</th>';
  });
  html+='</tr>';

  prodList.forEach(p=>{
    html+='<tr><td style="padding:6px;color:#d0d4da;font-weight:500;white-space:nowrap;">'+p+'</td>';
    custList.forEach(c=>{
      const key=p+'|'+c;
      const avg=avgMargins[key];
      const bg=marginColor(avg);
      const textColor=avg!==undefined?'#fff':'#3a3a4a';
      const display=avg!==undefined?'$'+avg.toFixed(0):'';
      html+='<td style="padding:6px;text-align:center;background:'+bg+';color:'+textColor+';font-weight:500;border:1px solid rgba(28,28,42,0.5);">'+display+'</td>';
    });
    html+='</tr>';
  });
  html+='</table>';

  // Legend
  html+='<div style="display:flex;justify-content:center;gap:16px;margin-top:8px;font-size:10px;color:#5a6270;">';
  html+='<span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:12px;height:12px;background:rgba(255,80,80,0.7);"></span> Negative</span>';
  html+='<span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:12px;height:12px;background:rgba(255,255,100,0.5);"></span> Break-even</span>';
  html+='<span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:12px;height:12px;background:rgba(0,180,80,0.7);"></span> High margin</span>';
  html+='</div>';

  container.innerHTML=html;
}

// MTM trend chart
function renderMTMTrendChart(canvasId,historyData){
  if(typeof Chart==='undefined')return;
  const id=canvasId||'mtm-trend-chart';
  const ctx=document.getElementById(id);
  if(!ctx)return;
  destroyChart(id);

  // Get history data
  let history=historyData||[];
  if(!historyData&&typeof getMTMHistory==='function'){
    history=getMTMHistory(30);
  }

  if(history.length<2){
    ctx.parentElement.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:12px">Not enough historical data for MTM trend.</div>';
    return;
  }

  const labels=history.map(h=>h.date?.substring(5)||'');
  const values=history.map(h=>h.unrealizedPnL||h.mtmPnL||0);

  const canvasCtx=ctx.getContext('2d');
  window._charts[id]=new Chart(ctx,{
    type:'line',
    data:{
      labels,
      datasets:[{
        label:'Unrealized P&L',
        data:values,
        borderColor:'#4d8df7',
        backgroundColor:hexToGradient('#4d8df7',canvasCtx,120),
        fill:true,
        tension:0.3,
        pointRadius:3,
        borderWidth:2
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:'#5a6270',font:{size:10}},grid:{color:'rgba(28,28,42,0.8)'}},
        y:{ticks:{color:'#5a6270',font:{size:10},callback:v=>'$'+v.toLocaleString()},grid:{color:'rgba(28,28,42,0.8)'}}
      }
    }
  });
}
