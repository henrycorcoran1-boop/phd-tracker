import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, RADIUS, SHADOW, SPACING } from '../theme';

export default function KPICard({ label, value, sub, accentColor, style }) {
  return (
    <View style={[styles.card, style, SHADOW.card]}>
      <View style={[styles.accent, { backgroundColor: accentColor || C.gold }]} />
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: accentColor || C.gold }]}>{value}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACING.md,
    overflow: 'hidden',
    flex: 1,
  },
  accent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: C.textMuted,
    marginBottom: 6,
    marginTop: 4,
  },
  value: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 34,
  },
  sub: {
    fontSize: 11,
    color: C.textSub,
    marginTop: 3,
  },
});
