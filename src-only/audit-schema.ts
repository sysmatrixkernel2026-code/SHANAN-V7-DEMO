import Database from 'bun:sqlite';
const db = new Database('db/custom.db');

// Get products table schema
const cols = db.query("PRAGMA table_info(products)").all();
console.log('=== PRODUCTS TABLE COLUMNS ===');
cols.forEach(c => console.log(`  ${c.name} (${c.type})${c.notnull ? ' NOT NULL' : ''} default=${c.dflt_value}`));

console.log('\n=== ALL TABLES ===');
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
tables.forEach(t => {
  const count = db.query(`SELECT COUNT(*) as c FROM ${t.name}`).get();
  console.log(`  ${t.name}: ${count.c} rows`);
});

// Check product_specifications schema
console.log('\n=== product_specifications schema ===');
const specCols = db.query("PRAGMA table_info(product_specifications)").all();
specCols.forEach(c => console.log(`  ${c.name} (${c.type})`));

// Check product_technical_metadata schema
console.log('\n=== product_technical_metadata schema ===');
const techCols = db.query("PRAGMA table_info(product_technical_metadata)").all();
techCols.forEach(c => console.log(`  ${c.name} (${c.type})`));

db.close();
