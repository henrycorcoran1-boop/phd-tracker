const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ deviceScaleFactor: 2 });
  await p.goto('file://' + __dirname + '/map-diagrams.html');
  await p.waitForTimeout(400);
  const slides = await p.$$('.slide');
  for (let i=0;i<slides.length;i++){
    await slides[i].screenshot({ path: `map-p${i+1}.png` });
    const ov = await slides[i].evaluate(e=>({sh:e.scrollHeight,ch:e.clientHeight}));
    if (ov.sh>ov.ch+2) console.log('  ! page',i+1,'overflow',ov);
  }
  await p.pdf({ path:'M100_Contract_Packaging.pdf', width:'1600px', height:'900px',
    printBackground:true, preferCSSPageSize:true, margin:{top:'0',right:'0',bottom:'0',left:'0'} });
  await b.close(); console.log('rendered', slides.length,'pages');
})();
