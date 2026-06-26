const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function parseYM(str) {
  const [y, m] = str.split('-').map(Number);
  return { y, m };
}

export function monthsBetween(a, b) {
  const A = parseYM(a), B = parseYM(b);
  return (B.y - A.y) * 12 + (B.m - A.m);
}

export function addMonths(str, n) {
  let { y, m } = parseYM(str);
  m += n;
  while (m > 12) { m -= 12; y++; }
  while (m < 1)  { m += 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function fmtMonth(str) {
  const { y, m } = parseYM(str);
  return `${MONTHS[m - 1]} ${y}`;
}

export function fmtMonthShort(str) {
  const { y, m } = parseYM(str);
  return `${MONTHS[m - 1]} '${String(y).slice(2)}`;
}

export function nowYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function totalMonths(plan) {
  return monthsBetween(plan.start, plan.end) + 1;
}

export function itemStatus(item) {
  const now = nowYM();
  const end = item.m ? item.s : item.e;
  if (monthsBetween(end, now) > 0) return 'complete';
  if (monthsBetween(item.s, now) >= 0) return 'active';
  return 'upcoming';
}

export function daysUntil(ymStr) {
  const { y, m } = parseYM(ymStr);
  const target = new Date(y, m - 1, 1);
  const now = new Date();
  return Math.round((target - now) / 86400000);
}

export function monthsRemaining(plan) {
  return Math.max(0, monthsBetween(nowYM(), plan.end));
}

export function completionPct(plan) {
  const total = totalMonths(plan);
  const elapsed = Math.max(0, monthsBetween(plan.start, nowYM()));
  return Math.min(100, Math.round((elapsed / total) * 100));
}

export function upcomingMilestones(plan, limit = 5) {
  const now = nowYM();
  return plan.items
    .filter(it => it.m && monthsBetween(now, it.s) >= 0)
    .sort((a, b) => monthsBetween(b.s, a.s))
    .slice(0, limit);
}

export function paperCount(plan) {
  return plan.items.filter(it => it.t === 'papers').length;
}
