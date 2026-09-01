const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:3000/catalog?page=2', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.product-card', { timeout: 10000 });
  
  const p2Detail = await page.$$eval('.product-card', cards => cards.slice(0, 3).map(card => ({
    text: card.textContent.substring(0, 200),
    hasPriceBlock: !!card.querySelector('.product-card-price-block'),
    hasPrice: !!card.querySelector('.product-card-price'),
    hasPriceOnReq: !!card.querySelector('.product-card-price-on-request'),
    priceClasses: Array.from(card.querySelectorAll('[class*="price"]')).map(e => e.className),
  })));
  console.log(JSON.stringify(p2Detail, null, 2));
  await browser.close();
})();
