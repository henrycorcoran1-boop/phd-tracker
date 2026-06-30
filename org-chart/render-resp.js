const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ deviceScaleFactor: 2 });
  await p.goto('file://' + __dirname + '/responsibilities.html');
  await p.waitForTimeout(400);
  const el = await p.$('.slide');
  await el.screenshot({ path: 'management-responsibilities.png' });
  const ov = await el.evaluate(e => ({sh:e.scrollHeight, ch:e.clientHeight}));
  if (ov.sh > ov.ch + 2) console.log('  ! overflow', ov);
  await p.pdf({ path:'management-responsibilities.pdf', width:'1600px', height:'900px',
    printBackground:true, preferCSSPageSize:true, margin:{top:'0',right:'0',bottom:'0',left:'0'} });
  await b.close(); console.log('done', ov);
})();
