import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, RADIUS } from '../theme';

export default function TrackBadge({ track }) {
  if (!track) return null;
  return (
    <View style={[styles.badge, { backgroundColor: track.dim, borderColor: track.color + '40' }]}>
      <View style={[styles.dot, { backgroundColor: track.color }]} />
      <Text style={[styles.text, { color: track.color }]}>{track.name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
