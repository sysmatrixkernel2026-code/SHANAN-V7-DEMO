const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Check prod-00001 (SKF with broken logo image)
  await page.goto('http://localhost:3000/product/prod-00001', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  const img = await page.$('.product-detail-main-image img');
  const placeholder = await page.$('.product-detail-image-placeholder');
  const brokenImg = await page.$('img[src*="shanan-logo"]');
  console.log('prod-00001: img=' + (img ? 'YES' : 'NO') + ' placeholder=' + (placeholder ? 'YES' : 'NO') + ' brokenLogo=' + (brokenImg ? 'YES' : 'NO'));
  if (img) {
    const d = await img.evaluate(e => ({ src: e.src, nw: e.naturalWidth, ok: e.complete }));
    console.log('  img src=' + d.src + ' naturalWidth=' + d.nw + ' complete=' + d.ok);
  }
  
  // Check prod-SHN-JB-001522 (no image linked, file exists on disk)
  await page.goto('http://localhost:3000/product/prod-SHN-JB-001522', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  const img2 = await page.$('.product-detail-main-image img');
  const placeholder2 = await page.$('.product-detail-image-placeholder');
  console.log('prod-SHN-JB-001522: img=' + (img2 ? 'YES' : 'NO') + ' placeholder=' + (placeholder2 ? 'YES' : 'NO'));
  
  await browser.close();
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
