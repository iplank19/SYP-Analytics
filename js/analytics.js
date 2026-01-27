// SYP Analytics - Analytics Functions
// Advanced Analytics Helper Functions
function calcTopProducts(buys,sells){
  // Group by product
  const products={};

  // Build buy lookup by order number
  const buyByOrder={};
  S.buys.forEach(b=>{
    const ord=String(b.orderNum||b.po||'').trim();
    if(ord)buyByOrder[ord]=b;
  });

  buys.forEach(b=>{
    const p=b.product||'Unknown';
    if(!products[p])products[p]={product:p,buyVol:0,sellVol:0,buyVal:0,sellVal:0,profit:0};
    products[p].buyVol+=(b.volume||0);
    products[p].buyVal+=(b.price||0)*(b.volume||0);
  });

  sells.forEach(s=>{
    const p=s.product||'Unknown';
    if(!products[p])products[p]={product:p,buyVol:0,sellVol:0,buyVal:0,sellVal:0,profit:0};
    products[p].sellVol+=(s.volume||0);
    const frtPerMBF=s.volume>0?(s.freight||0)/s.volume:0;
    products[p].sellVal+=((s.price||0)-frtPerMBF)*(s.volume||0);

    // Calculate profit from matched orders
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    const buy=ord?buyByOrder[ord]:null;
    if(buy){
      const buyCost=buy.price||0;
      const buyFrtPerMBF=buy.volume>0?(buy.freight||0)/buy.volume:0;
      const sellFob=(s.price||0)-frtPerMBF;
      products[p].profit+=(sellFob-buyCost-buyFrtPerMBF)*(s.volume||0);
    }
  });

  const list=Object.values(products).map(p=>({
    ...p,
    volume:p.buyVol+p.sellVol,
    margin:p.sellVol?(p.sellVal/p.sellVol)-(p.buyVol?p.buyVal/p.buyVol:0):0
  }));

  return{
    byVolume:[...list].sort((a,b)=>b.volume-a.volume),
    byProfit:[...list].filter(p=>p.profit!==0).sort((a,b)=>b.profit-a.profit)
  };
}

function calcTopCustomers(sells){
  const customers={};

  // Build buy lookup
  const buyByOrder={};
  S.buys.forEach(b=>{
    const ord=String(b.orderNum||b.po||'').trim();
    if(ord)buyByOrder[ord]=b;
  });

  sells.forEach(s=>{
    const c=s.customer||'Unknown';
    if(!customers[c])customers[c]={customer:c,volume:0,value:0,profit:0,orders:0};
    customers[c].volume+=(s.volume||0);
    customers[c].orders++;
    const frtPerMBF=s.volume>0?(s.freight||0)/s.volume:0;
    customers[c].value+=((s.price||0)-frtPerMBF)*(s.volume||0);

    // Calculate profit
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    const buy=ord?buyByOrder[ord]:null;
    if(buy){
      const buyCost=buy.price||0;
      const buyFrtPerMBF=buy.volume>0?(buy.freight||0)/buy.volume:0;
      const sellFob=(s.price||0)-frtPerMBF;
      customers[c].profit+=(sellFob-buyCost-buyFrtPerMBF)*(s.volume||0);
    }
  });

  return Object.values(customers).sort((a,b)=>b.volume-a.volume);
}

function calcAgingSummary(buys){
  const now=new Date();
  let fresh=0,week=0,twoWeek=0,old=0;

  // Calculate sold volume per order
  const orderSold={};
  S.sells.forEach(s=>{
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    if(ord)orderSold[ord]=(orderSold[ord]||0)+(s.volume||0);
  });

  buys.forEach(b=>{
    if(!b.date)return;
    const days=Math.floor((now-new Date(b.date))/(1000*60*60*24));
    const ord=String(b.orderNum||b.po||'').trim();
    const sold=orderSold[ord]||0;
    const avail=(b.volume||0)-sold;
    if(avail<=0)return; // Skip fully sold inventory

    if(days<=7)fresh+=avail;
    else if(days<=14)week+=avail;
    else if(days<=30)twoWeek+=avail;
    else old+=avail;
  });

  return{fresh,week,twoWeek,old,total:fresh+week+twoWeek+old};
}

function calcWeeklyVsMarket(allBuys,rlData){
  const weeks=[];
  const now=new Date();

  for(let i=7;i>=0;i--){
    const weekEnd=new Date(now);
    weekEnd.setDate(weekEnd.getDate()-i*7);
    const weekStart=new Date(weekEnd);
    weekStart.setDate(weekStart.getDate()-7);

    const inWeek=d=>{
      const date=new Date(d);
      return date>=weekStart&&date<weekEnd;
    };

    const weekBuys=allBuys.filter(b=>inWeek(b.date)&&!b.product?.toUpperCase().includes('MSR')&&!b.product?.toUpperCase().includes('2400'));

    // Find RL data closest to this week
    const weekRL=rlData.filter(r=>new Date(r.date)<=weekEnd).pop();

    let totalDiff=0,totalVol=0;
    weekBuys.forEach(b=>{
      if(!weekRL)return;
      const region=b.region||'west';
      const product=b.product;
      const length=b.length;

      // Try to match RL price
      let rlPrice=null;
      if(length&&length!=='RL'&&weekRL.specified_lengths?.[region]?.[product]?.[length]){
        rlPrice=weekRL.specified_lengths[region][product][length];
      }else if(weekRL[region]?.[product]){
        rlPrice=weekRL[region][product];
      }

      if(rlPrice){
        const diff=(b.price||0)-rlPrice;
        totalDiff+=diff*(b.volume||0);
        totalVol+=b.volume||0;
      }
    });

    const avgDiff=totalVol>0?totalDiff/totalVol:0;
    const label=`${weekStart.getMonth()+1}/${weekStart.getDate()}`;
    weeks.push({label,avgDiff,volume:totalVol});
  }

  return weeks;
}

function calcWeeklyPerformance(allBuys,allSells){
  const weeks=[];
  const now=new Date();

  // Build buy lookup
  const buyByOrder={};
  allBuys.forEach(b=>{
    const ord=String(b.orderNum||b.po||'').trim();
    if(ord)buyByOrder[ord]=b;
  });

  for(let i=7;i>=0;i--){
    const weekEnd=new Date(now);
    weekEnd.setDate(weekEnd.getDate()-i*7);
    const weekStart=new Date(weekEnd);
    weekStart.setDate(weekStart.getDate()-7);

    const inWeek=d=>{
      const date=new Date(d);
      return date>=weekStart&&date<weekEnd;
    };

    const weekBuys=allBuys.filter(b=>inWeek(b.date));
    const weekSells=allSells.filter(s=>inWeek(s.date));

    const buyVol=weekBuys.reduce((s,b)=>s+(b.volume||0),0);
    const sellVol=weekSells.reduce((s,x)=>s+(x.volume||0),0);

    // Calculate profit
    let profit=0;
    weekSells.forEach(s=>{
      const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
      const buy=ord?buyByOrder[ord]:null;
      if(buy){
        const frtPerMBF=s.volume>0?(s.freight||0)/s.volume:0;
        const buyFrtPerMBF=buy.volume>0?(buy.freight||0)/buy.volume:0;
        const sellFob=(s.price||0)-frtPerMBF;
        profit+=(sellFob-(buy.price||0)-buyFrtPerMBF)*(s.volume||0);
      }
    });

    const label=`${weekStart.getMonth()+1}/${weekStart.getDate()}`;
    weeks.push({label,buyVol,sellVol,profit});
  }

  return weeks;
}

function analytics(){
  const{buys,sells}=filtered();
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
  const bVol=buys.reduce((s,b)=>s+(b.volume||0),0);
  const bVal=buys.reduce((s,b)=>s+(b.price||0)*(b.volume||0),0);
  const avgB=bVol?bVal/bVol:0;
  const sVol=sells.reduce((s,x)=>s+(x.volume||0),0);
  const sVal=sells.reduce((s,x)=>s+(x.price||0)*(x.volume||0),0);
  // freight is $/load, FOB = price - (freight/volume per MBF)
  const sFOB=sells.reduce((s,x)=>{
    const freightPerMBF=x.volume>0?(x.freight||0)/x.volume:0;
    return s+((x.price||0)-freightPerMBF)*(x.volume||0);
  },0);
  const avgS=sVol?sFOB/sVol:0;
  const avgFr=sVol?(sVal-sFOB)/sVol:0;
  
  // Calculate realized profit from MATCHED trades only (same orderNum)
  // Normalize order numbers to strings for matching
  const buyByOrder={};
  S.buys.forEach(b=>{
    const ord=String(b.orderNum||b.po||'').trim();
    if(ord)buyByOrder[ord]=b;
  });
  
  let matchedProfit=0,matchedVol=0,matchedBuyCost=0,matchedSellFOB=0;
  sells.forEach(s=>{
    const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();
    const buy=ord?buyByOrder[ord]:null;
    if(buy){
      const buyFrtPerMBF=buy.volume>0?(buy.freight||0)/buy.volume:0;
      const totalBuyCost=((buy.price||0)+buyFrtPerMBF)*(s.volume||0);
      const sellFrtPerMBF=s.volume>0?(s.freight||0)/s.volume:0;
      const sellFOB=((s.price||0)-sellFrtPerMBF)*(s.volume||0);
      matchedProfit+=sellFOB-totalBuyCost;
      matchedVol+=s.volume||0;
      matchedBuyCost+=totalBuyCost;
      matchedSellFOB+=sellFOB;
    }
  });
  const avgMatchedBuy=matchedVol?matchedBuyCost/matchedVol:0;
  const avgMatchedSell=matchedVol?matchedSellFOB/matchedVol:0;
  const margin=avgMatchedSell-avgMatchedBuy;
  const marginPct=avgMatchedBuy?(margin/avgMatchedBuy)*100:0;
  const profit=matchedProfit;
  const inv=bVol-sVol;
  
  // Helper to find RL price for a product/region/length combo
  const findRLPrice=(rl,region,product,length,forMSR=false)=>{
    if(!rl||!region||!product)return null;
    
    // Normalize length: "16'" -> "16", "20'" -> "20"
    let normLen=(length||'').toString().replace(/[^0-9]/g,'');
    
    // For MSR/2400, look up the #1 base price for the same size/length
    let normProd=(product||'').replace(/\s+/g,'');
    if(forMSR){
      // Extract base size (e.g., "2x6MSR" -> "2x6", "2x4 2400f" -> "2x4")
      const baseMatch=normProd.match(/(\d+x\d+)/);
      if(baseMatch){
        const baseSize=baseMatch[1];
        // Try specified lengths first with #1 grade
        if(normLen&&rl.specified_lengths?.[region]?.[baseSize+'#1']?.[normLen]){
          return rl.specified_lengths[region][baseSize+'#1'][normLen];
        }
        // Try composite #1
        if(rl.composite?.[region]?.[baseSize+'#1'])return rl.composite[region][baseSize+'#1'];
        if(rl[region]?.[baseSize+'#1'])return rl[region][baseSize+'#1'];
        // Fall back to #2 if no #1
        if(normLen&&rl.specified_lengths?.[region]?.[baseSize+'#2']?.[normLen]){
          return rl.specified_lengths[region][baseSize+'#2'][normLen];
        }
      }
      return null;
    }
    
    // Standard product lookup
    if(!normProd.includes('#'))normProd+='#2';
    
    // Try specified lengths first if we have a length
    if(normLen&&rl.specified_lengths?.[region]?.[normProd]?.[normLen]){
      return rl.specified_lengths[region][normProd][normLen];
    }
    
    // Try composite prices (region.product)
    if(rl[region]?.[normProd])return rl[region][normProd];
    
    // Try composite without grade suffix for base lookup
    const baseSize=normProd.replace(/#\d/,'');
    if(rl.composite?.[region]?.[baseSize])return rl.composite[region][baseSize];
    if(rl[region]?.[baseSize])return rl[region][baseSize];
    
    // Try specified lengths with base size (no grade)
    if(normLen&&rl.specified_lengths?.[region]?.[baseSize]?.[normLen]){
      return rl.specified_lengths[region][baseSize][normLen];
    }
    
    return null;
  };
  
  // Check if product is MSR/2400
  const isMSRProduct=(prod)=>{
    const p=(prod||'').toUpperCase();
    return p.includes('MSR')||p.includes('2400');
  };
  
  const bench=buys.map(b=>{
    // Find the RL report closest to but not after the buy date
    const rl=S.rl.slice().reverse().find(r=>new Date(r.date)<=new Date(b.date));
    const isMSR=isMSRProduct(b.product);
    // For MSR, prefer stored basePrice, otherwise calculate from RL
    let rlP=null;
    if(isMSR&&b.basePrice){
      rlP=b.basePrice;
    }else{
      rlP=findRLPrice(rl,b.region,b.product,b.length,isMSR);
    }
    return{...b,rlP,diff:rlP&&!isMSR?(b.price-rlP):null,isMSR};
  });
  
  // Only include non-MSR trades in market comparison
  const standardBench=bench.filter(b=>!b.isMSR);
  const totVsRL=standardBench.filter(b=>b.diff!==null).reduce((s,b)=>s+b.diff*b.volume,0);
  const volRL=standardBench.filter(b=>b.diff!==null).reduce((s,b)=>s+b.volume,0);
  const avgVsRL=volRL?totVsRL/volRL:0;
  const byReg={west:{vol:0},central:{vol:0},east:{vol:0}};
  buys.forEach(b=>{if(byReg[b.region])byReg[b.region].vol+=b.volume||0});
  const byProd={};
  buys.forEach(b=>{if(!byProd[b.product])byProd[b.product]={bVol:0,bVal:0,sVol:0,sFOB:0};byProd[b.product].bVol+=b.volume||0;byProd[b.product].bVal+=(b.price||0)*(b.volume||0)});
  sells.forEach(x=>{if(!byProd[x.product])byProd[x.product]={bVol:0,bVal:0,sVol:0,sFOB:0};byProd[x.product].sVol+=x.volume||0;const frMBF=x.volume>0?(x.freight||0)/x.volume:0;byProd[x.product].sFOB+=((x.price||0)-frMBF)*(x.volume||0)});
  const byCust={};
  sells.forEach(x=>{if(!byCust[x.customer])byCust[x.customer]={vol:0,rev:0,fob:0,n:0};byCust[x.customer].vol+=x.volume||0;byCust[x.customer].rev+=(x.price||0)*(x.volume||0);const frMBF=x.volume>0?(x.freight||0)/x.volume:0;byCust[x.customer].fob+=((x.price||0)-frMBF)*(x.volume||0);byCust[x.customer].n++});
  const byDest={};
  sells.forEach(x=>{if(!byDest[x.destination])byDest[x.destination]={vol:0,fr:0,n:0};byDest[x.destination].vol+=x.volume||0;byDest[x.destination].fr+=(x.freight||0);byDest[x.destination].n++});
  return{buys,sells,latestRL,bVol,bVal,avgB,sVol,sVal,avgS,avgFr,margin,marginPct,profit,inv,bench,avgVsRL,totVsRL,byReg,byProd,byCust,byDest,matchedVol};
}
