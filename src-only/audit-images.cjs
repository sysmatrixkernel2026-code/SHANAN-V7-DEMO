const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Track network requests for images
  const imageRequests = [];
  const imageFailures = [];
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('/api/storage/') || url.includes('/storage/')) {
      imageRequests.push({ url, status: resp.status() });
      if (resp.status() >= 400) imageFailures.push({ url, status: resp.status() });
    }
  });
  page.on('requestfailed', req => {
    if (req.url().includes('/storage/')) {
      imageFailures.push({ url: req.url(), error: req.failure()?.errorText || 'unknown' });
    }
  });

  console.log('=== Loading catalog page 1 ===');
  await page.goto('http://localhost:3000/catalog', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  // Check how many product cards exist
  const cards = await page.$$('.product-card');
  console.log('Product cards found:', cards.length);

  // Check how many have img elements
  const imgs = await page.$$('.product-card-photo');
  console.log('product-card-photo elements:', imgs.length);

  // Check how many have placeholders
  const placeholders = await page.$$('.product-card-image-placeholder');
  console.log('Placeholder elements:', placeholders.length);

  // Check each image's loading state
  if (imgs.length > 0) {
    for (let i = 0; i < Math.min(imgs.length, 12); i++) {
      const info = await imgs[i].evaluate(el => ({
        src: el.src,
        nw: el.naturalWidth,
        nh: el.naturalHeight,
        complete: el.complete,
        display: getComputedStyle(el).display,
        visibility: getComputedStyle(el).visibility,
      }));
      console.log(`  img[${i}]: src=${info.src.substring(0, 80)} nw=${info.nw} nh=${info.nh} complete=${info.complete} display=${info.display}`);
    }
  }

  // Scroll down to trigger lazy loading
  console.log('\n=== Scrolling to trigger lazy load ===');
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(3000);

  const imgsAfterScroll = await page.$$('.product-card-photo');
  console.log('product-card-photo after scroll:', imgsAfterScroll.length);

  // Check all image srcs in the DOM
  const allImgSrcs = await page.$$eval('.product-card-photo', els => els.map(el => el.getAttribute('src')));
  console.log('\nAll product-card-photo srcs:');
  allImgSrcs.forEach((src, i) => console.log(`  [${i}] ${src}`));

  // Summary
  console.log('\n=== NETWORK SUMMARY ===');
  console.log('Image requests:', imageRequests.length);
  console.log('Image failures:', imageFailures.length);
  imageFailures.forEach(f => console.log('  FAIL:', f.url, f.status || f.error));

  // Take a screenshot
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'audit-catalog.png', fullPage: false });
  console.log('\nScreenshot saved to audit-catalog.png');

  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
