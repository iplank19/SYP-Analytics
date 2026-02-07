// SYP Analytics - Analytics Functions

// Build order-matched buy lookup from ALL buys (cross-trader matching)
// When duplicate order numbers exist, keep the most recent (first in array, since buys are unshift'd)
function buildBuyByOrder(){
  const buyByOrder={};
  S.buys.forEach(b=>{
    const ord=normalizeOrderNum(b.orderNum||b.po);
    if(ord&&!buyByOrder[ord])buyByOrder[ord]=b;
  });
  return buyByOrder;
}

// Top products analysis — profit uses matched orders only
function calcTopProducts(buys,sells){
  const products={};
  const buyByOrder=buildBuyByOrder();

  buys.forEach(b=>{
    const p=b.product||'Unknown';
    if(!products[p])products[p]={product:p,buyVol:0,sellVol:0,buyVal:0,sellFOBVal:0,matchedProfit:0,matchedVol:0};
    products[p].buyVol+=(b.volume||0);
    products[p].buyVal+=(b.price||0)*(b.volume||0);
  });

  sells.forEach(s=>{
    const p=s.product||'Unknown';
    if(!products[p])products[p]={product:p,buyVol:0,sellVol:0,buyVal:0,sellFOBVal:0,matchedProfit:0,matchedVol:0};
    const vol=s.volume||0;
    products[p].sellVol+=vol;
    const frtPerMBF=vol>0?(s.freight||0)/vol:0;
    const sellFob=(s.price||0)-frtPerMBF;
    products[p].sellFOBVal+=sellFob*vol;

    // Matched profit
    const ord=normalizeOrderNum(s.orderNum||s.linkedPO||s.oc);
    const buy=ord?buyByOrder[ord]:null;
    if(buy&&vol>0){
      const buyCost=buy.price||0;
      products[p].matchedProfit+=(sellFob-buyCost)*vol;
      products[p].matchedVol+=vol;
    }
  });

  const list=Object.values(products).map(p=>{
    return{
      ...p,
      volume:p.buyVol+p.sellVol,
      margin:p.matchedVol>0?p.matchedProfit/p.matchedVol:0,
      profit:p.matchedProfit
    };
  });

  return{
    byVolume:[...list].sort((a,b)=>b.volume-a.volume),
    byProfit:[...list].filter(p=>p.profit!==0).sort((a,b)=>b.profit-a.profit)
  };
}

// Top customers analysis — profit uses matched orders only
function calcTopCustomers(sells){
  const customers={};
  const buyByOrder=buildBuyByOrder();

  sells.forEach(s=>{
    const c=s.customer||'Unknown';
    if(!customers[c])customers[c]={customer:c,volume:0,value:0,profit:0,matchedVol:0,orders:0};
    const vol=s.volume||0;
    customers[c].volume+=vol;
    customers[c].orders++;
    const frtPerMBF=vol>0?(s.freight||0)/vol:0;
    const sellFob=(s.price||0)-frtPerMBF;
    customers[c].value+=sellFob*vol;

    // Matched profit
    const ord=normalizeOrderNum(s.orderNum||s.linkedPO||s.oc);
    const buy=ord?buyByOrder[ord]:null;
    if(buy&&vol>0){
      customers[c].profit+=(sellFob-(buy.price||0))*vol;
      customers[c].matchedVol+=vol;
    }
  });

  return Object.values(customers).sort((a,b)=>b.volume-a.volume);
}

function calcAgingSummary(buys){
  const now=new Date();
  let fresh=0,week=0,twoToFourWeek=0,old=0;

  // Calculate sold volume per order
  const orderSold=buildOrderSold();

  buys.forEach(b=>{
    if(!b.date)return;
    const days=Math.floor((now-new Date(b.date))/(1000*60*60*24));
    const ord=normalizeOrderNum(b.orderNum||b.po);
    const sold=orderSold[ord]||0;
    const avail=(b.volume||0)-sold;
    if(avail<=0)return; // Skip fully sold inventory

    if(days<=7)fresh+=avail;
    else if(days<=14)week+=avail;
    else if(days<=30)twoToFourWeek+=avail;
    else old+=avail;
  });

  return{fresh,week,twoToFourWeek,twoWeek:twoToFourWeek,old,total:fresh+week+twoToFourWeek+old};
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
  const buyByOrder=buildBuyByOrder();

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

    // Calculate profit — matched orders only
    let profit=0;
    weekSells.forEach(s=>{
      const ord=normalizeOrderNum(s.orderNum||s.linkedPO||s.oc);
      const buy=ord?buyByOrder[ord]:null;
      if(buy){
        const vol=s.volume||0;
        const frtPerMBF=vol>0?(s.freight||0)/vol:0;
        const sellFob=(s.price||0)-frtPerMBF;
        profit+=(sellFob-(buy.price||0))*vol;
      }
    });

    const label=`${weekStart.getMonth()+1}/${weekStart.getDate()}`;
    weeks.push({label,buyVol,sellVol,profit});
  }

  return weeks;
}

// Market Movers — biggest week-over-week RL price changes
function calcMarketMovers(){
  if(!S.rl||S.rl.length<2)return[];
  const latest=S.rl[S.rl.length-1];
  const prev=S.rl[S.rl.length-2];
  const movers=[];
  const products=PRODUCTS;
  const regions=['west','central','east'];
  regions.forEach(reg=>{
    products.forEach(prod=>{
      const curr=latest[reg]?.[prod];
      const old=prev[reg]?.[prod];
      if(curr&&old&&old>0){
        const change=curr-old;
        const pct=(change/old)*100;
        movers.push({product:prod,region:reg,curr,old,change,pct});
      }
    });
  });
  movers.sort((a,b)=>Math.abs(b.change)-Math.abs(a.change));
  return movers.slice(0,5);
}

// Daily P&L aggregation for calendar heatmap
// Groups matched sell trades by sell date, calculates profit per trade
// Ignores date filter so calendar can show any month; respects trader filter
function calcDailyPnL(){
  const buyByOrder=buildBuyByOrder();
  const isAdmin=S.trader==='Admin';
  const isMyTrade=t=>isAdmin||t===S.trader||!t;
  const mP=p=>S.filters.prod==='all'||p===S.filters.prod;

  const daily={};
  S.sells.filter(s=>isMyTrade(s.trader)&&mP(s.product)).forEach(s=>{
    const ord=normalizeOrderNum(s.orderNum||s.linkedPO||s.oc);
    const buy=ord?buyByOrder[ord]:null;
    if(!buy||!s.date)return;
    const vol=s.volume||0;
    if(vol<=0)return;
    const frtPerMBF=vol>0?(s.freight||0)/vol:0;
    const sellFob=(s.price||0)-frtPerMBF;
    const buyCost=buy.price||0;
    const profit=(sellFob-buyCost)*vol;
    const day=s.date; // YYYY-MM-DD
    if(!daily[day])daily[day]={total:0,trades:[]};
    daily[day].total+=profit;
    daily[day].trades.push({
      customer:s.customer||'Unknown',
      product:s.product||'',
      volume:vol,
      profit,
      sellPrice:s.price||0,
      buyPrice:buyCost,
      freight:s.freight||0,
      orderNum:ord
    });
  });
  return daily;
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

  // Realized profit from MATCHED trades only (same orderNum on buy + sell)
  // Use ALL buys for matching (cross-trader orders are valid)
  const buyByOrder=buildBuyByOrder();

  let matchedProfit=0,matchedVol=0,matchedBuyCost=0,matchedSellFOB=0;
  sells.forEach(s=>{
    const ord=normalizeOrderNum(s.orderNum||s.linkedPO||s.oc);
    const buy=ord?buyByOrder[ord]:null;
    if(buy){
      const vol=s.volume||0;
      const sellFrtPerMBF=vol>0?(s.freight||0)/vol:0;
      const sellFob=(s.price||0)-sellFrtPerMBF;
      const buyCost=buy.price||0;
      const totalBuyCost=buyCost*vol;
      const sellFOBVal=sellFob*vol;
      matchedProfit+=sellFOBVal-totalBuyCost;
      matchedVol+=vol;
      matchedBuyCost+=totalBuyCost;
      matchedSellFOB+=sellFOBVal;
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
      const baseMatch=normProd.match(/(\d+x\d+)/);
      if(baseMatch){
        const baseSize=baseMatch[1];
        if(normLen&&rl.specified_lengths?.[region]?.[baseSize+'#1']?.[normLen]){
          return rl.specified_lengths[region][baseSize+'#1'][normLen];
        }
        if(rl.composite?.[region]?.[baseSize+'#1'])return rl.composite[region][baseSize+'#1'];
        if(rl[region]?.[baseSize+'#1'])return rl[region][baseSize+'#1'];
        if(normLen&&rl.specified_lengths?.[region]?.[baseSize+'#2']?.[normLen]){
          return rl.specified_lengths[region][baseSize+'#2'][normLen];
        }
      }
      return null;
    }

    // Standard product lookup
    if(!normProd.includes('#'))normProd+='#2';

    if(normLen&&rl.specified_lengths?.[region]?.[normProd]?.[normLen]){
      return rl.specified_lengths[region][normProd][normLen];
    }
    if(rl[region]?.[normProd])return rl[region][normProd];
    const baseSize=normProd.replace(/#\d/,'');
    if(rl.composite?.[region]?.[baseSize])return rl.composite[region][baseSize];
    if(rl[region]?.[baseSize])return rl[region][baseSize];
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
    const rl=S.rl.slice().reverse().find(r=>new Date(r.date)<=new Date(b.date));
    const isMSR=isMSRProduct(b.product);
    let rlP=null;
    if(isMSR&&b.basePrice){
      rlP=b.basePrice;
    }else{
      rlP=findRLPrice(rl,b.region,b.product,b.length,isMSR);
    }
    return{...b,rlP,diff:rlP&&!isMSR?(b.price-rlP):null,isMSR};
  });

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

// ============================================================================
// TRADER LEADERBOARD
// ============================================================================

function calcTraderLeaderboard(period){
  period=period||S.leaderboardPeriod||'30d'
  const r=getLeaderboardRange(period)
  const inR=d=>new Date(d)>=r.start&&new Date(d)<=r.end
  const allBuys=S.buys.filter(b=>inR(b.date))
  const allSells=S.sells.filter(s=>inR(s.date))

  const buyByOrder=buildBuyByOrder()

  const board=TRADERS.map(t=>{
    const buys=allBuys.filter(b=>b.trader===t||(!b.trader&&t==='Ian P'))
    const sells=allSells.filter(s=>s.trader===t||(!s.trader&&t==='Ian P'))
    const buyVol=buys.reduce((s,b)=>s+(b.volume||0),0)
    const sellVol=sells.reduce((s,x)=>s+(x.volume||0),0)

    let profit=0,matchedVol=0,wins=0,matchedCount=0
    sells.forEach(s=>{
      const ord=normalizeOrderNum(s.orderNum||s.linkedPO||s.oc)
      const buy=ord?buyByOrder[ord]:null
      if(!buy)return
      const vol=s.volume||0
      if(vol<=0)return
      const frPerMBF=vol>0?(s.freight||0)/vol:0
      const sellFob=(s.price||0)-frPerMBF
      const tradeProfit=(sellFob-(buy.price||0))*vol
      profit+=tradeProfit
      matchedVol+=vol
      matchedCount++
      if(sellFob>(buy.price||0))wins++
    })

    const margin=matchedVol>0?profit/matchedVol:0
    const winRate=matchedCount>0?(wins/matchedCount)*100:0
    const trades=buys.length+sells.length

    return{
      name:t,
      profit,
      volume:buyVol+sellVol,
      buyVol,
      sellVol,
      margin,
      winRate,
      trades,
      matchedCount
    }
  })

  // Rank by profit
  board.sort((a,b)=>b.profit-a.profit)
  board.forEach((t,i)=>t.rank=i+1)

  return board
}

// ============================================================================
// PRODUCT HEATMAP DATA
// ============================================================================

function calcProductHeatmapData(){
  const buyByOrder=buildBuyByOrder()
  const matrix={}

  // Build product x region margin matrix from matched sells
  S.sells.forEach(s=>{
    const ord=normalizeOrderNum(s.orderNum||s.linkedPO||s.oc)
    const buy=ord?buyByOrder[ord]:null
    if(!buy)return
    const vol=s.volume||0
    if(vol<=0)return

    const product=s.product||'Unknown'
    const region=buy.region||'west'
    const frPerMBF=vol>0?(s.freight||0)/vol:0
    const sellFob=(s.price||0)-frPerMBF
    const marginPerMBF=sellFob-(buy.price||0)

    if(!matrix[product])matrix[product]={}
    if(!matrix[product][region])matrix[product][region]={totalMargin:0,totalVol:0,count:0}
    matrix[product][region].totalMargin+=marginPerMBF*vol
    matrix[product][region].totalVol+=vol
    matrix[product][region].count++
  })

  // Convert to array format
  const rows=[]
  Object.entries(matrix).forEach(([product,regions])=>{
    const row={product}
    ;['west','central','east'].forEach(r=>{
      const d=regions[r]
      row[r]=d&&d.totalVol>0?{
        margin:d.totalMargin/d.totalVol,
        volume:d.totalVol,
        count:d.count
      }:null
    })
    rows.push(row)
  })

  rows.sort((a,b)=>(a.product||'').localeCompare(b.product||''))
  return rows
}

// ============================================================================
// DAILY P&L SERIES (for sparklines/charts)
// ============================================================================

function calcDailyPnLSeries(days){
  days=days||30
  const buyByOrder=buildBuyByOrder()
  const isAdmin=S.trader==='Admin'
  const isMyTrade=t=>isAdmin||t===S.trader||!t

  const cutoff=new Date()
  cutoff.setDate(cutoff.getDate()-days)
  cutoff.setHours(0,0,0,0)

  // Build daily totals
  const dailyMap={}
  S.sells.filter(s=>isMyTrade(s.trader)&&new Date(s.date)>=cutoff).forEach(s=>{
    const ord=normalizeOrderNum(s.orderNum||s.linkedPO||s.oc)
    const buy=ord?buyByOrder[ord]:null
    if(!buy||!s.date)return
    const vol=s.volume||0
    if(vol<=0)return
    const frPerMBF=vol>0?(s.freight||0)/vol:0
    const sellFob=(s.price||0)-frPerMBF
    const profit=(sellFob-(buy.price||0))*vol
    const day=s.date
    dailyMap[day]=(dailyMap[day]||0)+profit
  })

  // Fill in all days in range
  const series=[]
  let cumulative=0
  const d=new Date(cutoff)
  const now=new Date()
  while(d<=now){
    const dateStr=d.toISOString().split('T')[0]
    const pnl=dailyMap[dateStr]||0
    cumulative+=pnl
    series.push({date:dateStr,pnl,cumulative})
    d.setDate(d.getDate()+1)
  }

  return series
}

// ============================================================================
// QUICK STATS (Dashboard KPIs)
// ============================================================================

function getQuickStats(){
  const buyByOrder=buildBuyByOrder()
  const isAdmin=S.trader==='Admin'
  const isMyTrade=t=>isAdmin||t===S.trader||!t
  const now=new Date()

  // Date ranges
  const todayStr=now.toISOString().split('T')[0]
  const weekAgo=new Date(now-7*86400000)
  const monthAgo=new Date(now-30*86400000)
  const ytdStart=new Date(now.getFullYear(),0,1)

  // Compute P&L for a date range
  const pnlFor=(startDate)=>{
    let profit=0,count=0
    S.sells.filter(s=>isMyTrade(s.trader)&&new Date(s.date)>=startDate).forEach(s=>{
      const ord=normalizeOrderNum(s.orderNum||s.linkedPO||s.oc)
      const buy=ord?buyByOrder[ord]:null
      if(!buy)return
      const vol=s.volume||0
      if(vol<=0)return
      const frPerMBF=vol>0?(s.freight||0)/vol:0
      const sellFob=(s.price||0)-frPerMBF
      profit+=(sellFob-(buy.price||0))*vol
      count++
    })
    return{profit,count}
  }

  const dayPnL=pnlFor(new Date(todayStr))
  const weekPnL=pnlFor(weekAgo)
  const monthPnL=pnlFor(monthAgo)
  const ytdPnL=pnlFor(ytdStart)

  // Open positions
  const positions={}
  S.buys.filter(b=>isMyTrade(b.trader)).forEach(b=>{
    const key=b.product||'Unknown'
    if(!positions[key])positions[key]={bought:0,sold:0}
    positions[key].bought+=b.volume||0
  })
  S.sells.filter(s=>isMyTrade(s.trader)).forEach(s=>{
    const key=s.product||'Unknown'
    if(!positions[key])positions[key]={bought:0,sold:0}
    positions[key].sold+=s.volume||0
  })
  const openPositions=Object.values(positions).filter(p=>Math.abs(p.bought-p.sold)>0).length
  const netPosition=Object.values(positions).reduce((s,p)=>s+(p.bought-p.sold),0)

  // Average margin (matched trades, last 30d)
  let totalMargin=0,marginCount=0
  S.sells.filter(s=>isMyTrade(s.trader)&&new Date(s.date)>=monthAgo).forEach(s=>{
    const ord=normalizeOrderNum(s.orderNum||s.linkedPO||s.oc)
    const buy=ord?buyByOrder[ord]:null
    if(!buy)return
    const vol=s.volume||0
    if(vol<=0)return
    const frPerMBF=vol>0?(s.freight||0)/vol:0
    const sellFob=(s.price||0)-frPerMBF
    totalMargin+=sellFob-(buy.price||0)
    marginCount++
  })
  const avgMargin=marginCount>0?totalMargin/marginCount:0

  // Trade count (last 30d)
  const buyCount=S.buys.filter(b=>isMyTrade(b.trader)&&new Date(b.date)>=monthAgo).length
  const sellCount=S.sells.filter(s=>isMyTrade(s.trader)&&new Date(s.date)>=monthAgo).length

  return{
    pnl:{
      day:dayPnL.profit,
      week:weekPnL.profit,
      month:monthPnL.profit,
      ytd:ytdPnL.profit
    },
    openPositions,
    netPosition,
    avgMargin,
    tradeCount:buyCount+sellCount,
    buyCount,
    sellCount
  }
}
