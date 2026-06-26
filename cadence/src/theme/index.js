import { Platform, Dimensions } from 'react-native';

export const SCREEN = Dimensions.get('window');

export const C = {
  // Backgrounds — deep ink navy matching InfraBuild's dark palette
  bg:           '#00243F',
  surface:      '#002F52',
  surface2:     '#003865',
  surface3:     '#004580',
  overlay:      'rgba(0,36,63,0.88)',

  // Borders
  border:       'rgba(255,255,255,0.10)',
  borderLight:  'rgba(255,255,255,0.06)',

  // Text
  text:         '#EDF3FA',
  textSub:      '#8BAAC8',
  textMuted:    '#4A6A88',

  // Brand accents
  gold:         '#C4873D',
  goldLight:    '#D49A50',
  goldDim:      'rgba(196,135,61,0.18)',

  // Track colours
  teal:         '#2F7A74',
  tealDim:      'rgba(47,122,116,0.2)',
  rust:         '#B04A3A',
  rustDim:      'rgba(176,74,58,0.2)',
  slate:        '#5A6478',
  slateDim:     'rgba(90,100,120,0.2)',
  plum:         '#6B4A6F',
  plumDim:      'rgba(107,74,111,0.2)',
  green:        '#4A9A5A',
  greenDim:     'rgba(74,154,90,0.2)',

  // Header
  headerBg:     '#00243F',
  headerLine:   '#C4873D',
  tabBg:        '#001E36',
};

export const SPACING = {
  xs:  4,
  sm:  8,
  md: 14,
  lg: 20,
  xl: 28,
  xxl: 40,
};

export const RADIUS = {
  xs:   4,
  sm:   7,
  md:  10,
  lg:  14,
  xl:  20,
  full: 9999,
};

export const FONT = {
  h1:       { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, color: C.text },
  h2:       { fontSize: 22, fontWeight: '600', letterSpacing: -0.3, color: C.text },
  h3:       { fontSize: 17, fontWeight: '600', color: C.text },
  h4:       { fontSize: 15, fontWeight: '600', color: C.text },
  body:     { fontSize: 15, fontWeight: '400', color: C.text },
  sm:       { fontSize: 13, fontWeight: '400', color: C.textSub },
  caption:  { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: C.textMuted },
  mono:     { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, color: C.textSub },
};

export const SHADOW = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  float: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 16,
  },
  fab: {
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 12,
  },
};
