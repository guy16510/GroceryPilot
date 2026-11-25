const DAY=86400000;
const time=d=>Date.parse(d+'T00:00:00Z');
const median=a=>{const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length?(s[m]+s[Math.ceil(s.length/2)-1])/2:null;};
export function analyze(orders,feedback={},today=new Date().toISOString().slice(0,10),horizon=7){
  const products=new Map();let unmatched=0,unfulfilled=0,spend=0;
  for(const o of orders){
    if(o.total!==null)spend+=o.total;
    for(const l of o.lines){
      if(o.canceled||l.missing){unfulfilled++;continue;}
      if(!l.id){unmatched++;continue;}
      if(!(l.qty>0)||o.date>today||/in progress|pending|preparing|placed|shipped|processing|scheduled/i.test(o.status??''))continue;
      let p=products.get(l.id);if(!p){p={id:l.id,dates:new Map(),prices:[],name:l.name,category:l.category,unitType:l.unitType,weighted:false};products.set(l.id,p);}
      p.name=l.name;p.category=l.category??p.category;p.unitType=l.unitType??p.unitType;
      p.weighted ||= /weight|lb|kg/i.test(l.unitType??'')||/weight adjusted|final weight/i.test((l.fulfillment??'')+' '+(l.note??''))||!Number.isInteger(l.qty);
      p.dates.set(o.date,(p.dates.get(o.date)??0)+l.qty);
      if(l.unit!==null&&l.unit>=0)p.prices.push(l.unit);
    }
  }
  const catalog=[];
  for(const p of products.values()){
    const dates=[...p.dates.keys()].sort(),last=dates.at(-1);
    const gaps=dates.slice(1).map((d,i)=>(time(d)-time(dates[i]))/DAY).filter(n=>n>0);
    const intervals=gaps.slice(-8),cadence=median(intervals),age=(time(today)-time(last))/DAY;
    const typicalQty=Math.max(1,Math.min(20,Math.round(median([...p.dates.values()].slice(-8))??1)));
    const lastPrice=p.prices.at(-1)??null, typicalPrice=median(p.prices.slice(-8));
    const f=feedback[p.id],dispersion=cadence?median(intervals.map(g=>Math.abs(g-cadence)))/cadence:null;
    const enough=dates.length>=3&&cadence>=2,stale=cadence&&age>Math.max(cadence*3,90);
    const due=enough&&!stale&&age+horizon>=cadence&&!p.weighted&&!f?.excluded&&!(f?.snooze_until>today);
    const confidence=dates.length>=5&&dispersion<=0.35?'high':enough?'medium':'low';
    catalog.push({id:p.id,name:p.name,category:p.category,unitType:p.unitType,weighted:p.weighted,purchases:dates.length,totalQty:[...p.dates.values()].reduce((a,b)=>a+b,0),last,age,cadence,qty:typicalQty,lastPrice,typicalPrice,confidence,due,excluded:!!f?.excluded,snoozeUntil:f?.snooze_until??null,stale:!!stale,priceChange:p.prices.length>1?lastPrice-p.prices[0]:null});
  }
  catalog.sort((a,b)=>Number(b.due)-Number(a.due)||b.purchases-a.purchases||a.name.localeCompare(b.name));
  return {today,horizon,orders:orders.length,uniqueProducts:catalog.length,unmatched,unfulfilled,recordedOrderTotalCents:spend,firstOrder:orders[0]?.date??null,lastOrder:orders.at(-1)?.date??null,catalog,recommended:catalog.filter(p=>p.due)};
}
export function cartLink(items){
  if(!Array.isArray(items)||!items.length||items.length>80)throw new Error('Choose 1 to 80 products');
  const ids=new Set();
  for(const i of items){if(!/^\d{1,20}$/.test(i.id)||!Number.isInteger(i.qty)||i.qty<1||i.qty>20||ids.has(i.id))throw new Error('Invalid or duplicate item / quantity');ids.add(i.id);}
  return 'https://affil.walmart.com/cart/addToCart?items='+encodeURIComponent(items.map(i=>i.id+'|'+i.qty).join(','));
}
