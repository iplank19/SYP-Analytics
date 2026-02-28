// SYP Analytics - AI Functions
const AI_MODEL_CHAT=()=>S.aiModel||'claude-opus-4-20250514';
const AI_MODEL_UTILITY='claude-sonnet-4-20250514';

const AI_TOOLS=[
  // Orders - Create
  {name:'create_buy',desc:'Create a buy order',params:['mill','product','price','volume','region','length','shipWeek','orderNum','notes']},
  {name:'create_sell',desc:'Create a sell order',params:['customer','destination','product','price','freight','volume','length','shipWeek','orderNum','notes']},
  // Orders - Read
  {name:'get_buys',desc:'Get all buy orders (optionally filtered)',params:['product','mill','limit']},
  {name:'get_sells',desc:'Get all sell orders (optionally filtered)',params:['product','customer','limit']},
  {name:'search_trades',desc:'Search buy/sell trades',params:['type','product','customer','mill']},
  {name:'get_inventory',desc:'Get current inventory/position by product',params:[]},
  {name:'get_analytics',desc:'Get trading analytics summary',params:[]},
  // Orders - Update
  {name:'update_buy',desc:'Update an existing buy order',params:['id','mill','product','price','volume','region','length','shipWeek','notes','shipped']},
  {name:'update_sell',desc:'Update an existing sell order',params:['id','customer','destination','product','price','freight','volume','length','shipWeek','notes','delivered']},
  {name:'mark_buy_shipped',desc:'Mark a buy order as shipped',params:['id']},
  {name:'mark_sell_delivered',desc:'Mark a sell order as delivered',params:['id']},
  // Orders - Delete
  {name:'delete_buy',desc:'Delete a buy order by ID',params:['id']},
  {name:'delete_sell',desc:'Delete a sell order by ID',params:['id']},
  {name:'delete_buys',desc:'Delete multiple buy orders by IDs or criteria',params:['ids','product','mill','all']},
  {name:'delete_sells',desc:'Delete multiple sell orders by IDs or criteria',params:['ids','product','customer','all']},
  // Quote Engine
  {name:'add_quote_item',desc:'Add item to quote engine',params:['product','origin','fob','tls','shipWeek']},
  {name:'clear_quote_items',desc:'Clear all items from quote engine',params:[]},
  {name:'generate_quote',desc:'Generate quote for a customer',params:['customerName']},
  // Customers & Mills
  {name:'get_customers',desc:'List all customers',params:[]},
  {name:'get_mills',desc:'List all mills',params:[]},
  {name:'add_customer',desc:'Add a new customer',params:['name','destination','email']},
  {name:'add_mill',desc:'Add a new mill',params:['name','location','region']},
  {name:'update_customer',desc:'Update a customer or mill',params:['id','name','destination','email','locations','region']},
  {name:'delete_customer',desc:'Delete a customer or mill by ID or name',params:['id','name']},
  // Freight Lanes
  {name:'get_lanes',desc:'Get freight lanes and mileage',params:[]},
  {name:'add_lane',desc:'Add a freight lane',params:['origin','dest','miles']},
  {name:'delete_lane',desc:'Delete a freight lane',params:['origin','dest']},
  // Market Data
  {name:'get_rl_prices',desc:'Get current Random Lengths prices',params:['region']},
  // Settings
  {name:'set_freight_settings',desc:'Set freight calculator settings',params:['freightBase','stateRates','shortHaulFloor']},
  // Navigation
  {name:'navigate',desc:'Navigate to a different view',params:['view']},
  // Analytics
  {name:'get_matched_trades',desc:'Get matched buy+sell pairs with P&L',params:['product','customer','limit']},
  {name:'get_open_orders',desc:'Get unshipped buys and undelivered sells',params:['product']},
  {name:'get_position_detail',desc:'Detailed position by product with avg prices, volumes, exposure',params:['product']},
  {name:'get_price_history',desc:'RL price history for a product/region over last N weeks',params:['product','region','weeks']},
  {name:'get_customer_summary',desc:'Full customer profile: volume, revenue, avg price, recent orders',params:['customer']},
  {name:'get_mill_summary',desc:'Full mill profile: volume, avg cost, products supplied',params:['mill']},
  {name:'analyze_margin',desc:'Margin breakdown by product, customer, or time period',params:['groupBy','filter']},
  {name:'get_top_customers',desc:'Ranked customer list by volume, profit, or order count',params:['sortBy','limit']},
  {name:'get_top_products',desc:'Ranked product list by volume, margin, or P&L',params:['sortBy','limit']},
  {name:'suggest_coverage',desc:'Identify short positions needing mill coverage',params:[]},
  {name:'generate_briefing',desc:'Generate daily trading briefing (deprecated)',params:[]},
  // Mill Pricing
  {name:'add_mill_quote',desc:'Add a mill pricing quote',params:['mill','product','price','length','volume','tls','shipWindow','notes']},
  {name:'parse_mill_prices',desc:'Parse a pasted mill price list (multiple quotes) and save all quotes to Mill Intel. Use when user pastes a price sheet or list of mill prices.',params:['text']},
  {name:'get_mill_prices',desc:'Get current mill prices for a product or all products',params:['product','mill']},
  {name:'get_best_mill_price',desc:'Get the cheapest mill offer for a product',params:['product']},
  // Utility
  {name:'clear_chat',desc:'Clear AI chat history',params:[]},
  {name:'refresh',desc:'Refresh the current view',params:[]},
  // Risk Management
  {name:'get_var',desc:'Calculate Value at Risk',params:['confidence','period']},
  {name:'get_exposure',desc:'Get current exposure by dimension (product, region, trader)',params:['groupBy']},
  {name:'check_limits',desc:'Check position limit breaches',params:[]},
  {name:'get_drawdown',desc:'Get drawdown metrics',params:['period']},
  {name:'get_risk_dashboard',desc:'Get comprehensive risk dashboard data',params:[]},
  // Advanced Analytics
  {name:'get_correlations',desc:'Get price correlations between products',params:['weeks']},
  {name:'get_seasonality',desc:'Get seasonal patterns for a product',params:['product','region']},
  {name:'get_volatility',desc:'Get volatility metrics for all products',params:['weeks']},
  // Trading Signals
  {name:'get_signals',desc:'Get active trading signals',params:['type']},
  {name:'generate_signals',desc:'Generate new trading signals',params:[]},
  {name:'get_recommendations',desc:'Get trade recommendations based on signals and portfolio',params:['objective']},
  // P&L Attribution
  {name:'get_pnl_breakdown',desc:'Get P&L breakdown by dimension',params:['groupBy','period']},
  {name:'get_trader_performance',desc:'Get trader performance comparison',params:['period']},
  {name:'get_customer_profitability',desc:'Get customer profitability analysis',params:['period']},
  {name:'get_mill_profitability',desc:'Get mill profitability analysis',params:['period']},
  // Portfolio Management
  {name:'get_mtm',desc:'Get mark-to-market valuations',params:[]},
  {name:'get_basis',desc:'Get cash vs futures basis',params:[]},
  {name:'get_hedge_recommendation',desc:'Get recommended hedge position',params:[]},
  {name:'get_inventory_optimization',desc:'Get optimal inventory levels',params:[]},
  // Reports
  {name:'generate_report',desc:'Generate a trading report',params:['type','period']},
  {name:'get_daily_flash',desc:'Get daily flash report',params:[]},
  // Alerts
  {name:'get_alerts',desc:'Get active alerts',params:['severity']},
  {name:'generate_alerts',desc:'Generate new alerts',params:[]},
  {name:'get_spread_analysis',desc:'Get spread analysis',params:[]},
  // Forecasting & Pricing Models
  {name:'get_forecast',desc:'Get short-term price forecast (Holt ES + seasonal) for a product/region',params:['product','region','weeks']},
  {name:'get_seasonal_analysis',desc:'Get seasonal analysis with monthly indices and percentile rank for a product/region',params:['product','region','years']},
  {name:'get_pricing_recommendation',desc:'Get customer pricing recommendation with best mill, freight, and seasonal margin adjustment',params:['customer','destination','products','targetMargin']},
  // Auto-Offerings
  {name:'generate_offering',desc:'Generate a draft offering for a customer (by profile_id or customer name). Use force=true to bypass schedule.',params:['profile_id','force']},
  {name:'get_offering_status',desc:'Get offering status — pending drafts, history for a customer, or all offerings. Filter by status (draft/approved/sent) or customer_id.',params:['status','customer_id','limit']},
  // Intelligence
  {name:'get_regime',desc:'Get current market regime classification (Rally/Topping/Decline/Bottoming/Choppy) with confidence score and trading bias for a region.',params:['region']},
  {name:'get_spread_signals',desc:'Get spread mean-reversion signals — flags spreads at extreme percentiles with reversion probability. Filter by region and type (dimension/length/grade/all).',params:['region','type']},
  {name:'get_mill_moves',desc:'Get recent mill price changes — which mills moved pricing, by how much, for which products. Filter by days, product, or mill name.',params:['days','product','mill']},
  // Platform Oversight
  {name:'get_platform_health',desc:'Get full platform health: data freshness (RL, mill quotes, orders), sync status, data quality issues, stale items, and system warnings. Use proactively at conversation start.',params:[]},
  {name:'get_daily_digest',desc:'Generate a comprehensive daily trading digest: market regime, position summary, pending actions (approvals, follow-ups, stale quotes), spread signals, recent mill moves, and recommended focus areas. Use when user asks "what should I focus on?" or at start of day.',params:[]},
  {name:'get_workflow_status',desc:'Get all pending workflow items: draft offerings awaiting approval, unshipped buys, undelivered sells, stale quotes (>2 days), prospects needing follow-up, and overdue items.',params:[]},
  {name:'get_data_quality',desc:'Audit data quality: missing customer destinations, mills without regions, orders missing fields, orphan records, duplicate detection, and completeness scores.',params:[]}
];

async function executeAITool(name,params){
  try{
    switch(name){
      case 'create_buy':{
        const buyId=genId();
        const buy={
          id:buyId,
          orderNum:params.orderNum||'',
          po:params.orderNum||'',
          date:today(),
          mill:params.mill||'',
          product:params.product||'2x4#2',
          price:parseFloat(params.price)||0,
          volume:parseFloat(params.volume)||0,
          region:params.region||'west',
          length:params.length||'RL',
          shipWeek:params.shipWeek||'',
          notes:params.notes||'Created by AI',
          shipped:false,
          trader:S.trader==='Admin'?'Ian P':S.trader
        };
        S.buys.unshift(buy);
        save('buys',S.buys);
        return{success:true,message:`Created buy: ${buy.volume} MBF ${buy.product} from ${buy.mill} @ $${buy.price}`,data:buy};
      }
      case 'create_sell':{
        const sell={
          id:genId(),
          orderNum:params.orderNum||'',
          linkedPO:params.orderNum||'',
          oc:params.orderNum||'',
          date:today(),
          customer:params.customer||'',
          destination:params.destination||'',
          product:params.product||'2x4#2',
          price:parseFloat(params.price)||0,
          freight:parseFloat(params.freight)||0,
          volume:parseFloat(params.volume)||0,
          length:params.length||'RL',
          shipWeek:params.shipWeek||'',
          notes:params.notes||'Created by AI',
          delivered:false,
          trader:S.trader==='Admin'?'Ian P':S.trader
        };
        S.sells.unshift(sell);
        save('sells',S.sells);
        return{success:true,message:`Created sell: ${sell.volume} MBF ${sell.product} to ${sell.customer} @ $${sell.price} DLVD`,data:sell};
      }
      case 'add_quote_item':{
        const item={
          id:Date.now(),
          product:params.product||'2x4#2',
          origin:params.origin||'',
          fob:parseFloat(params.fob)||0,
          tls:parseInt(params.tls)||1,
          shipWeek:params.shipWeek||'Prompt',
          selected:true
        };
        S.quoteItems.push(item);
        save('quoteItems',S.quoteItems);
        return{success:true,message:`Added to quote: ${item.tls} TL ${item.product} from ${item.origin} @ $${item.fob} FOB`,data:item};
      }
      case 'clear_quote_items':{
        S.quoteItems=[];
        save('quoteItems',S.quoteItems);
        return{success:true,message:'Cleared all quote items'};
      }
      case 'generate_quote':{
        let cust=findCustomerByName(params.customerName);
        if(!cust)cust=searchCustomers(params.customerName)[0]||null;
        if(!cust)return{success:false,message:`Customer "${params.customerName}" not found`};
        const items=S.quoteItems.filter(i=>i.selected!==false);
        if(!items.length)return{success:false,message:'No items in quote engine'};
        const dest=(cust.locations||[cust.destination].filter(Boolean))[0]||'TBD';
        const quotes=items.map(item=>{
          const miles=getLaneMiles(item.origin,dest);
          const frt=calcFreightPerMBF(miles,item.origin,item.product?.includes('MSR'));
          return{product:item.product,tls:item.tls,fob:item.fob,freight:frt,dlvd:item.fob+frt,ship:item.shipWeek};
        });
        return{success:true,message:`Quote for ${cust.name} (DLVD ${dest})`,data:quotes};
      }
      case 'get_inventory':{
        const inv={};
        S.buys.forEach(b=>{
          const k=b.product;
          if(!inv[k])inv[k]={bought:0,sold:0};
          inv[k].bought+=b.volume||0;
        });
        S.sells.forEach(s=>{
          const k=s.product;
          if(!inv[k])inv[k]={bought:0,sold:0};
          inv[k].sold+=s.volume||0;
        });
        const positions=Object.entries(inv).map(([p,v])=>({product:p,bought:v.bought,sold:v.sold,net:v.bought-v.sold,position:v.bought-v.sold>0?'LONG':v.bought-v.sold<0?'SHORT':'FLAT'}));
        return{success:true,data:positions};
      }
      case 'get_rl_prices':{
        const rl=S.rl.length?S.rl[S.rl.length-1]:null;
        if(!rl)return{success:false,message:'No RL data available'};
        const region=params.region||'west';
        return{success:true,data:{date:rl.date,region,composites:rl[region],specified_lengths:rl.specified_lengths?.[region]}};
      }
      case 'get_customers':{
        const custs=S.customers.filter(c=>c.type!=='mill').map(c=>({name:c.name,destination:c.destination,locations:c.locations,email:c.email}));
        return{success:true,data:custs};
      }
      case 'get_mills':{
        const mills=S.customers.filter(c=>c.type==='mill').concat(S.mills||[]).map(m=>({name:m.name,location:m.location||m.destination,region:m.region}));
        return{success:true,data:mills};
      }
      case 'add_customer':{
        const cust={id:genId(),name:normalizeCustomerName(params.name),destination:params.destination,email:params.email||'',type:'customer',quoteSelected:true,locations:[params.destination].filter(Boolean)};
        S.customers.push(cust);
        save('customers',S.customers);
        return{success:true,message:`Added customer: ${cust.name}`,data:cust};
      }
      case 'add_mill':{
        const mill={id:genId(),name:normalizeMillCompany(params.name),location:params.location,region:params.region||'west',type:'mill',trader:S.trader==='Admin'?'Ian P':S.trader};
        S.mills.push(mill);
        save('mills',S.mills);
        return{success:true,message:`Added mill: ${mill.name} (${mill.location})`,data:mill};
      }
      case 'update_customer':{
        let idx=-1;
        if(params.id)idx=S.customers.findIndex(c=>c.id==params.id);
        else if(params.name)idx=S.customers.findIndex(c=>c.name?.toLowerCase().includes(params.name.toLowerCase()));
        if(idx<0)return{success:false,message:`Customer/mill not found`};
        const cust=S.customers[idx];
        if(params.name!==undefined)cust.name=params.name;
        if(params.destination!==undefined)cust.destination=params.destination;
        if(params.email!==undefined)cust.email=params.email;
        if(params.locations!==undefined)cust.locations=Array.isArray(params.locations)?params.locations:params.locations.split(',').map(s=>s.trim());
        if(params.region!==undefined)cust.region=params.region;
        save('customers',S.customers);
        render();
        return{success:true,message:`Updated: ${cust.name}`,data:cust};
      }
      case 'delete_customer':{
        let idx=-1;
        if(params.id)idx=S.customers.findIndex(c=>c.id==params.id);
        else if(params.name)idx=S.customers.findIndex(c=>c.name?.toLowerCase().includes(params.name.toLowerCase()));
        if(idx<0)return{success:false,message:`Customer/mill not found`};
        const deleted=S.customers.splice(idx,1)[0];
        save('customers',S.customers);
        render();
        return{success:true,message:`Deleted: ${deleted.name}`};
      }
      case 'search_trades':{
        let results=[];
        if(params.type==='buy'||!params.type){
          results=results.concat(S.buys.filter(b=>{
            if(params.product&&!b.product?.toLowerCase().includes(params.product.toLowerCase()))return false;
            if(params.mill&&!b.mill?.toLowerCase().includes(params.mill.toLowerCase()))return false;
            return true;
          }).map(b=>({type:'buy',...b})));
        }
        if(params.type==='sell'||!params.type){
          results=results.concat(S.sells.filter(s=>{
            if(params.product&&!s.product?.toLowerCase().includes(params.product.toLowerCase()))return false;
            if(params.customer&&!s.customer?.toLowerCase().includes(params.customer.toLowerCase()))return false;
            return true;
          }).map(s=>({type:'sell',...s})));
        }
        return{success:true,data:results.slice(0,20)};
      }
      case 'get_buys':{
        let buys=S.buys;
        if(params.product)buys=buys.filter(b=>b.product?.toLowerCase().includes(params.product.toLowerCase()));
        if(params.mill)buys=buys.filter(b=>b.mill?.toLowerCase().includes(params.mill.toLowerCase()));
        const limit=parseInt(params.limit)||50;
        return{success:true,data:buys.slice(0,limit).map(b=>({id:b.id,date:b.date,mill:b.mill,product:b.product,price:b.price,volume:b.volume,region:b.region,shipped:b.shipped}))};
      }
      case 'get_sells':{
        let sells=S.sells;
        if(params.product)sells=sells.filter(s=>s.product?.toLowerCase().includes(params.product.toLowerCase()));
        if(params.customer)sells=sells.filter(s=>s.customer?.toLowerCase().includes(params.customer.toLowerCase()));
        const limit=parseInt(params.limit)||50;
        return{success:true,data:sells.slice(0,limit).map(s=>({id:s.id,date:s.date,customer:s.customer,destination:s.destination,product:s.product,price:s.price,volume:s.volume,delivered:s.delivered}))};
      }
      case 'update_buy':{
        const idx=S.buys.findIndex(b=>b.id==params.id);
        if(idx<0)return{success:false,message:`Buy order #${params.id} not found`};
        const buy=S.buys[idx];
        if(params.mill!==undefined)buy.mill=params.mill;
        if(params.product!==undefined)buy.product=params.product;
        if(params.price!==undefined)buy.price=parseFloat(params.price);
        if(params.volume!==undefined)buy.volume=parseFloat(params.volume);
        if(params.region!==undefined)buy.region=params.region;
        if(params.length!==undefined)buy.length=params.length;
        if(params.shipWeek!==undefined)buy.shipWeek=params.shipWeek;
        if(params.notes!==undefined)buy.notes=params.notes;
        if(params.shipped!==undefined)buy.shipped=params.shipped==='true'||params.shipped===true;
        save('buys',S.buys);
        render();
        return{success:true,message:`Updated buy order #${params.id}`,data:buy};
      }
      case 'update_sell':{
        const idx=S.sells.findIndex(s=>s.id==params.id);
        if(idx<0)return{success:false,message:`Sell order #${params.id} not found`};
        const sell=S.sells[idx];
        if(params.customer!==undefined)sell.customer=params.customer;
        if(params.destination!==undefined)sell.destination=params.destination;
        if(params.product!==undefined)sell.product=params.product;
        if(params.price!==undefined)sell.price=parseFloat(params.price);
        if(params.freight!==undefined)sell.freight=parseFloat(params.freight);
        if(params.volume!==undefined)sell.volume=parseFloat(params.volume);
        if(params.length!==undefined)sell.length=params.length;
        if(params.shipWeek!==undefined)sell.shipWeek=params.shipWeek;
        if(params.notes!==undefined)sell.notes=params.notes;
        if(params.delivered!==undefined)sell.delivered=params.delivered==='true'||params.delivered===true;
        save('sells',S.sells);
        render();
        return{success:true,message:`Updated sell order #${params.id}`,data:sell};
      }
      case 'mark_buy_shipped':{
        const idx=S.buys.findIndex(b=>b.id==params.id);
        if(idx<0)return{success:false,message:`Buy order #${params.id} not found`};
        S.buys[idx].shipped=true;
        save('buys',S.buys);
        render();
        return{success:true,message:`Marked buy order #${params.id} as shipped`};
      }
      case 'mark_sell_delivered':{
        const idx=S.sells.findIndex(s=>s.id==params.id);
        if(idx<0)return{success:false,message:`Sell order #${params.id} not found`};
        S.sells[idx].delivered=true;
        save('sells',S.sells);
        render();
        return{success:true,message:`Marked sell order #${params.id} as delivered`};
      }
      case 'delete_buy':{
        const idx=S.buys.findIndex(b=>b.id==params.id);
        if(idx<0)return{success:false,message:`Buy order #${params.id} not found`};
        const deleted=S.buys.splice(idx,1)[0];
        save('buys',S.buys);
        render();
        return{success:true,message:`Deleted buy order #${params.id}: ${deleted.volume} MBF ${deleted.product} from ${deleted.mill}`};
      }
      case 'delete_sell':{
        const idx=S.sells.findIndex(s=>s.id==params.id);
        if(idx<0)return{success:false,message:`Sell order #${params.id} not found`};
        const deleted=S.sells.splice(idx,1)[0];
        save('sells',S.sells);
        render();
        return{success:true,message:`Deleted sell order #${params.id}: ${deleted.volume} MBF ${deleted.product} to ${deleted.customer}`};
      }
      case 'delete_buys':{
        let count=0;
        if(params.all==='true'||params.all===true){
          count=S.buys.length;
          if(count>10)return{success:false,message:`⚠️ Refusing to bulk-delete all ${count} buys via AI. Use Settings > Clear All Data or delete individually.`};
          S.buys=[];
        }else if(params.ids){
          const ids=(Array.isArray(params.ids)?params.ids:params.ids.split(',')).map(id=>parseInt(id));
          const before=S.buys.length;
          S.buys=S.buys.filter(b=>!ids.includes(b.id));
          count=before-S.buys.length;
        }else{
          const before=S.buys.length;
          S.buys=S.buys.filter(b=>{
            if(params.product&&b.product?.toLowerCase().includes(params.product.toLowerCase()))return false;
            if(params.mill&&b.mill?.toLowerCase().includes(params.mill.toLowerCase()))return false;
            return true;
          });
          count=before-S.buys.length;
        }
        save('buys',S.buys);
        render();
        return{success:true,message:`Deleted ${count} buy order(s)`};
      }
      case 'delete_sells':{
        let count=0;
        if(params.all==='true'||params.all===true){
          count=S.sells.length;
          if(count>10)return{success:false,message:`⚠️ Refusing to bulk-delete all ${count} sells via AI. Use Settings > Clear All Data or delete individually.`};
          S.sells=[];
        }else if(params.ids){
          const ids=(Array.isArray(params.ids)?params.ids:params.ids.split(',')).map(id=>parseInt(id));
          const before=S.sells.length;
          S.sells=S.sells.filter(s=>!ids.includes(s.id));
          count=before-S.sells.length;
        }else{
          const before=S.sells.length;
          S.sells=S.sells.filter(s=>{
            if(params.product&&s.product?.toLowerCase().includes(params.product.toLowerCase()))return false;
            if(params.customer&&s.customer?.toLowerCase().includes(params.customer.toLowerCase()))return false;
            return true;
          });
          count=before-S.sells.length;
        }
        save('sells',S.sells);
        render();
        return{success:true,message:`Deleted ${count} sell order(s)`};
      }
      case 'get_lanes':{
        return{success:true,data:S.lanes};
      }
      case 'add_lane':{
        const lane={origin:params.origin,dest:params.dest,miles:parseInt(params.miles)||0};
        const existing=S.lanes.findIndex(l=>l.origin===lane.origin&&l.dest===lane.dest);
        if(existing>=0)S.lanes[existing]=lane;
        else S.lanes.push(lane);
        save('lanes',S.lanes);
        return{success:true,message:`Added lane: ${lane.origin} → ${lane.dest} (${lane.miles} mi)`,data:lane};
      }
      case 'delete_lane':{
        const idx=S.lanes.findIndex(l=>l.origin?.toLowerCase()===params.origin?.toLowerCase()&&l.dest?.toLowerCase()===params.dest?.toLowerCase());
        if(idx<0)return{success:false,message:`Lane ${params.origin} → ${params.dest} not found`};
        const deleted=S.lanes.splice(idx,1)[0];
        save('lanes',S.lanes);
        return{success:true,message:`Deleted lane: ${deleted.origin} → ${deleted.dest}`};
      }
      case 'get_analytics':{
        const a=analytics();
        return{success:true,data:{buyVolume:a.bVol,sellVolume:a.sVol,inventory:a.inv,margin:a.margin,marginPct:a.marginPct,profit:a.profit,avgBuy:a.avgB,avgSell:a.avgS,avgFreight:a.avgFr}};
      }
      case 'set_freight_settings':{
        if(params.freightBase!==undefined){S.freightBase=parseFloat(params.freightBase);save('freightBase',S.freightBase)}
        if(params.shortHaulFloor!==undefined){S.shortHaulFloor=parseFloat(params.shortHaulFloor);save('shortHaulFloor',S.shortHaulFloor)}
        if(params.stateRates){
          Object.entries(params.stateRates).forEach(([st,rate])=>{
            S.stateRates[st]=parseFloat(rate);
          });
          save('stateRates',S.stateRates);
        }
        return{success:true,message:'Freight settings updated',data:{freightBase:S.freightBase,shortHaulFloor:S.shortHaulFloor,stateRates:S.stateRates}};
      }
      case 'navigate':{
        const validViews=['dashboard','trading','quotes','millintel','analytics','crm','settings','leaderboard','insights','blotter','benchmark','risk','rldata','pnl-calendar','mi-intake','mi-prices','spreads','charts','compare','details'];
        const view=params.view?.toLowerCase();
        if(!validViews.includes(view))return{success:false,message:`Invalid view. Valid views: ${validViews.join(', ')}`};
        go(view);
        return{success:true,message:`Navigated to ${view}`};
      }
      case 'clear_chat':{
        S.aiMsgs=[];
        SS('aiMsgs',S.aiMsgs);
        renderAIPanel();
        return{success:true,message:'Chat history cleared'};
      }
      case 'refresh':{
        render();
        return{success:true,message:'View refreshed'};
      }
      case 'get_matched_trades':{
        const buyByOrder=buildBuyByOrder();
        let matches=[];
        S.sells.forEach(s=>{
          const ord=normalizeOrderNum(s.orderNum||s.linkedPO||s.oc);
          const buy=ord?buyByOrder[ord]:null;
          if(!buy)return;
          if(params.product&&!s.product?.toLowerCase().includes(params.product.toLowerCase()))return;
          if(params.customer){const cn=normalizeCustomerName(params.customer);if(s.customer&&s.customer.toLowerCase()!==cn.toLowerCase())return;}
          const vol=s.volume||0;const frtMBF=vol>0?(s.freight||0)/vol:0;
          const sellFob=(s.price||0)-frtMBF;const margin=sellFob-(buy.price||0);
          matches.push({orderNum:ord,product:s.product,customer:s.customer,mill:buy.mill,buyPrice:buy.price,sellDlvd:s.price,freight:s.freight,sellFob:Math.round(sellFob),volume:vol,margin:Math.round(margin),profit:Math.round(margin*vol),date:s.date});
        });
        matches.sort((a,b)=>(b.profit||0)-(a.profit||0));
        return{success:true,data:matches.slice(0,parseInt(params.limit)||20)};
      }
      case 'get_open_orders':{
        let unshipped=S.buys.filter(b=>!b.shipped);
        let undelivered=S.sells.filter(s=>!s.delivered);
        if(params.product){const p=params.product.toLowerCase();unshipped=unshipped.filter(b=>b.product?.toLowerCase().includes(p));undelivered=undelivered.filter(s=>s.product?.toLowerCase().includes(p));}
        return{success:true,data:{
          unshippedBuys:unshipped.map(b=>({id:b.id,date:b.date,mill:b.mill,product:b.product,price:b.price,volume:b.volume,region:b.region,shipWeek:b.shipWeek})),
          undeliveredSells:undelivered.map(s=>({id:s.id,date:s.date,customer:s.customer,product:s.product,price:s.price,volume:s.volume,shipWeek:s.shipWeek}))
        }};
      }
      case 'get_position_detail':{
        const detail={};const filter=params.product?.toLowerCase();
        S.buys.forEach(b=>{
          if(filter&&!b.product?.toLowerCase().includes(filter))return;
          const k=b.product;if(!detail[k])detail[k]={bought:0,sold:0,bVal:0,sVal:0,mills:new Set(),customers:new Set()};
          detail[k].bought+=b.volume||0;detail[k].bVal+=(b.price||0)*(b.volume||0);if(b.mill)detail[k].mills.add(b.mill);
        });
        S.sells.forEach(s=>{
          if(filter&&!s.product?.toLowerCase().includes(filter))return;
          const k=s.product;if(!detail[k])detail[k]={bought:0,sold:0,bVal:0,sVal:0,mills:new Set(),customers:new Set()};
          detail[k].sold+=s.volume||0;const frt=s.volume>0?(s.freight||0)/s.volume:0;detail[k].sVal+=((s.price||0)-frt)*(s.volume||0);if(s.customer)detail[k].customers.add(s.customer);
        });
        const result=Object.entries(detail).map(([prod,d])=>({product:prod,bought:d.bought,sold:d.sold,net:d.bought-d.sold,position:d.bought-d.sold>0?'LONG':d.bought-d.sold<0?'SHORT':'FLAT',avgBuy:d.bought>0?Math.round(d.bVal/d.bought):0,avgSell:d.sold>0?Math.round(d.sVal/d.sold):0,exposure:Math.round(Math.abs(d.bought-d.sold)*(d.bought>0?d.bVal/d.bought:400)),mills:[...d.mills],customers:[...d.customers]}));
        return{success:true,data:result};
      }
      case 'get_price_history':{
        const prod=params.product||'2x4#2';const region=params.region||'west';const weeks=parseInt(params.weeks)||8;
        const history=S.rl.slice(-weeks).map(r=>({date:r.date,price:r[region]?.[prod]||null})).filter(h=>h.price!==null);
        return{success:true,data:{product:prod,region,history}};
      }
      case 'get_customer_summary':{
        const custMatch=findCustomerByName(params.customer)||searchCustomers(params.customer)[0]||null;
        if(!custMatch)return{success:false,message:'Customer not found'};
        const custName=custMatch.name;
        const cust=custMatch;
        const sells=S.sells.filter(s=>s.customer&&s.customer.toLowerCase()===custName.toLowerCase());
        const totalVol=sells.reduce((s,x)=>s+(x.volume||0),0);
        const totalRev=sells.reduce((s,x)=>s+(x.price||0)*(x.volume||0),0);
        const recent=sells.slice(0,10).map(s=>({date:s.date,product:s.product,price:s.price,volume:s.volume}));
        const products={};sells.forEach(s=>{products[s.product]=(products[s.product]||0)+(s.volume||0)});
        return{success:true,data:{name:cust.name,destination:cust.destination,locations:cust.locations,email:cust.email,totalVolume:totalVol,totalRevenue:Math.round(totalRev),avgPrice:totalVol>0?Math.round(totalRev/totalVol):0,orderCount:sells.length,productMix:products,recentOrders:recent}};
      }
      case 'get_mill_summary':{
        const millNorm=normalizeMillCompany(params.mill||'');
        const name=(millNorm||params.mill||'').toLowerCase();
        const buys=S.buys.filter(b=>b.mill&&b.mill.toLowerCase()===name);
        const totalVol=buys.reduce((s,b)=>s+(b.volume||0),0);
        const totalCost=buys.reduce((s,b)=>s+(b.price||0)*(b.volume||0),0);
        const products={};buys.forEach(b=>{products[b.product]=(products[b.product]||0)+(b.volume||0)});
        const recent=buys.slice(0,10).map(b=>({date:b.date,product:b.product,price:b.price,volume:b.volume}));
        return{success:true,data:{mill:name,totalVolume:totalVol,totalCost:Math.round(totalCost),avgCost:totalVol>0?Math.round(totalCost/totalVol):0,orderCount:buys.length,productMix:products,recentOrders:recent}};
      }
      case 'analyze_margin':{
        const groupBy=params.groupBy||'product';
        const buyByOrder=buildBuyByOrder();const groups={};
        S.sells.forEach(s=>{
          const ord=String(s.orderNum||s.linkedPO||s.oc||'').trim();const buy=ord?buyByOrder[ord]:null;if(!buy)return;
          let key;if(groupBy==='customer')key=s.customer||'Unknown';else if(groupBy==='month')key=(s.date||'').substring(0,7);else key=s.product||'Unknown';
          if(params.filter&&!key.toLowerCase().includes(params.filter.toLowerCase()))return;
          if(!groups[key])groups[key]={vol:0,profit:0};
          const vol=s.volume||0;const frt=vol>0?(s.freight||0)/vol:0;const sellFob=(s.price||0)-frt;
          groups[key].vol+=vol;groups[key].profit+=(sellFob-(buy.price||0))*vol;
        });
        const result=Object.entries(groups).map(([k,v])=>({[groupBy]:k,volume:Math.round(v.vol*100)/100,profit:Math.round(v.profit),margin:v.vol>0?Math.round(v.profit/v.vol):0})).sort((a,b)=>b.profit-a.profit);
        return{success:true,data:result};
      }
      case 'get_top_customers':{
        const data=calcTopCustomers(S.sells);
        const sortBy=params.sortBy||'volume';
        if(sortBy==='profit')data.sort((a,b)=>(b.profit||0)-(a.profit||0));
        else if(sortBy==='orders')data.sort((a,b)=>(b.orders||0)-(a.orders||0));
        return{success:true,data:data.slice(0,parseInt(params.limit)||10)};
      }
      case 'get_top_products':{
        const{byVolume,byProfit}=calcTopProducts(S.buys,S.sells);
        const sortBy=params.sortBy||'volume';
        return{success:true,data:(sortBy==='profit'?byProfit:byVolume).slice(0,parseInt(params.limit)||10)};
      }
      case 'suggest_coverage':{
        const pos={};
        S.buys.forEach(b=>{pos[b.product]=(pos[b.product]||0)+(b.volume||0)});
        S.sells.forEach(s=>{pos[s.product]=(pos[s.product]||0)-(s.volume||0)});
        const shorts=Object.entries(pos).filter(([k,v])=>v<0).map(([product,net])=>{
          const supplierMills=[...new Set(S.buys.filter(b=>b.product===product).map(b=>b.mill).filter(Boolean))];
          return{product,shortMBF:Math.abs(net),suggestedMills:supplierMills.slice(0,5)};
        });
        return{success:true,data:shorts.length?shorts:[{message:'No short positions found'}]};
      }
      case 'generate_briefing':{
        go('spreads');
        return{success:true,message:'Navigated to Spreads view (briefing has been replaced by print-focused analytics).'};
      }
      case 'add_mill_quote':{
        if(!params.mill||!params.product||!params.price)return{success:false,message:'mill, product, and price required'};
        const mq={mill:params.mill,product:params.product,price:parseFloat(params.price),length:params.length||'RL',volume:parseFloat(params.volume)||0,tls:parseInt(params.tls)||0,shipWindow:params.shipWindow||'Prompt',date:today(),notes:params.notes||'',source:'ai'};
        if(typeof miSubmitQuotes==='function'){
          miSubmitQuotes([mq]).catch(e=>console.error('miSubmitQuotes error (AI):',e));
        }else{
          addMillQuote(mq);
        }
        return{success:true,message:`Added mill quote: ${mq.mill} ${mq.product} @ $${mq.price}`};
      }
      case 'parse_mill_prices':{
        if(!params.text)return{success:false,message:'text parameter required — paste the mill price list'};
        if(!S.apiKey)return{success:false,message:'Claude API key not set — go to Settings first'};
        const parsed=await miAiParseMillPriceList(params.text);
        if(!parsed||!parsed.length)return{success:false,message:'AI could not parse any quotes from the provided text'};
        for(const q of parsed){
          q.mill=miNormalizeMillName(q.mill);
          if(q.mill){const dc=miInferMillCity(q.mill);if(dc)q.city=dc;else if(!q.city)q.city='';}
          if(!q.length)q.length='RL';
          q.source='ai-chat';
        }
        await miSubmitQuotes(parsed);
        const mills=[...new Set(parsed.map(q=>q.mill).filter(Boolean))];
        const summary=parsed.slice(0,8).map(q=>`${q.mill} ${q.product} ${q.length}: $${q.price}`).join('\n');
        return{success:true,message:`Saved ${parsed.length} quotes from ${mills.length} mill(s):\n${summary}${parsed.length>8?'\n...'+(parsed.length-8)+' more':''}`};
      }
      case 'get_mill_prices':{
        const latest=typeof getLatestMillQuotes==='function'?getLatestMillQuotes({product:params.product||undefined,mill:params.mill||undefined}):[];
        if(!latest.length)return{success:true,message:'No mill quotes in database',data:[]};
        const data=latest.map(q=>({mill:q.mill,product:q.product,price:q.price,length:q.length,volume:q.volume,shipWindow:q.shipWindow,date:q.date}));
        return{success:true,message:`${data.length} current mill quotes`,data};
      }
      case 'get_best_mill_price':{
        if(!params.product)return{success:false,message:'product parameter required'};
        const best=typeof getBestPrice==='function'?getBestPrice(params.product):null;
        if(!best)return{success:true,message:`No mill quotes for ${params.product}`,data:null};
        return{success:true,message:`Best price for ${params.product}: $${best.price} from ${best.mill}`,data:{mill:best.mill,price:best.price,date:best.date,shipWindow:best.shipWindow}};
      }
      // Risk Management Tools
      case 'get_var':{
        const confidence=parseFloat(params.confidence)||0.95;
        const period=parseInt(params.period)||5;
        const varReport=getVaRReport(confidence);
        return{success:true,message:`VaR (${confidence*100}%): ${fmt(varReport.conservativeVaR)}`,data:varReport};
      }
      case 'get_exposure':{
        const groupBy=params.groupBy||'product';
        const exposure=getExposure(groupBy);
        const portfolio=getPortfolioExposure();
        return{success:true,data:{groupBy,exposure,summary:{totalLong:portfolio.totalLong,totalShort:portfolio.totalShort,net:portfolio.netPosition,notional:portfolio.totalNotional}}};
      }
      case 'check_limits':{
        const breaches=checkPositionLimits();
        return{success:true,message:breaches.length?`${breaches.length} limit breach(es) detected`:'All limits OK',data:breaches};
      }
      case 'get_drawdown':{
        const period=params.period||'30d';
        const dd=calcDrawdown(period);
        return{success:true,data:dd};
      }
      case 'get_risk_dashboard':{
        const risk=getRiskDashboard();
        return{success:true,message:`Risk Level: ${risk.riskLevel} (Score: ${risk.riskScore}/100)`,data:risk};
      }
      // Advanced Analytics Tools
      case 'get_correlations':{
        const weeks=parseInt(params.weeks)||12;
        const matrix=getCorrelationMatrix(weeks);
        return{success:true,data:matrix};
      }
      case 'get_seasonality':{
        const product=params.product||'2x4#2';
        const region=params.region||'west';
        const seasonal=calcSeasonalPattern(product,region,52);
        return{success:true,data:seasonal};
      }
      case 'get_volatility':{
        const weeks=parseInt(params.weeks)||12;
        const volReport=getVolatilityReport(weeks);
        return{success:true,message:`Volatility regime: ${volReport.regime}`,data:volReport};
      }
      // Trading Signals Tools
      case 'get_signals':{
        initSignalConfig();
        let signals=S.signals.filter(s=>s.status==='active');
        if(params.type)signals=signals.filter(s=>s.type===params.type);
        return{success:true,message:`${signals.length} active signal(s)`,data:signals};
      }
      case 'generate_signals':{
        const newSignals=generateSignals();
        return{success:true,message:`Generated ${newSignals.length} new signal(s)`,data:newSignals};
      }
      case 'get_recommendations':{
        const objective=params.objective||'balanced';
        const recs=getTradeRecommendations(objective);
        return{success:true,message:`${recs.recommendations.length} recommendation(s)`,data:recs};
      }
      // P&L Attribution Tools
      case 'get_pnl_breakdown':{
        const groupBy=params.groupBy||'product';
        const period=params.period||'30d';
        const pnl=getPnLBreakdown(groupBy,period);
        return{success:true,message:`Total P&L: ${fmt(pnl.totals.totalPnL)}`,data:pnl};
      }
      case 'get_trader_performance':{
        const period=params.period||'30d';
        const perf=getTraderPerformance(period);
        return{success:true,data:perf};
      }
      case 'get_customer_profitability':{
        const period=params.period||'30d';
        const prof=getCustomerProfitability(period);
        return{success:true,data:prof};
      }
      case 'get_mill_profitability':{
        const period=params.period||'30d';
        const prof=getMillProfitability(period);
        return{success:true,data:prof};
      }
      // Portfolio Management Tools
      case 'get_mtm':{
        const mtm=calcDailyMTM();
        return{success:true,message:`Portfolio MTM: ${fmt(mtm.totalMTM)}`,data:mtm};
      }
      case 'get_basis':{
        const basis=calcBasis();
        return{success:true,data:basis};
      }
      case 'get_hedge_recommendation':{
        const rec=getHedgeRecommendation();
        return{success:true,message:`Recommended: ${rec.recommendedContracts} contracts`,data:rec};
      }
      case 'get_inventory_optimization':{
        const opt=getOptimalInventory();
        return{success:true,data:opt};
      }
      // Reports Tools
      case 'generate_report':{
        const type=params.type||'daily';
        let report;
        switch(type){
          case 'daily':case 'flash':report=generateDailyFlash();break;
          case 'weekly':report=generateWeeklyReport();break;
          case 'monthly':report=generateMonthlyReport();break;
          case 'risk':report=generateRiskReport();break;
          case 'customer':report=generateCustomerReport(params.period||'30d');break;
          case 'mill':report=generateMillReport(params.period||'30d');break;
          default:report=generateDailyFlash();
        }
        saveReportToHistory(report);
        return{success:true,message:`Generated ${type} report`,data:report};
      }
      case 'get_daily_flash':{
        const flash=generateDailyFlash();
        return{success:true,data:flash};
      }
      // Alerts Tools
      case 'get_alerts':{
        initAlertConfig();
        let alerts=S.alerts;
        if(params.severity)alerts=alerts.filter(a=>a.severity===params.severity);
        return{success:true,message:`${alerts.length} alert(s)`,data:alerts.slice(0,20)};
      }
      case 'generate_alerts':{
        const newAlerts=generateAlerts();
        return{success:true,message:`Generated ${newAlerts.length} new alert(s)`,data:newAlerts};
      }
      case 'get_spread_analysis':{
        const spreads=getSpreadAnalysis();
        return{success:true,data:spreads};
      }
      case 'get_forecast':{
        const prod=params.product||'2x4#2';
        const reg=params.region||'west';
        const wks=parseInt(params.weeks)||8;
        try{
          const res=await fetch(`/api/forecast/shortterm?product=${encodeURIComponent(prod)}&region=${reg}&weeks=${wks}`);
          const data=await res.json();
          if(data.error)return{success:false,message:data.error};
          return{success:true,data:{product:prod,region:reg,lastPrice:data.lastPrice,trend:data.trend,momentum:data.momentum,forecast:data.forecast,seasonalOutlook:data.seasonalOutlook,dataPoints:data.dataPoints}};
        }catch(e){return{success:false,message:'Forecast endpoint unavailable: '+e.message}}
      }
      case 'get_seasonal_analysis':{
        const prod=params.product||'2x4#2';
        const reg=params.region||'west';
        const yrs=parseInt(params.years)||5;
        try{
          const res=await fetch(`/api/forecast/seasonal?product=${encodeURIComponent(prod)}&region=${reg}&years=${yrs}`);
          const data=await res.json();
          if(data.error)return{success:false,message:data.error};
          return{success:true,data};
        }catch(e){return{success:false,message:'Seasonal endpoint unavailable: '+e.message}}
      }
      case 'get_pricing_recommendation':{
        const body={
          customer:params.customer||'',
          destination:params.destination||'',
          products:Array.isArray(params.products)?params.products:(params.products?params.products.split(',').map(s=>s.trim()):[]),
          targetMargin:parseFloat(params.targetMargin)||25
        };
        try{
          const res=await fetch('/api/forecast/pricing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
          const data=await res.json();
          if(data.error)return{success:false,message:data.error};
          return{success:true,data};
        }catch(e){return{success:false,message:'Pricing endpoint unavailable: '+e.message}}
      }
      case 'generate_offering':{
        try{
          const body={force:params.force!==false};
          if(params.profile_id)body.profile_id=parseInt(params.profile_id);
          const res=await fetch('/api/offerings/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
          const data=await res.json();
          if(data.error)return{success:false,message:data.error};
          return{success:true,data};
        }catch(e){return{success:false,message:'Generate endpoint unavailable: '+e.message}}
      }
      case 'get_offering_status':{
        try{
          let url='/api/offerings?';
          if(params.status)url+='status='+encodeURIComponent(params.status)+'&';
          if(params.customer_id)url+='customer_id='+encodeURIComponent(params.customer_id)+'&';
          if(params.limit)url+='limit='+encodeURIComponent(params.limit)+'&';
          const res=await fetch(url);
          const data=await res.json();
          if(data.error)return{success:false,message:data.error};
          return{success:true,offerings:data,count:data.length};
        }catch(e){return{success:false,message:'Offerings endpoint unavailable: '+e.message}}
      }
      // Intelligence tools
      case 'get_regime':{
        try{
          const rg=params.region||'west';
          const res=await fetch(`/api/intelligence/regime?region=${encodeURIComponent(rg)}&product=2x4%232`);
          const data=await res.json();
          if(data.error)return{success:false,message:data.error};
          return{success:true,data};
        }catch(e){return{success:false,message:'Regime endpoint unavailable: '+e.message}}
      }
      case 'get_spread_signals':{
        try{
          const rg=params.region||'west';
          const tp=params.type||'all';
          const res=await fetch(`/api/intelligence/spread-signals?region=${encodeURIComponent(rg)}&type=${encodeURIComponent(tp)}`);
          const data=await res.json();
          if(data.error)return{success:false,message:data.error};
          return{success:true,data};
        }catch(e){return{success:false,message:'Spread signals endpoint unavailable: '+e.message}}
      }
      case 'get_mill_moves':{
        try{
          let url='/api/intelligence/mill-moves?';
          if(params.days)url+='days='+encodeURIComponent(params.days)+'&';
          if(params.product)url+='product='+encodeURIComponent(params.product)+'&';
          if(params.mill)url+='mill='+encodeURIComponent(params.mill)+'&';
          const res=await fetch(url);
          const data=await res.json();
          if(data.error)return{success:false,message:data.error};
          return{success:true,data};
        }catch(e){return{success:false,message:'Mill moves endpoint unavailable: '+e.message}}
      }
      // Platform Oversight Tools
      case 'get_platform_health':{
        const now=Date.now();
        const dayMs=86400000;
        // RL data freshness
        const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
        const rlDate=latestRL?.date||'unknown';
        const rlAge=latestRL?.date?Math.floor((now-new Date(latestRL.date).getTime())/dayMs):999;
        // Mill quote freshness
        const recentQuotes=(S.millQuotes||[]).filter(q=>q.date&&(now-new Date(q.date).getTime())<2*dayMs);
        const staleQuotes=(S.millQuotes||[]).filter(q=>q.date&&(now-new Date(q.date).getTime())>=2*dayMs);
        const totalQuotes=(S.millQuotes||[]).length;
        // Order counts
        const unshipped=S.buys.filter(b=>!b.shipped).length;
        const undelivered=S.sells.filter(s=>!s.delivered).length;
        // Data completeness
        const custsNoDestination=S.customers.filter(c=>c.type!=='mill'&&!c.destination).length;
        const millsNoRegion=(S.mills||[]).filter(m=>!m.region).length;
        // Sync status
        const syncActive=!!S.autoSync;
        const warnings=[];
        if(rlAge>7)warnings.push(`RL data is ${rlAge} days old — may need update`);
        if(staleQuotes.length>10)warnings.push(`${staleQuotes.length} mill quotes are stale (>2 days old)`);
        if(unshipped>20)warnings.push(`${unshipped} unshipped buys — review for shipping status`);
        if(custsNoDestination>0)warnings.push(`${custsNoDestination} customers missing destination`);
        return{success:true,data:{
          rl:{latestDate:rlDate,ageDays:rlAge,totalWeeks:S.rl.length},
          millQuotes:{total:totalQuotes,recent:recentQuotes.length,stale:staleQuotes.length},
          orders:{totalBuys:S.buys.length,totalSells:S.sells.length,unshipped,undelivered},
          dataQuality:{customersNoDestination:custsNoDestination,millsNoRegion},
          sync:{autoSync:syncActive,cloudConfigured:!!S.supabaseUrl},
          warnings
        }};
      }
      case 'get_daily_digest':{
        const results={};
        // Regime
        try{const r=await fetch('/api/intelligence/regime?region=west&product=2x4%232');results.regime=await r.json()}catch(e){results.regime={error:e.message}}
        // Spread signals
        try{const r=await fetch('/api/intelligence/spread-signals?region=west&type=all');results.spreadSignals=await r.json()}catch(e){results.spreadSignals={error:e.message}}
        // Mill moves (7 days)
        try{const r=await fetch('/api/intelligence/mill-moves?days=7');results.millMoves=await r.json()}catch(e){results.millMoves={error:e.message}}
        // Position summary
        const posData={};
        S.buys.forEach(b=>{const k=b.product;if(!posData[k])posData[k]={b:0,s:0};posData[k].b+=(b.volume||0)});
        S.sells.forEach(s=>{const k=s.product;if(!posData[k])posData[k]={b:0,s:0};posData[k].s+=(s.volume||0)});
        results.positions=Object.entries(posData).map(([p,v])=>({product:p,bought:v.b,sold:v.s,net:v.b-v.s,status:v.b>v.s?'LONG':v.b<v.s?'SHORT':'FLAT'}));
        // Pending items
        results.pending={
          unshippedBuys:S.buys.filter(b=>!b.shipped).length,
          undeliveredSells:S.sells.filter(s=>!s.delivered).length,
          staleMillQuotes:(S.millQuotes||[]).filter(q=>q.date&&(Date.now()-new Date(q.date).getTime())>=2*86400000).length
        };
        // Offerings
        try{const r=await fetch('/api/offerings?status=draft');const d=await r.json();results.pendingOfferings=Array.isArray(d)?d.length:0}catch(e){results.pendingOfferings=0}
        return{success:true,data:results};
      }
      case 'get_workflow_status':{
        const now=Date.now();const dayMs=86400000;
        const wf={};
        // Unshipped buys (sorted by age)
        wf.unshippedBuys=S.buys.filter(b=>!b.shipped).map(b=>({id:b.id,date:b.date,mill:b.mill,product:b.product,volume:b.volume,ageDays:b.date?Math.floor((now-new Date(b.date).getTime())/dayMs):0})).sort((a,b)=>b.ageDays-a.ageDays).slice(0,20);
        // Undelivered sells
        wf.undeliveredSells=S.sells.filter(s=>!s.delivered).map(s=>({id:s.id,date:s.date,customer:s.customer,product:s.product,volume:s.volume,ageDays:s.date?Math.floor((now-new Date(s.date).getTime())/dayMs):0})).sort((a,b)=>b.ageDays-a.ageDays).slice(0,20);
        // Stale mill quotes
        wf.staleQuotes=(S.millQuotes||[]).filter(q=>q.date&&(now-new Date(q.date).getTime())>=2*dayMs).length;
        // Draft offerings
        try{const r=await fetch('/api/offerings?status=draft');const d=await r.json();wf.draftOfferings=Array.isArray(d)?d:[];wf.draftOfferingCount=wf.draftOfferings.length}catch(e){wf.draftOfferings=[];wf.draftOfferingCount=0}
        // Prospect follow-ups
        try{const r=await fetch('/api/crm/prospects');const d=await r.json();const prospects=Array.isArray(d)?d:(d.prospects||[]);wf.overdueFollowUps=prospects.filter(p=>p.follow_up_date&&new Date(p.follow_up_date)<new Date()).length;wf.totalProspects=prospects.length}catch(e){wf.overdueFollowUps=0;wf.totalProspects=0}
        return{success:true,data:wf};
      }
      case 'get_data_quality':{
        const dq={scores:{},issues:[]};
        // Customer completeness
        const custs=S.customers.filter(c=>c.type!=='mill');
        const custsComplete=custs.filter(c=>c.name&&c.destination).length;
        dq.scores.customers=custs.length?Math.round(custsComplete/custs.length*100):100;
        custs.filter(c=>!c.destination).forEach(c=>dq.issues.push({type:'customer',severity:'medium',item:c.name,issue:'Missing destination'}));
        custs.filter(c=>!c.email).forEach(c=>dq.issues.push({type:'customer',severity:'low',item:c.name,issue:'Missing email'}));
        // Mill completeness
        const mills=S.mills||[];
        const millsComplete=mills.filter(m=>m.name&&m.region&&(m.lat||m.location)).length;
        dq.scores.mills=mills.length?Math.round(millsComplete/mills.length*100):100;
        mills.filter(m=>!m.region).forEach(m=>dq.issues.push({type:'mill',severity:'medium',item:m.name,issue:'Missing region'}));
        // Order completeness
        const buysComplete=S.buys.filter(b=>b.mill&&b.product&&b.price&&b.volume&&b.region).length;
        dq.scores.buys=S.buys.length?Math.round(buysComplete/S.buys.length*100):100;
        S.buys.filter(b=>!b.region).forEach(b=>dq.issues.push({type:'buy',severity:'low',item:`${b.mill} ${b.product}`,issue:'Missing region'}));
        const sellsComplete=S.sells.filter(s=>s.customer&&s.product&&s.price&&s.volume).length;
        dq.scores.sells=S.sells.length?Math.round(sellsComplete/S.sells.length*100):100;
        // Duplicate detection
        const buyDupes=new Map();
        S.buys.forEach(b=>{const k=`${b.date}_${b.mill}_${b.product}_${b.price}`;buyDupes.set(k,(buyDupes.get(k)||0)+1)});
        dq.potentialDuplicateBuys=[...buyDupes.entries()].filter(([k,v])=>v>1).length;
        const sellDupes=new Map();
        S.sells.forEach(s=>{const k=`${s.date}_${s.customer}_${s.product}_${s.price}`;sellDupes.set(k,(sellDupes.get(k)||0)+1)});
        dq.potentialDuplicateSells=[...sellDupes.entries()].filter(([k,v])=>v>1).length;
        if(dq.potentialDuplicateBuys)dq.issues.push({type:'buy',severity:'high',item:`${dq.potentialDuplicateBuys} sets`,issue:'Potential duplicate buy orders'});
        if(dq.potentialDuplicateSells)dq.issues.push({type:'sell',severity:'high',item:`${dq.potentialDuplicateSells} sets`,issue:'Potential duplicate sell orders'});
        dq.overallScore=Math.round((dq.scores.customers+dq.scores.mills+dq.scores.buys+dq.scores.sells)/4);
        dq.issueCount=dq.issues.length;
        return{success:true,data:dq};
      }
      default:
        return{success:false,message:`Unknown tool: ${name}`};
    }
  }catch(e){
    return{success:false,message:`Error: ${e.message}`};
  }
}

async function sendAI(){
  if(!S.apiKey){showToast('Add API key in Settings','warn');return}
  const inp=document.getElementById('ai-in');
  const msg=inp.value.trim();if(!msg)return;
  S.aiMsgs.push({role:'user',content:msg});inp.value='';render();
  
  const a=analytics();
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;

  // --- Full RL price snapshot ---
  let rlSummary='No RL data available.';
  if(latestRL){
    const rlLines=[];
    ['west','central','east'].forEach(r=>{
      const prods=Object.entries(latestRL[r]||{}).map(([p,v])=>`${p}: $${v}`).join(', ');
      if(prods)rlLines.push(`${r.toUpperCase()}: ${prods}`);
    });
    rlSummary=`Latest RL (${latestRL.date}):\n${rlLines.join('\n')}`;
  }

  // --- RL week-over-week trends ---
  let rlTrends='';
  if(S.rl.length>=2){
    const prev=S.rl[S.rl.length-2];
    const changes=[];
    ['west','central','east'].forEach(r=>{
      ['2x4#2','2x6#2','2x8#2','2x10#2','2x12#2'].forEach(p=>{
        const curr=latestRL?.[r]?.[p];const pr=prev?.[r]?.[p];
        if(curr&&pr&&curr!==pr)changes.push(`${r} ${p}: ${curr>pr?'+':''}$${curr-pr} (${pr} -> ${curr})`);
      });
    });
    if(changes.length)rlTrends='Week-over-week changes:\n'+changes.join('\n');
  }

  // --- Detailed position breakdown ---
  const posData={};
  S.buys.forEach(b=>{
    const k=b.product;if(!posData[k])posData[k]={b:0,s:0,bVal:0,sVal:0};
    posData[k].b+=b.volume||0;posData[k].bVal+=(b.price||0)*(b.volume||0);
  });
  S.sells.forEach(s=>{
    const k=s.product;if(!posData[k])posData[k]={b:0,s:0,bVal:0,sVal:0};
    posData[k].s+=s.volume||0;
    const frtMBF=s.volume>0?(s.freight||0)/s.volume:0;
    posData[k].sVal+=((s.price||0)-frtMBF)*(s.volume||0);
  });
  const posDetails=Object.entries(posData).map(([k,v])=>{
    const net=v.b-v.s;const avgB=v.b>0?(v.bVal/v.b).toFixed(0):'?';const avgS=v.s>0?(v.sVal/v.s).toFixed(0):'?';
    return`${k}: bought ${v.b.toFixed(1)} MBF (avg $${avgB}), sold ${v.s.toFixed(1)} MBF (avg $${avgS} FOB), net ${net>0?'LONG':net<0?'SHORT':'FLAT'} ${Math.abs(net).toFixed(1)} MBF`;
  }).join('\n')||'No positions';

  // --- Recent trades ---
  const recentBuys=S.buys.slice(0,20).map(b=>`BUY: ${b.date||'?'} | ${b.mill||'?'} | ${b.product} | $${b.price} | ${b.volume} MBF | ${b.region||'?'} | shipped:${b.shipped}`).join('\n')||'None';
  const recentSells=S.sells.slice(0,20).map(s=>`SELL: ${s.date||'?'} | ${s.customer||'?'} | ${s.destination||'?'} | ${s.product} | $${s.price} DLVD | frt:$${s.freight||0} | ${s.volume} MBF | delivered:${s.delivered}`).join('\n')||'None';

  // --- Full customer and mill lists ---
  const custList=S.customers.filter(c=>c.type!=='mill').map(c=>`${c.name} (${c.destination||c.locations?.[0]||'?'})${c.email?' <'+c.email+'>':''}`).join('\n')||'None';
  const millList=S.customers.filter(c=>c.type==='mill').concat(S.mills||[]).map(m=>`${m.name} (${m.location||m.destination||'?'}, ${m.region||'?'})`).join('\n')||'None';

  // --- Open orders ---
  const unshippedBuys=S.buys.filter(b=>!b.shipped);
  const undeliveredSells=S.sells.filter(s=>!s.delivered);
  const openOrders=`Unshipped buys: ${unshippedBuys.length} (${unshippedBuys.reduce((s,b)=>s+(b.volume||0),0).toFixed(1)} MBF)\nUndelivered sells: ${undeliveredSells.length} (${undeliveredSells.reduce((s,x)=>s+(x.volume||0),0).toFixed(1)} MBF)`;

  // --- Top customers by volume ---
  const custVol={};S.sells.forEach(s=>{const c=s.customer||'Unknown';custVol[c]=(custVol[c]||0)+(s.volume||0)});
  const topCusts=Object.entries(custVol).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([c,v])=>`${c}: ${v.toFixed(0)} MBF`).join(', ')||'None';

  // --- Freight lanes ---
  const laneSummary=S.lanes.slice(0,20).map(l=>`${l.origin} -> ${l.dest}: ${l.miles} mi`).join('\n')||'No lanes configured';

  // --- Futures ---
  let futuresSummary='No futures data';
  if(S.futuresContracts&&S.futuresContracts.length){
    const front=S.futuresContracts[0];futuresSummary=`Front month: $${front.price} (${front.symbol||'?'})`;
    const latestCash=latestRL?.east?.['2x4#2'];
    if(latestCash)futuresSummary+=`, Basis (cash-futures): $${latestCash-front.price}`;
  }

  // --- Quote items ---
  const quoteItems=S.quoteItems.map(i=>`${i.product} from ${i.origin} @ $${i.fob}`).join(', ')||'Empty';

  const toolDefs=AI_TOOLS.map(t=>`- ${t.name}(${t.params.join(', ')}): ${t.desc}`).join('\n');

  const ctx=`You are the AI trading agent for Buckeye Pacific's SYP (Southern Yellow Pine) lumber desk. You have FULL CONTROL and VISIBILITY over the entire platform — orders, customers, mills, pricing, analytics, intelligence, and workflow. You are not a chatbot answering questions; you are an embedded agent that runs the trading desk alongside the traders.

IDENTITY & POSTURE:
- You are proactive. If you see issues (stale data, limit breaches, open positions needing coverage), flag them immediately.
- You are precise. Always use tools to get real numbers — never estimate from context alone.
- You are strategic. Connect market intelligence (regime, spreads, seasonality) to specific trading recommendations.
- You are efficient. Execute multi-step workflows in a single turn when possible.
- You speak in trading desk language: concise, direct, numbers-first.

PLATFORM CAPABILITIES (use tools for ALL of these):
1. ORDER MANAGEMENT — Create, update, delete, ship/deliver buy and sell orders
2. CUSTOMER & MILL MANAGEMENT — Full CRUD on customers, mills, freight lanes
3. QUOTE ENGINE — Build quotes, generate offerings, manage pricing
4. MARKET INTELLIGENCE — Regime detection, spread signals, mill price tracking, seasonal forecasts
5. RISK & ANALYTICS — VaR, exposure, P&L attribution, position limits, correlations
6. PLATFORM OVERSIGHT — Health checks, data quality audits, workflow status, daily digest
7. NAVIGATION — Direct users to any view in the platform

AVAILABLE TOOLS:
${toolDefs}

TO USE A TOOL:
\`\`\`tool
{"tool":"tool_name","params":{"param1":"value1","param2":"value2"}}
\`\`\`

PROACTIVE BEHAVIORS:
- When greeting or at conversation start, run get_platform_health to check for issues.
- If asked "what should I focus on?" or "morning briefing", run get_daily_digest.
- When discussing any customer, use get_customer_summary for real data.
- When discussing any mill, use get_mill_summary for real data.
- When making pricing recommendations, ALWAYS check regime + spread signals + seasonal position first.
- Before generating quotes, check mill data freshness. If stale (>2 days), warn the trader.
- When positions are discussed, cross-reference with risk limits via check_limits.

WORKFLOW PATTERNS:
- Deletions: ALWAYS search first (get_buys/get_sells), then delete by specific ID.
- Quotes: Check mill freshness → generate → review with trader → adjust if needed.
- Offerings: Check regime context → generate draft → surface for approval.
- Coverage: suggest_coverage → identify short positions → recommend mills via get_best_mill_price.

CURRENT LIVE DATA:

MARKET:
${rlSummary}
${rlTrends}
${futuresSummary}

POSITIONS:
${posDetails}
Summary: Inventory ${a.inv} MBF, Margin ${fmt(a.margin)}/MBF, Profit ${fmt(a.profit)}

OPEN ORDERS:
${openOrders}

RECENT BUYS (last 20):
${recentBuys}

RECENT SELLS (last 20):
${recentSells}

TOP CUSTOMERS: ${topCusts}

CUSTOMERS:
${custList}

MILLS:
${millList}

FREIGHT LANES:
${laneSummary}
Settings: Base $${S.freightBase}/load, Floor $${S.shortHaulFloor}/MBF

QUOTE ENGINE: ${quoteItems}

MILL PRICING DATABASE: ${typeof getLatestMillQuotes==='function'&&S.millQuotes.length?getLatestMillQuotes().slice(0,15).map(q=>`${q.mill}: ${q.product} @ $${q.price} (${q.shipWindow||'?'}, ${q.date})`).join('\n'):'No mill quotes in database'}

TOOL CATEGORIES:
- FORECASTING: get_forecast, get_seasonal_analysis, get_pricing_recommendation (26yr RL history, Holt ES + seasonal)
- OFFERINGS: generate_offering, get_offering_status (automated customer pricing drafts)
- INTELLIGENCE: get_regime (5-state market classification), get_spread_signals (mean-reversion at extremes), get_mill_moves (price change tracking)
- OVERSIGHT: get_platform_health (system-wide health check), get_daily_digest (comprehensive morning briefing), get_workflow_status (pending actions), get_data_quality (data completeness audit)
- RISK: get_var, get_exposure, check_limits, get_drawdown, get_risk_dashboard
- SIGNALS: get_signals, generate_signals, get_recommendations

ALWAYS execute — never just describe. Use multiple tools per turn when it makes sense. Be the best trading desk AI in lumber.`;

  await runAIWithTools(ctx,msg);
}

async function runAIWithTools(systemCtx,userMsg,depth=0){
  if(depth>10){S.aiMsgs.push({role:'assistant',content:'I\'ve reached the maximum number of tool calls for this request. Here\'s what I\'ve done so far.'});SS('aiMsgs',S.aiMsgs);render();return}

  const messages=S.aiMsgs.slice(-12).map(m=>({role:m.role,content:m.content}));

  // Show typing indicator
  const msgsEl=document.getElementById('ai-msgs');
  if(msgsEl){
    const typingEl=document.createElement('div');
    typingEl.className='ai-typing';typingEl.id='ai-typing';
    typingEl.innerHTML='<div class="ai-typing-dot"></div><div class="ai-typing-dot"></div><div class="ai-typing-dot"></div>';
    msgsEl.appendChild(typingEl);msgsEl.scrollTop=msgsEl.scrollHeight;
  }

  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':S.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:AI_MODEL_CHAT(),max_tokens:4096,stream:true,system:systemCtx,messages})
    });

    if(!res.ok){
      const err=await res.json().catch(()=>({}));
      throw new Error(err.error?.message||`API error: ${res.status}`);
    }

    // Remove typing indicator
    const typingIndicator=document.getElementById('ai-typing');
    if(typingIndicator)typingIndicator.remove();

    // Stream the response
    let reply='';
    const streamIdx=S.aiMsgs.length;
    S.aiMsgs.push({role:'assistant',content:''});
    render();

    const reader=res.body.getReader();
    const decoder=new TextDecoder();
    let buffer='';
    let lastRender=0;
    let currentBlockType=null;

    while(true){
      const{done,value}=await reader.read();
      if(done)break;
      buffer+=decoder.decode(value,{stream:true});
      const lines=buffer.split('\n');
      buffer=lines.pop();
      for(const line of lines){
        if(line.startsWith('data: ')){
          const data=line.slice(6).trim();
          if(data==='[DONE]')break;
          try{
            const event=JSON.parse(data);
            // Track block type so we can skip thinking blocks
            if(event.type==='content_block_start'){
              currentBlockType=event.content_block?.type||null;
            }else if(event.type==='content_block_stop'){
              currentBlockType=null;
            }else if(event.type==='content_block_delta'&&event.delta?.text&&currentBlockType!=='thinking'){
              reply+=event.delta.text;
              // Throttle DOM updates to ~60fps
              const now=Date.now();
              if(now-lastRender>50){
                lastRender=now;
                S.aiMsgs[streamIdx].content=reply;
                const msgsEl=document.getElementById('ai-msgs');
                if(msgsEl){
                  const msgDiv=msgsEl.children[streamIdx];
                  if(msgDiv)msgDiv.innerHTML=typeof renderMarkdown==='function'?renderMarkdown(reply):reply;
                  msgsEl.scrollTop=msgsEl.scrollHeight;
                }
              }
            }
          }catch(e){/* skip malformed SSE events */}
        }
      }
    }

    // Final render of complete reply
    S.aiMsgs[streamIdx].content=reply;
    render();

    // Check for tool calls in completed reply
    const toolRegex=/```tool\s*\n?([\s\S]*?)\n?```/g;
    const toolCalls=[];
    let match;
    while((match=toolRegex.exec(reply))!==null){
      try{
        const toolData=JSON.parse(match[1]);
        toolCalls.push(toolData);
      }catch(e){console.error('Tool parse error:',e)}
    }

    if(toolCalls.length>0){
      // Execute tools
      const results=[];
      for(const tc of toolCalls){
        const result=await executeAITool(tc.tool,tc.params||{});
        results.push({tool:tc.tool,result});
      }

      // Clean tool blocks from the streamed reply — hide if only mechanics remain
      let cleanReply=reply.replace(/```tool[\s\S]*?```/g,'').trim();
      S.aiMsgs[streamIdx].content=cleanReply;
      if(!cleanReply)S.aiMsgs[streamIdx].hidden=true;

      // Show tool results (hidden from chat display, kept for AI context)
      const toolResultsText=results.map(r=>`${r.result.success?'✅':'❌'} ${r.tool}: ${r.result.message||JSON.stringify(r.result.data).slice(0,300)}`).join('\n');
      S.aiMsgs.push({role:'assistant',content:toolResultsText,hidden:true});
      render();
      SS('aiMsgs',S.aiMsgs);

      // Feed results back for multi-turn reasoning
      S.aiMsgs.push({role:'user',content:'[SYSTEM] Tool execution results:\n'+JSON.stringify(results.map(r=>({tool:r.tool,...r.result}))),hidden:true});
      await runAIWithTools(systemCtx,null,depth+1);
      return;
    }
  }catch(e){
    const ti=document.getElementById('ai-typing');if(ti)ti.remove();
    S.aiMsgs.push({role:'assistant',content:'Error: '+e.message});
  }

  SS('aiMsgs',S.aiMsgs);
  render();
}

// Deterministic CSV order parser — no AI, instant, free, never fails
function parseOrderCSV(csvText){
  const WEST_STATES=new Set(['TX','AR','LA','OK','NM','CO','AZ','UT','NV','CA','OR','WA','ID','MT','WY']);
  const EAST_STATES=new Set(['NC','SC','GA','FL','VA','MD','DE','NJ','NY','PA','CT','MA','ME','NH','VT','RI','WV','DC']);

  // Use configurable PPU from state, with fallback defaults
  const DEFAULT_PPU={'2x4':208,'2x6':128,'2x8':96,'2x10':80,'2x12':64};
  const getPPU=(dim)=>S.ppu&&S.ppu[dim]?S.ppu[dim]:(DEFAULT_PPU[dim]||0);
  const TIMBER_MBF=S.mbfPerTL?.timber||20;// Timbers use configurable MBF per TL

  function getRegion(st){
    st=(st||'').trim().toUpperCase();
    if(WEST_STATES.has(st))return 'west';
    if(EAST_STATES.has(st))return 'east';
    return 'central';
  }

  function parseProduct(desc,detail){
    let grade='#2';
    if(/CLEAR/i.test(desc))grade='CLEAR';
    else if(/#1/i.test(desc))grade='#1';
    else if(/#3/i.test(desc))grade='#3';
    else if(/#2/i.test(desc))grade='#2';

    const dimMatch=(detail||'').match(/(\d+)\s*X\s*(\d+)/i);
    // Match foot lengths (16'), stud lengths (104-5/8"), or plain numbers
    const lenMatch=(detail||'').match(/(\d+)'/)||// Standard: 16'
                   (detail||'').match(/(\d+)-\d+\/\d+"?/)||// Stud: 104-5/8" → 104 (treat as ~8.67')
                   (detail||'').match(/(\d+)"/);// Inch only: 104"
    const thick=dimMatch?parseInt(dimMatch[1]):2;
    const wide=dimMatch?parseInt(dimMatch[2]):4;
    const dim=`${thick}x${wide}`;
    let length=lenMatch?lenMatch[1]:'';
    // If length is in inches (>20), convert to feet (stud lengths like 104-5/8")
    if(length&&parseInt(length)>20){
      length=String(Math.round(parseInt(length)/12*100)/100);// 104 → 8.67
    }
    const product=grade==='CLEAR'?`${dim} CLEAR`:`${dim}${grade}`;
    const isTimber=thick>=4;// 4x4, 4x6, 6x6, etc.
    return{product,length,dim,thick,wide,isTimber};
  }

  // Parse mixed tallies into array of {units, length} objects
  // Handles formats like: "5/10, 3/12, 2/14", "10'-5, 12'-3", "5-10's 3-12's", "5x10 3x12", etc.
  function parseMixedTally(val, defaultLength){
    val=(val||'').replace(/"/g,'').trim();
    if(!val)return [];

    // Excel date detection: "5/14/2026" or "5/14/26" — mangled from "5/14"
    // This is units/bundles format, NOT a mixed tally with lengths
    if(/^\d+\/\d+\/\d{2,4}$/.test(val)){
      const units=parseFloat(val.split('/')[0])||0;
      return units?[{units,length:defaultLength}]:[];
    }

    // Month-name mangling: "May-14" — extract first number as units
    if(/^[a-zA-Z]{3,}-\d+$/.test(val)){
      const n=val.match(/(\d+)/);
      const units=n?parseFloat(n[1]):0;
      return units?[{units,length:defaultLength}]:[];
    }

    // Check for mixed tally patterns (multiple length entries)
    // Pattern: comma/space separated entries with units AND lengths
    const mixedPatterns=[
      // "5/10, 3/12, 2/14" — units/length pairs
      /(\d+)\s*\/\s*(\d+)(?:'|ft)?/gi,
      // "10'-5, 12'-3, 14'-2" — length'-units pairs
      /(\d+)(?:'|ft)?\s*[-–]\s*(\d+)(?!\d)/gi,
      // "5-10's, 3-12's" — units-length's pairs
      /(\d+)\s*[-–]\s*(\d+)(?:'s|'|ft)/gi,
      // "5x10, 3x12" — units x length pairs (NOT dimensions like 2x4)
      /(?<![x×])(\d+)\s*[x×]\s*(\d+)(?!'|\d)/gi,
      // "10(5) 12(3)" — length(units) pairs
      /(\d+)(?:'|ft)?\s*\(\s*(\d+)\s*\)/gi,
    ];

    // Try pattern: units/length (most common mixed tally format)
    let matches=[...val.matchAll(/(\d+)\s*\/\s*(\d+)(?!')/g)];
    if(matches.length>1||(matches.length===1&&val.includes(','))){
      // Multiple "X/Y" patterns = mixed tally
      return matches.map(m=>({units:parseFloat(m[1]),length:m[2]})).filter(x=>x.units>0);
    }

    // Try pattern: length'-units (e.g., "10'-5, 12'-3")
    matches=[...val.matchAll(/(\d+)(?:'|ft|')\s*[-–]\s*(\d+)(?!\d)/g)];
    if(matches.length>0){
      return matches.map(m=>({units:parseFloat(m[2]),length:m[1]})).filter(x=>x.units>0);
    }

    // Try pattern: units-length's (e.g., "5-10's, 3-12's")
    matches=[...val.matchAll(/(\d+)\s*[-–]\s*(\d+)(?:'s|'s|'|ft)/g)];
    if(matches.length>0){
      return matches.map(m=>({units:parseFloat(m[1]),length:m[2]})).filter(x=>x.units>0);
    }

    // Try pattern: length(units) (e.g., "10(5) 12(3)")
    matches=[...val.matchAll(/(\d+)(?:'|ft)?\s*\(\s*(\d+)\s*\)/g)];
    if(matches.length>0){
      return matches.map(m=>({units:parseFloat(m[2]),length:m[1]})).filter(x=>x.units>0);
    }

    // Single value patterns (no embedded length info)
    // "17" → 17 units at default length
    // "5/14" → 5 units / 14 bundles (ignore bundles), use default length
    let units=0;
    const slashMatch=val.match(/^(\d+)\s*\/\s*(\d+)$/);
    if(slashMatch){
      // Single "X/Y" = units/bundles, NOT units/length (when there's no comma indicating multiple entries)
      units=parseFloat(slashMatch[1])||0;
    }else{
      // Plain number
      units=parseFloat(val.match(/(\d+)/)?.[1]||'0')||0;
    }

    return units?[{units,length:defaultLength}]:[];
  }

  // Legacy single-value tally parser (for backward compatibility)
  function parseTally(val){
    const items=parseMixedTally(val,'');
    if(items.length===0)return 0;
    return items.reduce((sum,i)=>sum+i.units,0);
  }

  function unitsToMBF(units,dim,lengthFt,isTimber){
    if(isTimber)return TIMBER_MBF;
    if(!units||!lengthFt)return 0;
    const pcsPerUnit=getPPU(dim);
    if(!pcsPerUnit)return 0;
    const totalPieces=units*pcsPerUnit;
    // Parse thick x wide from dim
    const parts=dim.split('x').map(Number);
    const thick=parts[0]||2,wide=parts[1]||4;
    const bfPerPiece=(thick*wide*parseFloat(lengthFt))/12;
    return Math.round(totalPieces*bfPerPiece/1000*100)/100;// MBF rounded to 2 decimals
  }

  function parsePrice(val){
    return parseFloat((val||'').replace(/[$,]/g,''))||0;
  }

  // Convert per-piece price to MBF price if detected
  // Piece prices are typically $2-$20, MBF prices are typically $300-$800
  function piecePriceToMBF(price,thick,wide,lengthFt){
    if(!price||!lengthFt)return price;
    // Board feet per piece = (thick * wide * length) / 12
    const bfPerPiece=(thick*wide*parseFloat(lengthFt))/12;
    // MBF price = piece price * 1000 / bf per piece
    return Math.round(price*1000/bfPerPiece);
  }

  function isPiecePrice(price,thick,wide,lengthFt){
    if(!price||price<=0)return false;
    // Heuristic: if price < $50 and would convert to reasonable MBF ($200-$1200), it's per-piece
    if(price>=50)return false;// Likely already MBF
    const asInMBF=piecePriceToMBF(price,thick,wide,parseFloat(lengthFt)||12);
    return asInMBF>=200&&asInMBF<=1200;// Reasonable MBF range for SYP
  }

  function parseCSVRow(line){
    const fields=[];
    let current='',inQuotes=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){inQuotes=!inQuotes;continue}
      if(ch===','&&!inQuotes){fields.push(current.trim());current='';continue}
      current+=ch;
    }
    fields.push(current.trim());
    return fields;
  }

  const lines=csvText.split('\n').map(l=>l.replace(/\r/g,'')).filter(l=>l.trim());
  if(lines.length<2)throw new Error('CSV has no data rows');

  const header=lines[0].toLowerCase();
  const hasHeader=header.includes('order');
  // Filter out footer rows (Total, Applied filters, blank data)
  const dataLines=(hasHeader?lines.slice(1):lines).filter(l=>{
    const first=l.split(/[,\t]/)[0].trim().toLowerCase();
    return first&&first!=='total'&&!first.startsWith('applied filter');
  });

  const headerFields=hasHeader?parseCSVRow(lines[0]):[];

  // Detect CSV format by header columns
  // OC Reports format (15 cols): Order #, Seller, Customer, Ship To State, Ship To City, DELETE COLUMN, OC Price (sell), Product Description, Product Detail, Tally, Mill, Ship From State, Ship From City, PO_BuyTraderName, PO Price (buy)
  // Old format (13 cols): Order, Seller, Customer, ShipToState, ShipToCity, SellPrice, ProductDesc, ProductDetail, Tally, Mill, ShipFromState, ShipFromCity, Buyer
  const hasOCPrice=headerFields.some(h=>/oc.*price/i.test(h));
  const hasPOPrice=headerFields.some(h=>/po.*price/i.test(h));
  const hasDeleteCol=headerFields.some(h=>/delete/i.test(h));
  const hasBuyTrader=headerFields.some(h=>/buytrader/i.test(h));
  const isNewFormat=hasOCPrice||hasPOPrice||hasDeleteCol||hasBuyTrader;

  // Parse rows
  const rows=dataLines.map(line=>{
    const f=parseCSVRow(line);
    if(f.length<(isNewFormat?10:7))return null;

    let orderNum,seller,customer,shipToState,shipToCity,buyPrice,sellPrice,productDesc,productDetail,tally,mill,shipFromState,shipFromCity,buyer;

    if(isNewFormat){
      // OC Reports: Order #, Seller, Customer, Ship To State, Ship To City, DELETE COLUMN, OC Price, Product Description, Product Detail, Tally, Mill, Ship From State, Ship From City, PO_BuyTraderName, PO Price
      orderNum=f[0];
      seller=f[1];
      customer=f[2];
      shipToState=f[3];
      shipToCity=f[4];
      // f[5] is DELETE COLUMN - skip it
      sellPrice=parsePrice(f[6]);// OC Price (sell)
      productDesc=f[7];
      productDetail=f[8];
      tally=f[9];
      mill=f[10];
      shipFromState=f[11];
      shipFromCity=f[12];
      buyer=f[13]||seller;// PO_BuyTraderName
      buyPrice=parsePrice(f[14]);// PO Price (buy)
    }else{
      // Old format (legacy)
      orderNum=f[0];
      seller=f[1];
      customer=f[2];
      shipToState=f[3];
      shipToCity=f[4];
      sellPrice=parsePrice(f[5]);
      productDesc=f[6];
      productDetail=f[7];
      tally=f[8];
      mill=f[9];
      shipFromState=f[10];
      shipFromCity=f[11];
      buyer=f[12]||seller;
      const buyPriceIdx=headerFields.findIndex(h=>/buy.*price|fob.*price|mill.*price/i.test(h));
      buyPrice=buyPriceIdx>=0?parsePrice(f[buyPriceIdx]):0;
    }

    const{product,length:defaultLength,dim,thick,wide,isTimber}=parseProduct(productDesc,productDetail);

    // Normalize entity names (handles ALL-CAPS, aliases, suffix stripping)
    if(customer&&typeof normalizeCustomerName==='function')customer=normalizeCustomerName(customer);
    if(mill&&typeof normalizeMillCompany==='function')mill=normalizeMillCompany(mill);

    // Parse mixed tallies — may return multiple {units, length} entries
    const tallyItems=parseMixedTally(tally,defaultLength);

    // If no tally items parsed, create single row with 0 units
    if(tallyItems.length===0){
      return[{
        orderNum,seller,customer,shipToState,shipToCity,sellPrice,product,
        length:defaultLength,dim,isTimber,units:0,volume:0,
        mill,shipFromState,shipFromCity,buyer,buyPrice
      }];
    }

    // Create a row for each tally entry (handles mixed tallies like "5/10, 3/12, 2/14")
    return tallyItems.map(ti=>{
      const len=ti.length||defaultLength;
      const mbf=unitsToMBF(ti.units,dim,len,isTimber);

      // Detect and convert per-piece prices to MBF (e.g., $5.76/pc → ~$576/MBF for 2x6 12')
      const lengthNum=parseFloat(len)||12;
      let adjSellPrice=sellPrice,adjBuyPrice=buyPrice;
      if(typeof isPiecePrice==='function'&&typeof piecePriceToMBF==='function'){
        if(isPiecePrice(sellPrice,thick,wide,lengthNum)){
          adjSellPrice=piecePriceToMBF(sellPrice,thick,wide,lengthNum);
        }
        if(isPiecePrice(buyPrice,thick,wide,lengthNum)){
          adjBuyPrice=piecePriceToMBF(buyPrice,thick,wide,lengthNum);
        }
      }

      return{
        orderNum,seller,customer,shipToState,shipToCity,sellPrice:adjSellPrice,product,
        length:len,dim,isTimber,units:ti.units,volume:mbf,
        mill,shipFromState,shipFromCity,buyer,buyPrice:adjBuyPrice
      };
    });
  }).flat().filter(Boolean);

  // Group by Order #
  const groups=new Map();
  rows.forEach(r=>{
    if(!groups.has(r.orderNum))groups.set(r.orderNum,{rows:[],seller:r.seller,customer:r.customer,shipToState:r.shipToState,shipToCity:r.shipToCity,mill:r.mill,shipFromState:r.shipFromState,shipFromCity:r.shipFromCity,buyer:r.buyer});
    const g=groups.get(r.orderNum);
    g.rows.push(r);
    if(!g.mill&&r.mill)g.mill=r.mill;
    if(!g.buyer&&r.buyer)g.buyer=r.buyer;
    if(!g.customer&&r.customer)g.customer=r.customer;
    if(!g.seller&&r.seller)g.seller=r.seller;
    if(!g.shipFromState&&r.shipFromState)g.shipFromState=r.shipFromState;
    if(!g.shipFromCity&&r.shipFromCity)g.shipFromCity=r.shipFromCity;
    if(!g.shipToState&&r.shipToState)g.shipToState=r.shipToState;
    if(!g.shipToCity&&r.shipToCity)g.shipToCity=r.shipToCity;
  });

  // Build output
  const orders=[];
  groups.forEach((g,orderNum)=>{
    const hasMill=!!g.mill;
    const hasCustomer=!!g.customer;
    const status=hasMill&&hasCustomer?'matched':hasCustomer?'short':'long';

    const products=g.rows.map(r=>r.product);
    const primary=products.sort((a,b)=>products.filter(p=>p===b).length-products.filter(p=>p===a).length)[0];

    const items=g.rows.map(r=>({product:r.product,length:r.length,price:r.sellPrice,volume:r.volume,units:r.units,buyPrice:r.buyPrice}));
    const sellRegion=getRegion(g.shipToState);
    const buyRegion=getRegion(g.shipFromState);
    const destination=g.shipToCity&&g.shipToState?`${g.shipToCity}, ${g.shipToState}`.trim():'';
    const origin=g.shipFromCity&&g.shipFromState?`${g.shipFromCity}, ${g.shipFromState}`.trim():'';

    // Detect multi-product orders (e.g. 2x4 + 2x6 on one truck)
    const uniqueProducts=[...new Set(g.rows.map(r=>r.product))];
    const productLabel=uniqueProducts.length>1?uniqueProducts.join(' / '):primary;

    const order={orderNum,status};
    if(hasCustomer){
      order.sell={trader:g.seller||'',customer:g.customer,destination,product:productLabel,region:sellRegion,items:items.map(it=>({product:it.product,length:it.length,price:it.price,volume:it.volume,units:it.units}))};
    }else{order.sell=null}
    if(hasMill){
      order.buy={trader:g.buyer||g.seller||'',mill:g.mill,origin,product:productLabel,region:buyRegion,items:items.map(it=>({product:it.product,length:it.length,price:it.buyPrice||0,volume:it.volume,units:it.units}))};
    }else{order.buy=null}

    orders.push(order);
  });

  return orders;
}

// AI-powered order parser — handles any text format (CSV, emails, free-form, order confirmations)
// Attempt to repair truncated JSON array from a cut-off AI response
// Finds the last complete object in the array and closes brackets
function tryRepairTruncatedJSON(str){
  if(!str||!str.startsWith('['))return null;
  // Find the last complete object by looking for "},\n" or "}\n]" patterns
  // Walk backward to find the last valid closing brace of a top-level object
  let depth=0,lastGoodIdx=-1;
  let inString=false,escape=false;
  for(let i=0;i<str.length;i++){
    const ch=str[i];
    if(escape){escape=false;continue;}
    if(ch==='\\'){escape=true;continue;}
    if(ch==='"'){inString=!inString;continue;}
    if(inString)continue;
    if(ch==='{'||ch==='[')depth++;
    else if(ch==='}'||ch===']'){
      depth--;
      // depth===1 means we just closed a top-level object inside the root array
      if(depth===1&&ch==='}')lastGoodIdx=i;
      // depth===0 means the array itself closed properly
      if(depth===0)return null; // not actually truncated, parse error is something else
    }
  }
  if(lastGoodIdx<0)return null;
  const repaired=str.slice(0,lastGoodIdx+1)+'\n]';
  try{
    const arr=JSON.parse(repaired);
    if(Array.isArray(arr)&&arr.length>0)return arr;
  }catch(e2){}
  return null;
}

async function parseOrdersWithAI(text){
  if(!S.apiKey)throw new Error('API key required. Add your Anthropic API key in Settings.');

  const customerNames=S.customers.filter(c=>c.type!=='mill').map(c=>c.name);
  const millNames=S.customers.filter(c=>c.type==='mill').map(c=>c.name);

  const systemPrompt=`You are an expert lumber trade order parser for Southern Yellow Pine (SYP). Your job is to extract PERFECTLY structured order data from ANY text format — CSV, emails, order confirmations, handwritten notes, etc.

CRITICAL: ACCURACY IS PARAMOUNT. Every unit, price, and length MUST be correctly paired. When in doubt, preserve the original structure rather than guessing.

═══════════════════════════════════════════════════════════════════════════════
PRODUCT STANDARDS
═══════════════════════════════════════════════════════════════════════════════
DIMENSIONS: 2x4, 2x6, 2x8, 2x10, 2x12 (standard), 4x4, 4x6, 6x6 (timbers)
GRADES: #1, #2, #3, #4, CLEAR, MSR
FORMAT: "{dim}{grade}" → "2x4#2", "2x6#1", "2x8 CLEAR", "2x4 MSR 2400f"

═══════════════════════════════════════════════════════════════════════════════
LENGTH FORMAT GUIDE
═══════════════════════════════════════════════════════════════════════════════
- Standard: 10', 12', 16', 20' (foot mark)
- Stud lengths: "104-5/8"" or "92-5/8"" — convert to feet: 104.625" ≈ 8.72', 92.625" ≈ 7.72'
- If length is in inches (>20), divide by 12 to get feet

═══════════════════════════════════════════════════════════════════════════════
PRICE FORMAT DETECTION
═══════════════════════════════════════════════════════════════════════════════
- MBF prices are typically $200-$900 (e.g., 450, 575, 680)
- Per-piece prices are typically $2-$20 (e.g., 5.76, 8.32, 12.50)
- CRITICAL: If you see prices under $50, check if they're per-piece and CONVERT to MBF:
  MBF_price = piece_price × 1000 / ((thick × wide × length_ft) / 12)
  Example: $5.76/pc for 2x6 12' → 5.76 × 1000 / (2×6×12/12) = 5.76 × 1000 / 12 = $480/MBF
- Always output prices in $/MBF format

═══════════════════════════════════════════════════════════════════════════════
PIECES PER UNIT (PPU) — MEMORIZE THESE
═══════════════════════════════════════════════════════════════════════════════
${Object.entries(S.ppu||{'2x4':208,'2x6':128,'2x8':96,'2x10':80,'2x12':64}).map(([dim,ppu])=>`${dim}: ${ppu} pcs/unit`).join('    ')}
Timbers (4x4+): use 20 MBF flat

═══════════════════════════════════════════════════════════════════════════════
MBF CALCULATION — DO THIS FOR EVERY LINE ITEM
═══════════════════════════════════════════════════════════════════════════════
MBF = (units × pcsPerUnit × thick × wide × lengthFt) / 12 / 1000

Examples:
• 5 units of 2x4 at 10' → (5 × 208 × 2 × 4 × 10) / 12 / 1000 = 69.33 MBF
• 3 units of 2x6 at 12' → (3 × 128 × 2 × 6 × 12) / 12 / 1000 = 46.08 MBF
• 2 units of 2x8 at 16' → (2 × 96 × 2 × 8 × 16) / 12 / 1000 = 40.96 MBF

═══════════════════════════════════════════════════════════════════════════════
⚠️ CRITICAL: MIXED TALLY PARSING ⚠️
═══════════════════════════════════════════════════════════════════════════════
Tallies describe how many UNITS at each LENGTH. A single order often has MULTIPLE lengths.
You MUST create a SEPARATE line item for EACH length in the tally.

TALLY FORMAT EXAMPLES (all mean the same thing):
• "5/10, 3/12, 2/14" → 5 units @ 10', 3 units @ 12', 2 units @ 14'
• "10'-5, 12'-3, 14'-2" → 5 units @ 10', 3 units @ 12', 2 units @ 14'
• "5-10's, 3-12's, 2-14's" → 5 units @ 10', 3 units @ 12', 2 units @ 14'
• "5x10, 3x12, 2x14" → 5 units @ 10', 3 units @ 12', 2 units @ 14'
• "10(5) 12(3) 14(2)" → 5 units @ 10', 3 units @ 12', 2 units @ 14'

SINGLE LENGTH TALLIES:
• "5/14" → 5 units (the 14 is bundles/lifts, IGNORE IT), need length from elsewhere
• "17" → 17 units, need length from elsewhere
• "5 units" → 5 units, need length from elsewhere

WHEN LENGTH IS IN A SEPARATE COLUMN:
• If tally is just "5" and length column says "10", that's 5 units @ 10'
• Multiple rows with same order# but different lengths = multiple line items

═══════════════════════════════════════════════════════════════════════════════
⚠️ CRITICAL: PRICE-TALLY ALIGNMENT ⚠️
═══════════════════════════════════════════════════════════════════════════════
Prices often vary by length. You MUST match prices to the correct lengths.

SCENARIO 1 — Single price for all lengths:
  "2x4#2, 5/10 3/12 2/14, $450" → All three lengths get $450

SCENARIO 2 — Price per length (common in formal orders):
  "2x4#2 10' $445, 2x4#2 12' $450, 2x4#2 14' $460"
  → 10' gets $445, 12' gets $450, 14' gets $460

SCENARIO 3 — Price table format:
  Length | Price | Units
  10'    | 445   | 5
  12'    | 450   | 3
  14'    | 460   | 2
  → Create 3 items with correct price-length pairing

SCENARIO 4 — Base price + length adders:
  "Base $450, +$5 for 14'+, +$10 for 16'+"
  → 10' = $450, 12' = $450, 14' = $455, 16' = $460

WHEN UNCERTAIN: If prices and tallies don't clearly align, use the SAME price for all lengths rather than guessing wrong.

═══════════════════════════════════════════════════════════════════════════════
REGIONS (by state)
═══════════════════════════════════════════════════════════════════════════════
West: TX, AR, LA, OK, NM, CO, AZ, UT, NV, CA, OR, WA, ID, MT, WY
East: NC, SC, GA, FL, VA, MD, DE, NJ, NY, PA, CT, MA, ME, NH, VT, RI, WV, DC
Central: All other US states

═══════════════════════════════════════════════════════════════════════════════
KNOWN ENTITIES (fuzzy match to these)
═══════════════════════════════════════════════════════════════════════════════
TRADERS: ${JSON.stringify(TRADER_MAP)}
CUSTOMERS: ${customerNames.length?customerNames.join(', '):'(none)'}
MILLS: ${millNames.length?millNames.join(', '):'(none)'}

═══════════════════════════════════════════════════════════════════════════════
ORDER STATUS
═══════════════════════════════════════════════════════════════════════════════
"matched" = has BOTH mill (buy) AND customer (sell)
"short" = has customer but NO mill
"long" = has mill but NO customer

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT — JSON ARRAY ONLY, NO MARKDOWN
═══════════════════════════════════════════════════════════════════════════════
[{
  "orderNum": "string",
  "status": "matched|short|long",
  "buy": {
    "trader": "trader name or empty",
    "mill": "mill name",
    "origin": "City, ST",
    "product": "2x4#2 or 2x4#2 / 2x6#2 for mixed",
    "region": "west|central|east",
    "items": [
      {"product": "2x4#2", "length": "10", "price": 450, "volume": 69.33, "units": 5},
      {"product": "2x4#2", "length": "12", "price": 450, "volume": 41.60, "units": 3},
      {"product": "2x4#2", "length": "14", "price": 455, "volume": 32.43, "units": 2}
    ]
  },
  "sell": {
    "trader": "trader name or empty",
    "customer": "customer name",
    "destination": "City, ST",
    "product": "2x4#2",
    "region": "west|central|east",
    "items": [same structure as buy.items with sell prices]
  }
}]

═══════════════════════════════════════════════════════════════════════════════
FINAL RULES
═══════════════════════════════════════════════════════════════════════════════
• buy/sell = null if that side is missing
• Prices numeric (no $), in $/MBF
• Length as string, just the number (no ' or ")
• ONE item per length — if tally has 3 lengths, output 3 items
• Calculate MBF for EVERY item using the formula above
• If no order number, generate "AI-001", "AI-002", etc.
• Multi-product orders: set product to "2x4#2 / 2x6#2" and include separate items for each`;

  const res=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-api-key':S.apiKey,
      'anthropic-version':'2023-06-01',
      'anthropic-dangerous-direct-browser-access':'true'
    },
    body:JSON.stringify({
      model:'claude-sonnet-4-20250514',
      max_tokens:16384,
      system:systemPrompt,
      messages:[{role:'user',content:`Parse the following into structured lumber trade orders:\n\n${text}`}]
    })
  });

  if(!res.ok){
    const err=await res.json().catch(()=>({}));
    throw new Error(err.error?.message||`API error: ${res.status}`);
  }

  const data=await res.json();
  const reply=data.content?.[0]?.text||'';
  const stopReason=data.stop_reason||'';

  // Extract JSON from response — handle both raw JSON and markdown-wrapped JSON
  let jsonStr=reply;
  const jsonMatch=reply.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if(jsonMatch)jsonStr=jsonMatch[1];
  jsonStr=jsonStr.trim();

  let orders;
  try{
    orders=JSON.parse(jsonStr);
  }catch(e){
    // Attempt to repair truncated JSON (hit max_tokens)
    orders=tryRepairTruncatedJSON(jsonStr);
    if(!orders){
      throw new Error('AI returned invalid JSON'+(stopReason==='max_tokens'?' (response was truncated — try importing fewer orders at once)':'')+'. Raw response:\n\n'+reply.slice(0,500));
    }
  }

  if(!Array.isArray(orders))throw new Error('AI response is not an array of orders.');

  // Post-process: recalculate MBF using app's calcMBFFromUnits for consistency
  orders.forEach(order=>{
    ['buy','sell'].forEach(side=>{
      if(order[side]&&order[side].items){
        order[side].items.forEach(item=>{
          if(item.units&&item.product&&item.length){
            // Use the app's MBF calculation function if available
            if(typeof calcMBFFromUnits==='function'){
              const recalcMBF=calcMBFFromUnits(item.product,item.length,item.units);
              if(recalcMBF>0)item.volume=recalcMBF;
            }
          }
        });
      }
    });
  });

  return orders;
}
