import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppHeader from '../components/AppHeader';
import KPICard from '../components/KPICard';
import AddItemModal from '../components/AddItemModal';
import { C, FONT, RADIUS, SHADOW, SPACING } from '../theme';
import { usePlan } from '../context/PlanContext';
import { tracksForMode, trackById } from '../data/tracks';
import {
  monthsRemaining, completionPct, upcomingMilestones,
  paperCount, fmtMonth, daysUntil, itemStatus,
} from '../utils/dates';

function PhaseBar({ track, plan }) {
  const items = plan.items.filter(it => it.t === track.id);
  const done  = items.filter(it => itemStatus(it) === 'complete').length;
  const pct   = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <View style={styles.phaseRow}>
      <View style={styles.phaseHeader}>
        <View style={styles.phaseLeft}>
          <View style={[styles.phaseDot, { backgroundColor: track.color }]} />
          <Text style={styles.phaseName}>{track.name}</Text>
        </View>
        <Text style={[styles.phasePct, { color: track.color }]}>{pct}%</Text>
      </View>
      <View style={styles.progTrack}>
        <View style={[styles.progFill, { width: `${pct}%`, backgroundColor: track.color }]} />
      </View>
    </View>
  );
}

function MilestoneRow({ item, mode }) {
  const track = trackById(mode, item.t);
  const days  = daysUntil(item.s);
  const label = days === 0 ? 'Today' : days < 0 ? `${Math.abs(days)}d ago` : `in ${days}d`;
  return (
    <View style={styles.milestoneItem}>
      <View style={[styles.milestoneDot, { backgroundColor: track?.color || C.gold }]} />
      <View style={styles.milestoneBody}>
        <Text style={styles.milestoneName} numberOfLines={1}>{item.n}</Text>
        <Text style={styles.milestoneDate}>{fmtMonth(item.s)}</Text>
      </View>
      <View style={[styles.mileTag, { backgroundColor: track?.dim || C.goldDim }]}>
        <Text style={[styles.mileTagText, { color: track?.color || C.gold }]}>{label}</Text>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { state } = usePlan();
  const { plan, mode } = state;
  const tracks = tracksForMode(mode);
  const [modalVisible, setModalVisible] = useState(false);

  const months = monthsRemaining(plan);
  const pct    = completionPct(plan);
  const papers = paperCount(plan);
  const upcoming = upcomingMilestones(plan, 5);

  const totalItems = plan.items.length;
  const doneItems  = plan.items.filter(it => itemStatus(it) === 'complete').length;

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <AppHeader />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Plan title */}
        <View style={styles.planCard}>
          <Text style={styles.planTitle}>{plan.title}</Text>
          <Text style={styles.planSub}>{plan.sub}</Text>
          <View style={styles.overallProg}>
            <View style={styles.overallTrack}>
              <View style={[styles.overallFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.overallPct}>{pct}% elapsed</Text>
          </View>
        </View>

        {/* KPI grid */}
        <Text style={styles.sectionTitle}>Overview</Text>
        <View style={styles.kpiGrid}>
          <KPICard
            label="Months Left"
            value={months}
            sub="until plan end"
            accentColor={C.gold}
          />
          <KPICard
            label="Items"
            value={`${doneItems}/${totalItems}`}
            sub="complete"
            accentColor={C.green}
          />
        </View>
        <View style={styles.kpiGrid}>
          <KPICard
            label={mode === 'phd' ? 'Papers' : 'Modules'}
            value={papers}
            sub="in pipeline"
            accentColor={C.teal}
          />
          <KPICard
            label="Next Milestone"
            value={upcoming.length ? fmtMonth(upcoming[0].s) : '—'}
            sub={upcoming.length ? upcoming[0].n : 'none set'}
            accentColor={C.rust}
            style={{ flex: 1 }}
          />
        </View>

        {/* Phase breakdown */}
        {totalItems > 0 && (
          <>
            <Text style={styles.sectionTitle}>By Track</Text>
            <View style={styles.card}>
              {tracks.map((tr, i) => {
                const hasItems = plan.items.some(it => it.t === tr.id);
                if (!hasItems) return null;
                return (
                  <React.Fragment key={tr.id}>
                    {i > 0 && <View style={styles.divider} />}
                    <PhaseBar track={tr} plan={plan} />
                  </React.Fragment>
                );
              })}
            </View>
          </>
        )}

        {/* Upcoming milestones */}
        {upcoming.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Upcoming Milestones</Text>
            <View style={styles.card}>
              {upcoming.map((item, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <View style={styles.divider} />}
                  <MilestoneRow item={item} mode={mode} />
                </React.Fragment>
              ))}
            </View>
          </>
        )}

        {totalItems === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Start planning</Text>
            <Text style={styles.emptyText}>
              Tap the + button to add your first item, or load the template to start from a typical {mode === 'phd' ? 'doctorate' : 'academic year'}.
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, SHADOW.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <AddItemModal
        visible={modalVisible}
        itemIndex={null}
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
  scroll: { flex: 1 },
  content: { padding: SPACING.lg },

  planCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOW.card,
  },
  planTitle: {
    ...FONT.h2,
    marginBottom: 4,
  },
  planSub: {
    fontSize: 13,
    color: C.textSub,
    fontStyle: 'italic',
    marginBottom: SPACING.md,
  },
  overallProg: {
    gap: 6,
  },
  overallTrack: {
    height: 6,
    backgroundColor: C.surface2,
    borderRadius: 3,
    overflow: 'hidden',
  },
  overallFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: C.gold,
  },
  overallPct: {
    fontSize: 11,
    color: C.textMuted,
  },

  sectionTitle: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: C.textMuted,
    marginBottom: SPACING.sm,
    marginTop: 4,
    paddingLeft: 2,
  },

  kpiGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },

  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    ...SHADOW.card,
  },
  divider: {
    height: 1,
    backgroundColor: C.borderLight,
    marginVertical: SPACING.sm,
  },

  phaseRow: { gap: 5 },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  phaseLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  phaseDot: { width: 8, height: 8, borderRadius: 2, transform: [{ rotate: '45deg' }] },
  phaseName: { fontSize: 13, fontWeight: '600', color: C.text },
  phasePct: { fontSize: 12, fontWeight: '700' },
  progTrack: {
    height: 4,
    backgroundColor: C.surface2,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progFill: {
    height: '100%',
    borderRadius: 2,
  },

  milestoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 2,
  },
  milestoneDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
    flexShrink: 0,
  },
  milestoneBody: { flex: 1 },
  milestoneName: { fontSize: 13, color: C.text, fontWeight: '500' },
  milestoneDate: { fontSize: 11, color: C.textMuted },
  mileTag: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: RADIUS.full,
  },
  mileTagText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
  },
  emptyTitle: {
    ...FONT.h3,
    color: C.textSub,
  },
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
