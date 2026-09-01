import { Database } from 'bun:sqlite';
const db = new Database('db/custom.db', { readonly: true });

// Check metadata_json sanitization
const samples = db.query("SELECT id, metadata_json FROM products WHERE id IN ('prod-SHN-JB-000001','prod-SHN-JB-000201','prod-SHN-JB-003849')").all() as any[];
samples.forEach(s => {
  console.log(s.id);
  try { const m = JSON.parse(s.metadata_json); console.log('  ' + JSON.stringify(m)); }
  catch { console.log('  PARSE ERROR: ' + s.metadata_json); }
});

// Check that no sourceSupplier remains
const leaked = db.query("SELECT COUNT(*) as c FROM products WHERE metadata_json LIKE '%sourceSupplier%'").get() as any;
console.log('Products with sourceSupplier in metadata: ' + leaked.c);

const leakedCost = db.query("SELECT COUNT(*) as c FROM products WHERE metadata_json LIKE '%sourceCostPrice%'").get() as any;
console.log('Products with sourceCostPrice in metadata: ' + leakedCost.c);

// Check brand-jb name
const brand = db.query("SELECT name, name_ar FROM brands WHERE id = 'brand-jb'").get() as any;
console.log('brand-jb public name: ' + brand.name + ' / ' + brand.name_ar);

// Price coverage
const priced = db.query("SELECT COUNT(*) as c FROM products WHERE sell_price IS NOT NULL AND sell_price > 0").get() as any;
const unpriced = db.query("SELECT COUNT(*) as c FROM products WHERE sell_price IS NULL OR sell_price = 0").get() as any;
console.log('Priced: ' + priced.c + ' Unpriced: ' + unpriced.c);

// Availability breakdown
const avail = db.query("SELECT availability, COUNT(*) as c FROM products GROUP BY availability").all() as any[];
avail.forEach(a => console.log('  ' + a.availability + ': ' + a.c));

db.close();
