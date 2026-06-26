import React, { useRef, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { C, FONT, RADIUS, SPACING } from '../theme';
import { tracksForMode, trackById } from '../data/tracks';
import {
  monthsBetween, addMonths, fmtMonthShort, totalMonths,
} from '../utils/dates';

const LABEL_W   = 150;
const CELL_W    = 44;
const ROW_H     = 46;
const HEADER_H  = 32;
const GROUP_H   = 28;

export default function GanttChart({ plan, mode, onItemPress }) {
  const tracks = tracksForMode(mode);
  const T = totalMonths(plan);
  const totalW = T * CELL_W;

  // All horizontal scrollviews reference
  const headerRef = useRef(null);
  const rowRefs   = useRef({});
  const activeX   = useRef(0);

  const syncScroll = useCallback((x) => {
    if (Math.abs(x - activeX.current) < 1) return;
    activeX.current = x;
    headerRef.current?.scrollTo({ x, animated: false });
    Object.values(rowRefs.current).forEach(ref => ref?.scrollTo({ x, animated: false }));
  }, []);

  // Build list of renderable rows: [type: 'group' | 'item', ...]
  const rows = [];
  tracks.forEach(tr => {
    const its = plan.items
      .map((it, idx) => ({ it, idx }))
      .filter(o => o.it.t === tr.id);
    if (its.length === 0) return;
    rows.push({ type: 'group', track: tr });
    its.forEach(({ it, idx }) => rows.push({ type: 'item', it, idx, track: tr }));
  });

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No items yet. Tap + to add one.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ---- fixed left column ---- */}
      <View style={styles.leftCol}>
        {/* corner */}
        <View style={[styles.corner, { height: HEADER_H }]}>
          <Text style={styles.cornerText}>Track / Item</Text>
        </View>

        {rows.map((row, i) => {
          if (row.type === 'group') {
            return (
              <View key={`g-${i}`} style={[styles.groupLabel, { height: GROUP_H }]}>
                <View style={[styles.swatch, { backgroundColor: row.track.color }]} />
                <Text style={styles.groupText} numberOfLines={1}>{row.track.name}</Text>
              </View>
            );
          }
          return (
            <TouchableOpacity
              key={`l-${i}`}
              style={[styles.labelCell, { height: ROW_H }]}
              onPress={() => onItemPress(row.idx)}
              activeOpacity={0.7}
            >
              <Text style={styles.labelName} numberOfLines={2}>{row.it.n}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ---- scrollable right area ---- */}
      <ScrollView
        horizontal
        ref={headerRef}
        scrollEnabled={false}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        contentContainerStyle={{ width: totalW, marginLeft: LABEL_W }}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.rightScroll}
        onScroll={e => syncScroll(e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
      >
        <View style={{ width: totalW }}>
          {/* Month headers */}
          <View style={[styles.monthRow, { height: HEADER_H }]}>
            {Array.from({ length: T }).map((_, i) => {
              const mStr = addMonths(plan.start, i);
              const label = i % 3 === 0 ? fmtMonthShort(mStr) : '';
              return (
                <View key={i} style={[styles.monthCell, { width: CELL_W }]}>
                  {label ? <Text style={styles.monthText}>{label}</Text> : null}
                </View>
              );
            })}
          </View>

          {/* Rows */}
          {rows.map((row, i) => {
            if (row.type === 'group') {
              return (
                <View key={`gr-${i}`} style={[styles.groupStripe, { height: GROUP_H, width: totalW }]} />
              );
            }

            const { it, idx, track } = row;
            const offset = monthsBetween(plan.start, it.s);
            const leftPx = offset * CELL_W;

            return (
              <ScrollView
                key={`r-${i}`}
                horizontal
                scrollEnabled={false}
                ref={r => { rowRefs.current[i] = r; }}
                style={{ height: ROW_H }}
                contentContainerStyle={{ width: totalW }}
                showsHorizontalScrollIndicator={false}
              >
                <View style={[styles.rowStripe, { width: totalW, height: ROW_H }]}>
                  {/* Grid lines */}
                  {Array.from({ length: Math.ceil(T / 3) }).map((_, qi) => (
                    <View
                      key={qi}
                      style={[styles.gridLine, { left: qi * 3 * CELL_W }]}
                    />
                  ))}

                  {it.m ? (
                    /* Diamond milestone */
                    <TouchableOpacity
                      style={[styles.diamond, { left: leftPx + CELL_W / 2 - 8, backgroundColor: track.color }]}
                      onPress={() => onItemPress(idx)}
                    />
                  ) : (
                    /* Duration bar */
                    (() => {
                      const dur = Math.max(1, monthsBetween(it.s, it.e) + 1);
                      const w   = dur * CELL_W - 4;
                      return (
                        <TouchableOpacity
                          style={[styles.bar, { left: leftPx + 2, width: w, backgroundColor: track.color }]}
                          onPress={() => onItemPress(idx)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.barText} numberOfLines={1}>{it.n}</Text>
                        </TouchableOpacity>
                      );
                    })()
                  )}
                </View>
              </ScrollView>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flex: 1,
  },
  leftCol: {
    width: LABEL_W,
    borderRightWidth: 1,
    borderRightColor: C.border,
    zIndex: 10,
    backgroundColor: C.surface,
  },
  corner: {
    paddingHorizontal: SPACING.sm,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface2,
  },
  cornerText: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: C.textMuted,
  },
  groupLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    gap: 6,
    backgroundColor: C.surface2,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  groupText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: C.textMuted,
    flex: 1,
  },
  labelCell: {
    paddingHorizontal: SPACING.sm,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
    backgroundColor: C.surface,
  },
  labelName: {
    fontSize: 12,
    fontWeight: '500',
    color: C.text,
    lineHeight: 16,
  },
  rightScroll: {
    flex: 1,
  },
  monthRow: {
    flexDirection: 'row',
    backgroundColor: C.surface2,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  monthCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: C.borderLight,
  },
  monthText: {
    fontSize: 9,
    color: C.textMuted,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  groupStripe: {
    backgroundColor: C.surface2,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  rowStripe: {
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: C.borderLight,
  },
  bar: {
    position: 'absolute',
    top: 10,
    height: ROW_H - 20,
    borderRadius: RADIUS.xs,
    justifyContent: 'center',
    paddingHorizontal: 6,
    opacity: 0.9,
  },
  barText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  diamond: {
    position: 'absolute',
    top: ROW_H / 2 - 8,
    width: 16,
    height: 16,
    transform: [{ rotate: '45deg' }],
    borderRadius: 2,
    borderWidth: 2,
    borderColor: '#fff',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxl,
  },
  emptyText: {
    color: C.textMuted,
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
