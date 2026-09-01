const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Intercept API response to see what frontend receives
  let apiData = null;
  page.on('response', async resp => {
    if (resp.url().includes('/api/products?') && !resp.url().includes('/api/products/')) {
      try {
        const json = await resp.json();
        apiData = json;
      } catch {}
    }
  });

  await page.goto('http://localhost:3000/catalog', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  if (apiData) {
    console.log('=== API RESPONSE FROM FRONTEND ===');
    console.log('Total items:', apiData.items?.length);
    if (apiData.items?.length > 0) {
      const first = apiData.items[0];
      console.log('\nFirst product keys:', Object.keys(first));
      console.log('primaryImage:', JSON.stringify(first.primaryImage));
      console.log('images:', JSON.stringify(first.images));
      console.log('All field values of first product:');
      for (const [k, v] of Object.entries(first)) {
        const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
        console.log(`  ${k}: ${val?.substring(0, 100)}`);
      }
    }
  } else {
    console.log('No API response intercepted');
  }

  // Also check what React renders
  console.log('\n=== REACT STATE ===');
  const productHTML = await page.$$eval('.product-card', els => els.slice(0, 2).map(el => el.innerHTML));
  productHTML.forEach((html, i) => console.log(`\nCard ${i} HTML:\n${html.substring(0, 500)}`));

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
