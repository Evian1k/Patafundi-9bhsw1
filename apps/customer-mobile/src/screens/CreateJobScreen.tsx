import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import {
  apiClient,
  colors,
  fonts,
  fontSize,
  spacing,
  borderRadius,
  gradients,
  SERVICE_CATEGORIES,
} from '@patafundi/shared';

interface PhotoAsset {
  uri: string;
  type?: string;
  name?: string;
}

export function CreateJobScreen({ navigation, route }: any): JSX.Element {
  const preselected: string | undefined = route?.params?.category;
  const [category, setCategory] = useState<string | null>(preselected ?? null);
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [urgency, setUrgency] = useState<'normal' | 'emergency'>('normal');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (preselected) setCategory(preselected);
  }, [preselected]);

  const detectLocation = async (): Promise<void> => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Location denied', 'Please grant location to continue.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = loc.coords;
      setCoords({ latitude, longitude });
      const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geo.length > 0) {
        const g = geo[0];
        setAddress([g.name, g.street, g.city, g.region].filter(Boolean).join(', '));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to get location';
      Alert.alert('Location error', msg);
    } finally {
      setLocating(false);
    }
  };

  const pickPhotos = async (): Promise<void> => {
    if (photos.length >= 5) {
      Alert.alert('Limit reached', 'You can upload up to 5 photos.');
      return;
    }
    try {
      const remaining = 5 - photos.length;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.7,
      });
      if (result.canceled) return;
      const picked: PhotoAsset[] = result.assets.map((a) => ({
        uri: a.uri,
        type: 'image/jpeg',
        name: `photo-${Date.now()}.jpg`,
      }));
      setPhotos((prev) => [...prev, ...picked].slice(0, 5));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to pick photo';
      Alert.alert('Photo error', msg);
    }
  };

  const removePhoto = (index: number): void => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (): Promise<void> => {
    if (!category) {
      Alert.alert('Select category', 'Please choose a service category.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Description required', 'Please describe your job.');
      return;
    }
    if (!coords) {
      Alert.alert('Location required', 'Please detect your location.');
      return;
    }
    setSubmitting(true);
    try {
      const { job } = await apiClient.createJob({
        serviceCategory: category,
        description: description.trim(),
        estimatedPrice: budget ? Number(budget) : undefined,
        urgency,
        latitude: coords.latitude,
        longitude: coords.longitude,
        address: address.trim() || undefined,
      });
      if (photos.length > 0) {
        try {
          await apiClient.uploadJobPhotos(job.id, photos);
        } catch {
          // photos optional
        }
      }
      Alert.alert('Job posted', 'Your job has been posted. We are matching a fundi.', [
        { text: 'Track', onPress: () => navigation.replace('JobTracking', { jobId: job.id }) },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to post job';
      Alert.alert('Failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.label}>Service category</Text>
      <View style={styles.grid}>
        {SERVICE_CATEGORIES.map((cat) => {
          const selected = category === cat.slug;
          return (
            <TouchableOpacity
              key={cat.slug}
              style={[styles.categoryCard, selected ? styles.categorySelected : null]}
              onPress={() => setCategory(cat.slug)}
            >
              <Text style={styles.categoryIcon}>{cat.icon}</Text>
              <Text style={styles.categoryLabel}>{cat.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.textarea}
        value={description}
        onChangeText={setDescription}
        placeholder="Describe the job, what needs fixing, when you're available..."
        placeholderTextColor={colors.textSecondary}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      <Text style={styles.label}>Budget (KES, optional)</Text>
      <TextInput
        style={styles.input}
        value={budget}
        onChangeText={setBudget}
        placeholder="500"
        keyboardType="number-pad"
      />

      <Text style={styles.label}>Urgency</Text>
      <View style={styles.urgencyRow}>
        <TouchableOpacity
          style={[styles.urgencyBtn, urgency === 'normal' ? { borderColor: colors.accent, backgroundColor: colors.accent + '15' } : null]}
          onPress={() => setUrgency('normal')}
        >
          <Text style={[styles.urgencyText, { color: urgency === 'normal' ? colors.accent : colors.textSecondary }]}>Normal</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.urgencyBtn, urgency === 'emergency' ? { borderColor: colors.error, backgroundColor: colors.error + '15' } : null]}
          onPress={() => setUrgency('emergency')}
        >
          <Text style={[styles.urgencyText, { color: urgency === 'emergency' ? colors.error : colors.textSecondary }]}>Emergency</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Location</Text>
      <View style={styles.locationRow}>
        <TouchableOpacity onPress={detectLocation} style={styles.locateBtn} disabled={locating}>
          {locating ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Ionicons name="locate" size={20} color={colors.primary} />
          )}
          <Text style={styles.locateText}>{address || 'Detect my location'}</Text>
        </TouchableOpacity>
      </View>
      {coords ? (
        <Text style={styles.coordsText}>
          {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
        </Text>
      ) : null}

      <Text style={styles.label}>Photos (up to 5)</Text>
      <View style={styles.photoRow}>
        {photos.map((_p, i) => (
          <View key={i} style={styles.photoBox}>
            <Ionicons name="image" size={22} color={colors.textSecondary} />
            <TouchableOpacity style={styles.removePhoto} onPress={() => removePhoto(i)}>
              <Ionicons name="close-circle" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < 5 ? (
          <TouchableOpacity style={styles.addPhoto} onPress={pickPhotos}>
            <Ionicons name="add" size={24} color={colors.primary} />
            <Text style={styles.addPhotoText}>Add</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <TouchableOpacity onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
        <LinearGradient
          colors={[gradients.primary.start, gradients.primary.end]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btn}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.btnText}>Post Job</Text>
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
  label: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: spacing.md,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  categoryCard: {
    width: '31%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  categorySelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  categoryIcon: {
    fontSize: 26,
    marginBottom: 4,
  },
  categoryLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.text,
    textAlign: 'center',
  },
  textarea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: 12,
    backgroundColor: colors.card,
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
    minHeight: 100,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: 12,
    backgroundColor: colors.card,
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
  },
  urgencyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  urgencyBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  urgencyText: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: fontSize.md,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: 12,
    backgroundColor: colors.card,
  },
  locateText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    color: colors.text,
    marginLeft: 8,
  },
  coordsText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 4,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  photoBox: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  removePhoto: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.card,
    borderRadius: borderRadius.pill,
  },
  addPhoto: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.primary,
    marginTop: 2,
  },
  btn: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  btnText: {
    color: colors.primaryForeground,
    fontFamily: fonts.sans,
    fontWeight: '700',
    fontSize: fontSize.lg,
  },
});
