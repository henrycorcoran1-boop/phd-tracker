const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  // High-resolution PNG (2x device scale)
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.goto('file://' + __dirname + '/org-chart.html');
  await page.waitForTimeout(400);
  await (await page.$('body')).screenshot({ path: 'org-chart.png' });

  // Measure full content size so the PDF is a single, tightly-cropped page
  const dims = await page.evaluate(() => {
    const b = document.body;
    return {
      w: Math.ceil(b.scrollWidth),
      h: Math.ceil(b.getBoundingClientRect().height),
    };
  });

  // High-quality vector PDF (text + SVG logos stay vector)
  await page.pdf({
    path: 'org-chart.pdf',
    width: dims.w + 'px',
    height: dims.h + 'px',
    printBackground: true,
    pageRanges: '1',
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });

  await browser.close();
  console.log('rendered PNG + PDF', dims);
})();
