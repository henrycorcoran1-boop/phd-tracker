import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AddItemModal from '../components/AddItemModal';
import TrackBadge from '../components/TrackBadge';
import { C, FONT, RADIUS, SHADOW, SPACING } from '../theme';
import { usePlan } from '../context/PlanContext';
import { tracksForMode, trackById } from '../data/tracks';
import { fmtMonth, itemStatus } from '../utils/dates';

const STATUS_COLOR = { complete: C.green, active: C.gold, upcoming: C.textMuted };
const STATUS_LABEL = { complete: 'Complete', active: 'In Progress', upcoming: 'Upcoming' };

function StatusPill({ status }) {
  const color = STATUS_COLOR[status] || C.textMuted;
  return (
    <View style={[styles.pill, { backgroundColor: color + '22', borderColor: color + '44' }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

function ItemCard({ item, idx, track, onPress }) {
  const status = itemStatus(item);
  const dateStr = item.m
    ? fmtMonth(item.s)
    : `${fmtMonth(item.s)} – ${fmtMonth(item.e)}`;

  return (
    <TouchableOpacity
      style={[styles.itemCard, SHADOW.card]}
      onPress={() => onPress(idx)}
      activeOpacity={0.8}
    >
      <View style={[styles.itemAccent, { backgroundColor: track?.color || C.gold }]} />
      <View style={styles.itemBody}>
        <View style={styles.itemTop}>
          <Text style={styles.itemName} numberOfLines={2}>{item.n}</Text>
          <StatusPill status={status} />
        </View>
        <View style={styles.itemBottom}>
          <Text style={styles.itemDate}>
            {item.m ? '◆ ' : ''}{dateStr}
          </Text>
          {item.m && <Text style={styles.milestoneBadge}>Milestone</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ItemsScreen() {
  const insets = useSafeAreaInsets();
  const { state } = usePlan();
  const { plan, mode } = state;
  const tracks = tracksForMode(mode);

  const [modalVisible, setModalVisible] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [activeTrack, setActiveTrack] = useState(null);

  const handleItemPress = (idx) => {
    setEditIndex(idx);
    setModalVisible(true);
  };

  const handleAdd = () => {
    setEditIndex(null);
    setModalVisible(true);
  };

  const filteredItems = plan.items
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => !activeTrack || it.t === activeTrack);

  const grouped = tracks.reduce((acc, tr) => {
    const group = filteredItems.filter(({ it }) => it.t === tr.id);
    if (group.length > 0) acc.push({ track: tr, items: group });
    return acc;
  }, []);

  const listData = [];
  grouped.forEach(g => {
    listData.push({ type: 'header', track: g.track, key: `h-${g.track.id}` });
    g.items.forEach(({ it, idx }) =>
      listData.push({ type: 'item', it, idx, track: g.track, key: `i-${idx}` })
    );
  });

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      {/* Page header */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Items</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.8}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Track filter pills */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.filterChip, !activeTrack && styles.filterChipActive]}
          onPress={() => setActiveTrack(null)}
        >
          <Text style={[styles.filterText, !activeTrack && styles.filterTextActive]}>All</Text>
        </TouchableOpacity>
        {tracks.map(tr => {
          const has = plan.items.some(it => it.t === tr.id);
          if (!has) return null;
          const active = activeTrack === tr.id;
          return (
            <TouchableOpacity
              key={tr.id}
              style={[styles.filterChip, active && { backgroundColor: tr.color, borderColor: tr.color }]}
              onPress={() => setActiveTrack(active ? null : tr.id)}
            >
              <View style={[styles.filterDot, { backgroundColor: active ? C.bg : tr.color }]} />
              <Text style={[styles.filterText, active && { color: C.bg }]}>{tr.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      {listData.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No items yet</Text>
          <Text style={styles.emptyText}>
            Tap + to add your first item, or go to Settings to load a template.
          </Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={item => item.key}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return (
                <View style={styles.trackHeader}>
                  <View style={[styles.trackHeaderLine, { backgroundColor: item.track.color }]} />
                  <View style={[styles.trackHeaderDot, { backgroundColor: item.track.color }]} />
                  <Text style={[styles.trackHeaderText, { color: item.track.color }]}>
                    {item.track.name}
                  </Text>
                </View>
              );
            }
            return (
              <ItemCard
                item={item.it}
                idx={item.idx}
                track={item.track}
                onPress={handleItemPress}
              />
            );
          }}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, SHADOW.fab, { bottom: insets.bottom + 24 }]}
        onPress={handleAdd}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <AddItemModal
        visible={modalVisible}
        itemIndex={editIndex}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  pageTitle: { ...FONT.h3 },
  addBtn: {
    backgroundColor: C.gold,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
  },
  addBtnText: { color: C.bg, fontWeight: '700', fontSize: 13 },

  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
    flexWrap: 'wrap',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: C.gold,
    borderColor: C.gold,
  },
  filterDot: { width: 6, height: 6, borderRadius: 3 },
  filterText: { fontSize: 11, fontWeight: '600', color: C.textSub },
  filterTextActive: { color: C.bg },

  listContent: {
    padding: SPACING.lg,
    paddingBottom: 100,
    gap: SPACING.sm,
  },

  trackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: SPACING.md,
    marginBottom: 4,
  },
  trackHeaderLine: {
    width: 3,
    height: 14,
    borderRadius: 2,
  },
  trackHeaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  trackHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  itemCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 2,
  },
  itemAccent: {
    width: 4,
    flexShrink: 0,
  },
  itemBody: {
    flex: 1,
    padding: SPACING.md,
    gap: 6,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
    flex: 1,
    lineHeight: 19,
  },
  itemBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  itemDate: {
    fontSize: 11,
    color: C.textMuted,
    fontFamily: 'Menlo',
  },
  milestoneBadge: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: C.gold,
    backgroundColor: C.goldDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    flexShrink: 0,
  },
  pillDot: { width: 5, height: 5, borderRadius: 3 },
  pillText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxl,
    gap: SPACING.sm,
  },
  emptyTitle: { ...FONT.h3, color: C.textSub },
  emptyText: {
    fontSize: 14,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    fontStyle: 'italic',
  },

  fab: {
    position: 'absolute',
    right: SPACING.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
    fontSize: 28,
    color: C.bg,
    fontWeight: '300',
    lineHeight: 32,
    marginTop: -1,
  },
});
