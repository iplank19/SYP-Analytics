// SYP Analytics - Chart Functions
// Chart.js integration + legacy canvas chart helpers

// Chart instance management (prevent memory leaks on re-render)
window._charts={};
function destroyChart(id){if(window._charts[id]){window._charts[id].destroy();delete window._charts[id]}}
function destroyAllCharts(){Object.keys(window._charts).forEach(destroyChart)}

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
