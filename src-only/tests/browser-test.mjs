import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const API = 'http://localhost:3001';
const results = [];

async function testRoute(context, route, opts) {
  const page = await context.newPage();
  const consoleErrors = [];
  const networkErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', req => {
    networkErrors.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });

  let result = { route, status: 'PASS', consoleErrors, networkErrors, error: null };

  try {
    if (opts?.login) {
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(3000);
      await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', 'admin@v7test.com');
      await page.fill('input[type="password"], input[name="password"]', 'admin12345');
      await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign")');
      await page.waitForURL('**/admin/**', { timeout: 15000 });
      await page.waitForTimeout(3000);
    }

    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(5000);

    if (opts?.waitForSelector) {
      await page.waitForSelector(opts.waitForSelector, { timeout: 10000 }).catch(() => {});
    }

    const bodyText = await page.textContent('body');
    if (!bodyText || bodyText.trim().length < 5) {
      result.status = 'FAIL';
      result.error = 'Page appears blank or has minimal content';
    }

    const currentUrl = page.url();

    const ssName = route.replace(/[/\\?#]/g, '_').substring(0, 50) || 'root';
    await page.screenshot({ path: `tests/browser-${ssName}.png`, fullPage: false }).catch(() => {});

    console.log(`  ${result.status === 'PASS' ? '✓' : '✗'} ${route} -> ${currentUrl} (content length: ${bodyText?.length || 0})`);
    if (consoleErrors.length > 0) console.log(`    Console errors: ${consoleErrors.join('; ').substring(0, 200)}`);
    if (networkErrors.length > 0) console.log(`    Network errors: ${networkErrors.join('; ').substring(0, 200)}`);

  } catch (e) {
    result.status = 'FAIL';
    result.error = e.message?.substring(0, 200);
    console.log(`  ✗ ${route} - ERROR: ${e.message?.substring(0, 120)}`);
  }

  results.push(result);
  await page.close();
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  console.log('\n=== BROWSER ROUTE TESTS ===\n');
  console.log('Testing PUBLIC routes...');
  await testRoute(context, '/');
  await testRoute(context, '/catalog');
  await testRoute(context, '/product/prod-SHN-JB-001000');
  await testRoute(context, '/product/prod-SHN-JB-001010');
  await testRoute(context, '/login');
  await testRoute(context, '/supply-request');

  console.log('\nTesting ADMIN routes (with login)...');
  await testRoute(context, '/admin/supply-requests', { login: true });
  await testRoute(context, '/admin/products', { login: true });
  await testRoute(context, '/admin/suppliers', { login: true });

  console.log('\nTesting API via browser...');
  const apiPage = await context.newPage();
  try {
    const healthResp = await apiPage.goto(`${API}/api/health`);
    console.log(`  ${healthResp?.status() === 200 ? '✓' : '✗'} GET /api/health -> ${healthResp?.status()}`);
  } catch (e) { console.log(`  ✗ GET /api/health - ${e.message?.substring(0, 80)}`); }

  try {
    const prodResp = await apiPage.goto(`${API}/api/products/SHN-JB-001000`);
    const prodBody = await prodResp?.json();
    console.log(`  ${prodResp?.status() === 200 ? '✓' : '✗'} GET /api/products/SHN-JB-001000 -> ${prodResp?.status()}`);
  } catch (e) { console.log(`  ✗ GET /api/products - ${e.message?.substring(0, 80)}`); }

  try {
    const imgResp = await apiPage.goto(`${API}/api/storage/jb/images/1758.jpg`);
    const ct = imgResp?.headers()?.['content-type'] || 'unknown';
    console.log(`  ${imgResp?.status() === 200 ? '✓' : '✗'} GET /api/storage/jb/images/1758.jpg -> ${imgResp?.status()} (type: ${ct})`);
  } catch (e) { console.log(`  ✗ GET image - ${e.message?.substring(0, 80)}`); }

  await apiPage.close();

  console.log('\n=== BROWSER TEST SUMMARY ===');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`Total: ${results.length} | PASS: ${passed} | FAIL: ${failed}`);
  if (failed > 0) {
    console.log('\nFailed routes:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ${r.route}: ${r.error}`);
    });
  }

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
