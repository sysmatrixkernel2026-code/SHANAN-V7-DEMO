const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const imageReqs = [];
  page.on('response', resp => {
    if (resp.url().includes('/api/storage/')) {
      imageReqs.push({ url: resp.url(), status: resp.status() });
    }
  });

  async function scrollAll() {
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(1500);
  }

  async function getPhotos() {
    return page.$$eval('.product-card-photo', els =>
      els.map(e => ({ src: e.src, nw: e.naturalWidth, ok: e.complete }))
    );
  }

  // PAGE 1
  console.log('CATALOG PAGE 1');
  await page.goto('http://localhost:3000/catalog', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  // Check how many product cards exist in DOM (any class containing product-card)
  let domCards = await page.$$eval('.product-grid .product-card', els => els.length);
  let domPhotos = await page.$$eval('.product-card-photo', els => els.length);
  let domPlaceholders = await page.$$eval('.product-card-image-placeholder', els => els.length);
  let totalGridChildren = await page.$$eval('.product-grid > *', els => els.length);
  console.log('DOM: grid_children=' + totalGridChildren + ' product-cards=' + domCards + ' photos=' + domPhotos + ' placeholders=' + domPlaceholders);
  // Also check total text in page header
  let headerText = await page.$eval('.page-subtitle', el => el.textContent).catch(() => 'N/A');
  console.log('Header: ' + headerText);
  // Force all lazy images to load eagerly
  await page.evaluate(() => {
    document.querySelectorAll('img[loading="lazy"]').forEach(img => {
      img.loading = 'eager';
      const src = img.src;
      img.src = '';
      img.src = src;
    });
  });
  await page.waitForTimeout(3000);
  await scrollAll();
  let imgs = await getPhotos();
  let broken = imgs.filter(i => !i.ok || i.nw === 0);
  console.log('photos=' + imgs.length + ' valid=' + (imgs.length - broken.length) + ' broken=' + broken.length);
  if (broken.length > 0) broken.slice(0, 3).forEach(b => console.log('  ' + b.src));

  // PAGE 2
  console.log('CATALOG PAGE 2');
  await page.goto('http://localhost:3000/catalog?page=2', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await scrollAll();
  imgs = await getPhotos();
  broken = imgs.filter(i => !i.ok || i.nw === 0);
  console.log('photos=' + imgs.length + ' valid=' + (imgs.length - broken.length) + ' broken=' + broken.length);

  // PAGE 39
  console.log('CATALOG PAGE 39');
  await page.goto('http://localhost:3000/catalog?page=39', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  imgs = await getPhotos();
  broken = imgs.filter(i => !i.ok || i.nw === 0);
  console.log('photos=' + imgs.length + ' valid=' + (imgs.length - broken.length) + ' broken=' + broken.length);

  // DETAIL JB
  console.log('DETAIL JB');
  await page.goto('http://localhost:3000/product/prod-SHN-JB-000001', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  try {
    let d = await page.$eval('.product-detail-main-image img', e => ({
      src: e.src, nw: e.naturalWidth, nh: e.naturalHeight, ok: e.complete,
      rw: Math.round(e.width), rh: Math.round(e.height),
      fit: getComputedStyle(e).objectFit
    }));
    console.log((d.ok && d.nw > 0 ? 'OK' : 'BROKEN') + ' natural=' + d.nw + 'x' + d.nh + ' rendered=' + d.rw + 'x' + d.rh + ' fit=' + d.fit);
  } catch(e) { console.log('placeholder'); }

  // DETAIL Bosch (no image)
  console.log('DETAIL BOSCH');
  await page.goto('http://localhost:3000/product/prod-00008', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  let boschImg = await page.$('.product-detail-main-image img');
  let boschPH = await page.$('.product-detail-image-placeholder');
  console.log('img=' + (boschImg ? 'YES' : 'NO') + ' placeholder=' + (boschPH ? 'YES' : 'NO'));

  // MOBILE
  console.log('MOBILE CATALOG');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('http://localhost:3000/catalog', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await scrollAll();
  imgs = await getPhotos();
  broken = imgs.filter(i => !i.ok || i.nw === 0);
  console.log('photos=' + imgs.length + ' valid=' + (imgs.length - broken.length) + ' broken=' + broken.length);
  if (imgs.length > 0) {
    let m = await page.$$eval('.product-card-photo', els => els.slice(0, 2).map(e => ({
      nw: e.naturalWidth, rw: Math.round(e.width), rh: Math.round(e.height)
    })));
    m.forEach((r, i) => console.log('  img' + i + ': natural=' + r.nw + ' rendered=' + r.rw + 'x' + r.rh));
  }

  // NETWORK
  console.log('NETWORK');
  console.log('total_requests=' + imageReqs.length);
  let failed = imageReqs.filter(r => r.status >= 400);
  console.log('failed=' + failed.length);
  if (failed.length > 0) failed.slice(0, 3).forEach(r => console.log('  ' + r.status + ' ' + r.url));

  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
