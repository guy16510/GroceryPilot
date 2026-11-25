import {DatabaseSync} from 'node:sqlite';
export function openStore(path) {
  const db=new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec('CREATE TABLE IF NOT EXISTS imports (hash TEXT PRIMARY KEY, imported_at TEXT NOT NULL, source TEXT, orders INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, date TEXT NOT NULL, payload TEXT NOT NULL, imported_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS feedback (product_id TEXT PRIMARY KEY, snooze_until TEXT, excluded INTEGER DEFAULT 0); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  const save=db.prepare('INSERT INTO orders VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,payload=excluded.payload,imported_at=excluded.imported_at');
  return {
    db,
    importOrders(orders,hash,source){
      db.exec('BEGIN IMMEDIATE');
      try{
        if(db.prepare('SELECT 1 FROM imports WHERE hash=?').get(hash)){db.exec('COMMIT');return {duplicate:true,orders:0};}
        const now=new Date().toISOString();
        for(const o of orders)save.run(o.id,o.date,JSON.stringify(o),now);
        db.prepare('INSERT INTO imports VALUES (?,?,?,?)').run(hash,now,source,orders.length);
        db.exec('COMMIT');return {duplicate:false,orders:orders.length};
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
    orders(){return db.prepare('SELECT payload FROM orders ORDER BY date,id').all().map(x=>JSON.parse(x.payload));},
    feedback(){return Object.fromEntries(db.prepare('SELECT * FROM feedback').all().map(r=>[r.product_id,r]));},
    setFeedback(id,until,excluded){db.prepare('INSERT INTO feedback VALUES (?,?,?) ON CONFLICT(product_id) DO UPDATE SET snooze_until=excluded.snooze_until,excluded=excluded.excluded').run(id,until,excluded?1:0);},
    get(key){return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value??null;},
    set(key,value){db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);},
    imports(){return db.prepare('SELECT imported_at,source,orders FROM imports ORDER BY imported_at DESC LIMIT 20').all();}
  };
}
