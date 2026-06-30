const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.goto('file://' + __dirname + '/deck.html');
  await page.waitForTimeout(500);

  // Per-slide PNGs for verification
  const slides = await page.$$('.slide');
  for (let i = 0; i < slides.length; i++) {
    await slides[i].screenshot({ path: `slide-${i + 1}.png` });
    // overflow check
    const ov = await slides[i].evaluate((el) => ({
      sh: el.scrollHeight, ch: el.clientHeight,
    }));
    if (ov.sh > ov.ch + 2) console.log(`  ! slide ${i + 1} overflow: ${ov.sh} > ${ov.ch}`);
  }

  // Multi-page vector PDF (one slide per page)
  await page.pdf({
    path: 'org-chart-deck.pdf',
    width: '1600px',
    height: '900px',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });

  await browser.close();
  console.log('rendered', slides.length, 'slides + org-chart-deck.pdf');
})();
