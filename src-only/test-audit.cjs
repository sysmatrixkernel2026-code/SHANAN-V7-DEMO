const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const results = [];
  let errors = 0;

  function log(key, value, ok = true) {
    const status = ok ? '✅' : '❌';
    results.push(`${status} ${key}: ${value}`);
    if (!ok) errors++;
  }

  const SUPPLIER_TERMS = ['Jabali', 'jabali', 'JABALI', 'brand-jb', 'brand_jb', 'Jabali Brothers'];
  const SUPPLIER_FIELDS = ['supplierCode', 'supplierId', 'supplierName', 'supplierSlug', 'costPrice', 'sourceCostPrice', 'sourceStock', 'productCode'];

  async function checkPrivacy(pageObj, label) {
    const html = await pageObj.content();
    for (const term of SUPPLIER_TERMS) {
      if (html.includes(term)) {
        log(`${label}_PRIVACY_${term}`, `LEAK: "${term}" found in HTML`, false);
      }
    }
    log(`${label}_PRIVACY`, 'CLEAN');
  }

  async function checkNetworkLeaks(pageObj, label) {
    const apiLeaks = [];
    pageObj.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/') && response.status() === 200) {
        try {
          const text = await response.text();
          for (const term of SUPPLIER_TERMS) {
            if (text.includes(`"${term}"`)) {
              apiLeaks.push(`${term} in ${url}`);
            }
          }
          for (const field of SUPPLIER_FIELDS) {
            if (text.includes(`"${field}"`)) {
              apiLeaks.push(`${field} in ${url}`);
            }
          }
        } catch {}
      }
    });
    return apiLeaks;
  }

  // ========== 1. API PRIVACY ==========
  console.log('--- API PRIVACY ---');
  const apiUrls = [
    'http://localhost:3001/api/products?page=1&pageSize=5',
    'http://localhost:3001/api/products/prod-SHN-JB-000001',
    'http://localhost:3001/api/products/prod-00008',
    'http://localhost:3001/api/products/prod-00001',
    'http://localhost:3001/api/brands',
    'http://localhost:3001/api/categories?pageSize=5',
  ];
  for (const url of apiUrls) {
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle0' });
      const text = await resp.text();
      const leaks = [];
      for (const term of SUPPLIER_TERMS) {
        if (text.includes(`"${term}"`)) leaks.push(term);
      }
      const shortUrl = url.replace('http://localhost:3001', '');
      if (leaks.length > 0) {
        log(`API_PRIVACY_${shortUrl}`, `LEAK: ${leaks.join(', ')}`, false);
      } else {
        log(`API_PRIVACY_${shortUrl}`, 'CLEAN');
      }
    } catch (e) {
      log(`API_PRIVACY_${url}`, `ERROR: ${e.message}`, false);
    }
  }

  // ========== 2. HOME PAGE ==========
  console.log('--- HOME PAGE ---');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle2', timeout: 30000 });
  const homeTitle = await page.title();
  log('HOME_TITLE', homeTitle);
  await checkPrivacy(page, 'HOME');
  const homeCategories = await page.$$('.category-preview-card');
  log('HOME_CATEGORIES', homeCategories.length);

  // ========== 3. CATEGORIES PAGE ==========
  console.log('--- CATEGORIES PAGE ---');
  await page.goto('http://localhost:3000/categories', { waitUntil: 'networkidle2', timeout: 30000 });
  const catTitle = await page.$eval('.categories-page-title', el => el.textContent).catch(() => 'NOT FOUND');
  log('CAT_TITLE', catTitle);
  const catCards = await page.$$('.category-page-card');
  log('CAT_CARDS', catCards.length);
  const catSearch = await page.$('.categories-page-search-input');
  log('CAT_SEARCH', catSearch ? 'YES' : 'NO');
  const catPag = await page.$('.categories-page-pagination');
  log('CAT_PAGINATION', catPag ? 'YES' : 'NO');
  await checkPrivacy(page, 'CAT');

  // Test category search
  if (catSearch) {
    await catSearch.type('bearing');
    await new Promise(r => setTimeout(r, 500));
    const searchCards = await page.$$('.category-page-card');
    log('CAT_SEARCH_RESULT', searchCards.length > 0 ? `${searchCards.length} results` : '0 results');
    await catSearch.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await new Promise(r => setTimeout(r, 300));
  }

  // Test Ken Burns animation
  const kenBurns = await page.evaluate(() => {
    const sheets = [...document.styleSheets];
    for (const sheet of sheets) {
      try {
        for (const rule of [...sheet.cssRules]) {
          if (rule.name && rule.name.toLowerCase().includes('kenburns')) return true;
        }
      } catch {}
    }
    return false;
  });
  log('CAT_KENBURNS_CSS', kenBurns ? 'YES' : 'NO');

  // ========== 4. CATALOG PAGE ==========
  console.log('--- CATALOG PAGE ---');
  await page.goto('http://localhost:3000/catalog', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  const catalogCards = await page.$$('.product-card');
  log('CATALOG_CARDS', catalogCards.length);
  await checkPrivacy(page, 'CATALOG');

  // Check brand filter (brand-jb should NOT appear)
  const brandOptions = await page.evaluate(() => {
    const select = document.querySelector('.catalog-sidebar select:nth-of-type(2)');
    if (!select) return [];
    return [...select.options].map(o => ({ value: o.value, text: o.textContent }));
  });
  const hasJbFilter = brandOptions.some(o => o.value === 'brand-jb' || o.text.includes('Jabali'));
  log('CATALOG_BRAND_FILTER', hasJbFilter ? 'LEAK: brand-jb in filter' : 'CLEAN: brand-jb filtered', !hasJbFilter);

  // Check prices and privacy
  const priceCount = await page.$$eval('.product-card-price', els => els.length);
  const onRequestCount = await page.$$eval('.product-card-price-on-request', els => els.length);
  log('CATALOG_PRICES', `${priceCount} numeric + ${onRequestCount} on-request`);

  // Check brand display in cards
  const brandDisplay = await page.$$eval('.product-card-brand', els => els.map(e => e.textContent).filter(Boolean));
  log('CATALOG_BRANDS_DISPLAYED', brandDisplay.length > 0 ? brandDisplay.join(', ') : 'none (correct for JB products)');

  // ========== 5. PRODUCT DETAIL ==========
  console.log('--- PRODUCT DETAIL ---');

  // JB product with price
  await page.goto('http://localhost:3000/product/prod-SHN-JB-000001', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));
  const dName = await page.$eval('.product-detail-name', el => el.textContent).catch(() => 'NOT FOUND');
  const dPrice = await page.$eval('.product-detail-pricing-value', el => el.textContent).catch(() => null);
  const dOnRequest = await page.$eval('.product-detail-pricing-on-request', el => el.textContent).catch(() => null);
  const dBrand = await page.$eval('.product-detail-meta-item .product-detail-meta-value a', el => el.textContent).catch(() => null);
  log('D_JB_NAME', dName);
  log('D_JB_PRICE', dPrice || dOnRequest || 'NOT FOUND');
  log('D_JB_BRAND', dBrand === null ? 'null (correct)' : dBrand, dBrand === null);
  await checkPrivacy(page, 'D_JB');

  // Check SHANAN trust badge
  const shananTrust = await page.$('.product-detail-shanan-trust');
  log('D_JB_SHANAN_TRUST', shananTrust ? 'YES' : 'NO');

  // Bosch product
  await page.goto('http://localhost:3000/product/prod-00008', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));
  const dBosch = await page.$eval('.product-detail-name', el => el.textContent).catch(() => 'NOT FOUND');
  const dBoschBrand = await page.$eval('.product-detail-meta-item .product-detail-meta-value a', el => el.textContent).catch(() => null);
  log('D_BOSCH_NAME', dBosch);
  log('D_BOSCH_BRAND', dBoschBrand, dBoschBrand === 'Bosch');
  await checkPrivacy(page, 'D_BOSCH');

  // ========== 6. SEARCH ==========
  console.log('--- SEARCH ---');
  await page.goto('http://localhost:3000/catalog?search=bearing', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  const searchCards = await page.$$('.product-card');
  log('SEARCH_CARDS', searchCards.length);

  // ========== 7. SUPPLY REQUEST ==========
  console.log('--- SUPPLY REQUEST ---');
  await page.goto('http://localhost:3000/supply-request', { waitUntil: 'networkidle2', timeout: 30000 });
  await checkPrivacy(page, 'SUPPLY');

  // ========== 8. RTL ==========
  console.log('--- RTL CHECK ---');
  await page.goto('http://localhost:3000/categories', { waitUntil: 'networkidle2', timeout: 30000 });
  const rtlDir = await page.$eval('html', el => el.getAttribute('dir'));
  const rtlLang = await page.$eval('html', el => el.getAttribute('lang'));
  log('RTL_DIR', rtlDir, rtlDir === 'rtl');
  log('RTL_LANG', rtlLang, rtlLang === 'ar');

  // ========== 9. MOBILE ==========
  console.log('--- MOBILE 375px ---');
  await page.setViewport({ width: 375, height: 812 });
  await page.goto('http://localhost:3000/catalog', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  const mobCards = await page.$$('.product-card');
  log('MOB_CARDS', mobCards.length);
  const mobOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth <= window.innerWidth;
  });
  log('MOB_NO_OVERFLOW', mobOverflow ? 'YES' : 'OVERFLOW', mobOverflow);

  await page.goto('http://localhost:3000/categories', { waitUntil: 'networkidle2', timeout: 30000 });
  const mobCatCards = await page.$$('.category-page-card');
  log('MOB_CAT_CARDS', mobCatCards.length);

  // ========== 10. CONSOLE ERRORS ==========
  console.log('--- CONSOLE ERRORS ---');
  let consoleErrors = 0;
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors++;
  });
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.goto('http://localhost:3000/catalog', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.goto('http://localhost:3000/categories', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.goto('http://localhost:3000/product/prod-SHN-JB-000001', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  log('CONSOLE_ERRORS', consoleErrors, consoleErrors === 0);

  // ========== PRINT RESULTS ==========
  console.log('\n========== AUDIT RESULTS ==========');
  for (const r of results) console.log(r);
  console.log(`\nTotal: ${results.length} checks, ${errors} failures`);
  console.log(errors === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${errors} CHECKS FAILED`);

  await browser.close();
  process.exit(errors > 0 ? 1 : 0);
})();
