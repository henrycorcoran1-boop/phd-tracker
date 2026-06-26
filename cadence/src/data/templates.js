export function phdTemplate() {
  return {
    title: 'My Doctorate',
    sub: 'Organisational Culture & Innovation · Viva Aug 2028',
    start: '2025-09',
    end: '2028-12',
    items: [
      { n: 'Registration',            t: 'thesis', m: true,  s: '2025-09' },
      { n: 'Confirmation / Upgrade',  t: 'thesis', m: true,  s: '2026-09' },
      { n: 'Full Draft Assembled',    t: 'thesis', m: false, s: '2028-01', e: '2028-05' },
      { n: 'Thesis Submission',       t: 'thesis', m: true,  s: '2028-06' },
      { n: 'Viva Voce',               t: 'thesis', m: true,  s: '2028-08' },

      { n: 'Paper 1 — SLR',                    t: 'papers', m: false, s: '2025-09', e: '2026-02' },
      { n: 'Paper 2 — Conceptual (ECAM)',       t: 'papers', m: false, s: '2026-01', e: '2026-08' },
      { n: 'Paper 3 — Pilot Validation',        t: 'papers', m: false, s: '2026-03', e: '2026-12' },
      { n: 'Paper 4 — Full-Scale Validation',   t: 'papers', m: false, s: '2026-10', e: '2027-08' },
      { n: 'Paper 5 — Cost-Benefit Model',      t: 'papers', m: false, s: '2027-06', e: '2028-02' },
      { n: 'Paper 6 — Comparative Case Study',  t: 'papers', m: false, s: '2027-11', e: '2028-04' },

      { n: 'Pilot Survey Fieldwork',     t: 'data', m: false, s: '2026-05', e: '2026-09' },
      { n: 'Full-Scale Data Collection', t: 'data', m: false, s: '2027-01', e: '2027-06' },

      { n: 'Demonstrating / Tutoring', t: 'teach', m: false, s: '2026-01', e: '2028-05' },

      { n: 'Scholarship Application', t: 'fund', m: true, s: '2026-02' },
      { n: 'Conference Abstract Due',  t: 'fund', m: true, s: '2026-11' },
    ],
  };
}

export function studentTemplate() {
  return {
    title: 'My Year',
    sub: 'Semester Planner · 2025–26',
    start: '2025-09',
    end: '2026-06',
    items: [
      { n: 'Semester 1 Modules',     t: 'modules', m: false, s: '2025-09', e: '2025-12' },
      { n: 'Semester 2 Modules',     t: 'modules', m: false, s: '2026-01', e: '2026-05' },
      { n: 'Mid-Term Assignments',   t: 'assess',  m: true,  s: '2025-11' },
      { n: 'January Exams',          t: 'assess',  m: false, s: '2026-01', e: '2026-01' },
      { n: 'Final Exams',            t: 'assess',  m: false, s: '2026-05', e: '2026-06' },
      { n: 'Dissertation Research',  t: 'project', m: false, s: '2026-01', e: '2026-04' },
      { n: 'Dissertation Due',       t: 'project', m: true,  s: '2026-05' },
      { n: 'Part-Time Job',          t: 'life',    m: false, s: '2025-09', e: '2026-06' },
    ],
  };
}
