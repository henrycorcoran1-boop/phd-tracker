import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Alert, StyleSheet, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, RADIUS, SHADOW, SPACING } from '../theme';
import { usePlan } from '../context/PlanContext';
import { addMonths } from '../utils/dates';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR + i - 1);
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function SectionTitle({ children }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function Row({ label, value, onPress, hint, danger }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={styles.rowLeft}>
        <Text style={[styles.rowLabel, danger && { color: C.rust }]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {value !== undefined && (
        <Text style={[styles.rowValue, danger && { color: C.rust }]}>{value}</Text>
      )}
    </TouchableOpacity>
  );
}

function MonthPicker({ value, onChange }) {
  const [y, m] = value.split('-').map(Number);
  return (
    <View style={styles.pickerGroup}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
        {MONTH_NAMES.map((mn, i) => {
          const mo = i + 1;
          const active = mo === m;
          return (
            <TouchableOpacity
              key={mn}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(`${y}-${String(mo).padStart(2,'0')}`)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{mn}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
        {YEARS.map(yr => {
          const active = yr === y;
          return (
            <TouchableOpacity
              key={yr}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(`${yr}-${String(m).padStart(2,'0')}`)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{yr}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { state, dispatch } = usePlan();
  const { plan, mode } = state;
  const [expanded, setExpanded] = useState(null);

  const toggle = (key) => setExpanded(p => p === key ? null : key);

  const handleLoadTemplate = () => {
    Alert.alert(
      'Load Template',
      'This will replace all current items with the default template. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Load', style: 'destructive', onPress: () => dispatch({ type: 'LOAD_TEMPLATE' }) },
      ]
    );
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Items',
      'This will permanently delete all items from your plan. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => dispatch({ type: 'CLEAR_ITEMS' }) },
      ]
    );
  };

  const handleModeSwitch = () => {
    const next = mode === 'phd' ? 'student' : 'phd';
    Alert.alert(
      'Switch Mode',
      `Switch to ${next === 'phd' ? 'PhD' : 'Student'} mode? This will load the corresponding template.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch', onPress: () => dispatch({ type: 'SET_MODE', payload: next }) },
      ]
    );
  };

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Plan Details */}
        <SectionTitle>Plan Details</SectionTitle>
        <View style={[styles.card, SHADOW.card]}>
          <View style={styles.inputField}>
            <Text style={styles.inputLabel}>Plan Title</Text>
            <TextInput
              style={styles.input}
              value={plan.title}
              onChangeText={t => dispatch({ type: 'SET_PLAN_META', payload: { title: t } })}
              placeholderTextColor={C.textMuted}
              placeholder="My Doctorate"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.inputField}>
            <Text style={styles.inputLabel}>Subtitle</Text>
            <TextInput
              style={styles.input}
              value={plan.sub}
              onChangeText={t => dispatch({ type: 'SET_PLAN_META', payload: { sub: t } })}
              placeholderTextColor={C.textMuted}
              placeholder="e.g. Thesis topic · Viva Jun 2028"
            />
          </View>
        </View>

        {/* Plan dates */}
        <SectionTitle>Timeline Range</SectionTitle>
        <View style={[styles.card, SHADOW.card]}>
          <TouchableOpacity style={styles.expandRow} onPress={() => toggle('start')}>
            <Text style={styles.rowLabel}>Start Date</Text>
            <Text style={styles.rowValue}>{plan.start}</Text>
          </TouchableOpacity>
          {expanded === 'start' && (
            <MonthPicker
              value={plan.start}
              onChange={v => dispatch({ type: 'SET_PLAN_META', payload: { start: v } })}
            />
          )}
          <View style={styles.divider} />
          <TouchableOpacity style={styles.expandRow} onPress={() => toggle('end')}>
            <Text style={styles.rowLabel}>End Date</Text>
            <Text style={styles.rowValue}>{plan.end}</Text>
          </TouchableOpacity>
          {expanded === 'end' && (
            <MonthPicker
              value={plan.end}
              onChange={v => dispatch({ type: 'SET_PLAN_META', payload: { end: v } })}
            />
          )}
        </View>

        {/* Mode */}
        <SectionTitle>Mode</SectionTitle>
        <View style={[styles.card, SHADOW.card]}>
          <View style={[styles.expandRow, { justifyContent: 'space-between' }]}>
            <View>
              <Text style={styles.rowLabel}>Current Mode</Text>
              <Text style={styles.rowHint}>{mode === 'phd' ? 'PhD / Doctorate' : 'Student / Course'}</Text>
            </View>
            <Switch
              value={mode === 'phd'}
              onValueChange={handleModeSwitch}
              trackColor={{ false: C.tealDim, true: C.goldDim }}
              thumbColor={mode === 'phd' ? C.gold : C.teal}
            />
          </View>
        </View>

        {/* Data */}
        <SectionTitle>Data</SectionTitle>
        <View style={[styles.card, SHADOW.card]}>
          <Row
            label="Load Template"
            hint={`Loads default ${mode === 'phd' ? 'doctorate' : 'student year'} example data`}
            value="→"
            onPress={handleLoadTemplate}
          />
          <View style={styles.divider} />
          <Row
            label="Clear All Items"
            hint="Permanently removes all items from your plan"
            value="→"
            onPress={handleClearAll}
            danger
          />
        </View>

        {/* About */}
        <SectionTitle>About</SectionTitle>
        <View style={[styles.card, SHADOW.card]}>
          <Row label="Version" value="1.0.0" />
          <View style={styles.divider} />
          <Row label="Storage" value="On-device only" hint="Your plan never leaves this device" />
        </View>

        <Text style={styles.footer}>
          Cadence · plan your doctorate, one page at a time
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pageHeader: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  pageTitle: { ...FONT.h3 },
  content: { padding: SPACING.lg, paddingBottom: 60 },
  sectionTitle: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: C.textMuted,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
    paddingLeft: 2,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: SPACING.xs,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: C.borderLight, marginHorizontal: SPACING.md },
  inputField: { padding: SPACING.md },
  inputLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: C.textMuted,
    marginBottom: 6,
  },
  input: {
    color: C.text,
    fontSize: 15,
    paddingVertical: 4,
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  rowLeft: { flex: 1 },
  rowLabel: { fontSize: 15, color: C.text },
  rowHint: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  rowValue: { fontSize: 14, color: C.textSub, marginLeft: SPACING.sm },

  pickerGroup: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, gap: 6 },
  pickerRow: { gap: 6, paddingVertical: 2 },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: RADIUS.full,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.gold, borderColor: C.gold },
  chipText: { fontSize: 12, fontWeight: '500', color: C.textSub },
  chipTextActive: { color: C.bg, fontWeight: '700' },

  footer: {
    fontSize: 11,
    color: C.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: SPACING.xl,
    marginBottom: SPACING.xl,
  },
});
