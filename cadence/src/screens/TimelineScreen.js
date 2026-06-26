import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GanttChart from '../components/GanttChart';
import AddItemModal from '../components/AddItemModal';
import { C, FONT, RADIUS, SHADOW, SPACING } from '../theme';
import { usePlan } from '../context/PlanContext';
import { parseYM, monthsBetween, nowYM } from '../utils/dates';

function YearRibbon({ plan }) {
  const startY = parseYM(plan.start).y;
  const endY   = parseYM(plan.end).y;
  const nowY   = parseYM(nowYM()).y;
  const years  = Array.from({ length: endY - startY + 1 }, (_, i) => startY + i);

  return (
    <View style={styles.ribbon}>
      {years.map(y => {
        const isNow  = y === nowY;
        const isPast = y < nowY;
        return (
          <View
            key={y}
            style={[
              styles.ribbonYear,
              isNow  && styles.ribbonNow,
              isPast && styles.ribbonPast,
            ]}
          >
            <Text style={[styles.ribbonText, isNow && styles.ribbonTextNow]}>{y}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function TimelineScreen() {
  const insets = useSafeAreaInsets();
  const { state } = usePlan();
  const { plan, mode } = state;

  const [modalVisible, setModalVisible] = useState(false);
  const [editIndex, setEditIndex] = useState(null);

  const handleItemPress = (idx) => {
    setEditIndex(idx);
    setModalVisible(true);
  };

  const handleAdd = () => {
    setEditIndex(null);
    setModalVisible(true);
  };

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      {/* Timeline header */}
      <View style={styles.pageHeader}>
        <View>
          <Text style={styles.pageTitle}>Timeline</Text>
          <Text style={styles.pageSub}>{plan.title}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.8}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Year ribbon */}
      <YearRibbon plan={plan} />

      {/* Gantt */}
      <ScrollView style={styles.ganttScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.ganttContainer}>
          <GanttChart plan={plan} mode={mode} onItemPress={handleItemPress} />
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

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
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
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
  pageTitle: {
    ...FONT.h3,
  },
  pageSub: {
    fontSize: 12,
    color: C.textSub,
    fontStyle: 'italic',
    marginTop: 1,
  },
  addBtn: {
    backgroundColor: C.gold,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
  },
  addBtnText: {
    color: C.bg,
    fontWeight: '700',
    fontSize: 13,
  },
  ribbon: {
    flexDirection: 'row',
    height: 28,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  ribbonYear: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  ribbonNow: {
    backgroundColor: C.gold,
  },
  ribbonPast: {
    backgroundColor: C.surface2,
  },
  ribbonText: {
    fontSize: 11,
    color: C.textMuted,
    letterSpacing: 0.5,
    fontWeight: '500',
  },
  ribbonTextNow: {
    color: C.bg,
    fontWeight: '700',
  },
  ganttScroll: {
    flex: 1,
  },
  ganttContainer: {
    flex: 1,
    minHeight: 400,
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
