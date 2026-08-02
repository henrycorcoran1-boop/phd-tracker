/* ==========================================================================
   Small Markdown renderer.

   Input is escaped before any markup is produced, so user content can never
   inject HTML. Supports headings, lists, task lists, tables, code, quotes,
   rules, links, bold, italic and inline code — enough for notes and specs.
   ========================================================================== */

import { esc } from './dom.js';

export function renderMarkdown(source = '') {
  if (!source.trim()) return '';

  const lines = String(source).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    // Fenced code
    if (/^\s*```/.test(line)) {
      const language = line.replace(/^\s*```/, '').trim();
      const buffer = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        buffer.push(lines[index]);
        index += 1;
      }
      index += 1;
      out.push(`<pre><code${language ? ` data-lang="${esc(language)}"` : ''}>${esc(buffer.join('\n'))}</code></pre>`);
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\s*\1\s*\1[\s\S]*$/.test(line) && /^[\s\-*_]+$/.test(line)) {
      out.push('<hr>');
      index += 1;
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const buffer = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        buffer.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      out.push(`<blockquote>${renderMarkdown(buffer.join('\n'))}</blockquote>`);
      continue;
    }

    // Table
    if (/\|/.test(line) && index + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[index + 1])) {
      const header = splitRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && /\|/.test(lines[index]) && lines[index].trim()) {
        rows.push(splitRow(lines[index]));
        index += 1;
      }
      out.push(`<table><thead><tr>${header.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead>`
        + `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }

    // Lists
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (index < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[index])) {
        let text = lines[index].replace(/^\s*([-*+]|\d+\.)\s+/, '');
        let prefix = '';
        const task = /^\[([ xX])\]\s+/.exec(text);
        if (task) {
          const checked = task[1].toLowerCase() === 'x';
          prefix = `<input type="checkbox" disabled${checked ? ' checked' : ''}>`;
          text = text.slice(task[0].length);
        }
        items.push(`<li>${prefix}${inline(text)}</li>`);
        index += 1;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    // Blank
    if (!line.trim()) { index += 1; continue; }

    // Paragraph
    const buffer = [];
    while (index < lines.length && lines[index].trim()
      && !/^\s*(#{1,6}\s|>|```|[-*+]\s|\d+\.\s)/.test(lines[index])) {
      buffer.push(lines[index]);
      index += 1;
    }
    out.push(`<p>${inline(buffer.join(' '))}</p>`);
  }

  return out.join('\n');
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function inline(text) {
  let html = esc(text);

  // Inline code first so its contents are not further transformed.
  const codes = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });

  html = html
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) =>
      (isSafeUrl(src) ? `<img src="${src}" alt="${alt}" style="max-width:100%;border-radius:8px">` : alt))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) =>
      (isSafeUrl(href) ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>` : label))
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>')
    .replace(/(^|[^*])\*(?=\S)([^*]*?\S)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_(?=\S)([^_]*?\S)_/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');

  html = html.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return html;
}

/** Block javascript: and data: URLs — only http(s), mailto and anchors pass. */
function isSafeUrl(url) {
  return /^(https?:\/\/|mailto:|#|\/)/i.test(url.trim());
}

/** First non-heading line, for list previews. */
export function excerpt(source = '', length = 90) {
  const text = String(source)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+.*$/gm, ' ')
    .replace(/[#*_>`|[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}
