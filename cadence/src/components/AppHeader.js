import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACING } from '../theme';
import { usePlan } from '../context/PlanContext';

export default function AppHeader({ title, right }) {
  const insets = useSafeAreaInsets();
  const { state, dispatch } = usePlan();

  const isPhd = state.mode === 'phd';

  const toggleMode = () => {
    dispatch({ type: 'SET_MODE', payload: isPhd ? 'student' : 'phd' });
  };

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.logoRow}>
        <View style={styles.crest}>
          <Text style={styles.crestText}>C</Text>
        </View>
        <View>
          <Text style={styles.wordmark}>CADENCE</Text>
          <Text style={styles.tagline}>
            {isPhd ? 'doctorate planner' : 'student planner'}
          </Text>
        </View>
      </View>

      <View style={styles.rightArea}>
        {right}
        <TouchableOpacity style={styles.modeToggle} onPress={toggleMode} activeOpacity={0.8}>
          <View style={[styles.modePill, !isPhd && styles.modePillStudent]}>
            <Text style={[styles.modeText, isPhd && styles.modeTextActive]}>PhD</Text>
          </View>
          <View style={[styles.modePill, isPhd && styles.modePillPhd]}>
            <Text style={[styles.modeText, !isPhd && styles.modeTextActive]}>Student</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: C.headerBg,
    borderBottomWidth: 2,
    borderBottomColor: C.headerLine,
    paddingHorizontal: SPACING.lg,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  crest: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestText: {
    fontSize: 18,
    fontWeight: '900',
    color: C.bg,
    letterSpacing: -0.5,
  },
  wordmark: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    letterSpacing: 2.5,
  },
  tagline: {
    fontSize: 9,
    color: C.gold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 1,
  },
  rightArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: C.surface2,
    borderRadius: 99,
    padding: 3,
    borderWidth: 1,
    borderColor: C.border,
  },
  modePill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 99,
  },
  modePillPhd: {
    backgroundColor: 'transparent',
  },
  modePillStudent: {
    backgroundColor: 'transparent',
  },
  modeText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSub,
    letterSpacing: 0.3,
  },
  modeTextActive: {
    color: C.bg,
  },
});
