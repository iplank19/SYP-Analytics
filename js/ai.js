// SYP Analytics - AI Functions
const AI_TOOLS=[
  // Orders - Create
  {name:'create_buy',desc:'Create a buy order',params:['mill','product','price','volume','region','length','shipWeek','notes']},
  {name:'create_sell',desc:'Create a sell order',params:['customer','destination','product','price','freight','volume','length','shipWeek','notes']},
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
  // Utility
  {name:'clear_chat',desc:'Clear AI chat history',params:[]},
  {name:'refresh',desc:'Refresh the current view',params:[]}
];

function executeAITool(name,params){
  console.log('Executing tool:',name,params);
  try{
    switch(name){
      case 'create_buy':{
        const buy={
          id:genId(),
          date:today(),
          mill:params.mill||'',
          product:params.product||'2x4#2',
          price:parseFloat(params.price)||0,
          volume:parseFloat(params.volume)||0,
          region:params.region||'west',
          length:params.length||'RL',
          shipWeek:params.shipWeek||'',
          notes:params.notes||'Created by AI',
          shipped:false
        };
        S.buys.unshift(buy);
        save('buys',S.buys);
        return{success:true,message:`Created buy: ${buy.volume} MBF ${buy.product} from ${buy.mill} @ $${buy.price}`,data:buy};
      }
      case 'create_sell':{
        const sell={
          id:genId(),
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
          delivered:false
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
        const cust=S.customers.find(c=>c.name.toLowerCase().includes((params.customerName||'').toLowerCase()));
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
        const cust={id:genId(),name:params.name,destination:params.destination,email:params.email||'',type:'customer',quoteSelected:true,locations:[params.destination].filter(Boolean)};
        S.customers.push(cust);
        save('customers',S.customers);
        return{success:true,message:`Added customer: ${cust.name}`,data:cust};
      }
      case 'add_mill':{
        const mill={id:genId(),name:params.name,location:params.location,region:params.region||'west',type:'mill'};
        S.customers.push(mill);
        save('customers',S.customers);
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
        const validViews=['dashboard','leaderboard','insights','blotter','benchmark','risk','quotes','products','crm','rldata','settings'];
        const view=params.view?.toLowerCase();
        if(!validViews.includes(view))return{success:false,message:`Invalid view. Valid views: ${validViews.join(', ')}`};
        S.view=view;
        render();
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
      default:
        return{success:false,message:`Unknown tool: ${name}`};
    }
  }catch(e){
    return{success:false,message:`Error: ${e.message}`};
  }
}

async function sendAI(){
  if(!S.apiKey){alert('Add API key in Settings');return}
  const inp=document.getElementById('ai-in');
  const msg=inp.value.trim();if(!msg)return;
  S.aiMsgs.push({role:'user',content:msg});inp.value='';render();
  
  const a=analytics();
  const latestRL=S.rl.length?S.rl[S.rl.length-1]:null;
  
  // Build context
  let rlSummary='No RL data available.';
  if(latestRL){
    const prices=[];
    ['west','central','east'].forEach(r=>{
      ['2x4#2','2x6#2','2x8#2'].forEach(p=>{
        if(latestRL[r]?.[p])prices.push(`${r} ${p}: $${latestRL[r][p]}`);
      });
    });
    rlSummary=`Latest RL (${latestRL.date}): ${prices.slice(0,6).join(', ')}`;
  }
  
  // Position summary
  const positions={};
  S.buys.forEach(b=>{const k=b.product;if(!positions[k])positions[k]={b:0,s:0};positions[k].b+=b.volume||0});
  S.sells.forEach(s=>{const k=s.product;if(!positions[k])positions[k]={b:0,s:0};positions[k].s+=s.volume||0});
  const posSummary=Object.entries(positions).filter(([k,v])=>v.b!==v.s).map(([k,v])=>`${k}: ${v.b-v.s>0?'LONG':'SHORT'} ${Math.abs(v.b-v.s)} MBF`).join(', ')||'Flat';
  
  // Customer list
  const custList=S.customers.filter(c=>c.type!=='mill').map(c=>c.name).slice(0,10).join(', ');
  
  // Quote items
  const quoteItems=S.quoteItems.map(i=>`${i.product} from ${i.origin} @ $${i.fob}`).join(', ')||'Empty';

  const toolDefs=AI_TOOLS.map(t=>`- ${t.name}(${t.params.join(', ')}): ${t.desc}`).join('\n');
  
  const ctx=`You are an AI trading assistant for SYP (Southern Yellow Pine) lumber trading at Buckeye Pacific. You have FULL CONTROL over the entire platform and can execute ANY action.

CAPABILITIES:
- CREATE, UPDATE, DELETE buy orders and sell orders
- Manage customers and mills (add, update, delete)
- Control the quote engine
- Navigate between views
- Update settings and freight rates
- Access all trading data and analytics

AVAILABLE TOOLS:
${toolDefs}

TO USE A TOOL, respond with a JSON block:
\`\`\`tool
{"tool":"tool_name","params":{"param1":"value1","param2":"value2"}}
\`\`\`

IMPORTANT WORKFLOW FOR DELETIONS:
1. First use get_buys or get_sells to find the order IDs
2. Then use delete_buy or delete_sell with the specific ID
3. For bulk deletions, use delete_buys or delete_sells with criteria or IDs

You can use multiple tools in one response.

CURRENT STATE:
- ${rlSummary}
- Positions: ${posSummary}
- Inventory: ${a.inv} MBF, Margin: ${fmt(a.margin)}, Profit: ${fmt(a.profit)}
- Customers: ${custList}
- Quote Engine Items: ${quoteItems}
- Freight: Base $${S.freightBase}/load, Floor $${S.shortHaulFloor}/MBF
- Buy orders: ${S.buys.length}, Sell orders: ${S.sells.length}

ALWAYS use tools to execute actions. Never just describe what you would do - actually do it.
When deleting, first search to find the correct IDs, then delete.`;

  await runAIWithTools(ctx,msg);
}

async function runAIWithTools(systemCtx,userMsg,depth=0){
  if(depth>5){S.aiMsgs.push({role:'assistant',content:'Max tool depth reached.'});render();return}
  
  const messages=S.aiMsgs.slice(-10).map(m=>({role:m.role,content:m.content}));
  
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':S.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:2048,system:systemCtx,messages})
    });
    const data=await res.json();
    let reply=data.content?.[0]?.text||data.error?.message||'Error';
    
    // Check for tool calls
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
      // Execute tools and show results
      const results=[];
      for(const tc of toolCalls){
        const result=executeAITool(tc.tool,tc.params||{});
        results.push({tool:tc.tool,result});
        // Show tool execution in chat
        reply=reply.replace(/```tool[\s\S]*?```/,'');
      }
      
      // Clean up reply and add tool results
      reply=reply.trim();
      const toolResultsText=results.map(r=>`✅ ${r.tool}: ${r.result.message||JSON.stringify(r.result.data).slice(0,200)}`).join('\n');
      
      if(reply)S.aiMsgs.push({role:'assistant',content:reply});
      S.aiMsgs.push({role:'assistant',content:toolResultsText});
      
      // Re-render to show updates
      render();
      
      // Continue conversation if AI might want to do more
      // (commented out to avoid loops - enable if needed)
      // await runAIWithTools(systemCtx,'Tool results: '+JSON.stringify(results),depth+1);
    }else{
      S.aiMsgs.push({role:'assistant',content:reply});
    }
  }catch(e){
    S.aiMsgs.push({role:'assistant',content:'Error: '+e.message});
  }
  
  SS('aiMsgs',S.aiMsgs);
  render();
}

// Parse CSV order data using Claude AI
async function parseOrderCSV(csvText){
  if(!S.apiKey){throw new Error('Add API key in Settings first')}
  const systemPrompt=`You are a lumber trade data parser. Parse the CSV order data and return a JSON array.

RULES:
1. Group rows by Order # — multiple rows with the same Order # are line items on one truckload.
2. For each unique Order #, produce ONE object with sell and buy sides.
3. Product mapping from "Product Description" + "Product Detail":
   - "K.D. SYP #2" + "2 X 4 10'" → product "2x4#2", length "10"
   - "K.D. SYP #1" + "2 X 10 16'" → product "2x10#1", length "16"
   - "K.D. SYP #2 PRIME" → treat as #2 grade
   - "K.D. SYP CLEAR" + "2 X 10 14'" → product "2x10 CLEAR", length "14"
   - General pattern: take dimension from Product Detail (e.g. "2 X 4" → "2x4"), grade from Product Description (#1, #2, #3, CLEAR)
4. Tally parsing:
   - Simple number like "17" → volume = 17
   - Fraction like "5/14" → volume = 5 (first number is MBF, second is units/bundles — ignore second)
   - "40/18" → volume = 40
   - Empty "" → volume = 0
5. When grouping multiple rows into one order, build items array with each line item's length, price, and volume.
   If all items share the same product dimension (e.g. all 2x4), use that product. If mixed dimensions, note in the product field.
6. Destination = "CITY, ST" from Ship To City + Ship To State
7. Origin = "CITY, ST" from Ship From City + Ship From State
8. Region: Determine from Ship To State:
   - West: TX, AR, LA, OK, NM, CO
   - East: NC, SC, GA, FL, VA, MD, DE, NJ, NY, PA, CT, MA
   - Central: IL, IN, OH, MI, KY, TN, AL, MS, MO, WI, MN, IA
9. Status classification:
   - "matched" = has both Customer AND Mill data
   - "short" = has Customer but Mill is empty
   - "long" = has Mill but Customer is empty
10. Seller is the trader who owns the sell side. Buyer is the trader who owns the buy side.

Return ONLY a JSON array, no markdown, no explanation. Format:
[{
  "orderNum": "70264",
  "status": "matched",
  "sell": {
    "trader": "Ian Plank",
    "customer": "BEAR CREEK TRUSS INC",
    "destination": "TUSCOLA, IL",
    "product": "2x4#1",
    "region": "central",
    "items": [{"length": "10", "price": 483, "volume": 17}]
  },
  "buy": {
    "trader": "Ian Plank",
    "mill": "POTLATCHDELTIC OLA",
    "origin": "OLA, AR",
    "product": "2x4#1",
    "region": "central",
    "items": [{"length": "10", "price": null, "volume": 17}]
  }
}]

If buy side has no data (mill is empty), set buy to null.
If sell side has no data (customer is empty), set sell to null.
Buy price is always null (not in the CSV).`;

  const res=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':S.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:4096,system:systemPrompt,messages:[{role:'user',content:csvText}]})
  });
  const data=await res.json();
  const text=data.content?.[0]?.text||'';
  if(data.error)throw new Error(data.error.message);
  // Extract JSON from response (might be wrapped in markdown code block)
  const jsonMatch=text.match(/\[[\s\S]*\]/);
  if(!jsonMatch)throw new Error('AI did not return valid JSON');
  return JSON.parse(jsonMatch[0]);
}
