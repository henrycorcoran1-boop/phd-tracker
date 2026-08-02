/* ==========================================================================
   Date helpers. Dates are stored as 'YYYY-MM-DD' strings (no timezone drift);
   timestamps are epoch milliseconds.
   ========================================================================== */

export const DAY_MS = 86400000;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = DAYS.map((d) => d.slice(0, 3));

/** Local midnight Date for a 'YYYY-MM-DD' key (or Date/timestamp). */
export function toDate(value) {
  if (value instanceof Date) return startOfDay(value);
  if (typeof value === 'number') return startOfDay(new Date(value));
  if (typeof value === 'string' && value) {
    const [y, m, d] = value.split('-').map(Number);
    if (y && m && d) return new Date(y, m - 1, d);
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return startOfDay(parsed);
  }
  return null;
}

/** 'YYYY-MM-DD' for a Date. */
export function key(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : toDate(date);
  if (!d) return null;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function today() { return startOfDay(new Date()); }
export function todayKey() { return key(today()); }

export function addDays(date, count) {
  const d = new Date(toDate(date) || new Date());
  d.setDate(d.getDate() + count);
  return d;
}

export function addMonths(date, count) {
  const d = new Date(toDate(date) || new Date());
  const targetDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + count);
  d.setDate(Math.min(targetDay, daysInMonth(d)));
  return d;
}

export function daysInMonth(date) {
  const d = toDate(date) || new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function startOfWeek(date, weekStartsOn = 1) {
  const d = toDate(date) || today();
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  return addDays(d, -diff);
}

export function startOfMonth(date) {
  const d = toDate(date) || today();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(date) {
  const d = toDate(date) || today();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** Whole days from a to b (b - a). */
export function diffDays(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / DAY_MS);
}

export function isWeekend(date) {
  const day = (toDate(date) || today()).getDay();
  return day === 0 || day === 6;
}

export function isSameDay(a, b) {
  return key(a) === key(b);
}

export function clampDate(date, min, max) {
  const d = toDate(date);
  if (min && d < toDate(min)) return toDate(min);
  if (max && d > toDate(max)) return toDate(max);
  return d;
}

/** 'Mar 14' / 'Mar 14, 2027' when the year differs from now. */
export function formatDate(value, { withYear = 'auto', month = 'short' } = {}) {
  const d = toDate(value);
  if (!d) return '';
  const name = month === 'long' ? MONTHS[d.getMonth()] : MONTHS_SHORT[d.getMonth()];
  const showYear = withYear === true
    || (withYear === 'auto' && d.getFullYear() !== new Date().getFullYear());
  return `${name} ${d.getDate()}${showYear ? `, ${d.getFullYear()}` : ''}`;
}

export function formatDayName(value, short = true) {
  const d = toDate(value);
  if (!d) return '';
  return (short ? DAYS_SHORT : DAYS)[d.getDay()];
}

export function formatMonth(value, short = false) {
  const d = toDate(value);
  if (!d) return '';
  return (short ? MONTHS_SHORT : MONTHS)[d.getMonth()];
}

export function formatRange(start, end) {
  if (!start && !end) return '';
  if (!start) return `Due ${formatDate(end)}`;
  if (!end) return `Starts ${formatDate(start)}`;
  const a = toDate(start);
  const b = toDate(end);
  if (isSameDay(a, b)) return formatDate(a);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${MONTHS_SHORT[a.getMonth()]} ${a.getDate()}–${b.getDate()}`;
  }
  return `${formatDate(a)} – ${formatDate(b)}`;
}

/** 'Today', 'Tomorrow', 'Mar 14', '3 days overdue' style due-date wording. */
export function formatDue(value) {
  const d = toDate(value);
  if (!d) return '';
  const delta = diffDays(today(), d);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  if (delta > 1 && delta < 7) return formatDayName(d, false);
  return formatDate(d);
}

export function dueTone(value, isDone = false) {
  const d = toDate(value);
  if (!d || isDone) return '';
  const delta = diffDays(today(), d);
  if (delta < 0) return 'overdue';
  if (delta <= 2) return 'due-soon';
  return '';
}

/** '4m ago', '2h ago', 'Mar 14'. */
export function timeAgo(ms) {
  if (!ms) return '';
  const seconds = Math.round((Date.now() - ms) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 90) return '1m ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return formatDate(new Date(ms));
}

export function formatDateTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'pm' : 'am';
  const h12 = hours % 12 || 12;
  return `${formatDate(d)} at ${h12}:${mins}${suffix}`;
}

/** Business days between two dates, inclusive of start, exclusive of end. */
export function workingDays(start, end) {
  const a = toDate(start);
  const b = toDate(end);
  if (!a || !b) return 0;
  let count = 0;
  const cursor = new Date(a);
  while (cursor < b) {
    if (!isWeekend(cursor)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export const monthNames = MONTHS;
export const dayNames = DAYS;
export const dayNamesShort = DAYS_SHORT;
