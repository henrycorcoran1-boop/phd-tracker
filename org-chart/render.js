const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.goto('file://' + __dirname + '/org-chart.html');
  await page.waitForTimeout(300);
  const el = await page.$('body');
  await el.screenshot({ path: 'org-chart.png' });
  await browser.close();
  console.log('done');
})();
