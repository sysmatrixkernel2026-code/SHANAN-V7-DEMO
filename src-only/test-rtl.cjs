const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  
  // Test Arabic mode
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  
  // Click Arabic button
  const arBtn = await page.$('button:has-text("العربية")');
  if (arBtn) {
    await arBtn.click();
    await page.waitForTimeout(3000);
    results.push('AR_BTN: CLICKED');
  } else {
    results.push('AR_BTN: NOT_FOUND');
  }
  
  const dir = await page.$eval('html', e => e.getAttribute('dir')).catch(() => 'N/A');
  const lang = await page.$eval('html', e => e.getAttribute('lang')).catch(() => 'N/A');
  results.push('AR_DIR: ' + dir);
  results.push('AR_LANG: ' + lang);
  
  // Navigate to catalog in Arabic
  await page.goto('http://localhost:3000/catalog', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.product-card', { timeout: 10000 });
  const arCards = await page.$$eval('.product-card', cards => cards.length);
  results.push('AR_CATALOG_CARDS: ' + arCards);
  
  // Check a product detail in Arabic
  const firstCardLink = await page.$eval('.product-card a', el => el.getAttribute('href')).catch(() => null);
  if (firstCardLink) {
    await page.goto('http://localhost:3000' + firstCardLink, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector('.product-detail-page', { timeout: 10000 }).catch(() => {});
    const detailDir = await page.$eval('.product-detail-page', e => window.getComputedStyle(e).direction).catch(() => 'N/A');
    results.push('AR_DETAIL_DIR: ' + detailDir);
  }
  
  // Check body text direction
  const bodyDir = await page.$eval('body', e => window.getComputedStyle(e).direction).catch(() => 'N/A');
  results.push('AR_BODY_DIR: ' + bodyDir);
  
  console.log(results.join('\n'));
  await browser.close();
})();
