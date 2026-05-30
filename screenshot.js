const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Wait a bit for the frontend to fully load if needed
  await new Promise(r => setTimeout(r, 2000));

  await page.goto('http://localhost:3000');
  await page.screenshot({ path: 'landing_page.png' });
  console.log('Saved landing_page.png');

  await page.goto('http://localhost:3000/dashboard');
  await page.screenshot({ path: 'dashboard.png' });
  console.log('Saved dashboard.png');

  await browser.close();
})();
