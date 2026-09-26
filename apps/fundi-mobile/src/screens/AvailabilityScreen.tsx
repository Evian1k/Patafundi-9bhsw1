import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
} from '@patafundi/shared';

interface DayAvailability {
  enabled: boolean;
  start: string;
  end: string;
}

type AvailabilityMap = Record<string, DayAvailability>;

const DAYS: Array<{ key: string; label: string }> = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

function emptyAvailability(): AvailabilityMap {
  const map: AvailabilityMap = {};
  DAYS.forEach((d) => {
    map[d.key] = { enabled: false, start: '08:00', end: '17:00' };
  });
  return map;
}

export function AvailabilityScreen({ navigation }: any): JSX.Element {
  const [avail, setAvail] = useState<AvailabilityMap>(emptyAvailability);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const data = await apiClient.getAvailability();
        const a = data.availability as Record<string, DayAvailability | { start?: string; end?: string; enabled?: boolean }> | undefined;
        if (a && typeof a === 'object') {
          const merged = emptyAvailability();
          Object.keys(merged).forEach((key) => {
            const incoming = a[key];
            if (incoming && typeof incoming === 'object') {
              merged[key] = {
                enabled: !!incoming.enabled,
                start: (incoming.start as string) ?? merged[key].start,
                end: (incoming.end as string) ?? merged[key].end,
              };
            }
          });
          setAvail(merged);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const toggleDay = (key: string): void => {
    setAvail((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }));
  };

  const update = (key: string, field: 'start' | 'end', value: string): void => {
    setAvail((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await apiClient.updateAvailability(avail);
      Alert.alert('Saved', 'Your availability has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      Alert.alert('Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
    >
      <Text style={styles.title}>Availability</Text>
      <Text style={styles.subtitle}>Set the days and hours you are available for jobs.</Text>

      <View style={styles.card}>
        {DAYS.map((day) => {
          const entry = avail[day.key];
          return (
            <View key={day.key} style={styles.dayRow}>
              <View style={styles.dayHeader}>
                <TouchableOpacity
                  style={[styles.toggle, entry.enabled ? styles.toggleOn : null]}
                  onPress={() => toggleDay(day.key)}
                >
                  <Ionicons
                    name={entry.enabled ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={entry.enabled ? colors.primaryForeground : colors.textSecondary}
                  />
                </TouchableOpacity>
                <Text style={[styles.dayLabel, !entry.enabled ? styles.dayLabelOff : null]}>
                  {day.label}
                </Text>
              </View>
              {entry.enabled ? (
                <View style={styles.timeRow}>
                  <View style={styles.timeWrap}>
                    <Text style={styles.timeLabel}>From</Text>
                    <TextInput
                      style={styles.timeInput}
                      value={entry.start}
                      onChangeText={(v) => update(day.key, 'start', v)}
                      placeholder="08:00"
                      keyboardType="numeric"
                      maxLength={5}
                    />
                  </View>
                  <View style={styles.timeWrap}>
                    <Text style={styles.timeLabel}>To</Text>
                    <TextInput
                      style={styles.timeInput}
                      value={entry.end}
                      onChangeText={(v) => update(day.key, 'end', v)}
                      placeholder="17:00"
                      keyboardType="numeric"
                      maxLength={5}
                    />
                  </View>
                </View>
              ) : null}
              <View style={styles.divider} />
            </View>
          );
        })}
      </View>

      <TouchableOpacity onPress={handleSave} disabled={saving} activeOpacity={0.85}>
        <LinearGradient
          colors={[gradients.primary.start, gradients.primary.end]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btn}
        >
          {saving ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.btnText}>Save</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.xxl,
    color: colors.text,
    marginTop: spacing.md,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  dayRow: {
    paddingVertical: spacing.xs,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.xs,
  },
  toggle: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: colors.primary,
  },
  dayLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '600',
  },
  dayLabelOff: {
    color: colors.textSecondary,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 32,
    paddingBottom: spacing.sm,
  },
  timeWrap: {
    flex: 1,
  },
  timeLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  timeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: 10,
    backgroundColor: colors.background,
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  btn: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: {
    color: colors.primaryForeground,
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
  },
});
