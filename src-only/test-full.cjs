const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const errors = [];

  const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx1.newPage();
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text().substring(0, 200)); });
  page.on('pageerror', err => errors.push('PAGE:' + err.message.substring(0, 200)));

  async function safeGoto(p, url, waitFor) {
    try {
      await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      if (waitFor) {
        await p.waitForSelector(waitFor, { timeout: 10000 }).catch(() => {});
      } else {
        await p.waitForTimeout(2000);
      }
    } catch(e) {
      results.push('NAV_WARN: ' + url + ' -> ' + e.message.substring(0, 100));
    }
  }

  // === HOME ===
  await safeGoto(page, 'http://localhost:3000/', '.home');
  results.push('HOME_TITLE: ' + await page.title());
  const homeText = await page.textContent('body');
  results.push('HOME_SUPPLIER_LEAK: ' + (homeText.includes('Jabali') || homeText.includes('JABALI') ? 'FOUND' : 'CLEAN'));
  results.push('HOME_CATEGORIES: ' + await page.$$eval('.category-preview-card', els => els.length).catch(() => 0));
  results.push('HOME_SHANAN: ' + await page.$$eval('header *', els => els.some(e => e.textContent.includes('SHANAN'))).catch(() => false));

  // === CATEGORIES PAGE (NEW) ===
  await safeGoto(page, 'http://localhost:3000/categories', '.categories-page');
  const catTitle = await page.$eval('.categories-page-title', e => e.textContent.trim()).catch(() => 'MISSING');
  const catStats = await page.$eval('.categories-page-stats', e => e.textContent.trim()).catch(() => 'MISSING');
  const catSearch = !!(await page.$('.categories-page-search-input'));
  const catGrid = await page.$$eval('.category-page-card', els => els.length).catch(() => 0);
  const catPagination = !!(await page.$('.categories-page-pagination'));
  const catMotion = !!(await page.$('.category-page-card-icon-wrap'));
  results.push('CAT_TITLE: ' + catTitle);
  results.push('CAT_STATS: ' + catStats);
  results.push('CAT_SEARCH: ' + catSearch);
  results.push('CAT_CARDS: ' + catGrid);
  results.push('CAT_PAGINATION: ' + catPagination);
  results.push('CAT_KENBURNS: ' + catMotion);
  const catText = await page.textContent('body');
  results.push('CAT_PRIVACY: ' + (catText.includes('Jabali') || catText.includes('JABALI') ? 'FOUND' : 'CLEAN'));

  // Test category search
  if (catSearch) {
    await page.fill('.categories-page-search-input', 'bearing');
    await page.waitForTimeout(500);
    const filtered = await page.$$eval('.category-page-card', els => els.length).catch(() => 0);
    results.push('CAT_SEARCH_FILTER: ' + filtered + ' results for "bearing"');
    await page.fill('.categories-page-search-input', '');
    await page.waitForTimeout(500);
  }

  // Test category pagination
  if (catPagination) {
    const pageInfo = await page.$eval('.categories-page-pagination-info', e => e.textContent.trim()).catch(() => 'MISSING');
    results.push('CAT_PAGE_INFO: ' + pageInfo);
  }

  // === CATEGORY → CATALOG NAVIGATION ===
  const firstCatLink = await page.$eval('.category-page-card-link', e => e.getAttribute('href')).catch(() => null);
  if (firstCatLink) {
    results.push('CAT_FIRST_LINK: ' + firstCatLink);
    await page.goto('http://localhost:3000' + firstCatLink, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('.product-card', { timeout: 10000 }).catch(() => {});
    const catalogCards = await page.$$eval('.product-card', els => els.length).catch(() => 0);
    results.push('CATALOG_FROM_CAT: ' + catalogCards + ' products');
    const url = page.url();
    results.push('CATALOG_URL: ' + url);
  }

  // === CATALOG PAGE 1 ===
  await safeGoto(page, 'http://localhost:3000/catalog', '.product-card');
  results.push('CAT_P1_CARDS: ' + await page.$$eval('.product-card', els => els.length));
  results.push('CAT_P1_PRIVACY: ' + (await page.$$eval('.product-card', cards => cards.filter(c => {
    const t = c.textContent;
    return t.includes('Jabali') || t.includes('JABALI') || !!c.querySelector('.product-card-supplier-mark');
  }).length)) + ' leaks');
  results.push('CAT_P1_PRICES: ' + await page.$$eval('.product-card', cards => cards.filter(c => c.querySelector('.product-card-price-block, .product-card-price-on-request')).length));

  // === CATALOG PAGE 2 ===
  await safeGoto(page, 'http://localhost:3000/catalog?page=2', '.product-card');
  results.push('CAT_P2_CARDS: ' + await page.$$eval('.product-card', els => els.length));
  const p2Brands = await page.$$eval('.product-card .product-card-brand', els => [...new Set(els.map(e => e.textContent.trim()))]);
  results.push('CAT_P2_BRANDS: ' + JSON.stringify(p2Brands));

  // === SEARCH ===
  await safeGoto(page, 'http://localhost:3000/catalog?search=bearing', '.product-card');
  results.push('SEARCH_CARDS: ' + await page.$$eval('.product-card', els => els.length).catch(() => 0));

  // === DETAIL: JB with price ===
  await safeGoto(page, 'http://localhost:3000/product/prod-SHN-JB-000001', '.product-detail-page');
  results.push('D_JB_NAME: ' + await page.$eval('.product-detail-name', e => e.textContent.trim()).catch(() => 'MISS'));
  results.push('D_JB_PRICE: ' + await page.$eval('.product-detail-pricing-section', e => e.textContent.trim()).catch(() => 'MISS'));
  results.push('D_JB_CAT: ' + await page.$eval('.product-detail-category', e => e.textContent.trim()).catch(() => 'MISS'));
  results.push('D_JB_BTN: ' + await page.$eval('.product-detail-quote-btn', e => e.textContent.trim()).catch(() => 'MISS'));
  results.push('D_JB_IMG: ' + !!(await page.$('.product-detail-main-image img[src]')));
  results.push('D_JB_SHANAN: ' + !!(await page.$('.product-detail-shanan-trust')));
  const d1Text = await page.textContent('body');
  results.push('D_JB_PRIVACY: ' + (d1Text.includes('Jabali') || d1Text.includes('JABALI') ? 'EXPOSED' : 'CLEAN'));

  // === DETAIL: Bosch ===
  await safeGoto(page, 'http://localhost:3000/product/prod-00008', '.product-detail-page');
  results.push('D_BOSCH: ' + await page.$eval('.product-detail-name', e => e.textContent.trim()).catch(() => 'MISS'));
  results.push('D_BOSCH_BRAND: ' + await page.$eval('.product-detail-meta-item a[href*="brand"]', e => e.textContent.trim()).catch(() => 'NONE'));
  results.push('D_BOSCH_PRICE: ' + await page.$eval('.product-detail-pricing-section', e => e.textContent.trim()).catch(() => 'MISS'));

  // === DETAIL: SKF ===
  await safeGoto(page, 'http://localhost:3000/product/prod-00001', '.product-detail-page');
  results.push('D_SKF: ' + await page.$eval('.product-detail-name', e => e.textContent.trim()).catch(() => 'MISS'));
  results.push('D_SKF_BRAND: ' + await page.$eval('.product-detail-meta-item a[href*="brand"]', e => e.textContent.trim()).catch(() => 'NONE'));

  // === SUPPLY FLOW ===
  await safeGoto(page, 'http://localhost:3000/product/prod-SHN-JB-000001', '.product-detail-page');
  await page.click('.product-detail-quote-btn');
  await page.waitForTimeout(2000);
  results.push('SUPPLY_URL: ' + page.url());
  results.push('SUPPLY_ITEMS: ' + await page.$$eval('.supply-item', els => els.length).catch(() => 0));
  const sText = await page.textContent('body');
  results.push('SUPPLY_PRIVACY: ' + (sText.includes('Jabali') || sText.includes('JABALI') ? 'FOUND' : 'CLEAN'));

  // === RTL ===
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageAr = await ctx2.newPage();
  await safeGoto(pageAr, 'http://localhost:3000/', '.home');
  await pageAr.click('button:has-text("العربية")');
  await pageAr.waitForTimeout(2000);
  const arDir = await pageAr.$eval('html', e => e.getAttribute('dir'));
  const arLang = await pageAr.$eval('html', e => e.getAttribute('lang'));
  results.push('RTL_DIR: ' + arDir);
  results.push('RTL_LANG: ' + arLang);
  // Check categories page in Arabic
  await pageAr.goto('http://localhost:3000/categories', { waitUntil: 'networkidle', timeout: 30000 });
  await pageAr.waitForSelector('.categories-page', { timeout: 10000 }).catch(() => {});
  const arCatTitle = await pageAr.$eval('.categories-page-title', e => e.textContent.trim()).catch(() => 'MISS');
  const arCatCards = await pageAr.$$eval('.category-page-card', els => els.length).catch(() => 0);
  results.push('RTL_CAT_TITLE: ' + arCatTitle);
  results.push('RTL_CAT_CARDS: ' + arCatCards);

  // === MOBILE ===
  const ctx3 = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const pageM = await ctx3.newPage();
  await safeGoto(pageM, 'http://localhost:3000/catalog', '.product-card');
  results.push('MOB_CARDS: ' + await pageM.$$eval('.product-card', els => els.length).catch(() => 0));
  const overflow = await pageM.evaluate(() => document.body.scrollWidth > window.innerWidth).catch(() => false);
  results.push('MOB_OVERFLOW: ' + (overflow ? 'BROKEN' : 'CLEAN'));
  // Check categories mobile
  await safeGoto(pageM, 'http://localhost:3000/categories', '.categories-page');
  const mobCatCards = await pageM.$$eval('.category-page-card', els => els.length).catch(() => 0);
  results.push('MOB_CAT_CARDS: ' + mobCatCards);

  // === API PRIVACY AUDIT ===
  const apiResp = await page.evaluate(async () => {
    const res = await fetch('http://localhost:3001/api/products?page=2&pageSize=10');
    return res.json();
  });
  const leaks = (apiResp.items || []).filter(i =>
    (i.brandName && i.brandName.includes('Jabali')) ||
    i.productCode || i.supplierCode || i.stock != null || i.costPrice != null
  );
  results.push('API_PRIVACY: ' + leaks.length + '/' + (apiResp.items||[]).length);

  // === CONSOLE ERRORS ===
  results.push('ERRORS: ' + errors.length);
  if (errors.length > 0) errors.slice(0, 5).forEach(e => results.push('  ERR: ' + e));

  console.log(results.join('\n'));
  await browser.close();
})();
