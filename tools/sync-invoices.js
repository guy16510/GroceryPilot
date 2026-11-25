// Run on the SAME machine as the signed-in browser extension, not on a remote NAS.
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {normalize} from '../src/import.js';
import {setTimeout as sleep} from 'node:timers/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFile,rename,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

const env=process.env;
if(!env.WALMART_INVOICE_MCP_TOKEN)throw new Error('Set WALMART_INVOICE_MCP_TOKEN from the exporter pairing settings');
if(!env.GROCERY_ACCOUNT_KEY&&!process.argv.includes('--accounts'))throw new Error('Set GROCERY_ACCOUNT_KEY, or run with --accounts to discover the saved account keys');
if(!env.GROCERY_INBOX&&!env.GROCERY_URL&&!process.argv.includes('--accounts'))throw new Error('Set GROCERY_INBOX or GROCERY_URL');
const client=new Client({name:'grocerypilot-sync',version:'0.1.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../node_modules/walmart-invoice-mcp/bin/walmart-invoice-mcp.js',import.meta.url))],env:{...Object.fromEntries(Object.entries(env).filter(([k,v])=>v!==undefined&&/^(PATH|HOME|USERPROFILE|SYSTEMROOT|APPDATA|TEMP|TMP|WALMART_INVOICE_MCP_TOKEN|WALMART_INVOICE_MCP_PORT)$/i.test(k)))}});
async function call(name,args={}){
  const r=await client.callTool({name,arguments:args},undefined,{timeout:30000});
  if(r.isError)throw new Error(name+' failed: '+r.content?.[0]?.text);
  return r.structuredContent??JSON.parse(r.content.find(x=>x.type==='text').text);
}
// Re-encode normalized records to an importer-compatible, privacy-filtered invoice shape.
function safeInvoice(o){
  const dollars=n=>n==null?null:n/100;
  const l=x=>({item_id:x.id,productName:x.name,quantity:x.qty,price:dollars(x.price),unitPrice:dollars(x.unit),deliveryStatus:x.status,sales_unit:x.unitType,category:x.category,seller:x.seller,wasPrice:dollars(x.wasPrice),discount:x.discount,comparisonPrice:x.comparison,priceNotes:x.note,fulfillment:x.fulfillment,returnable:x.returnable,reason:x.reason});
  return {orderNumber:o.id,orderDate:o.date,orderStatus:o.status,orderType:o.fulfillment,storeName:o.store,orderTotal:dollars(o.total),orderSubtotal:dollars(o.subtotal),tax:dollars(o.tax),fees:dollars(o.fees),tip:dollars(o.tip),refund:dollars(o.refund),order_discounts:dollars(o.discount),donations:dollars(o.donations),wasDelayed:o.late,returnWindow:o.returnWindow,noChargedItems:o.canceled,items:o.lines.filter(x=>!x.missing).map(l),unfulfilledItems:o.lines.filter(x=>x.missing).map(l)};
}
async function publish(orders){
  if(!orders.length)return;
  const content=JSON.stringify(orders);
  if(env.GROCERY_INBOX){
    const inbox=env.GROCERY_INBOX;await mkdir(inbox,{recursive:true,mode:0o700});
    const p=join(inbox,'mcp-'+randomUUID()+'.json');await writeFile(p+'.tmp',content,{mode:0o600});await rename(p+'.tmp',p);
  }else{
    const u=new URL('/api/import?filename=mcp-invoices.json',env.GROCERY_URL);
    if(u.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw new Error('Use HTTPS or a localhost SSH tunnel');
    if(!env.GROCERY_APP_PASSWORD)throw new Error('Set GROCERY_APP_PASSWORD');
    const r=await fetch(u,{method:'POST',headers:{Authorization:'Basic '+Buffer.from('grocery:'+env.GROCERY_APP_PASSWORD).toString('base64'),'Content-Type':'application/octet-stream'},body:content,redirect:'error',signal:AbortSignal.timeout(60000)});
    if(!r.ok)throw new Error('GroceryPilot import failed: HTTP '+r.status);
  }
}
try{
  await client.connect(transport);
  let status;
  for(let i=0;i<12;i++){status=await call('get_status');if(status.connected)break;await sleep(2500);}
  if(!status?.connected)throw new Error('Browser extension disconnected. Open its panel and confirm MCP is enabled.');
  if(process.argv.includes('--accounts')){console.log(JSON.stringify(await call('list_accounts'),null,2));}
  else{
    const provider='WALMART_US',accountKey=env.GROCERY_ACCOUNT_KEY,limit=100;
    let offset=0,total=Infinity,saved=0,missing=0;
    const seen=new Set();
    while(offset<total){
      const page=await call('export_orders',{provider,accountKey,includeInvoices:true,limit,offset,...(env.GROCERY_SINCE?{since:env.GROCERY_SINCE}:{})});
      if(!Array.isArray(page.orders)||!Number.isInteger(page.total))throw new Error('Unexpected export response');
      total=page.total;if(!page.orders.length&&offset<total)throw new Error('Incomplete pagination; rerun sync');
      const full=[];
      for(const record of page.orders){
        if(record.accountKey!==accountKey)throw new Error('Account mismatch; stopping');
        if(seen.has(record.orderNumber))throw new Error('Pagination changed during export; rerun sync');
        seen.add(record.orderNumber);
        if(!record.invoice||record.invoice.dataSource==='summary'||(!Array.isArray(record.invoice.items)&&record.invoice.noChargedItems!==true)){missing++;continue;}
        full.push(record);
      }
      if(full.length){const safe=normalize(JSON.stringify(full)).map(safeInvoice);await publish(safe);saved+=safe.length;}
      offset+=page.orders.length;
    }
    console.log('Sync complete: '+saved+' full invoices; '+missing+' summaries skipped. Collect missing invoices in the browser extension.');
  }
}finally{await client.close();}
