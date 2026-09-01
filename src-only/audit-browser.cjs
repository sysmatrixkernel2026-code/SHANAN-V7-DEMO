const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const imageReqs = [];
  const imageFails = [];

  page.on('response', resp => {
    if (resp.url().includes('/api/storage/')) {
      imageReqs.push({ url: resp.url(), status: resp.status() });
    }
  });
  page.on('requestfailed', req => {
    if (req.url().includes('/api/storage/')) {
      imageFails.push(req.url());
    }
  });

  async function checkPage(label, url) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(4000);
    const totalCards = await page.$$eval('[class*="product-card"]', els => els.length);
    const imgs = await page.$$eval('img[src*="/api/storage/"]', els =>
      els.map(e => ({ src: e.src, nw: e.naturalWidth, ok: e.complete }))
    );
    const broken = imgs.filter(i => !i.ok || i.nw === 0);
    console.log(label + ': productCards=' + totalCards + ' storageImgs=' + imgs.length + ' broken=' + broken.length);
    if (imgs.length > 0 && imgs.length <= 3) {
      imgs.forEach(i => console.log('  img: ' + i.src + ' ok=' + i.ok + ' nw=' + i.nw));
    }
    return imgs;
  }

  console.log('=== CATALOG PAGES ===');
  await checkPage('Page 1', 'http://localhost:3000/catalog');
  await checkPage('Page 2', 'http://localhost:3000/catalog?page=2');
  await checkPage('Page 5', 'http://localhost:3000/catalog?page=5');
  await checkPage('Page 39 (last)', 'http://localhost:3000/catalog?page=39');

  console.log('\n=== DETAIL PAGES ===');
  await page.goto('http://localhost:3000/product/prod-SHN-JB-000001', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  try {
    const d = await page.$eval('.product-detail-main-image img', e => ({
      nw: e.naturalWidth, ok: e.complete, w: Math.round(e.width), h: Math.round(e.height)
    }));
    console.log('JB detail: ' + (d.ok && d.nw > 0 ? 'OK' : 'BROKEN') + ' natural=' + d.nw + ' rendered=' + d.w + 'x' + d.h);
  } catch(e) {
    console.log('JB detail: placeholder shown');
  }

  await page.goto('http://localhost:3000/product/prod-00008', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  const hasImg = await page.$('.product-detail-main-image img');
  const hasPH = await page.$('.product-detail-image-placeholder');
  console.log('Bosch detail: img=' + (hasImg ? 'YES' : 'NO') + ' placeholder=' + (hasPH ? 'YES' : 'NO'));

  console.log('\n=== MOBILE (375px) ===');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('http://localhost:3000/catalog', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  const mobImgs = await page.$$eval('.product-card-photo', els =>
    els.map(e => ({ nw: e.naturalWidth, ok: e.complete, rw: Math.round(e.width), rh: Math.round(e.height) }))
  );
  const mobBroken = mobImgs.filter(i => !i.ok || i.nw === 0);
  console.log('Mobile: total=' + mobImgs.length + ' broken=' + mobBroken.length);
  if (mobImgs[0]) console.log('Sample: natural=' + mobImgs[0].nw + ' rendered=' + mobImgs[0].rw + 'x' + mobImgs[0].rh);

  console.log('\n=== ASPECT RATIO (Desktop) ===');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://localhost:3000/catalog', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  const ratios = await page.$$eval('.product-card-photo', els =>
    els.slice(0, 6).map(e => ({
      name: e.src.split('/').pop(),
      nw: e.naturalWidth, nh: e.naturalHeight,
      rw: Math.round(e.width), rh: Math.round(e.height)
    }))
  );
  ratios.forEach(r => {
    const ar = (r.nw / r.nh).toFixed(2);
    const rar = (r.rw / r.rh).toFixed(2);
    const distorted = Math.abs(r.nw / r.nh - r.rw / r.rh) > 0.15;
    console.log('  ' + r.name + ': natural=' + r.nw + 'x' + r.nh + '(AR=' + ar + ') rendered=' + r.rw + 'x' + r.rh + '(AR=' + rar + ') distort=' + distorted);
  });

  console.log('\n=== NETWORK SUMMARY ===');
  console.log('Total storage requests: ' + imageReqs.length);
  const failed4xx = imageReqs.filter(r => r.status >= 400);
  console.log('Failed (4xx/5xx): ' + failed4xx.length);
  if (failed4xx.length > 0) failed4xx.slice(0, 5).forEach(r => console.log('  ' + r.status + ': ' + r.url));
  console.log('Request-level failures: ' + imageFails.length);

  await browser.close();
  console.log('\nDone.');
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
