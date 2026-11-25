import http from 'node:http';
import {mkdir,readFile,readdir,rename,stat} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {openStore} from './store.js';
import {normalize,digest,day} from './import.js';
import {analyze,cartLink} from './predict.js';
const env=process.env, password=env.APP_PASSWORD;
if(!password||password.length<16)throw new Error('Set APP_PASSWORD to at least 16 characters');
const dir=env.DATA_DIR??'./data';
await mkdir(join(dir,'inbox'),{recursive:true,mode:0o700});
await mkdir(join(dir,'processed'),{recursive:true,mode:0o700});
const store=openStore(join(dir,'grocery.sqlite'));
const page=await readFile(new URL('../public/index.html',import.meta.url));
const js=await readFile(new URL('../public/app.js',import.meta.url));
const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:env.TZ??'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function summary(){return {...analyze(store.orders(),store.feedback(),localDay()),imports:store.imports()};}
const same=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
function auth(req){const h=req.headers.authorization??'';if(h.startsWith('Basic ')){const [u,...p]=Buffer.from(h.slice(6),'base64').toString().split(':');return u==='grocery'&&same(p.join(':'),password);}return false;}
const send=(res,status,data,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'"});res.end(type==='application/json'?JSON.stringify(data):data);};
async function body(req){const chunks=[];let n=0;for await(const c of req){n+=c.length;if(n>25*1024*1024)throw new Error('Upload exceeds 25 MB');chunks.push(c);}return Buffer.concat(chunks).toString('utf8');}
function ingest(raw,name){if(!/\.(csv|json)$/i.test(name))throw new Error('Only CSV or JSON');return store.importOrders(normalize(raw,name),digest(raw),basename(name));}
let syncing=false;
async function syncInbox(){
  if(syncing)return;syncing=true;
  try{for(const f of await readdir(join(dir,'inbox'))){
    if(!/\.(json|csv)$/i.test(f))continue;
    try{const path=join(dir,'inbox',f),s=await stat(path);if(!s.isFile()||s.size>25*1024*1024||Date.now()-s.mtimeMs<10000)continue;
      const raw=await readFile(path,'utf8');ingest(raw,f);await rename(path,join(dir,'processed',digest(raw).slice(0,16)+'-'+f));
    }catch(e){console.error('Inbox import failed; file retained:',e.message);}
  }}finally{syncing=false;}
}
let notifying=false;
async function notify(){
  if(notifying||!env.HA_URL||!env.HA_TOKEN||!env.HA_NOTIFY_SERVICE||!env.PUBLIC_URL)return;
  if(!/^notify\/[a-z0-9_]+$/.test(env.HA_NOTIFY_SERVICE))return;
  const now=new Date(),date=localDay(),weekday=new Date(date+'T12:00:00Z').getUTCDay();
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:env.TZ??'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(now));
  if(weekday!==Number(env.REVIEW_DAY??5)||hour<Number(env.REVIEW_HOUR??9)||store.get('last_notice')===date)return;
  notifying=true;
  try{const s=summary();if(!s.orders)return;
    const r=await fetch(new URL('/api/services/'+env.HA_NOTIFY_SERVICE,env.HA_URL),{method:'POST',headers:{Authorization:'Bearer '+env.HA_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({title:'GroceryPilot',message:s.recommended.length+' possible replenishments. Review your Walmart list before checkout.',data:{url:env.PUBLIC_URL}}),signal:AbortSignal.timeout(10000)});
    if(r.ok)store.set('last_notice',date);else console.error('HA notification failed:',r.status);
  }catch(e){console.error('HA notification failed:',e.message);}finally{notifying=false;}
}
setInterval(()=>{syncInbox().catch(e=>console.error(e.message));notify();},60000).unref();
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost');
    if(!auth(req)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="GroceryPilot"','Cache-Control':'no-store'});return res.end('Authentication required');}
    if(req.method==='POST'&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'Cross-origin request denied'});
    if(req.method==='GET'&&u.pathname==='/')return send(res,200,page,'text/html; charset=utf-8');
    if(req.method==='GET'&&u.pathname==='/app.js')return send(res,200,js,'application/javascript; charset=utf-8');
    if(req.method==='GET'&&u.pathname==='/api/summary')return send(res,200,summary());
    if(req.method==='GET'&&u.pathname==='/api/orders')return send(res,200,store.orders());
    if(req.method==='GET'&&u.pathname==='/api/revisions'){const id=u.searchParams.get('order');if(!id)throw new Error('Order ID required');return send(res,200,store.revisions(id));}
    if(req.method==='POST'&&u.pathname==='/api/import'){if(req.headers['content-type']!=='application/octet-stream')throw new Error('Expected application/octet-stream');return send(res,200,ingest(await body(req),u.searchParams.get('filename')??'orders.json'));}
    if(req.method==='POST'&&u.pathname==='/api/cart'){
      if(!req.headers['content-type']?.startsWith('application/json'))throw new Error('Expected JSON');
      const items=JSON.parse(await body(req));const catalog=new Map(summary().catalog.map(p=>[p.id,p]));
      if(!Array.isArray(items)||items.some(i=>!catalog.has(i.id)||catalog.get(i.id).weighted))throw new Error('Unknown or weight-based product');
      return send(res,200,{url:cartLink(items),warning:'Opening this link may add to existing cart quantities. Open only once, then verify all items and delivery availability on Walmart.'});
    }
    if(req.method==='POST'&&u.pathname==='/api/feedback'){
      if(!req.headers['content-type']?.startsWith('application/json'))throw new Error('Expected JSON');
      const f=JSON.parse(await body(req));if(!summary().catalog.some(p=>p.id===f.id)||typeof f.excluded!=='boolean'||(f.until!=null&&day(f.until)!==f.until))throw new Error('Invalid feedback');
      store.setFeedback(f.id,f.until??null,f.excluded);return send(res,200,{ok:true});
    }
    return send(res,404,{error:'Not found'});
  }catch(e){return send(res,400,{error:e.message});}
});
server.listen(Number(env.PORT??8080),'0.0.0.0',()=>console.log('GroceryPilot listening'));
syncInbox().catch(e=>console.error(e.message));
