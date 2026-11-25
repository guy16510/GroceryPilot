const $=id=>document.getElementById(id);
const money=n=>n==null?'Unknown':'$'+(n/100).toFixed(2);
let state,selected=new Map();
function error(e){$('error').textContent=e.message;}
async function api(path,options){const r=await fetch(path,options);const d=await r.json();if(!r.ok)throw new Error(d.error??r.status);return d;}
function text(tag,s){const e=document.createElement(tag);e.textContent=s;return e;}
async function refresh(){state=await api('/api/summary');selected=new Map(state.recommended.map(p=>[p.id,p.qty]));$('stats').textContent=state.orders+' orders · '+state.uniqueProducts+' exact products · '+state.unmatched+' unmatched lines · '+state.unfulfilled+' unfulfilled/returned lines · recorded totals '+money(state.recordedOrderTotalCents)+(state.lastOrder?' · latest order '+state.lastOrder:'');render();}
function subtotal(){let n=0,unknown=0;for(const [id,q] of selected){const p=state.catalog.find(x=>x.id===id);if(p.lastPrice==null)unknown++;else n+=p.lastPrice*q;}$('subtotal').textContent=selected.size+' products · historical estimate '+money(n)+(unknown?' + '+unknown+' unknown prices':'');$('link').replaceChildren();}
function render(){const tbody=$('rows');tbody.replaceChildren();const q=$('search').value.toLowerCase();for(const p of state.catalog.filter(x=>($('all').checked||x.due||selected.has(x.id))&&x.name.toLowerCase().includes(q))){
  const tr=document.createElement('tr'),td=()=>{const e=document.createElement('td');tr.append(e);return e;};
  const check=document.createElement('input');check.type='checkbox';check.checked=selected.has(p.id);check.disabled=p.weighted;check.onchange=()=>{if(check.checked)selected.set(p.id,p.qty);else selected.delete(p.id);qty.disabled=!check.checked;subtotal();};td().append(check);
  const product=td();product.append(text('strong',p.name),document.createElement('br'),text('small',p.id+(p.weighted?' · weighted':'')+(p.category?' · '+p.category:'')));
  td().append(text('span',p.purchases+' dates · last '+p.last),document.createElement('br'),text('small',(p.cadence?'~'+p.cadence+' days':'no cadence')+' · '+p.confidence+(p.stale?' · stale':'')));
  const qty=document.createElement('input');qty.type='number';qty.min=1;qty.max=20;qty.value=selected.get(p.id)??p.qty;qty.disabled=!check.checked;qty.onchange=()=>{qty.value=Math.max(1,Math.min(20,Math.round(Number(qty.value)||1)));if(check.checked)selected.set(p.id,Number(qty.value));subtotal();};td().append(qty);
  td().textContent=money(p.lastPrice);
  const pref=td(),b=text('button',p.excluded?'Allow again':'Never suggest'),s=text('button','Skip 7 days');
  const feedback=async(excluded,until)=>{try{await api('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:p.id,excluded,until})});await refresh();}catch(e){error(e);}};
  b.onclick=()=>feedback(!p.excluded,null);s.onclick=()=>{const d=new Date(state.today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+7);feedback(false,d.toISOString().slice(0,10));};pref.append(b,s);tbody.append(tr);
}subtotal();}
$('search').oninput=render;$('all').onchange=render;
$('import').onclick=async()=>{try{const f=$('file').files[0];if(!f)throw new Error('Select a file');const r=await api('/api/import?filename='+encodeURIComponent(f.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:f});$('error').textContent=r.duplicate?'Already imported':r.orders+' orders imported';await refresh();}catch(e){error(e);}};
$('cart').onclick=async()=>{try{const d=await api('/api/cart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([...selected].map(([id,qty])=>({id,qty})))});const a=text('a','Open Walmart cart once');a.href=d.url;a.target='_blank';a.rel='noopener noreferrer';$('link').replaceChildren(text('span',d.warning+' '),a);}catch(e){error(e);}};
refresh().catch(error);
