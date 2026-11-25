import {parse} from 'csv-parse/sync';
import {createHash} from 'node:crypto';

const txt = v => v == null ? null : String(v).trim().slice(0,1000) || null;
const get = (o,...keys) => keys.map(k=>o?.[k]).find(v=>v!==undefined && v!==null && v!=='');
export function num(v) {
  if(v===null||v===undefined||v==='') return null;
  const s=String(v).trim().replace(/[$,]/g,'');
  if(!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
  const n=Number(s); return Number.isFinite(n)?n:null;
}
export function day(v) {
  if(!v) return null;
  const s=String(v), iso=/^\d{4}-\d{2}-\d{2}/.exec(s);
  if(iso){const d=new Date(iso[0]+'T00:00:00Z'); return Number.isFinite(+d)&&d.toISOString().slice(0,10)===iso[0]?iso[0]:null;}
  const d=new Date(s); return Number.isFinite(+d)?d.toISOString().slice(0,10):null;
}
export function productId(i) {
  const raw=get(i,'item_id','itemId','usItemId','productId','Item ID');
  if(/^\d{1,20}$/.test(String(raw))) return String(raw);
  try { const u=new URL(get(i,'productLink','product_url','Product Link','url')); if(!['www.walmart.com','walmart.com'].includes(u.hostname)) return null;
    return /\/ip\/(?:[^/]+\/)?(\d{1,20})\/?$/.exec(u.pathname)?.[1]??null;
  } catch {return null;}
}
const money=v=>{const n=num(v);return n===null?null:Math.round(n*100)};
function line(i,missing=false) {
  const id=productId(i),name=txt(get(i,'productName','item_name','Product Name','name','title'));
  if(!name&&!id)return null;
  const status=txt(get(i,'deliveryStatus','status','Delivery Status','reason','Reason'));
  const q=num(get(i,'quantity','qty','Qty','Quantity'));
  const total=money(get(i,'price','line_price','Price','Line Price','Price (Not Charged)'));
  return {id,name:name??'Unknown product',qty:q,price:total,unit:money(get(i,'unitPrice','unit_price','Price Each'))??(q>0&&total!==null?Math.round(total/q):null),
    status,missing:missing||/cancel|unavailable|not fulfilled|not delivered|refunded|returned|not charged/i.test(status??''),
    unitType:txt(get(i,'sales_unit','salesUnit','unitType')),category:txt(get(i,'category','categoryPathId','Category')),
    seller:txt(get(i,'seller','Seller')),wasPrice:money(get(i,'wasPrice','Was Price')),discount:txt(get(i,'discount','Savings')),
    comparison:txt(get(i,'comparisonPrice','Price per Unit')),note:txt(get(i,'priceNotes','Note')),fulfillment:txt(get(i,'fulfillment','Fulfillment')),
    returnable:txt(get(i,'returnable','Returnable')),reason:missing?status:null};
}
function order(o,items,unfulfilled=[]) {
  const id=txt(get(o,'orderNumber','order_number','Order Number','order_id','orderId','id'));
  const date=day(get(o,'orderDate','order_date','Order Date','date','order_datetime'));
  if(!id||!date)throw new Error('Order missing identifier or valid date');
  const status=txt(get(o,'orderStatus','order_status','Order Status','status'));
  return {id,date,status,fulfillment:txt(get(o,'orderType','fulfillment','Fulfillment','Order Type')),store:txt(get(o,'storeName','store','Store')),
    total:money(get(o,'orderTotal','order_total','Order Total')),subtotal:money(get(o,'orderSubtotal','order_subtotal','Subtotal')),
    tax:money(get(o,'tax','order_tax','Tax')),fees:money(get(o,'fees','order_fees','Fees')),tip:money(get(o,'tip','order_tip','Tip')),
    refund:money(get(o,'refund','Refund')),discount:money(get(o,'order_discounts','discounts','Discounts')),
    donations:money(get(o,'donations','Donations')),late:txt(get(o,'wasDelayed','Late Delivery')),returnWindow:txt(get(o,'returnWindow','Return Window')),
    lines:[...items.map(i=>line(i)),...unfulfilled.map(i=>line(i,true))].filter(Boolean),
    canceled:o.noChargedItems===true||/^(fully )?cancel[l]?ed$/i.test(status??'')};
}
export function normalize(input,filename='orders.json') {
  let data=filename.toLowerCase().endsWith('.csv')?parse(input,{columns:true,bom:true,skip_empty_lines:true,relax_column_count:false}):JSON.parse(input);
  if(!Array.isArray(data)) data=data.orders??data.rows??data.data??(data.orderNumber?[data]:null);
  if(!Array.isArray(data)||!data.length)throw new Error('Expected a nonempty array of full invoice records or line-item CSV rows');
  if(data.some(x=>!x||typeof x!=='object'))throw new Error('Invalid record');
  const result=[];
  if(data.some(x=>Array.isArray(x.items)||x.invoice||Array.isArray(x.unfulfilledItems)||x.noChargedItems===true)){
    for(const record of data){
      const inv=record.invoice??record;
      if(!Array.isArray(inv.items)&&inv.noChargedItems!==true)throw new Error('Summary-only record: collect full invoices first');
      if(inv.dataSource==='summary')throw new Error('Summary-only record: collect full invoices first');
      result.push(order({...record,...inv},inv.items??[],inv.unfulfilledItems??[]));
    }
  } else {
    const groups=new Map();
    for(const row of data){
      const id=get(row,'order_number','Order Number','order_id','orderNumber');
      if(!id||!get(row,'item_name','Product Name','productName'))throw new Error('CSV must contain full line items, not order summaries');
      if(!groups.has(String(id)))groups.set(String(id),[]);
      groups.get(String(id)).push(row);
    }
    for(const rows of groups.values())result.push(order(rows[0],rows));
  }
  const ids=new Set();
  for(const o of result){if(ids.has(o.id))throw new Error('Duplicate order in input: '+o.id);ids.add(o.id);}
  return result;
}
export const digest=s=>createHash('sha256').update(s).digest('hex');
