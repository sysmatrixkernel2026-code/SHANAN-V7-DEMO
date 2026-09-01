import { Database } from 'bun:sqlite';
const db = new Database('db/custom.db');

// agreement_product_terms schema
const aptCols = db.prepare("PRAGMA table_info(agreement_product_terms)").all();
console.log('=== AGREEMENT_PRODUCT_TERMS COLUMNS ===');
aptCols.forEach(c => console.log('  ' + c.name + ' (' + c.type + ')'));

// Count records with prices for JB products
const aptCount = db.prepare(`
  SELECT COUNT(*) as n FROM agreement_product_terms apt
  JOIN supplier_agreements sa ON apt.agreement_id = sa.id
  WHERE apt.product_id IN (SELECT id FROM products WHERE sku LIKE 'SHN-JB-%')
`).get();
console.log('\nAPT records for JB products: ' + aptCount.n);

// Sample pricing data
const sample = db.prepare(`
  SELECT apt.unit_price, apt.currency, p.sku, sa.agreement_number
  FROM agreement_product_terms apt
  JOIN products p ON apt.product_id = p.id
  JOIN supplier_agreements sa ON apt.agreement_id = sa.id
  WHERE p.sku LIKE 'SHN-JB-%'
  AND apt.unit_price IS NOT NULL AND apt.unit_price > 0
  LIMIT 10
`).all();
console.log('\n=== JB PRODUCT PRICING SAMPLE ===');
sample.forEach(r => console.log('  ' + r.sku + ' | ' + r.unit_price + ' ' + r.currency + ' | agr: ' + r.agreement_number));

// Count JB products WITH pricing
const withPrice = db.prepare(`
  SELECT COUNT(DISTINCT p.id) as n FROM products p
  JOIN agreement_product_terms apt ON apt.product_id = p.id
  WHERE p.sku LIKE 'SHN-JB-%'
  AND apt.unit_price IS NOT NULL AND apt.unit_price > 0
`).get();
console.log('\nJB products with supplier pricing: ' + withPrice.n);

// JB products WITHOUT pricing
const withoutPrice = db.prepare(`
  SELECT COUNT(DISTINCT p.id) as n FROM products p
  WHERE p.sku LIKE 'SHN-JB-%'
  AND NOT EXISTS (
    SELECT 1 FROM agreement_product_terms apt
    WHERE apt.product_id = p.id
    AND apt.unit_price IS NOT NULL AND apt.unit_price > 0
  )
`).get();
console.log('JB products WITHOUT supplier pricing: ' + withoutPrice.n);

db.close();
