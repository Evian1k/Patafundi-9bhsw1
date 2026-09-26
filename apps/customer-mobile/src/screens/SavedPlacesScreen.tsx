import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  ScreenHeader,
} from '@patafundi/shared';
import type { SavedPlace } from '@patafundi/shared';
import { useFocusEffect } from '@react-navigation/native';

export function SavedPlacesScreen({ navigation }: any): JSX.Element {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const resp = await apiClient.getSavedPlaces();
      setPlaces(resp.places || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (): Promise<void> => {
    if (!label.trim() || !address.trim()) {
      Alert.alert('Missing fields', 'Please enter label and address.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.addSavedPlace({
        label: label.trim(),
        address: address.trim(),
        latitude: 0,
        longitude: 0,
      });
      setLabel('');
      setAddress('');
      await load();
      Alert.alert('Saved', 'Place added.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add place';
      Alert.alert('Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string): void => {
    Alert.alert('Delete place', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.deleteSavedPlace(id);
            await load();
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to delete';
            Alert.alert('Failed', msg);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: SavedPlace }): JSX.Element => (
    <View style={styles.placeCard}>
      <View style={styles.placeLeft}>
        <View style={styles.iconWrap}>
          <Ionicons name="location" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.placeLabel}>{item.label}</Text>
          <Text style={styles.placeAddress} numberOfLines={1}>{item.address}</Text>
        </View>
      </View>
      <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={18} color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <ScreenHeader title="Saved Places" onBack={() => navigation.goBack()} />
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Add a place</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder="Label (e.g. Home)"
            placeholderTextColor={colors.textSecondary}
          />
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="Address"
            placeholderTextColor={colors.textSecondary}
          />
          <TouchableOpacity
            onPress={handleAdd}
            disabled={saving}
            activeOpacity={0.85}
            style={[styles.saveBtn, saving ? styles.saveBtnDisabled : null]}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.saveBtnText}>Add Place</Text>
            )}
          </TouchableOpacity>
        </View>

        <FlatList
          data={places}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No saved places yet. Add one above.</Text>
          }
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    margin: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: 12,
    backgroundColor: colors.background,
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: colors.primaryForeground,
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.md,
  },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeLabel: {
    fontFamily: fonts.display,
    fontWeight: '700',
    fontSize: fontSize.md,
    color: colors.text,
  },
  placeAddress: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  deleteBtn: {
    padding: spacing.sm,
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
