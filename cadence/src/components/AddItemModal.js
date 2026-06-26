import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal,
  ScrollView, Switch, StyleSheet, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, RADIUS, SHADOW, SPACING } from '../theme';
import { tracksForMode } from '../data/tracks';
import { addMonths } from '../utils/dates';
import { usePlan } from '../context/PlanContext';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR + i - 1);
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function MonthPicker({ label, value, onChange }) {
  const [y, m] = value.split('-').map(Number);
  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <View style={styles.pickerRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollPicker}
        >
          {MONTH_NAMES.map((mn, idx) => {
            const mo = idx + 1;
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
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollPicker}
      >
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

export default function AddItemModal({ visible, itemIndex, onClose }) {
  const insets = useSafeAreaInsets();
  const { state, dispatch } = usePlan();
  const tracks = tracksForMode(state.mode);
  const isEditing = itemIndex !== null && itemIndex !== undefined;
  const existing = isEditing ? state.plan.items[itemIndex] : null;

  const defaultStart = state.plan.start;
  const defaultEnd = addMonths(state.plan.start, 3);

  const [name, setName] = useState('');
  const [trackId, setTrackId] = useState(tracks[0].id);
  const [isMilestone, setIsMilestone] = useState(false);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);

  useEffect(() => {
    if (visible) {
      if (existing) {
        setName(existing.n);
        setTrackId(existing.t);
        setIsMilestone(!!existing.m);
        setStart(existing.s);
        setEnd(existing.e || addMonths(existing.s, 3));
      } else {
        setName('');
        setTrackId(tracks[0].id);
        setIsMilestone(false);
        setStart(defaultStart);
        setEnd(defaultEnd);
      }
    }
  }, [visible]);

  const handleSave = () => {
    if (!name.trim()) return;
    const item = {
      n: name.trim(),
      t: trackId,
      m: isMilestone,
      s: start,
      e: isMilestone ? undefined : end,
    };
    if (isEditing) {
      dispatch({ type: 'UPDATE_ITEM', index: itemIndex, payload: item });
    } else {
      dispatch({ type: 'ADD_ITEM', payload: item });
    }
    onClose();
  };

  const handleDelete = () => {
    dispatch({ type: 'DELETE_ITEM', index: itemIndex });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <KeyboardAvoidingView
        style={styles.scrim}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />

          <Text style={styles.sheetTitle}>{isEditing ? 'Edit Item' : 'Add Item'}</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Name */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Paper 2 — submit to ECAM"
                placeholderTextColor={C.textMuted}
                autoFocus
                returnKeyType="next"
              />
            </View>

            {/* Track */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Track</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trackRow}>
                {tracks.map(tr => {
                  const active = tr.id === trackId;
                  return (
                    <TouchableOpacity
                      key={tr.id}
                      style={[styles.trackChip, { borderColor: tr.color }, active && { backgroundColor: tr.color }]}
                      onPress={() => setTrackId(tr.id)}
                    >
                      <View style={[styles.trackDot, { backgroundColor: active ? C.bg : tr.color }]} />
                      <Text style={[styles.trackChipText, active && { color: C.bg }]}>{tr.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Milestone toggle */}
            <View style={[styles.field, styles.fieldRow]}>
              <View style={styles.fieldRowLabel}>
                <Text style={styles.fieldLabel}>Milestone</Text>
                <Text style={styles.fieldHint}>Single date, diamond marker</Text>
              </View>
              <Switch
                value={isMilestone}
                onValueChange={setIsMilestone}
                trackColor={{ false: C.surface3, true: C.goldDim }}
                thumbColor={isMilestone ? C.gold : C.textMuted}
              />
            </View>

            {/* Start date */}
            <MonthPicker
              label={isMilestone ? 'Date' : 'Start Date'}
              value={start}
              onChange={setStart}
            />

            {/* End date */}
            {!isMilestone && (
              <MonthPicker label="End Date" value={end} onChange={setEnd} />
            )}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            {isEditing && (
              <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleDelete}>
                <Text style={styles.btnDangerText}>Delete</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={handleSave}>
              <Text style={styles.btnSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.lg,
    paddingTop: 12,
    maxHeight: '90%',
    ...SHADOW.float,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    ...FONT.h3,
    marginBottom: SPACING.lg,
  },
  field: {
    marginBottom: SPACING.md,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldRowLabel: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: C.textMuted,
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: 11,
    color: C.textMuted,
    marginBottom: 2,
  },
  input: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.sm,
    padding: 12,
    color: C.text,
    fontSize: 15,
  },
  trackRow: {
    gap: 8,
    paddingVertical: 2,
  },
  trackChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  trackDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  trackChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSub,
  },
  pickerWrap: {
    marginBottom: SPACING.md,
    gap: 6,
  },
  pickerLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: C.textMuted,
    marginBottom: 2,
  },
  pickerRow: {},
  scrollPicker: {
    gap: 6,
    paddingVertical: 2,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: {
    backgroundColor: C.gold,
    borderColor: C.gold,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: C.textSub,
  },
  chipTextActive: {
    color: C.bg,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  btnSave: {
    backgroundColor: C.gold,
    flex: 2,
  },
  btnSaveText: {
    color: C.bg,
    fontSize: 14,
    fontWeight: '700',
  },
  btnGhost: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  btnGhostText: {
    color: C.textSub,
    fontSize: 14,
    fontWeight: '600',
  },
  btnDanger: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.rust,
  },
  btnDangerText: {
    color: C.rust,
    fontSize: 14,
    fontWeight: '600',
  },
});
