import Database from 'bun:sqlite';
const db = new Database('db/custom.db');

console.log('=== EXISTING SPECIFICATIONS DATA ===');
const specs = db.query('SELECT * FROM product_specifications').all();
console.log('product_specifications (' + specs.length + ' rows):');
specs.forEach((r: any) => console.log(JSON.stringify(r, null, 2)));

console.log('\n=== EXISTING TECH METADATA ===');
const techs = db.query('SELECT * FROM product_technical_metadata').all();
console.log('product_technical_metadata (' + techs.length + ' rows):');
techs.forEach((r: any) => console.log(JSON.stringify(r, null, 2)));

// Now check how many products have meaningful sourceUnit / sourceBarcode
console.log('\n=== PUBLIC-SAFE METADATA ANALYSIS ===');
const products = db.query('SELECT id, metadata_json, is_sample_data FROM products').all();

let unitCount = 0, barcodeCount = 0, subcatCount = 0;
let uniqueUnits = new Set<string>();
let uniqueBarcodes = new Set<string>();

for (const p of products) {
  const pp = p as any;
  try {
    const meta = JSON.parse(pp.metadata_json || '{}');
    if (meta.sourceUnit) { unitCount++; uniqueUnits.add(meta.sourceUnit); }
    if (meta.sourceBarcode) { barcodeCount++; uniqueBarcodes.add(meta.sourceBarcode); }
    if (meta.sourceSubcategory) { subcatCount++; }
  } catch {}
}

console.log('Products with sourceUnit: ' + unitCount);
console.log('  Unique units: ' + uniqueUnits.size);
console.log('  Units: ' + Array.from(uniqueUnits).join(', '));
console.log('Products with sourceBarcode: ' + barcodeCount);
console.log('  Unique barcodes: ' + uniqueBarcodes.size);
console.log('Products with sourceSubcategory: ' + subcatCount);

// Check how many demo products have manufacturer set
const demoWithMfg = db.query('SELECT COUNT(*) as c FROM products WHERE is_sample_data = 1 AND manufacturer IS NOT NULL AND manufacturer != ""').get();
const jbWithMfg = db.query('SELECT COUNT(*) as c FROM products WHERE is_sample_data = 0 AND manufacturer IS NOT NULL AND manufacturer != ""').get();
console.log('\n=== MANUFACTURER DATA ===');
console.log('Demo products with manufacturer: ' + demoWithMfg.c);
console.log('JB products with manufacturer: ' + jbWithMfg.c);

// Check brand data
const brands = db.query('SELECT * FROM brands').all();
console.log('\n=== BRANDS ===');
brands.forEach((b: any) => console.log('  ' + b.id + ': ' + b.name_en));

// Check which products have brand_id != brand-jb
const branded = db.query('SELECT COUNT(*) as c FROM products WHERE brand_id IS NOT NULL AND brand_id != "brand-jb"').get();
console.log('\nProducts with public brand (not brand-jb): ' + branded.c);

db.close();
