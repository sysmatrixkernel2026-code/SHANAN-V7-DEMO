import { Database } from 'bun:sqlite';
const db = new Database('db/custom.db');

// 1. Products table columns
const cols = db.prepare("PRAGMA table_info(products)").all();
console.log('=== PRODUCTS TABLE COLUMNS ===');
cols.forEach(c => console.log('  ' + c.name + ' (' + c.type + ') default=' + c.dflt_value));

// 2. All tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('\n=== ALL TABLES ===');
tables.forEach(t => console.log('  ' + t.name));

// 3. Check product price values
try {
  const priceCheck = db.prepare("SELECT price, currency FROM products LIMIT 5").all();
  console.log('\n=== PRICE SAMPLE (5 rows) ===');
  priceCheck.forEach(r => console.log('  price=' + r.price + ' currency=' + r.currency));
} catch(e) {
  console.log('\nNo price/currency columns in products: ' + e.message);
}

// 4. Count products with non-null prices
try {
  const withPrice = db.prepare("SELECT COUNT(*) as n FROM products WHERE price IS NOT NULL AND price > 0").get();
  console.log('\nProducts with price > 0: ' + withPrice.n);
} catch(e) {
  console.log('\nCannot query price: ' + e.message);
}

// 5. Check supplier_agreement_products for pricing
try {
  const sapCols = db.prepare("PRAGMA table_info(supplier_agreement_products)").all();
  console.log('\n=== SUPPLIER_AGREEMENT_PRODUCTS COLUMNS ===');
  sapCols.forEach(c => console.log('  ' + c.name + ' (' + c.type + ')'));
  
  const sapCount = db.prepare("SELECT COUNT(*) as n FROM supplier_agreement_products WHERE unit_price IS NOT NULL AND unit_price > 0").get();
  console.log('supplier_agreement_products with unit_price > 0: ' + sapCount.n);
} catch(e) {
  console.log('\nNo supplier_agreement_products: ' + e.message);
}

// 6. Product type in API response
const apiSample = db.prepare("SELECT p.price, p.currency FROM products p WHERE p.sku LIKE 'SHN-JB-%' LIMIT 3").all();
console.log('\n=== JB PRODUCT PRICE SAMPLE ===');
apiSample.forEach(r => console.log('  price=' + r.price + ' currency=' + r.currency));

db.close();
