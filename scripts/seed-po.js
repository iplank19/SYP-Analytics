#!/usr/bin/env node
// Parse closed trades CSV → po-seed.json for seeding S.poHistory
const fs=require('fs');
const path=require('path');

const csvPath=process.argv[2]||path.join(require('os').homedir(),'Downloads','orders-closed-2026-02-08.csv');
const outPath=path.join(__dirname,'..','po-seed.json');

const text=fs.readFileSync(csvPath,'utf8');

function parseCSVLine(line){
  const fields=[];let field='',inQuotes=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(inQuotes){if(ch==='"'&&line[i+1]==='"'){field+='"';i++}else if(ch==='"')inQuotes=false;else field+=ch}
    else{if(ch==='"')inQuotes=true;else if(ch===','){fields.push(field.trim());field=''}else field+=ch}
  }
  fields.push(field.trim());
  return fields;
}

function parsePOProduct(raw){
  if(!raw)return{product:'',length:''};
  let s=raw.trim();
  const commaIdx=s.indexOf(',');
  let gradePart=commaIdx>=0?s.slice(0,commaIdx):s;
  let dimPart=commaIdx>=0?s.slice(commaIdx+1):'';
  let grade='#2';
  if(/#\s*1\b/.test(gradePart))grade='#1';
  else if(/#\s*2\b/.test(gradePart))grade='#2';
  else if(/#\s*3\b/.test(gradePart))grade='#3';
  else if(/#\s*4\b/.test(gradePart))grade='#4';
  else if(/MSR|2400\s*F/i.test(gradePart))grade=' MSR';
  else if(/Dense\s*Sel/i.test(gradePart))grade='#1';
  else if(/Prime/i.test(gradePart))grade='#1';
  const dimMatch=dimPart.match(/(\d+)\s*[xX]\s*(\d+)/);
  if(!dimMatch)return{product:s,length:''};
  const thick=parseInt(dimMatch[1]),wide=parseInt(dimMatch[2]);
  let length='';
  const after=dimPart.slice(dimMatch.index+dimMatch[0].length).trim();
  const lenMatch=after.match(/^(\d+)/);
  if(lenMatch)length=lenMatch[1];
  else if(/^R\/?L/i.test(after))length='RL';
  const product=grade===' MSR'?thick+'x'+wide+' MSR':thick+'x'+wide+grade;
  return{product,length};
}

function parsePOPrice(raw){
  if(!raw)return 0;
  const n=parseFloat(String(raw).replace(/[$,MBF\s]/gi,'').trim());
  return isNaN(n)?0:Math.round(n*100)/100;
}

function parsePODate(raw){
  if(!raw)return'';
  const s=raw.trim();
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m)return m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0');
  return s;
}

function guessRegion(origin){
  if(!origin)return'central';
  const s=origin.toUpperCase();
  const west=['WA','OR','CA','ID','MT','NV','UT','AZ','CO','WY','NM'];
  const east=['VA','NC','SC','GA','FL','MD','DE','NJ','NY','PA','CT','MA','NH','ME','VT','RI','WV','OH','MI','IN'];
  for(const st of west){if(s.includes(', '+st)||s.endsWith(' '+st))return'west'}
  for(const st of east){if(s.includes(', '+st)||s.endsWith(' '+st))return'east'}
  return'central';
}

const TRADER_MAP={'Ian Plank':'Ian P','Aubrey Milligan':'Aubrey M','Sawyer Rapp':'Sawyer R','Jackson McCormick':'Jackson M','Hunter Sweet':'Hunter S'};

const lines=text.split(/\r?\n/).filter(l=>l.trim());
const header=parseCSVLine(lines[0]);
const col=(name)=>{const n=name.toLowerCase().replace(/[^a-z0-9]/g,'');return header.findIndex(h=>h.toLowerCase().replace(/[^a-z0-9]/g,'').includes(n))};
const iOrder=col('Order'),iDoc=col('Doc'),iSupplier=col('SupplierCustomer'),iTrader=col('Trader');
const iPartner=col('Tradingpartner'),iOrderDate=col('Orderdate'),iShipFrom=col('Shipfrom');
const iDept=col('Department'),iFreight=col('Totalfreight'),iProduct=col('Product');
const iPrice=col('Price'),iShipDate=col('Shipdate'),iShipStatus=col('Shipstatus');
const iOrderType=col('Ordertype');

const rows=[];
for(let i=1;i<lines.length;i++){
  const f=parseCSVLine(lines[i]);
  if(f.length<5)continue;
  const doc=(f[iDoc]||'').trim().toUpperCase();
  if(doc!=='PO')continue;
  const dept=(f[iDept]||'').trim();
  if(dept&&!dept.toLowerCase().includes('syp'))continue;
  const parsed=parsePOProduct(f[iProduct]||'');
  const traderRaw=(f[iTrader]||'').trim().replace(/\s*\([^)]*\)\s*$/,'').trim();
  const trader=TRADER_MAP[traderRaw]||traderRaw;
  const supplierRaw=(f[iSupplier]||'').trim().replace(/\s*\(\d+\)\s*$/,'').trim();
  const location=(f[iShipFrom]||'').trim();
  rows.push({
    orderNum:(f[iOrder]||'').trim(),
    doc,
    date:parsePODate(f[iOrderDate]||''),
    mill:supplierRaw,
    partner:(f[iPartner]||'').trim(),
    origin:location,
    region:guessRegion(location),
    product:parsed.product,
    length:parsed.length,
    price:parsePOPrice(f[iPrice]||''),
    freight:parsePOPrice(f[iFreight]||''),
    trader,
    shipDate:parsePODate(f[iShipDate]||''),
    shipStatus:(f[iShipStatus]||'').trim(),
    orderType:(f[iOrderType]||'').trim(),
    source:'csv'
  });
}

// Scrub outliers
const DATE_FLOOR='2024-02-01';
const PRICE_MIN=100;   // MBF prices below $100 are junk ($0/$1 inventory transfers)
const PRICE_MAX=1500;  // sanity cap
const BAD_MILLS=/^INV-|MISCELLANEOUS/i;
const BAD_LENGTHS=new Set(['48','93','104','116','128','140']);
const VALID_PRODUCT=/^\d+x\d+/;
const before=rows.length;
const scrubbed=rows.filter(r=>{
  if(r.date<DATE_FLOOR)return false;
  if(r.price<PRICE_MIN||r.price>PRICE_MAX)return false;
  if(BAD_MILLS.test(r.mill||''))return false;
  if(BAD_LENGTHS.has(r.length))return false;
  if(!VALID_PRODUCT.test(r.product))return false;
  return true;
});
console.log(`Scrubbed ${before-scrubbed.length} junk records (${scrubbed.length} remaining)`);

fs.writeFileSync(outPath,JSON.stringify(scrubbed));
const stats=fs.statSync(outPath);
console.log(`Parsed ${rows.length} records → ${outPath} (${Math.round(stats.size/1024)}KB)`);

const prods={};
scrubbed.filter(r=>r.doc==='PO').forEach(r=>{prods[r.product]=(prods[r.product]||0)+1});
const sorted=Object.entries(prods).sort((a,b)=>b[1]-a[1]).slice(0,10);
console.log('Top PO products:',sorted.map(e=>e[0]+': '+e[1]).join(', '));
console.log(`PO records: ${scrubbed.length}`);
