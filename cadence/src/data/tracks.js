import { C } from '../theme';

export const TRACKS_PHD = [
  { id: 'thesis', name: 'Thesis & Milestones', color: C.gold,  dim: C.goldDim  },
  { id: 'papers', name: 'Paper Pipeline',       color: C.teal,  dim: C.tealDim  },
  { id: 'data',   name: 'Fieldwork & Data',     color: C.plum,  dim: C.plumDim  },
  { id: 'teach',  name: 'Teaching & Service',   color: C.slate, dim: C.slateDim },
  { id: 'fund',   name: 'Funding & Deadlines',  color: C.rust,  dim: C.rustDim  },
];

export const TRACKS_STUDENT = [
  { id: 'modules', name: 'Modules & Coursework',   color: C.teal,  dim: C.tealDim  },
  { id: 'assess',  name: 'Assessments & Exams',    color: C.rust,  dim: C.rustDim  },
  { id: 'project', name: 'Dissertation / Project', color: C.gold,  dim: C.goldDim  },
  { id: 'life',    name: 'Work & Commitments',      color: C.slate, dim: C.slateDim },
];

export function tracksForMode(mode) {
  return mode === 'phd' ? TRACKS_PHD : TRACKS_STUDENT;
}

export function trackById(mode, id) {
  return tracksForMode(mode).find(t => t.id === id) || tracksForMode(mode)[0];
}
