const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => logs.push(msg.type() + ': ' + msg.text().substring(0, 300)));
  page.on('pageerror', err => logs.push('PAGE_ERROR: ' + err.message.substring(0, 300)));
  
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);
  
  const rootHTML = await page.$eval('#root', el => el.innerHTML.substring(0, 1000));
  console.log('ROOT HTML: ' + rootHTML);
  console.log('LOGS:');
  logs.forEach(l => console.log('  ' + l));
  
  await browser.close();
})();
