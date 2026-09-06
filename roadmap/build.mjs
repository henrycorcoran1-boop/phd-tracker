#!/usr/bin/env node
/**
 * Build script for the doctoral programme roadmap.
 *
 * Assembles the HTML partials in src/, embeds the fonts as data URIs so the
 * document renders identically anywhere, then prints to PDF through headless
 * Chromium. British English throughout; no network access is required at
 * build time.
 *
 * Usage:  node build.mjs            -> writes build/Corcoran_PhD_Roadmap.pdf
 *         node build.mjs --html     -> also writes build/roadmap.html for inspection
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'src');
const FONTS = path.join(HERE, 'fonts');
const OUT = path.join(HERE, 'build');

const PARTIALS = [
  '00-cover.html',
  '01-frontmatter.html',
  '02-programme.html',
  '03-theory.html',
  '04-infrastructure.html',
  '05-workstream-a.html',
  '06-workstream-b.html',
  '07-workstream-c.html',
  '08-workstream-d.html',
  '09-workstream-e.html',
  '10-control.html',
  '11-appendices.html',
  '12-references.html',
];

/** Read a font file and return a CSS @font-face rule with the file inlined. */
function face(family, file, weight, style = 'normal') {
  const data = fs.readFileSync(path.join(FONTS, file)).toString('base64');
  return `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};font-display:block;` +
    `src:url(data:font/woff2;base64,${data}) format('woff2');}`;
}

const FONT_CSS = [
  face('Literata', 'literata-latin-400-normal.woff2', 400),
  face('Literata', 'literata-latin-400-italic.woff2', 400, 'italic'),
  face('Literata', 'literata-latin-600-normal.woff2', 600),
  face('Literata', 'literata-latin-700-normal.woff2', 700),
  face('Literata', 'literata-latin-700-italic.woff2', 700, 'italic'),
  face('Inter', 'inter-latin-400-normal.woff2', 400),
  face('Inter', 'inter-latin-500-normal.woff2', 500),
  face('Inter', 'inter-latin-600-normal.woff2', 600),
  face('Inter', 'inter-latin-700-normal.woff2', 700),
].join('\n');

const css = fs.readFileSync(path.join(SRC, 'style.css'), 'utf8');
const body = PARTIALS.map((p) => {
  const f = path.join(SRC, p);
  if (!fs.existsSync(f)) {
    console.warn(`  ! missing partial ${p}, skipping`);
    return '';
  }
  return fs.readFileSync(f, 'utf8');
}).join('\n');

// Contents-page numbers resolved by tocmap.py from the previous render. The
// build sequence is therefore: build, tocmap, build.
const tocFile = path.join(OUT, 'toc-pages.json');
let resolved = body;
if (fs.existsSync(tocFile)) {
  const map = JSON.parse(fs.readFileSync(tocFile, 'utf8'));
  let hits = 0;
  for (const [target, page] of Object.entries(map)) {
    const needle = `data-t="${target}">00<`;
    if (resolved.includes(needle)) {
      resolved = resolved.replace(needle, `data-t="${target}">${page}<`);
      hits += 1;
    }
  }
  console.log(`  contents: ${hits} page numbers substituted`);
} else {
  console.log('  contents: no toc-pages.json yet, page numbers left as placeholders');
}

const html = `<!doctype html><html lang="en-IE"><head><meta charset="utf-8">
<title>Doctoral Programme Roadmap - H. Corcoran</title>
<style>${FONT_CSS}</style>
<style>${css}</style>
</head><body>${resolved}</body></html>`;

fs.mkdirSync(OUT, { recursive: true });
if (process.argv.includes('--html')) {
  fs.writeFileSync(path.join(OUT, 'roadmap.html'), html);
}

// Running foot: candidate and short title on the left, page number on the right.
// The cover page suppresses its own furniture by starting the count at zero.
const footer = `
<div style="width:100%;font-family:'Liberation Serif','Times New Roman',serif;font-size:7.5pt;color:#8A8A8A;
     padding:0 18mm;display:flex;justify-content:space-between;align-items:baseline;">
  <span>H. M. Corcoran &nbsp;|&nbsp; Doctoral Programme Roadmap &nbsp;|&nbsp; Revision B</span>
  <span class="pageNumber"></span>
</div>`;

const header = `<div style="width:100%;height:0;"></div>`;
const blank = `<div style="width:100%;height:0;"></div>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.emulateMedia({ media: 'print' });
await page.evaluate(() => document.fonts.ready);

const common = {
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: header,
  margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' },
  tagged: true,
  outline: false,
};

// Two identical renders. The running foot is suppressed in one of them so the
// cover can be taken unnumbered; pagination is byte-identical between the two
// because the page margins do not change.
const bodyPdf = path.join(OUT, '_body.pdf');
const coverPdf = path.join(OUT, '_cover.pdf');
await page.pdf({ ...common, path: bodyPdf, footerTemplate: footer });
await page.pdf({ ...common, path: coverPdf, footerTemplate: blank });
await browser.close();

// Splice: page 1 from the unnumbered render, the remainder from the numbered one.
const { execFileSync } = await import('node:child_process');
const pdfPath = path.join(OUT, 'Corcoran_PhD_Roadmap_RevB.pdf');
execFileSync('python3', [path.join(HERE, 'splice.py'), coverPdf, bodyPdf, pdfPath], { stdio: 'inherit' });
fs.unlinkSync(bodyPdf);
fs.unlinkSync(coverPdf);

const kb = (fs.statSync(pdfPath).size / 1024).toFixed(0);
console.log(`wrote ${pdfPath} (${kb} KB)`);
