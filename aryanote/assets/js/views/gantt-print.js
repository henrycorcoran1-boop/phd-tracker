/* ==========================================================================
   PDF export for the Gantt chart.

   Rather than screenshotting the view, this builds a dedicated print document
   — legend, project header, repeated column headers, page-broken row blocks —
   and hands it to the browser's print pipeline, where "Save as PDF" produces
   a vector file with selectable text. That is the same route MSP's
   File > Print > Save as PDF takes, and it avoids bundling a PDF library.
   ========================================================================== */

import { h, mount, clear } from '../lib/dom.js';
import store from '../data/store.js';
import * as api from '../data/api.js';
import { taskProgress } from '../data/schema.js';
import { formatPredecessors, workingDaysBetween } from '../data/schedule.js';
import { toDate, addDays, diffDays, today, monthNames, startOfWeek, startOfMonth } from '../lib/date.js';
import { fmt } from './gantt.js';
import { showModal, closeModal } from '../ui/overlay.js';

const ROW_H = 22;

/* Rows per printed page at each paper size, landscape, after the header. */
const PAGE = {
  a4:     { rows: 26, chartWidth: 640, label: 'A4 landscape' },
  a3:     { rows: 40, chartWidth: 980, label: 'A3 landscape' },
  letter: { rows: 25, chartWidth: 660, label: 'Letter landscape' },
};

export function exportGanttPdf(ctx) {
  let paper = 'a4';
  let fitTo = 'all';

  const paperSelect = h('select.select',
    ...Object.entries(PAGE).map(([id, cfg]) =>
      h('option', { value: id, selected: id === paper }, cfg.label)));
  paperSelect.addEventListener('change', () => { paper = paperSelect.value; });

  const rangeSelect = h('select.select',
    h('option', { value: 'all', selected: true }, 'Entire project'),
    h('option', { value: 'quarter' }, 'Next 3 months'),
    h('option', { value: 'year' }, 'Next 12 months'));
  rangeSelect.addEventListener('change', () => { fitTo = rangeSelect.value; });

  showModal({
    title: 'Export Gantt chart to PDF',
    subtitle: 'Builds a print-ready plan, then opens your browser\'s print dialog — choose "Save as PDF" as the destination.',
    body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      h('div.field', h('label.field__label', 'Paper size'), paperSelect),
      h('div.field', h('label.field__label', 'Date range'), rangeSelect),
      h('p.field__hint', 'Tip: turn on "Background graphics" in the print dialog so the bars and shading are included.')),
    actions: [
      { label: 'Cancel', onClick: () => {} },
      {
        label: 'Create PDF',
        variant: 'primary',
        onClick: () => {
          closeModal();
          buildAndPrint(ctx, { paper, fitTo });
          return false;
        },
      },
    ],
  });
}

function buildAndPrint(ctx, { paper, fitTo }) {
  const cfg = PAGE[paper];
  const { project, rows, computed, idToRow } = ctx;

  const range = printRange(ctx, fitTo);
  const pxPerDay = cfg.chartWidth / Math.max(1, range.days);

  const host = document.createElement('div');
  host.className = 'print-root';
  host.dataset.paper = paper;

  const printable = rows.filter((row) => {
    if (row.kind === 'group') return true;
    const c = computed.get(row.task.id);
    return c && c.finish >= range.start && c.start <= range.end;
  });

  const pages = [];
  for (let i = 0; i < printable.length; i += cfg.rows) {
    pages.push(printable.slice(i, i + cfg.rows));
  }
  if (!pages.length) pages.push([]);

  pages.forEach((pageRows, pageIndex) => {
    host.appendChild(buildPage(ctx, {
      pageRows, pageIndex, pageCount: pages.length, range, pxPerDay, cfg,
      firstIndex: pageIndex * cfg.rows,
    }));
  });

  document.body.appendChild(host);
  document.body.classList.add('is-printing');

  const cleanup = () => {
    document.body.classList.remove('is-printing');
    host.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  // Give layout a frame to settle before the dialog blocks the thread.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
      // Safari does not always fire afterprint.
      setTimeout(cleanup, 1500);
    });
  });
}

function printRange(ctx, fitTo) {
  const { computed } = ctx;
  let min = null;
  let max = null;
  for (const c of computed.values()) {
    if (!min || c.start < min) min = c.start;
    if (!max || c.finish > max) max = c.finish;
  }
  if (!min) { min = today(); max = addDays(today(), 30); }

  if (fitTo === 'quarter') {
    min = today();
    max = addDays(today(), 92);
  } else if (fitTo === 'year') {
    min = today();
    max = addDays(today(), 365);
  }

  const start = startOfWeek(addDays(min, -2));
  const end = addDays(max, 2);
  return { start, end, days: Math.max(7, diffDays(start, end) + 1) };
}

function buildPage(ctx, opts) {
  const { project, computed, idToRow } = ctx;
  const { pageRows, pageIndex, pageCount, range, pxPerDay, cfg, firstIndex } = opts;

  const stats = api.projectStats(project.id);

  const header = h('div.print-head',
    h('div',
      h('div.print-title', project.name),
      h('div.print-sub',
        `${stats.total} tasks · ${stats.percent}% complete · `,
        `plan from ${fmt(range.start)} to ${fmt(range.end)}`)),
    h('div.print-meta',
      h('div', `Printed ${fmt(today())}`),
      h('div', `Page ${pageIndex + 1} of ${pageCount}`)));

  const legend = h('div.print-legend',
    legendItem('print-legend__bar', 'Task'),
    legendItem('print-legend__bar print-legend__bar--critical', 'Critical'),
    legendItem('print-legend__bar print-legend__bar--summary', 'Summary'),
    legendItem('print-legend__diamond', 'Milestone'),
    legendItem('print-legend__progress', 'Progress'));

  /* table head */
  const thead = h('div.print-row.print-row--head',
    h('div.print-cell.print-cell--id', 'ID'),
    h('div.print-cell.print-cell--name', 'Task Name'),
    h('div.print-cell.print-cell--dur', 'Dur.'),
    h('div.print-cell.print-cell--date', 'Start'),
    h('div.print-cell.print-cell--date', 'Finish'),
    h('div.print-cell.print-cell--pred', 'Pred.'),
    h('div.print-cell.print-cell--chart', buildPrintScale(range, pxPerDay, cfg)));

  const body = h('div.print-body');

  pageRows.forEach((row, i) => {
    const absoluteIndex = firstIndex + i;
    const chartCell = h('div.print-cell.print-cell--chart',
      { style: { position: 'relative' } });

    /* weekend shading + month rules */
    let month = startOfMonth(range.start);
    while (month <= range.end) {
      const x = diffDays(range.start, month) * pxPerDay;
      if (x >= 0) chartCell.appendChild(h('div.print-vline', { style: { left: `${x}px` } }));
      month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    }

    if (row.kind === 'group') {
      if (row.span) {
        const left = diffDays(range.start, row.span.start) * pxPerDay;
        const width = (diffDays(row.span.start, row.span.finish) + 1) * pxPerDay;
        chartCell.appendChild(h('div.print-summary', {
          style: { left: `${Math.max(0, left)}px`, width: `${Math.max(2, width)}px` },
        }));
      }
      body.appendChild(h('div.print-row.print-row--summary',
        h('div.print-cell.print-cell--id', String(row.rowNumber || '')),
        h('div.print-cell.print-cell--name', row.group.name),
        h('div.print-cell.print-cell--dur',
          row.span ? `${workingDaysBetween(row.span.start, row.span.finish)}d` : ''),
        h('div.print-cell.print-cell--date', row.span ? shortDate(row.span.start) : ''),
        h('div.print-cell.print-cell--date', row.span ? shortDate(row.span.finish) : ''),
        h('div.print-cell.print-cell--pred', ''),
        chartCell));
      return;
    }

    const task = row.task;
    const c = computed.get(task.id);
    if (!c) return;

    const left = diffDays(range.start, c.start) * pxPerDay;
    const width = (diffDays(c.start, c.finish) + 1) * pxPerDay;
    const percent = taskProgress(task);

    if (c.milestone) {
      chartCell.appendChild(h('div.print-diamond', { style: { left: `${left - 3}px` } }));
    } else if (c.isSummary) {
      chartCell.appendChild(h('div.print-summary', {
        style: { left: `${Math.max(0, left)}px`, width: `${Math.max(2, width)}px` },
      }));
    } else {
      const bar = h('div.print-bar', {
        class: c.critical ? 'print-bar--critical' : '',
        style: { left: `${Math.max(0, left)}px`, width: `${Math.max(2, width)}px` },
      });
      if (percent) {
        bar.appendChild(h('div.print-bar__progress', { style: { width: `${percent}%` } }));
      }
      chartCell.appendChild(bar);
    }

    const resources = task.assigneeIds
      .map((id) => store.get('users', id)?.name?.split(' ')[0]).filter(Boolean).join(', ');
    if (resources && !c.isSummary) {
      chartCell.appendChild(h('div.print-barlabel', {
        style: { left: `${Math.max(0, left) + Math.max(2, width) + 3}px` },
      }, resources));
    }

    body.appendChild(h('div.print-row',
      h('div.print-cell.print-cell--id', String(row.rowNumber || idToRow.get(task.id) || '')),
      h('div.print-cell.print-cell--name',
        h('span', { style: { paddingLeft: `${(c.level || 0) * 10}px` } }, task.title || '—')),
      h('div.print-cell.print-cell--dur', `${c.duration}d`),
      h('div.print-cell.print-cell--date', shortDate(c.start)),
      h('div.print-cell.print-cell--date', shortDate(c.finish)),
      h('div.print-cell.print-cell--pred', formatPredecessors(task.predecessors, idToRow)),
      chartCell));
  });

  return h('div.print-page', header, legend, h('div.print-table', thead, body));
}

function buildPrintScale(range, pxPerDay, cfg) {
  const wrap = h('div.print-scale', { style: { width: `${cfg.chartWidth}px` } });
  const major = h('div.print-scale__tier');
  const minor = h('div.print-scale__tier');

  let month = startOfMonth(range.start);
  while (month <= range.end) {
    const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const left = Math.max(0, diffDays(range.start, month) * pxPerDay);
    const right = Math.min(cfg.chartWidth, diffDays(range.start, next) * pxPerDay);
    if (right - left > 16) {
      major.appendChild(h('div.print-scale__cell', {
        style: { left: `${left}px`, width: `${right - left}px` },
      }, `${monthNames[month.getMonth()].slice(0, 3)} ${String(month.getFullYear()).slice(2)}`));
    }
    month = next;
  }

  const weekPx = 7 * pxPerDay;
  if (weekPx > 12) {
    let week = startOfWeek(range.start);
    while (week <= range.end) {
      const left = diffDays(range.start, week) * pxPerDay;
      if (left >= 0) {
        minor.appendChild(h('div.print-scale__cell', {
          style: { left: `${left}px`, width: `${weekPx}px` },
        }, String(week.getDate())));
      }
      week = addDays(week, 7);
    }
  }

  wrap.appendChild(major);
  wrap.appendChild(minor);
  return wrap;
}

function legendItem(className, label) {
  return h('span.print-legend__item', h('span', { class: className }), label);
}

function shortDate(date) {
  const d = toDate(date);
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
}
