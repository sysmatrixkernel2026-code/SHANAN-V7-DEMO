import Database from 'bun:sqlite';

const db = new Database('db/custom.db');

console.log('=== SHANAN PRODUCT DATA AUDIT ===\n');

// 1. Table inventory
console.log('--- TABLE INVENTORY ---');
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'product%' ORDER BY name").all();
tables.forEach(t => {
  const count = db.query(`SELECT COUNT(*) as c FROM ${t.name}`).get();
  console.log(`  ${t.name}: ${count.c} rows`);
});

// 2. Product totals
const total = db.query("SELECT COUNT(*) as c FROM products").get();
const jb = db.query("SELECT COUNT(*) as c FROM products WHERE supplier_code IS NOT NULL AND supplier_code != ''").get();
const demo = db.query("SELECT COUNT(*) as c FROM products WHERE supplier_code IS NULL OR supplier_code = ''").get();
console.log(`\n--- PRODUCT TOTALS ---`);
console.log(`  Total: ${total.c}`);
console.log(`  JB (supplier_code present): ${jb.c}`);
console.log(`  Demo (no supplier_code): ${demo.c}`);

// 3. Product fields inventory
console.log(`\n--- PRODUCT TABLE COLUMNS ---`);
const cols = db.query("PRAGMA table_info(products)").all();
cols.forEach(c => {
  const nonNull = db.query(`SELECT COUNT(*) as c FROM products WHERE ${c.name} IS NOT NULL AND ${c.name} != '' AND ${c.name} != 'null'`).get();
  console.log(`  ${c.name} (${c.type}): ${nonNull.c}/${total.c} populated`);
});

// 4. product_specifications table
console.log(`\n--- PRODUCT_SPECIFICATIONS ---`);
const specCount = db.query("SELECT COUNT(*) as c FROM product_specifications").get();
const specProds = db.query("SELECT COUNT(DISTINCT product_id) as c FROM product_specifications").get();
console.log(`  Total spec rows: ${specCount.c}`);
console.log(`  Products with specs: ${specProds.c}`);

if (specCount.c > 0) {
  const specFields = db.query("SELECT DISTINCT key_en FROM product_specifications ORDER BY key_en").all();
  console.log(`  Unique spec keys: ${specFields.length}`);
  specFields.forEach(s => {
    const cnt = db.query(`SELECT COUNT(*) as c FROM product_specifications WHERE key_en = '${s.key_en}'`).get();
    console.log(`    ${s.key_en}: ${cnt.c} entries`);
  });
}

// 5. product_technical_metadata table
console.log(`\n--- PRODUCT_TECHNICAL_METADATA ---`);
const techCount = db.query("SELECT COUNT(*) as c FROM product_technical_metadata").get();
const techProds = db.query("SELECT COUNT(DISTINCT product_id) as c FROM product_technical_metadata").get();
console.log(`  Total rows: ${techCount.c}`);
console.log(`  Products with tech metadata: ${techProds.c}`);

if (techCount.c > 0) {
  const techFields = db.query("SELECT DISTINCT key_en FROM product_technical_metadata ORDER BY key_en").all();
  console.log(`  Unique keys: ${techFields.length}`);
  techFields.forEach(s => {
    const cnt = db.query(`SELECT COUNT(*) as c FROM product_technical_metadata WHERE key_en = '${s.key_en}'`).get();
    console.log(`    ${s.key_en}: ${cnt.c} entries`);
  });
}

// 6. product_documents table
console.log(`\n--- PRODUCT_DOCUMENTS ---`);
const docCount = db.query("SELECT COUNT(*) as c FROM product_documents").get();
const docProds = db.query("SELECT COUNT(DISTINCT product_id) as c FROM product_documents").get();
console.log(`  Total docs: ${docCount.c}`);
console.log(`  Products with docs: ${docProds.c}`);

// 7. product_images table
console.log(`\n--- PRODUCT_IMAGES ---`);
const imgCount = db.query("SELECT COUNT(*) as c FROM product_images").get();
const imgProds = db.query("SELECT COUNT(DISTINCT product_id) as c FROM product_images").get();
console.log(`  Total images: ${imgCount.c}`);
console.log(`  Products with images: ${imgProds.c}`);

// 8. metadata_json deep dive — THIS IS THE KEY DATA SOURCE
console.log(`\n--- METADATA_JSON DEEP DIVE ---`);
const products = db.query("SELECT id, name_en, category_id, metadata_json FROM products").all();

let withMetadata = 0;
let metadataParsed = 0;
let metadataParseFailed = 0;
const allKeys = {};
const categoryKeys = {};

for (const p of products) {
  if (p.metadata_json && p.metadata_json !== 'null' && p.metadata_json !== '{}') {
    withMetadata++;
    try {
      const meta = JSON.parse(p.metadata_json);
      if (typeof meta === 'object' && meta !== null && Object.keys(meta).length > 0) {
        metadataParsed++;
        for (const [k, v] of Object.entries(meta)) {
          allKeys[k] = (allKeys[k] || 0) + 1;
          if (!categoryKeys[p.category_id]) categoryKeys[p.category_id] = {};
          categoryKeys[p.category_id][k] = (categoryKeys[p.category_id][k] || 0) + 1;
        }
      }
    } catch {
      metadataParseFailed++;
    }
  }
}

console.log(`  Products with metadata_json: ${withMetadata}/${total.c}`);
console.log(`  Successfully parsed with data: ${metadataParsed}`);
console.log(`  Parse failures: ${metadataParseFailed}`);

console.log(`\n  ALL metadata_json keys (across all products):`);
const sortedKeys = Object.entries(allKeys).sort((a, b) => b[1] - a[1]);
sortedKeys.forEach(([k, v]) => console.log(`    ${k}: ${v} products`));

// 9. metadata_json keys by category
console.log(`\n  METADATA JSON KEYS BY CATEGORY:`);
const cats = db.query("SELECT id, name_en FROM categories ORDER BY name_en").all();
for (const cat of cats) {
  if (!categoryKeys[cat.id]) continue;
  const keys = Object.entries(categoryKeys[cat.id]).sort((a, b) => b[1] - a[1]);
  const prodsInCat = db.query(`SELECT COUNT(*) as c FROM products WHERE category_id = '${cat.id}'`).get();
  console.log(`\n  [${cat.name_en}] (${prodsInCat.c} products):`);
  keys.forEach(([k, v]) => console.log(`    ${k}: ${v}`));
}

// 10. Sample metadata_json values (first 3 products with metadata)
console.log(`\n--- SAMPLE METADATA_JSON VALUES ---`);
const samples = db.query("SELECT id, name_en, metadata_json FROM products WHERE metadata_json IS NOT NULL AND metadata_json != 'null' AND metadata_json != '{}' LIMIT 5").all();
for (const s of samples) {
  console.log(`\n  ${s.id} (${s.name_en}):`);
  try {
    const m = JSON.parse(s.metadata_json);
    console.log(JSON.stringify(m, null, 4).split('\n').map(l => '    ' + l).join('\n'));
  } catch { console.log('    [parse failed]'); }
}

// 11. Final classification
console.log(`\n--- PRODUCT SPECIFICATION CLASSIFICATION ---`);
let hasSpecs = 0, hasTechMeta = 0, hasMetadataJson = 0;
let hasAnyData = 0;
let hasNothing = 0;

const prodSpecs = db.query("SELECT DISTINCT product_id FROM product_specifications").all().map(r => r.product_id);
const prodTech = db.query("SELECT DISTINCT product_id FROM product_technical_metadata").all().map(r => r.product_id);

for (const p of products) {
  const hasSpec = prodSpecs.includes(p.id);
  const hasTech = prodTech.includes(p.id);
  let hasMeta = false;
  try {
    const m = JSON.parse(p.metadata_json || '{}');
    hasMeta = typeof m === 'object' && m !== null && Object.keys(m).length > 0;
  } catch {}

  if (hasSpec) hasSpecs++;
  if (hasTech) hasTechMeta++;
  if (hasMeta) hasMetadataJson++;
  if (hasSpec || hasTech || hasMeta) hasAnyData++;
  if (!hasSpec && !hasTech && !hasMeta) hasNothing++;
}

console.log(`  With product_specifications: ${hasSpecs}`);
console.log(`  With product_technical_metadata: ${hasTechMeta}`);
console.log(`  With metadata_json data: ${hasMetadataJson}`);
console.log(`  With ANY spec data (union): ${hasAnyData}`);
console.log(`  With NO spec data: ${hasNothing}`);
console.log(`  Coverage: ${((hasAnyData / total.c) * 100).toFixed(1)}%`);

db.close();
